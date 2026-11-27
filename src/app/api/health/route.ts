import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('matches').select('id').limit(1);
    if (error) {
      return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, db: 'ok' }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
