'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCode, Wallet, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { NumericInput } from '@/components/ui/NumericInput';
import { formatVnd } from '@/lib/format';
import {
  calculateSplitBill,
  normalizeSlotGenders,
} from '@/lib/split-bill';
import { splitParticipantNames } from '@/lib/ui-helpers';
import type {
  ClubWalletSummary,
  MatchSettlementRow,
  SlotGender,
} from '@/lib/types';

interface SplitBillPanelProps {
  matchId: string;
  initialCourtFee: number;
  initialShuttleFee: number;
  initialShuttleCount: number;
  initialExtrasFee: number;
  initialMaleSurchargePercent?: number;
  registrations: Array<{
    id: string;
    display_name: string;
    contact: string | null;
    slots: number;
    slot_genders?: SlotGender[] | null;
    amount_paid: number;
    status: string;
  }>;
  onUpdated: () => void;
}

const SURCHARGE_PRESETS = [0, 20, 30, 50] as const;

function FormattedVndInput({
  value,
  onChange,
  locale,
  placeholder = '0',
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  locale: 'vi' | 'en';
  placeholder?: string;
  ariaLabel: string;
}) {
  const formatted =
    value > 0
      ? new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(value)
      : '';

  const handleChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) {
      onChange(0);
      return;
    }
    const num = Math.min(Number(digits), 100_000_000);
    onChange(num);
  };

  return (
    <div className="relative mt-1">
      <input
        type="text"
        inputMode="numeric"
        value={formatted}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-3 pr-14 text-sm font-bold tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        VND
      </span>
    </div>
  );
}

export function SplitBillPanel({
  matchId,
  initialCourtFee,
  initialShuttleFee,
  initialShuttleCount,
  initialExtrasFee,
  initialMaleSurchargePercent = 0,
  registrations,
  onUpdated,
}: SplitBillPanelProps) {
  const { locale, t } = useLocale();
  const [courtFee, setCourtFee] = useState(initialCourtFee);
  const [shuttleCount, setShuttleCount] = useState(initialShuttleCount);
  const [shuttleUnitPrice, setShuttleUnitPrice] = useState(() =>
    initialShuttleCount > 0
      ? Math.round(initialShuttleFee / initialShuttleCount)
      : initialShuttleFee
  );
  const [extrasFee, setExtrasFee] = useState(initialExtrasFee);
  const [maleSurchargePercent, setMaleSurchargePercent] = useState(
    initialMaleSurchargePercent
  );

  // Per-registration slot genders state (editable by Host before settling)
  const [slotGendersByReg, setSlotGendersByReg] = useState<
    Record<string, SlotGender[]>
  >(() => {
    const map: Record<string, SlotGender[]> = {};
    for (const r of registrations) {
      map[r.id] = normalizeSlotGenders(r.slot_genders, r.slots);
    }
    return map;
  });

  useEffect(() => {
    setSlotGendersByReg((prev) => {
      const next: Record<string, SlotGender[]> = {};
      for (const r of registrations) {
        const existing = prev[r.id];
        if (existing && existing.length === r.slots) {
          next[r.id] = existing;
        } else {
          next[r.id] = normalizeSlotGenders(r.slot_genders, r.slots);
        }
      }
      return next;
    });
  }, [registrations]);

  const [settlements, setSettlements] = useState<MatchSettlementRow[]>([]);
  const [walletSummaries, setWalletSummaries] = useState<ClubWalletSummary[]>(
    []
  );
  const [paymentInfo, setPaymentInfo] = useState<{
    bankCode: string;
    accountNumber: string;
    accountName: string;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [qrModalRow, setQrModalRow] = useState<MatchSettlementRow | null>(null);

  const fetchSettlement = useCallback(async () => {
    try {
      const res = await fetch(`/api/host/matches/${matchId}/settlement`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        settlements?: MatchSettlementRow[];
        walletSummaries?: ClubWalletSummary[];
        paymentInfo?: {
          bankCode: string;
          accountNumber: string;
          accountName: string;
        } | null;
      };
      setSettlements(data.settlements ?? []);
      setWalletSummaries(data.walletSummaries ?? []);
      setPaymentInfo(data.paymentInfo ?? null);
    } catch {
      // Ignore transient errors
    }
  }, [matchId]);

  useEffect(() => {
    void fetchSettlement();
  }, [fetchSettlement]);

  const shuttleFee = useMemo(
    () => Math.max(0, Math.trunc(shuttleUnitPrice || 0)) * Math.max(0, Math.trunc(shuttleCount || 0)),
    [shuttleUnitPrice, shuttleCount]
  );

  const confirmedRegistrations = useMemo(
    () => registrations.filter((r) => r.status === 'confirmed' && r.slots > 0),
    [registrations]
  );

  const toggleRegSlotGender = (regId: string, slotIdx: number, slots: number) => {
    setSlotGendersByReg((prev) => {
      const current = normalizeSlotGenders(prev[regId], slots);
      const next = [...current];
      next[slotIdx] = next[slotIdx] === 'female' ? 'male' : 'female';
      return { ...prev, [regId]: next };
    });
  };

  const livePreview = useMemo(
    () =>
      calculateSplitBill({
        courtFee,
        shuttleFee,
        extrasFee,
        maleSurchargePercent,
        registrations: registrations.map((r) => ({
          id: r.id,
          displayName: r.display_name,
          contact: r.contact,
          slots: r.slots,
          slotGenders: normalizeSlotGenders(
            slotGendersByReg[r.id] ?? r.slot_genders,
            r.slots
          ),
          amountPaid: r.amount_paid,
          status: r.status,
        })),
      }),
    [
      courtFee,
      shuttleFee,
      extrasFee,
      maleSurchargePercent,
      registrations,
      slotGendersByReg,
    ]
  );

  const costDiff = livePreview.totalCost - livePreview.totalDeposits;

  const handleFinalizeCosts = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/host/matches/${matchId}/settlement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          court_fee_total: Math.max(0, Math.trunc(courtFee || 0)),
          shuttle_fee_total: Math.max(0, Math.trunc(shuttleFee || 0)),
          shuttle_count: Math.max(0, Math.trunc(shuttleCount || 0)),
          extras_fee_total: Math.max(0, Math.trunc(extrasFee || 0)),
          male_surcharge_percent: Math.max(
            0,
            Math.min(200, Math.trunc(maleSurchargePercent || 0))
          ),
          slot_genders_by_reg: slotGendersByReg,
        }),
      });
      if (!res.ok) {
        setError(t('errGeneric'));
        return;
      }
      await fetchSettlement();
      onUpdated();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const handleSettlementAction = async (
    settlementId: string,
    action: 'mark_paid' | 'mark_unpaid' | 'credit_wallet'
  ) => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(
        `/api/host/matches/${matchId}/settlement/${settlementId}/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      if (!res.ok) {
        setError(t('errGeneric'));
        return;
      }
      await fetchSettlement();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const handleWalletDeduct = async (wallet: ClubWalletSummary) => {
    if (wallet.balance <= 0) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/host/wallet/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactNormalized: wallet.contact_normalized,
          playerName: wallet.player_name,
          deltaAmount: -wallet.balance,
          note: 'Đã khấu trừ / hoàn tất số dư ví CLB',
        }),
      });
      if (res.ok) {
        await fetchSettlement();
      }
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
      {/* Post-Match Cost Finalization Form */}
      <form
        onSubmit={handleFinalizeCosts}
        className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
      >
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
          {t('hostCostCalcTitle')}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostCourtFee')}
            </label>
            <FormattedVndInput
              value={courtFee}
              onChange={setCourtFee}
              locale={locale}
              placeholder="300.000"
              ariaLabel={t('hostCourtFee')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostExtrasFee')}
            </label>
            <FormattedVndInput
              value={extrasFee}
              onChange={setExtrasFee}
              locale={locale}
              placeholder="0"
              ariaLabel={t('hostExtrasFee')}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostShuttleUnitPrice')}
            </label>
            <FormattedVndInput
              value={shuttleUnitPrice}
              onChange={setShuttleUnitPrice}
              locale={locale}
              placeholder="30.000"
              ariaLabel={t('hostShuttleUnitPrice')}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                {t('hostShuttleCount')}
              </label>
              {shuttleCount > 0 && shuttleUnitPrice > 0 && (
                <span className="tabular-nums text-[11px] font-extrabold text-zinc-950 dark:text-volt">
                  = {formatVnd(shuttleFee, locale)}
                </span>
              )}
            </div>
            <NumericInput
              min={0}
              max={500}
              value={shuttleCount}
              onValueChange={setShuttleCount}
              aria-label={t('hostShuttleCount')}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-bold tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
          </div>
        </div>

        {/* Gender Surcharge (%) & Quick Presets */}
        <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                {t('hostGenderSurchargeLabel')}
              </label>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t('hostGenderSurchargeHint')}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative w-20">
                <NumericInput
                  min={0}
                  max={200}
                  value={maleSurchargePercent}
                  onValueChange={setMaleSurchargePercent}
                  aria-label={t('hostGenderSurchargeLabel')}
                  className="h-9 w-full rounded-xl border border-zinc-300 bg-white pl-2.5 pr-7 text-center font-mono text-sm font-black tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-volt dark:focus:border-volt"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-zinc-500">
                  %
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SURCHARGE_PRESETS.map((pct) => {
              const active = maleSurchargePercent === pct;
              return (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setMaleSurchargePercent(pct)}
                  className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${
                    active
                      ? 'bg-volt text-zinc-950 shadow-sm'
                      : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  {pct === 0 ? '0%' : `+${pct}%`}
                </button>
              );
            })}
          </div>

          {/* Host Per-Slot Gender Quick Toggles */}
          {confirmedRegistrations.length > 0 && (
            <div className="border-t border-zinc-200/80 pt-2.5 dark:border-zinc-800">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {t('hostPlayerGenderAdjustTitle')} ({livePreview.totalMaleSlots}{' '}
                {t('genderMale')} · {livePreview.totalFemaleSlots}{' '}
                {t('genderFemale')})
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {confirmedRegistrations.map((reg) => {
                  const genders = normalizeSlotGenders(
                    slotGendersByReg[reg.id] ?? reg.slot_genders,
                    reg.slots
                  );
                  const names = splitParticipantNames(reg.display_name);

                  return (
                    <div
                      key={reg.id}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <span className="min-w-0 flex-1 truncate font-bold text-zinc-900 dark:text-zinc-100">
                        {reg.display_name}
                      </span>
                      <div className="flex shrink-0 flex-wrap items-center gap-1">
                        {genders.map((g, sIdx) => {
                          const isFemale = g === 'female';
                          const personLabel =
                            reg.slots > 1
                              ? names[sIdx]
                                ? `${names[sIdx].split(' ').slice(-1)[0]}: `
                                : `#${sIdx + 1}: `
                              : '';
                          return (
                            <button
                              key={sIdx}
                              type="button"
                              onClick={() =>
                                toggleRegSlotGender(reg.id, sIdx, reg.slots)
                              }
                              className={`rounded-lg px-2 py-0.5 text-[11px] font-extrabold transition ${
                                isFemale
                                  ? 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/20 dark:text-rose-300'
                                  : 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/20 dark:text-sky-300'
                              }`}
                            >
                              {personLabel}
                              {isFemale ? t('genderFemale') : t('genderMale')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Cost & Per-Slot Summary Box */}
        <div className="space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          {shuttleCount > 0 && (
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">
                {t('hostShuttleBreakdown', {
                  count: shuttleCount,
                  price: formatVnd(shuttleUnitPrice, locale),
                })}
              </span>
              <span className="tabular-nums font-bold text-zinc-800 dark:text-zinc-200">
                {formatVnd(shuttleFee, locale)}
              </span>
            </div>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostTotalCost')}
            </span>
            <strong className="tabular-nums text-zinc-950 dark:text-white">
              {formatVnd(livePreview.totalCost, locale)}
            </strong>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostConfirmedRevenue')}
            </span>
            <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVnd(livePreview.totalDeposits, locale)}
            </strong>
          </div>

          <div className="flex flex-wrap justify-between gap-2">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostDiffLabel')}
            </span>
            <strong
              className={`tabular-nums ${
                costDiff > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : costDiff < 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {costDiff > 0
                ? t('hostDiffNeedMore', { amount: formatVnd(costDiff, locale) })
                : costDiff < 0
                  ? t('hostDiffSurplus', {
                      amount: formatVnd(Math.abs(costDiff), locale),
                    })
                  : t('hostDiffExact')}
            </strong>
          </div>

          <div className="space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            {livePreview.isGenderWeighted ? (
              <>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {t('hostSplitPerSlotMale', {
                      count: livePreview.totalMaleSlots,
                    })}
                  </span>
                  <strong className="tabular-nums text-zinc-950 dark:text-volt">
                    {formatVnd(livePreview.maleSlotCost, locale)}
                  </strong>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-zinc-600 dark:text-zinc-300">
                    {t('hostSplitPerSlotFemale', {
                      count: livePreview.totalFemaleSlots,
                    })}
                  </span>
                  <strong className="tabular-nums text-zinc-950 dark:text-volt">
                    {formatVnd(livePreview.femaleSlotCost, locale)}
                  </strong>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('hostSplitPerSlot')} ({livePreview.totalConfirmedSlots} slot)
                </span>
                <strong className="tabular-nums text-zinc-950 dark:text-volt">
                  {formatVnd(livePreview.perSlotShare, locale)}
                </strong>
              </div>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-volt text-xs font-extrabold uppercase tracking-wide text-zinc-950 transition hover:bg-volt-hover disabled:opacity-60"
        >
          {t('hostSplitSaveRecalc')}
        </button>
      </form>

      {/* Per-Player Settlement Table */}
      {settlements.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-2.5">
            {settlements.map((row) => {
              const isDeficit = row.settlement_type === 'deficit';
              const isSurplus = row.settlement_type === 'surplus';

              return (
                <div
                  key={row.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-zinc-950 dark:text-white">
                        {row.player_name}
                      </span>
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 tabular-nums text-[11px] font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        ×{row.slots}
                      </span>

                      {isDeficit && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            row.status === 'paid'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400'
                              : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
                          }`}
                        >
                          {row.status === 'paid'
                            ? t('hostSplitPaidBadge')
                            : t('hostSplitUnpaidBadge')}
                        </span>
                      )}

                      {isSurplus && (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            row.status === 'credited_wallet'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400'
                              : 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300'
                          }`}
                        >
                          {row.status === 'credited_wallet'
                            ? t('hostSplitCreditedBadge')
                            : t('hostSplitSurplusLabel', {
                                amount: formatVnd(
                                  Math.abs(row.net_balance),
                                  locale
                                ),
                              })}
                        </span>
                      )}
                    </div>

                    <p className="tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                      {t('hostSplitDepositCol')}:{' '}
                      {formatVnd(row.deposit_paid, locale)} ·{' '}
                      {t('hostSplitShareCol')}:{' '}
                      {formatVnd(row.actual_share, locale)} ·{' '}
                      <strong
                        className={
                          isDeficit
                            ? 'text-amber-600 dark:text-amber-400'
                            : isSurplus
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                        }
                      >
                        {isDeficit
                          ? t('hostSplitOweLabel', {
                              amount: formatVnd(row.net_balance, locale),
                            })
                          : isSurplus
                            ? t('hostSplitSurplusLabel', {
                                amount: formatVnd(
                                  Math.abs(row.net_balance),
                                  locale
                                ),
                              })
                            : t('hostSplitSettledLabel')}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isDeficit && row.qr_url && row.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => setQrModalRow(row)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-zinc-950 px-3 text-xs font-extrabold text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        <span>{t('hostSplitShowQr')}</span>
                      </button>
                    )}

                    {isDeficit && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void handleSettlementAction(
                            row.id,
                            row.status === 'paid' ? 'mark_unpaid' : 'mark_paid'
                          )
                        }
                        className={`h-9 rounded-xl px-3 text-xs font-bold transition ${
                          row.status === 'paid'
                            ? 'border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        {row.status === 'paid'
                          ? t('hostSplitMarkUnpaid')
                          : t('hostSplitMarkPaid')}
                      </button>
                    )}

                    {isSurplus && row.status !== 'credited_wallet' && (
                      <button
                        type="button"
                        disabled={busy || !row.contact_normalized}
                        onClick={() =>
                          void handleSettlementAction(row.id, 'credit_wallet')
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-3 text-xs font-bold text-white transition hover:bg-sky-700 disabled:opacity-50"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        <span>{t('hostSplitCreditWallet')}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Club Wallet Ledger */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-zinc-950 dark:text-volt" />
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
            {t('hostWalletTitle')}
          </h3>
        </div>

        {walletSummaries.filter((w) => w.balance !== 0).length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {t('hostWalletEmpty')}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {walletSummaries
              .filter((w) => w.balance !== 0)
              .map((w) => (
                <div
                  key={w.contact_normalized}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="min-w-0">
                    <p className="truncate font-extrabold text-zinc-950 dark:text-white">
                      {w.player_name}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-500">
                      ***{w.contact_normalized.slice(-4)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="tabular-nums text-sm font-black text-emerald-600 dark:text-volt">
                      {formatVnd(w.balance, locale)}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleWalletDeduct(w)}
                      className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                    >
                      {t('hostWalletUseBalance')}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Individual Top-Up VietQR Modal */}
      {qrModalRow && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalRow(null);
          }}
        >
          <div className="w-full max-w-sm rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 className="text-sm font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                {t('hostSplitQrTitle', { name: qrModalRow.player_name })}
              </h3>
              <button
                type="button"
                onClick={() => setQrModalRow(null)}
                aria-label={t('close')}
                className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 dark:border-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-950">
              {qrModalRow.qr_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={qrModalRow.qr_url}
                  alt={qrModalRow.player_name}
                  className="aspect-square h-48 w-48 max-w-full rounded-xl border border-zinc-100 object-contain p-1 sm:h-56 sm:w-56"
                />
              )}
              <p className="mt-2 tabular-nums text-2xl font-black">
                {formatVnd(qrModalRow.net_balance, locale)}
              </p>
              <code className="mt-1 rounded-lg bg-zinc-100 px-3 py-1 font-mono text-sm font-black">
                {qrModalRow.transfer_content || qrModalRow.payment_ref}
              </code>
              {paymentInfo && (
                <p className="mt-2 text-center text-xs text-zinc-600">
                  {paymentInfo.bankCode} · {paymentInfo.accountNumber} ·{' '}
                  {paymentInfo.accountName}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
