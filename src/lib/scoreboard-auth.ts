import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/validation';

export async function authorizeMatchScoreboardAccess(
  request: NextRequest,
  admin: SupabaseClient,
  matchId: string
): Promise<{
  authorized: boolean;
  actor: 'host' | 'player' | null;
  hostSupabase?: SupabaseClient;
}> {
  const { user, isHost } = await getAuthenticatedHost();
  if (user && isHost) {
    const hostSupabase = await createServerSupabaseClient();
    const { data: matchRow } = await hostSupabase
      .from('matches')
      .select('id, host_id')
      .eq('id', matchId)
      .maybeSingle();
    if (matchRow && (matchRow as { host_id: string }).host_id === user.id) {
      return { authorized: true, actor: 'host', hostSupabase };
    }
  }

  // Fallback: check if requester holds a valid kt_<registrationId> cookie for a confirmed registration of this match
  const cookieTokens: Array<{ regId: string; token: string }> = [];
  for (const cookie of request.cookies.getAll()) {
    if (!cookie.name.startsWith('kt_')) continue;
    const regId = cookie.name.slice(3);
    if (isValidUuid(regId) && cookie.value) {
      cookieTokens.push({ regId, token: cookie.value });
    }
  }

  if (cookieTokens.length === 0) {
    return { authorized: false, actor: null };
  }

  const regIds = cookieTokens.map((c) => c.regId);
  const { data: regs } = await admin
    .from('registrations')
    .select('id, access_token, status')
    .eq('match_id', matchId)
    .eq('status', 'confirmed')
    .in('id', regIds);

  if (!regs || regs.length === 0) {
    return { authorized: false, actor: null };
  }

  for (const reg of regs as Array<{ id: string; access_token: string }>) {
    const matchCookie = cookieTokens.find((c) => c.regId === reg.id);
    if (matchCookie && matchCookie.token === reg.access_token) {
      return { authorized: true, actor: 'player' };
    }
  }

  return { authorized: false, actor: null };
}
