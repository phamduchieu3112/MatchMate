import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireHostMutation, safeRpcError } from '@/lib/host-api';
import { enforceRateLimits } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidUuid } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `delete_match:user:${auth.user.id}`, limit: 5, windowSeconds: 900 },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  let password = '';
  try {
    const parsed = (await request.json()) as Record<string, unknown> | null;
    if (parsed && typeof parsed.password === 'string') {
      password = parsed.password;
    }
  } catch {
    return NextResponse.json({ error: 'password_required' }, { status: 400 });
  }

  if (!password.trim()) {
    return NextResponse.json({ error: 'password_required' }, { status: 400 });
  }

  // Verify the host owns this match via RLS
  const { data: ownedMatch, error: ownErr } = await auth.supabase
    .from('matches')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (ownErr || !ownedMatch) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  // Verify admin account password without disturbing current session cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || !auth.user.email) {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }

  const verifyClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: verifyData, error: verifyErr } =
    await verifyClient.auth.signInWithPassword({
      email: auth.user.email,
      password,
    });

  if (verifyErr || !verifyData.user || verifyData.user.id !== auth.user.id) {
    return NextResponse.json({ error: 'invalid_password' }, { status: 401 });
  }

  try {
    const { error: delErr } = await auth.supabase.rpc('host_delete_match', {
      p_match_id: id,
    });

    if (delErr) {
      return NextResponse.json(
        { error: safeRpcError(delErr.message, 'delete_failed') },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
