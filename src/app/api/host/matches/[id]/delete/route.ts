import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireHostMutation } from '@/lib/host-api';
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
    const admin = createAdminClient();

    const { data: regs, error: regErr } = await admin
      .from('registrations')
      .select('id')
      .eq('match_id', id);

    if (regErr) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    const regIds = (regs ?? []).map((r) => r.id);

    if (regIds.length > 0) {
      const [refDel, payDel, idemDel] = await Promise.all([
        admin.from('refunds').delete().in('registration_id', regIds),
        admin.from('payments').delete().in('registration_id', regIds),
        admin.from('request_idempotency').delete().in('registration_id', regIds),
      ]);

      if (refDel.error || payDel.error || idemDel.error) {
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }

      const { error: delRegsErr } = await admin
        .from('registrations')
        .delete()
        .eq('match_id', id);

      if (delRegsErr) {
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }
    }

    const { error: delMatchErr } = await admin
      .from('matches')
      .delete()
      .eq('id', id);

    if (delMatchErr) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
