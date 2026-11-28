'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { QrCode, Wallet, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { formatVnd } from '@/lib/format';
import { calculateSplitBill } from '@/lib/split-bill';
import type { ClubWalletSummary, MatchSettlementRow } from '@/lib/types';

interface SplitBillPanelProps {
  matchId: string;
  initialCourtFee: number;
  initialShuttleFee: number;
  initialShuttleCount: number;
  initialExtrasFee: number;
  registrations: Array<{
    id: string;
    display_name: string;
    contact: string | null;
    slots: number;
    amount_paid: number;
    status: string;
  }>;
  onUpdated: () => void;
}

export function SplitBillPanel({
  matchId,
  initialCourtFee,
  initialShuttleFee,
  initialShuttleCount,
  initialExtrasFee,
  registrations,
  onUpdated,
}: SplitBillPanelProps) {
  const { locale, t } = useLocale();
  const [courtFee, setCourtFee] = useState(initialCourtFee);
  const [shuttleCount, setShuttleCount] = useState(initialShuttleCount);
  const [shuttleFee, setShuttleFee] = useState(initialShuttleFee);
  const [extrasFee, setExtrasFee] = useState(initialExtrasFee);

  const [settlements, setSettlements] = useState<MatchSettlementRow[]>([]);
  const [walletSummaries, setWalletSummaries] = useState<ClubWalletSummary[]>([]);
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

  const livePreview = useMemo(
    () =>
      calculateSplitBill({
        courtFee,
        shuttleFee,
        extrasFee,
        registrations: registrations.map((r) => ({
          id: r.id,
          displayName: r.display_name,
          contact: r.contact,
          slots: r.slots,
          amountPaid: r.amount_paid,
          status: r.status,
        })),
      }),
    [courtFee, shuttleFee, extrasFee, registrations]
  );

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
        className="space-y-3.5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
          {t('hostCostCalcTitle')}
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostCourtFee')}
            </label>
            <input
              type="number"
              min={0}
              max={100000000}
              value={courtFee}
              onChange={(e) => setCourtFee(Number(e.target.value) || 0)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostShuttleCount')}
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={shuttleCount}
              onChange={(e) => setShuttleCount(Number(e.target.value) || 0)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostShuttleFee')}
            </label>
            <input
              type="number"
              min={0}
              max={100000000}
              value={shuttleFee}
              onChange={(e) => setShuttleFee(Number(e.target.value) || 0)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              {t('hostExtrasFee')}
            </label>
            <input
              type="number"
              min={0}
              max={100000000}
              value={extrasFee}
              onChange={(e) => setExtrasFee(Number(e.target.value) || 0)}
              className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostTotalCost')}
            </span>
            <strong className="tabular-nums text-zinc-950 dark:text-white">
              {formatVnd(livePreview.totalCost, locale)}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostConfirmedRevenue')}
            </span>
            <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatVnd(livePreview.totalDeposits, locale)}
            </strong>
          </div>
          <div className="flex justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-800">
            <span className="text-zinc-500 dark:text-zinc-400">
              {t('hostSplitPerSlot')} ({livePreview.totalConfirmedSlots} slot)
            </span>
            <strong className="tabular-nums text-zinc-950 dark:text-volt">
              {formatVnd(livePreview.perSlotShare, locale)}
            </strong>
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
                                amount: formatVnd(Math.abs(row.net_balance), locale),
                              })}
                        </span>
                      )}
                    </div>

                    <p className="tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                      {t('hostSplitDepositCol')}: {formatVnd(row.deposit_paid, locale)} ·{' '}
                      {t('hostSplitShareCol')}: {formatVnd(row.actual_share, locale)} ·{' '}
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
                                amount: formatVnd(Math.abs(row.net_balance), locale),
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
