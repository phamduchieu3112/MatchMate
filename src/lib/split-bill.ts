import type {
  ClubWalletEntry,
  ClubWalletSummary,
  SettlementType,
} from '@/lib/types';

export interface SplitBillRegistrationInput {
  id: string;
  displayName: string;
  contact: string | null;
  slots: number;
  amountPaid: number;
  status: string;
}

export interface CalculatedPlayerSettlement {
  registrationId: string;
  playerName: string;
  contactNormalized: string | null;
  slots: number;
  depositPaid: number;
  actualShare: number;
  netBalance: number;
  settlementType: SettlementType;
}

export interface SplitBillSummary {
  totalCost: number;
  totalConfirmedSlots: number;
  perSlotShare: number;
  totalActualBilled: number;
  totalDeposits: number;
  totalDeficit: number;
  totalSurplus: number;
  items: CalculatedPlayerSettlement[];
}

export function normalizeContactDigits(contact: string | null | undefined): string | null {
  if (!contact) return null;
  const digits = contact.replace(/[^0-9]/g, '');
  if (digits.length < 9) return null;
  return digits.slice(-9);
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
 * Computes post-match split bill reconciliation across confirmed participants.
 * netBalance = actualShare - depositPaid:
 *   > 0 => 'deficit' (player owes extra money)
 *   < 0 => 'surplus' (player overpaid; can be credited to Club Wallet)
 *   = 0 => 'settled'
 */
export function calculateSplitBill(params: {
  courtFee: number;
  shuttleFee: number;
  extrasFee: number;
  registrations: SplitBillRegistrationInput[];
  roundTo?: number;
}): SplitBillSummary {
  const court = Math.max(0, Math.trunc(params.courtFee));
  const shuttle = Math.max(0, Math.trunc(params.shuttleFee));
  const extras = Math.max(0, Math.trunc(params.extrasFee));
  const totalCost = court + shuttle + extras;
  const roundTo = params.roundTo ?? 1000;

  const eligible = params.registrations.filter(
    (r) => r.status === 'confirmed' && r.slots > 0
  );

  const totalConfirmedSlots = eligible.reduce((acc, r) => acc + r.slots, 0);
  const perSlotShare =
    totalConfirmedSlots > 0 && totalCost > 0
      ? roundVndShare(totalCost / totalConfirmedSlots, roundTo)
      : 0;

  let totalActualBilled = 0;
  let totalDeposits = 0;
  let totalDeficit = 0;
  let totalSurplus = 0;

  const items: CalculatedPlayerSettlement[] = eligible.map((r) => {
    const actualShare = perSlotShare * r.slots;
    const depositPaid = Math.max(0, Math.trunc(r.amountPaid));
    const netBalance = actualShare - depositPaid;
    const settlementType: SettlementType =
      netBalance > 0 ? 'deficit' : netBalance < 0 ? 'surplus' : 'settled';

    totalActualBilled += actualShare;
    totalDeposits += depositPaid;
    if (netBalance > 0) totalDeficit += netBalance;
    if (netBalance < 0) totalSurplus += Math.abs(netBalance);

    return {
      registrationId: r.id,
      playerName: r.displayName,
      contactNormalized: normalizeContactDigits(r.contact),
      slots: r.slots,
      depositPaid,
      actualShare,
      netBalance,
      settlementType,
    };
  });

  return {
    totalCost,
    totalConfirmedSlots,
    perSlotShare,
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
