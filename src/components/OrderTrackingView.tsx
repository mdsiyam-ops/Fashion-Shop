import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, Clock, Package, Search, Truck, XCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  DELIVERY_SPEED_LABELS,
  formatBDT,
  formatTimestamp,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { Order, OrderStatus, OrderTracking } from '../types';

interface OrderTrackingViewProps {
  initialTrackingCode: string;
  currentUser: User | null;
  userOrders: Order[];
  onRequireAuth: () => void;
}

const TIMELINE_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'pending', label: 'অর্ডার গৃহীত' },
  { status: 'confirmed', label: 'নিশ্চিতকৃত' },
  { status: 'packed', label: 'প্যাকিং সম্পন্ন' },
  { status: 'shipped', label: 'ডেলিভারির পথে' },
  { status: 'delivered', label: 'ডেলিভারি সম্পন্ন' },
];

export const OrderTrackingView: React.FC<OrderTrackingViewProps> = ({
  initialTrackingCode,
  currentUser,
  userOrders,
  onRequireAuth,
}) => {
  const [codeInput, setCodeInput] = useState(initialTrackingCode);
  const [activeCode, setActiveCode] = useState(initialTrackingCode);
  const [trackingDoc, setTrackingDoc] = useState<OrderTracking | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (initialTrackingCode) {
      setCodeInput(initialTrackingCode);
      setActiveCode(initialTrackingCode);
    }
  }, [initialTrackingCode]);

  useEffect(() => {
    const clean = activeCode.trim().toUpperCase();
    if (!clean) {
      setTrackingDoc(null);
      setNotFound(false);
      return;
    }

    setLoading(true);
    setNotFound(false);
    const unsub = onSnapshot(
      doc(db, 'orderTracking', clean),
      (snap) => {
        if (snap.exists()) {
          setTrackingDoc(snap.data() as OrderTracking);
          setNotFound(false);
        } else {
          setTrackingDoc(null);
          setNotFound(true);
        }
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.GET, `orderTracking/${clean}`);
      }
    );

    return () => unsub();
  }, [activeCode]);

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = codeInput.trim().toUpperCase();
    if (cleaned) {
      setActiveCode(cleaned);
    }
  };

  const handleCancelOrder = async (order: Order) => {
    if (!currentUser || order.status !== 'pending') return;
    setCancelling(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'orders', order.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'orderTracking', order.trackingCode), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setCancelling(false);
    }
  };

  const activeStepIndex = trackingDoc
    ? TIMELINE_STEPS.findIndex((s) => s.status === trackingDoc.status)
    : -1;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header & Search */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">লাইভ অর্ডার ট্র্যাকিং</h1>
          <p className="text-sm text-zinc-500 mt-1">
            আপনার অর্ডার ট্র্যাকিং কোড (যেমন: SHL-XXXXXX) দিয়ে পণ্যের বর্তমান অবস্থান জানুন।
          </p>
        </div>

        <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="ট্র্যাকিং কোড লিখুন (যেমন: SHL-4A9X2B)"
              className="w-full pl-10 pr-4 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular uppercase focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
          >
            ট্র্যাক করুন
          </button>
        </form>
      </div>

      {/* Active Tracking Timeline */}
      {loading && (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center text-sm text-zinc-500">
          অর্ডারের তথ্য লোড হচ্ছে...
        </div>
      )}

      {!loading && notFound && activeCode && (
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-2">
          <p className="text-base font-semibold text-zinc-950">
            ট্র্যাকিং কোড <span className="font-mono-tabular">{activeCode}</span> পাওয়া যায়নি
          </p>
          <p className="text-sm text-zinc-500">
            দয়া করে কোডটি সঠিকভাবে যাচাই করুন অথবা নিচে আপনার অ্যাকাউন্টের অর্ডার তালিকা থেকে নির্বাচন করুন।
          </p>
        </div>
      )}

      {!loading && trackingDoc && (
        <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
            <div>
              <p className="text-xs text-zinc-500">ট্র্যাকিং কোড</p>
              <h2 className="text-xl font-bold font-mono-tabular text-zinc-950">
                {trackingDoc.trackingCode}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span
                className={`px-3 py-1 rounded-md border font-semibold ${
                  ORDER_STATUS_TONE[trackingDoc.status]
                }`}
              >
                {ORDER_STATUS_LABELS[trackingDoc.status]}
              </span>
              <span className="text-zinc-500">
                {DELIVERY_SPEED_LABELS[trackingDoc.deliverySpeed]}
              </span>
            </div>
          </div>

          {trackingDoc.status === 'cancelled' ? (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>এই অর্ডারটি বাতিল করা হয়েছে।</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              {TIMELINE_STEPS.map((step, idx) => {
                const completed = idx <= activeStepIndex;
                const current = idx === activeStepIndex;
                return (
                  <div
                    key={step.status}
                    className={`p-4 rounded-xl border transition-colors ${
                      current
                        ? 'border-emerald-700 bg-emerald-50/70'
                        : completed
                        ? 'border-zinc-950 bg-zinc-50'
                        : 'border-zinc-200 bg-white opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono-tabular text-zinc-500">0{idx + 1}</span>
                      {completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <Clock className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>
                    <p className="text-sm font-semibold text-zinc-950">{step.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-200 text-sm">
            <div>
              <p className="text-xs text-zinc-500">সম্ভাব্য ডেলিভারি সময়</p>
              <p className="font-semibold text-zinc-950 mt-0.5">{trackingDoc.estimatedWindow}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">গন্তব্য শহর ও পণ্য সংখ্যা</p>
              <p className="font-semibold text-zinc-950 mt-0.5 tabular-nums">
                {trackingDoc.city} · {trackingDoc.itemCount}টি পণ্য
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">কুরিয়ার আপডেট</p>
              <p className="font-semibold text-zinc-950 mt-0.5">{trackingDoc.courierNote}</p>
            </div>
          </div>
        </div>
      )}

      {/* User's Own Orders List */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">আপনার সাম্প্রতিক অর্ডারসমূহ</h2>
            <p className="text-xs text-zinc-500">গোপনীয়তা রক্ষার্থে শুধুমাত্র আপনার নিজের অর্ডার এখানে প্রদর্শিত হয়</p>
          </div>
          {!currentUser && (
            <button
              type="button"
              onClick={onRequireAuth}
              className="px-4 py-2 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              অর্ডার দেখতে সাইন ইন করুন
            </button>
          )}
        </div>

        {currentUser && userOrders.length === 0 && (
          <div className="py-8 text-center text-sm text-zinc-500 flex flex-col items-center gap-2">
            <Package className="w-6 h-6 text-zinc-400" />
            <span>আপনার এখনো কোনো অর্ডার নেই।</span>
          </div>
        )}

        {currentUser && userOrders.length > 0 && (
          <div className="divide-y divide-zinc-200">
            {userOrders.map((order) => (
              <div
                key={order.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-bold font-mono-tabular text-zinc-950">
                      {order.trackingCode}
                    </span>
                    <span className="text-zinc-300" aria-hidden="true">·</span>
                    <span className="text-zinc-600">{formatTimestamp(order.createdAt)}</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {order.items.length}টি আইটেম · {PAYMENT_METHOD_LABELS[order.paymentMethod]} ·{' '}
                    <strong className="text-zinc-900 tabular-nums">{formatBDT(order.totalAmount)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  <span
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                      ORDER_STATUS_TONE[order.status]
                    }`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeInput(order.trackingCode);
                      setActiveCode(order.trackingCode);
                    }}
                    className="px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg hover:bg-zinc-100 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    ট্র্যাক
                  </button>
                  {order.status === 'pending' && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={() => void handleCancelOrder(order)}
                      className="px-3 py-1.5 text-xs font-medium text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer"
                    >
                      বাতিল
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
