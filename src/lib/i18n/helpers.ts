import type { Dictionary } from './dictionaries/vi';

type Translator = (
  key: keyof Dictionary,
  vars?: Record<string, string | number>
) => string;

export function translateMatchStatus(status: string, t: Translator): string {
  switch (status) {
    case 'open':
      return t('statusOpen');
    case 'locked':
      return t('statusLocked');
    case 'cancelled':
      return t('statusCancelled');
    case 'finished':
      return t('statusFinished');
    default:
      return status;
  }
}

export function translateRegStatus(status: string, t: Translator): string {
  switch (status) {
    case 'confirmed':
      return t('regConfirmed');
    case 'pending_payment':
      return t('regPendingPayment');
    case 'waitlisted':
      return t('regWaitlisted');
    case 'expired':
      return t('regExpired');
    case 'cancelled':
      return t('regCancelled');
    default:
      return status;
  }
}

export function translatePaymentMethod(method: string, t: Translator): string {
  switch (method) {
    case 'sepay':
      return t('payMethodSepay');
    case 'cash':
      return t('payMethodCash');
    case 'none':
      return t('payMethodNone');
    default:
      return method;
  }
}

export function translateRefundStatus(status: string, t: Translator): string {
  switch (status) {
    case 'pending_review':
      return t('refundStatusPendingReview');
    case 'pending':
      return t('refundStatusPending');
    case 'done':
      return t('refundStatusDone');
    case 'rejected':
      return t('refundStatusRejected');
    default:
      return status;
  }
}

export function translateRefundReason(reason: string, t: Translator): string {
  switch (reason) {
    case 'host_cancelled':
      return t('refundReasonHostCancelled');
    case 'overpaid':
      return t('refundReasonOverpaid');
    case 'cancelled_before_cutoff':
      return t('refundReasonCancelledBeforeCutoff');
    case 'cancelled_late':
      return t('refundReasonCancelledLate');
    case 'late_payment':
      return t('refundReasonLatePayment');
    case 'underpaid_expired':
      return t('refundReasonUnderpaidExpired');
    case 'waitlisted_payment':
      return t('refundReasonWaitlistedPayment');
    case 'duplicate_payment':
      return t('refundReasonDuplicatePayment');
    case 'host_removed':
      return t('refundReasonHostRemoved');
    default:
      return t('refundReasonOther');
  }
}

export function translatePaymentResult(result: string, t: Translator): string {
  switch (result) {
    case 'applied':
    case 'matched':
      return t('payResultApplied');
    case 'overpaid':
      return t('payResultOverpaid');
    case 'underpaid':
      return t('payResultUnderpaid');
    case 'unmatched':
      return t('payResultUnmatched');
    case 'late':
      return t('payResultLate');
    case 'waitlisted':
      return t('payResultWaitlisted');
    case 'duplicate':
      return t('payResultDuplicate');
    default:
      return t('payResultOther');
  }
}

export function formatSlotLabel(count: number, t: Translator): string {
  return count === 1
    ? `1 ${t('slotSingular')}`
    : `${count} ${t('slotPlural')}`;
}
