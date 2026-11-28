import { describe, expect, it } from 'vitest';
import {
  aggregateClubWallet,
  calculateSplitBill,
  roundVndShare,
} from '@/lib/split-bill';

describe('Post-match split bill & club wallet math', () => {
  it('rounds per-slot cost cleanly in VND and computes deficit vs surplus (p = 0)', () => {
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
    expect(summary.isGenderWeighted).toBe(false);

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

  it('computes gender-weighted split for p = 50 (2M + 2F on 100k = 30k/20k) and mixed ×2 booking', () => {
    const summary = calculateSplitBill({
      courtFee: 100_000,
      shuttleFee: 0,
      extrasFee: 0,
      maleSurchargePercent: 50,
      registrations: [
        {
          id: 'r1',
          displayName: 'Nam 1',
          contact: '0900000001',
          slots: 1,
          slotGenders: ['male'],
          amountPaid: 25_000,
          status: 'confirmed',
        },
        {
          id: 'r2',
          displayName: 'Nữ 1',
          contact: '0900000002',
          slots: 1,
          slotGenders: ['female'],
          amountPaid: 25_000,
          status: 'confirmed',
        },
        {
          id: 'r3',
          displayName: 'Cặp Nam + Nữ',
          contact: '0900000003',
          slots: 2,
          slotGenders: ['male', 'female'],
          amountPaid: 50_000,
          status: 'confirmed',
        },
      ],
    });

    expect(summary.isGenderWeighted).toBe(true);
    expect(summary.totalMaleSlots).toBe(2);
    expect(summary.totalFemaleSlots).toBe(2);
    expect(summary.maleSlotCost).toBe(30_000);
    expect(summary.femaleSlotCost).toBe(20_000);

    // Nam 1: 30k share - 25k deposit = +5k deficit
    expect(summary.items[0]).toMatchObject({
      actualShare: 30_000,
      netBalance: 5_000,
      settlementType: 'deficit',
    });
    // Nữ 1: 20k share - 25k deposit = -5k surplus
    expect(summary.items[1]).toMatchObject({
      actualShare: 20_000,
      netBalance: -5_000,
      settlementType: 'surplus',
    });
    // Mixed ×2 (1M + 1F): 30k + 20k = 50k share - 50k deposit = 0 settled
    expect(summary.items[2]).toMatchObject({
      maleSlots: 1,
      femaleSlots: 1,
      actualShare: 50_000,
      netBalance: 0,
      settlementType: 'settled',
    });
  });

  it('computes p = 30 weighted split and falls back to equal split when all slots share the same gender', () => {
    // p = 30, 2M + 1F on 360k => totalWeight = 2 * 1.3 + 1 = 3.6 => F = 100k, M = 130k
    const weighted30 = calculateSplitBill({
      courtFee: 240_000,
      shuttleFee: 120_000,
      extrasFee: 0,
      maleSurchargePercent: 30,
      registrations: [
        {
          id: 'm1',
          displayName: 'Phong, Dũng',
          contact: '0911111111',
          slots: 2,
          slotGenders: ['male', 'male'],
          amountPaid: 200_000,
          status: 'confirmed',
        },
        {
          id: 'f1',
          displayName: 'Linh',
          contact: '0922222222',
          slots: 1,
          slotGenders: ['female'],
          amountPaid: 100_000,
          status: 'confirmed',
        },
      ],
    });

    expect(weighted30.isGenderWeighted).toBe(true);
    expect(weighted30.femaleSlotCost).toBe(100_000);
    expect(weighted30.maleSlotCost).toBe(130_000);
    expect(weighted30.items[0].actualShare).toBe(260_000);
    expect(weighted30.items[1].actualShare).toBe(100_000);

    // All-same-gender fallback (legacy null slotGenders => all male, F = 0)
    const allMale = calculateSplitBill({
      courtFee: 300_000,
      shuttleFee: 0,
      extrasFee: 0,
      maleSurchargePercent: 50,
      registrations: [
        {
          id: 'a1',
          displayName: 'A',
          contact: '0933333333',
          slots: 2,
          slotGenders: null,
          amountPaid: 200_000,
          status: 'confirmed',
        },
        {
          id: 'a2',
          displayName: 'B',
          contact: '0944444444',
          slots: 1,
          slotGenders: ['male'],
          amountPaid: 100_000,
          status: 'confirmed',
        },
      ],
    });

    expect(allMale.isGenderWeighted).toBe(false);
    expect(allMale.maleSlotCost).toBe(100_000);
    expect(allMale.femaleSlotCost).toBe(100_000);
    expect(allMale.items[0].actualShare).toBe(200_000);
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
