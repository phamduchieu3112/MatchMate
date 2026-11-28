import type {
  ClubWalletEntry,
  ClubWalletSummary,
  SettlementType,
  SlotGender,
} from '@/lib/types';

export interface SplitBillRegistrationInput {
  id: string;
  displayName: string;
  contact: string | null;
  slots: number;
  amountPaid: number;
  status: string;
  slotGenders?: SlotGender[] | null;
}

export interface CalculatedPlayerSettlement {
  registrationId: string;
  playerName: string;
  contactNormalized: string | null;
  slots: number;
  slotGenders: SlotGender[];
  maleSlots: number;
  femaleSlots: number;
  depositPaid: number;
  actualShare: number;
  netBalance: number;
  settlementType: SettlementType;
}

export interface SplitBillSummary {
  totalCost: number;
  totalConfirmedSlots: number;
  totalMaleSlots: number;
  totalFemaleSlots: number;
  maleSurchargePercent: number;
  isGenderWeighted: boolean;
  perSlotShare: number;
  maleSlotCost: number;
  femaleSlotCost: number;
  totalActualBilled: number;
  totalDeposits: number;
  totalDeficit: number;
  totalSurplus: number;
  items: CalculatedPlayerSettlement[];
}

export function normalizeContactDigits(
  contact: string | null | undefined
): string | null {
  if (!contact) return null;
  const digits = contact.replace(/[^0-9]/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
}

/**
 * Normalizes a registration's slot_genders array to match `slots` length.
 * Legacy bookings with null/empty slot_genders default each slot to 'male'.
 */
export function normalizeSlotGenders(
  slotGenders: unknown,
  slots: number
): SlotGender[] {
  const count = Math.max(0, Math.trunc(slots || 0));
  const raw = Array.isArray(slotGenders) ? slotGenders : [];
  return Array.from({ length: count }, (_, idx) =>
    raw[idx] === 'female' ? 'female' : 'male'
  );
}

/**
 * Rounds an amount up to the nearest VND step (default 1,000 VND) cleanly.
 */
export function roundVndShare(rawAmount: number, roundTo = 1000): number {
  if (rawAmount <= 0) return 0;
  if (roundTo <= 1) return Math.round(rawAmount);
  return Math.ceil(rawAmount / roundTo) * roundTo;
}

/**
 * Computes post-match split bill reconciliation across confirmed participants,
 * supporting both equal split and configurable Male/Female surcharge (%).
 */
export function calculateSplitBill(params: {
  courtFee: number;
  shuttleFee: number;
  extrasFee: number;
  maleSurchargePercent?: number;
  registrations: SplitBillRegistrationInput[];
  roundTo?: number;
}): SplitBillSummary {
  const court = Math.max(0, Math.trunc(params.courtFee));
  const shuttle = Math.max(0, Math.trunc(params.shuttleFee));
  const extras = Math.max(0, Math.trunc(params.extrasFee));
  const totalCost = court + shuttle + extras;
  const roundTo = params.roundTo ?? 1000;
  const maleSurchargePercent = Math.max(
    0,
    Math.min(200, Math.trunc(params.maleSurchargePercent ?? 0))
  );

  const eligible = params.registrations.filter(
    (r) => r.status === 'confirmed' && r.slots > 0
  );

  const regGenderMeta = eligible.map((r) => {
    const genders = normalizeSlotGenders(r.slotGenders, r.slots);
    const maleSlots = genders.filter((g) => g === 'male').length;
    const femaleSlots = genders.length - maleSlots;
    return { reg: r, genders, maleSlots, femaleSlots };
  });

  const totalMaleSlots = regGenderMeta.reduce((acc, x) => acc + x.maleSlots, 0);
  const totalFemaleSlots = regGenderMeta.reduce(
    (acc, x) => acc + x.femaleSlots,
    0
  );
  const totalConfirmedSlots = totalMaleSlots + totalFemaleSlots;

  const isGenderWeighted =
    maleSurchargePercent > 0 && totalMaleSlots > 0 && totalFemaleSlots > 0;

  let perSlotShare = 0;
  let maleSlotCost = 0;
  let femaleSlotCost = 0;

  if (totalConfirmedSlots > 0 && totalCost > 0) {
    perSlotShare = roundVndShare(totalCost / totalConfirmedSlots, roundTo);
    if (!isGenderWeighted) {
      maleSlotCost = perSlotShare;
      femaleSlotCost = perSlotShare;
    } else {
      const multiplier = 1 + maleSurchargePercent / 100;
      const totalWeight = totalMaleSlots * multiplier + totalFemaleSlots;
      femaleSlotCost = roundVndShare(totalCost / totalWeight, roundTo);
      maleSlotCost = roundVndShare(
        (totalCost * multiplier) / totalWeight,
        roundTo
      );
    }
  }

  let totalActualBilled = 0;
  let totalDeposits = 0;
  let totalDeficit = 0;
  let totalSurplus = 0;

  const items: CalculatedPlayerSettlement[] = regGenderMeta.map(
    ({ reg, genders, maleSlots, femaleSlots }) => {
      const actualShare =
        maleSlots * maleSlotCost + femaleSlots * femaleSlotCost;
      const depositPaid = Math.max(0, Math.trunc(reg.amountPaid));
      const netBalance = actualShare - depositPaid;
      const settlementType: SettlementType =
        netBalance > 0 ? 'deficit' : netBalance < 0 ? 'surplus' : 'settled';

      totalActualBilled += actualShare;
      totalDeposits += depositPaid;
      if (netBalance > 0) totalDeficit += netBalance;
      if (netBalance < 0) totalSurplus += Math.abs(netBalance);

      return {
        registrationId: reg.id,
        playerName: reg.displayName,
        contactNormalized: normalizeContactDigits(reg.contact),
        slots: reg.slots,
        slotGenders: genders,
        maleSlots,
        femaleSlots,
        depositPaid,
        actualShare,
        netBalance,
        settlementType,
      };
    }
  );

  return {
    totalCost,
    totalConfirmedSlots,
    totalMaleSlots,
    totalFemaleSlots,
    maleSurchargePercent,
    isGenderWeighted,
    perSlotShare,
    maleSlotCost,
    femaleSlotCost,
    totalActualBilled,
    totalDeposits,
    totalDeficit,
    totalSurplus,
    items,
  };
}

/**
 * Aggregates Club Wallet ledger entries into per-player current balances.
 */
export function aggregateClubWallet(
  entries: ClubWalletEntry[]
): ClubWalletSummary[] {
  const map = new Map<string, ClubWalletSummary>();

  for (const entry of entries) {
    const key = entry.contact_normalized;
    if (!key) continue;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        contact_normalized: key,
        player_name: entry.player_name,
        balance: entry.delta_amount,
        last_updated: entry.created_at,
      });
    } else {
      existing.balance += entry.delta_amount;
      if (entry.created_at > existing.last_updated) {
        existing.last_updated = entry.created_at;
        existing.player_name = entry.player_name;
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.balance - a.balance);
}
