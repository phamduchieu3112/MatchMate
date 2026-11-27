import { describe, expect, it } from 'vitest';
import {
  aggregateClubWallet,
  calculateSplitBill,
  roundVndShare,
} from '@/lib/split-bill';

describe('Post-match split bill & club wallet math', () => {
  it('rounds per-slot cost cleanly in VND and computes deficit vs surplus', () => {
    expect(roundVndShare(62_100, 1000)).toBe(63_000);
    expect(roundVndShare(60_000, 1000)).toBe(60_000);

    const summary = calculateSplitBill({
      courtFee: 300_000,
      shuttleFee: 150_000,
      extrasFee: 10_000,
      registrations: [
        {
          id: 'reg-1',
          displayName: 'An',
          contact: '0912345678',
          slots: 1,
          amountPaid: 100_000,
          status: 'confirmed',
        },
        {
          id: 'reg-2',
          displayName: 'Bình',
          contact: '0987654321',
          slots: 2,
          amountPaid: 250_000,
          status: 'confirmed',
        },
        {
          id: 'reg-3',
          displayName: 'Chi',
          contact: '0911223344',
          slots: 1,
          amountPaid: 115_000,
          status: 'confirmed',
        },
      ],
    });

    // Total cost = 460,000 across 4 slots => 115,000/slot
    expect(summary.totalCost).toBe(460_000);
    expect(summary.totalConfirmedSlots).toBe(4);
    expect(summary.perSlotShare).toBe(115_000);

    expect(summary.items[0]).toMatchObject({
      playerName: 'An',
      actualShare: 115_000,
      netBalance: 15_000,
      settlementType: 'deficit',
    });
    expect(summary.items[1]).toMatchObject({
      playerName: 'Bình',
      actualShare: 230_000,
      netBalance: -20_000,
      settlementType: 'surplus',
    });
    expect(summary.items[2]).toMatchObject({
      playerName: 'Chi',
      actualShare: 115_000,
      netBalance: 0,
      settlementType: 'settled',
    });
  });

  it('aggregates club wallet ledger balances per normalized phone', () => {
    const summaries = aggregateClubWallet([
      {
        id: '1',
        contact_normalized: '912345678',
        player_name: 'An',
        match_id: 'm1',
        settlement_id: 's1',
        delta_amount: 20_000,
        note: 'Surplus',
        created_at: '2026-12-01T10:00:00Z',
      },
      {
        id: '2',
        contact_normalized: '912345678',
        player_name: 'An',
        match_id: null,
        settlement_id: null,
        delta_amount: -5_000,
        note: 'Used',
        created_at: '2026-12-02T10:00:00Z',
      },
    ]);

    expect(summaries).toHaveLength(1);
    expect(summaries[0].balance).toBe(15_000);
  });
});
