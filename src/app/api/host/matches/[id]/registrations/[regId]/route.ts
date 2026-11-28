import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import { normalizeSlotGenders } from '@/lib/split-bill';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RegistrationStatus, SlotGender } from '@/lib/types';
import {
  isValidUuid,
  sanitizeText,
  validateAndNormalizePhone,
} from '@/lib/validation';

const VALID_STATUSES = new Set<RegistrationStatus>([
  'pending_payment',
  'confirmed',
  'waitlisted',
  'expired',
  'cancelled',
]);

const VALID_PAYMENT_METHODS = new Set(['sepay', 'cash', 'none']);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; regId: string }> }
) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  const { id, regId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(regId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: matchRow } = await admin
    .from('matches')
    .select('id, host_id, fee_per_slot, max_slots')
    .eq('id', id)
    .maybeSingle();

  if (!matchRow || (matchRow as { host_id: string }).host_id !== auth.user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const typedMatch = matchRow as {
    id: string;
    host_id: string;
    fee_per_slot: number;
    max_slots: number;
  };

  const { data: existingRow } = await admin
    .from('registrations')
    .select(
      'id, match_id, display_name, contact, slots, status, payment_code, amount_due, amount_paid, payment_method, expires_at, checked_in, created_at, cancelled_at, promoted_at, refund_account_info'
    )
    .eq('id', regId)
    .eq('match_id', id)
    .maybeSingle();

  if (!existingRow) {
    return NextResponse.json(
      { error: 'registration_not_found' },
      { status: 404 }
    );
  }

  const { data: existingGenderRow } = await admin
    .from('registrations')
    .select('slot_genders')
    .eq('id', regId)
    .eq('match_id', id)
    .maybeSingle();

  const existing = {
    ...(existingRow as {
      id: string;
      match_id: string;
      display_name: string;
      contact: string | null;
      slots: number;
      status: RegistrationStatus;
      payment_code: string;
      amount_due: number;
      amount_paid: number;
      payment_method: string;
      expires_at: string | null;
      checked_in: boolean;
      created_at: string;
      cancelled_at: string | null;
      promoted_at: string | null;
      refund_account_info: string | null;
    }),
    slot_genders:
      (
        existingGenderRow as {
          slot_genders?: SlotGender[] | null;
        } | null
      )?.slot_genders ?? null,
  };

  const updates: Record<string, unknown> = {};
  let nextSlotGenders: SlotGender[] | undefined;

  const rawName =
    body.display_name !== undefined ? body.display_name : body.player_name;
  if (rawName !== undefined) {
    const cleanName = sanitizeText(rawName, 300);
    if (!cleanName) {
      return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
    }
    updates.display_name = cleanName;
  }

  const rawPhone = body.contact !== undefined ? body.contact : body.phone;
  if (rawPhone !== undefined) {
    if (
      rawPhone === null ||
      (typeof rawPhone === 'string' && rawPhone.trim() === '')
    ) {
      updates.contact = null;
    } else {
      const phoneCheck = validateAndNormalizePhone(rawPhone);
      if (!phoneCheck.valid) {
        return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
      }
      updates.contact = phoneCheck.sanitized;
    }
  }

  let targetSlots = existing.slots;
  if (body.slots !== undefined) {
    const parsedSlots = Number(body.slots);
    if (
      !Number.isInteger(parsedSlots) ||
      parsedSlots < 1 ||
      parsedSlots > Math.max(50, typedMatch.max_slots)
    ) {
      return NextResponse.json({ error: 'invalid_slots' }, { status: 400 });
    }
    targetSlots = parsedSlots;
    updates.slots = parsedSlots;
    if (body.amount_due === undefined) {
      updates.amount_due = parsedSlots * typedMatch.fee_per_slot;
    }
  }

  if (body.amount_due !== undefined) {
    const parsedDue = Number(body.amount_due);
    if (
      !Number.isInteger(parsedDue) ||
      parsedDue < 0 ||
      parsedDue > 100_000_000
    ) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    updates.amount_due = parsedDue;
  }

  if (body.slot_genders !== undefined) {
    if (
      !Array.isArray(body.slot_genders) ||
      body.slot_genders.some((g) => g !== 'male' && g !== 'female')
    ) {
      return NextResponse.json(
        { error: 'invalid_slot_genders' },
        { status: 400 }
      );
    }
    nextSlotGenders = normalizeSlotGenders(body.slot_genders, targetSlots);
  } else if (body.slots !== undefined) {
    nextSlotGenders = normalizeSlotGenders(existing.slot_genders, targetSlots);
  }

  const rawPaid =
    body.amount_paid !== undefined ? body.amount_paid : body.paid_amount;
  if (rawPaid !== undefined) {
    const parsedPaid = Number(rawPaid);
    if (
      !Number.isInteger(parsedPaid) ||
      parsedPaid < 0 ||
      parsedPaid > 100_000_000
    ) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    updates.amount_paid = parsedPaid;
  }

  if (body.status !== undefined) {
    if (
      typeof body.status !== 'string' ||
      !VALID_STATUSES.has(body.status as RegistrationStatus)
    ) {
      return NextResponse.json(
        { error: 'invalid_registration_status' },
        { status: 400 }
      );
    }
    const nextStatus = body.status as RegistrationStatus;
    updates.status = nextStatus;

    if (
      nextStatus === 'confirmed' &&
      existing.payment_method === 'none' &&
      body.payment_method === undefined
    ) {
      updates.payment_method = 'cash';
    }
    if (nextStatus === 'cancelled' && !existing.cancelled_at) {
      updates.cancelled_at = new Date().toISOString();
    }
    if (nextStatus === 'pending_payment' && !existing.expires_at) {
      updates.expires_at = new Date(
        Date.now() + 15 * 60 * 1000
      ).toISOString();
    }
  }

  if (body.payment_method !== undefined) {
    if (
      typeof body.payment_method !== 'string' ||
      !VALID_PAYMENT_METHODS.has(body.payment_method)
    ) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    updates.payment_method = body.payment_method;
  }

  if (body.refund_account_info !== undefined) {
    updates.refund_account_info =
      body.refund_account_info === null
        ? null
        : sanitizeText(body.refund_account_info, 200) || null;
  }

  if (typeof body.checked_in === 'boolean') {
    updates.checked_in = body.checked_in;
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await admin
      .from('registrations')
      .update(updates)
      .eq('id', regId)
      .eq('match_id', id);

    if (updErr) {
      return NextResponse.json(
        { error: 'update_failed', code: updErr.code },
        { status: 400 }
      );
    }
  }

  if (typeof updates.display_name === 'string') {
    await admin
      .from('match_settlements')
      .update({
        player_name: updates.display_name,
        updated_at: new Date().toISOString(),
      })
      .eq('registration_id', regId)
      .eq('match_id', id);
  }

  if (nextSlotGenders !== undefined) {
    await admin
      .from('registrations')
      .update({ slot_genders: nextSlotGenders })
      .eq('id', regId)
      .eq('match_id', id);
  }

  let nextSlotsTaken: number | undefined;
  if (updates.slots !== undefined || updates.status !== undefined) {
    const { data: activeRegs } = await admin
      .from('registrations')
      .select('slots, status, expires_at')
      .eq('match_id', id);

    const nowMs = Date.now();
    const computedTaken = (
      (activeRegs ?? []) as Array<{
        slots: number;
        status: string;
        expires_at: string | null;
      }>
    ).reduce((acc, r) => {
      if (
        r.status === 'confirmed' ||
        (r.status === 'pending_payment' &&
          r.expires_at &&
          new Date(r.expires_at).getTime() > nowMs)
      ) {
        return acc + (r.slots || 0);
      }
      return acc;
    }, 0);

    nextSlotsTaken = computedTaken;
    await admin
      .from('matches')
      .update({ slots_taken: computedTaken })
      .eq('id', id);
  }

  const { data: refreshed } = await admin
    .from('registrations')
    .select(
      'id, match_id, display_name, contact, slots, status, payment_code, amount_due, amount_paid, payment_method, expires_at, checked_in, created_at, cancelled_at, promoted_at'
    )
    .eq('id', regId)
    .eq('match_id', id)
    .single();

  const { data: refreshedGender } = await admin
    .from('registrations')
    .select('slot_genders')
    .eq('id', regId)
    .eq('match_id', id)
    .maybeSingle();

  const finalSlotGenders = normalizeSlotGenders(
    (refreshedGender as { slot_genders?: SlotGender[] | null } | null)
      ?.slot_genders ??
      nextSlotGenders ??
      existing.slot_genders,
    (refreshed as { slots?: number } | null)?.slots ?? targetSlots
  );

  return NextResponse.json(
    {
      ok: true,
      registration: {
        ...(refreshed ?? existing),
        slot_genders: finalSlotGenders,
      },
      slots_taken: nextSlotsTaken,
    },
    { status: 200 }
  );
}
