import { DeliverySpeed, OrderStatus, PaymentMethod, PaymentStatus } from '../types';

export function formatBDT(amount: number): string {
  return `৳ ${Math.round(amount).toLocaleString('en-US')}`;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'অর্ডার গৃহীত',
  confirmed: 'নিশ্চিতকৃত',
  packed: 'প্যাকিং সম্পন্ন',
  shipped: 'ডেলিভারির পথে',
  delivered: 'ডেলিভারি সম্পন্ন',
  cancelled: 'বাতিলকৃত',
};

export const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  confirmed: 'text-sky-700 bg-sky-50 border-sky-200',
  packed: 'text-indigo-700 bg-indigo-50 border-indigo-200',
  shipped: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  delivered: 'text-emerald-800 bg-emerald-100 border-emerald-300',
  cancelled: 'text-rose-700 bg-rose-50 border-rose-200',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bkash: 'বিকাশ (bKash)',
  nagad: 'নগদ (Nagad)',
  card: 'ভিসা / মাস্টারকার্ড',
  cod: 'ক্যাশ অন ডেলিভারি',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'পরিশোধিত',
  pending_cod: 'ডেলিভারিতে পরিশোধ',
  refunded: 'ফেরতকৃত',
};

export const DELIVERY_SPEED_LABELS: Record<DeliverySpeed, string> = {
  standard: 'ঢাকার ভেতরে (২৪-৪৮ ঘণ্টা)',
  express: 'ঢাকার বাইরে (৩-৫ দিন)',
};

export function formatTimestamp(ts: unknown): string {
  if (!ts) return 'সদ্য';
  try {
    if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
      return (ts as { toDate: () => Date }).toDate().toLocaleDateString('bn-BD', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (ts instanceof Date) {
      return ts.toLocaleDateString('bn-BD', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  } catch {
    return 'সদ্য';
  }
  return 'সদ্য';
}
