import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const SAFE_REG_ID_REGEX = /^[A-Za-z0-9_-]{4,64}$/;

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Handle GET /dang-ky/[id]?t=<token> -> set HttpOnly cookie and 302 redirect stripping ?t=
  const regMatch = pathname.match(/^\/dang-ky\/([^/]+)$/);
  if (regMatch && request.method === 'GET' && searchParams.has('t')) {
    const id = regMatch[1];
    const token = searchParams.get('t')?.trim() ?? '';

    if (SAFE_REG_ID_REGEX.test(id) && token.length >= 8 && token.length <= 256) {
      const cleanUrl = request.nextUrl.clone();
      cleanUrl.searchParams.delete('t');
      const response = NextResponse.redirect(cleanUrl, 302);
      response.cookies.set(`kt_${id}`, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 2592000,
      });
      return response;
    }
  }

  // Refresh Supabase session cookies for Host routes
  if (pathname.startsWith('/host')) {
    let response = NextResponse.next({
      request,
    });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && anonKey) {
      const supabase = createServerClient(url, anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({
              request,
            });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
          },
        },
      });
      await supabase.auth.getUser();
    }

    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dang-ky/:path*', '/host/:path*'],
};
