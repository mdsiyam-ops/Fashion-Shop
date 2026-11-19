import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, increment, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CheckCircle2, CreditCard, Lock, Minus, Plus, ShieldCheck, Smartphone, Trash2, Truck, X } from 'lucide-react';
import { clampStr, db, handleFirestoreError, OperationType } from '../firebase';
import { DELIVERY_SPEED_LABELS, formatBDT, PAYMENT_METHOD_LABELS } from '../lib/format';
import {
  CartItem,
  DeliverySpeed,
  PaymentMethod,
  StoreSettings,
  UserPrivateProfile,
} from '../types';
import { ResilientImage } from './ResilientImage';

interface CartAndCheckoutModalProps {
  isOpen: boolean;
  initialStep?: 'cart' | 'checkout';
  cart: CartItem[];
  settings: StoreSettings;
  currentUser: User | null;
  privateProfile: UserPrivateProfile | null;
  firestoreProductIds: Set<string>;
  trafficSource: 'web' | 'fb_shop_now';
  onClose: () => void;
  onUpdateQty: (productId: string, qty: number) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  onRequireAuth: () => void;
  onOrderSuccess: (trackingCode: string) => void;
}

export const CartAndCheckoutModal: React.FC<CartAndCheckoutModalProps> = ({
  isOpen,
  initialStep = 'cart',
  cart,
  settings,
  currentUser,
  privateProfile,
  firestoreProductIds,
  trafficSource,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  onRequireAuth,
  onOrderSuccess,
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'gateway' | 'success'>(initialStep);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [city, setCity] = useState('ঢাকা');
  const [postalCode, setPostalCode] = useState('1205');
  const [deliverySpeed, setDeliverySpeed] = useState<DeliverySpeed>('standard');
  const [paymentMode, setPaymentMode] = useState<'cod' | 'advance'>('cod');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cod');

  // Gateway encrypted simulation inputs (never persisted raw to Firestore!)
  const [walletNumber, setWalletNumber] = useState('');
  const [gatewayOtp, setGatewayOtp] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [gatewayError, setGatewayError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedTrackingCode, setCompletedTrackingCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep);
      setGatewayError('');
    }
  }, [isOpen, initialStep]);

  useEffect(() => {
    if (currentUser?.displayName && !customerName) {
      setCustomerName(currentUser.displayName);
    }
    if (privateProfile) {
      if (privateProfile.phone) setCustomerPhone(privateProfile.phone);
      if (privateProfile.address) setShippingAddress(privateProfile.address);
      if (privateProfile.city) setCity(privateProfile.city);
      if (privateProfile.postalCode) setPostalCode(privateProfile.postalCode);
      if (privateProfile.preferredDelivery) setDeliverySpeed(privateProfile.preferredDelivery);
    }
  }, [currentUser, privateProfile, customerName]);

  if (!isOpen) return null;

  const subtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const deliveryFee =
    cart.length === 0
      ? 0
      : deliverySpeed === 'standard'
      ? settings.standardDeliveryFee
      : settings.expressDeliveryFee;
  const totalAmount = subtotal + deliveryFee;

  const handleProceedToCheckout = () => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    setStep('checkout');
  };

  const handleCheckoutContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setGatewayError('');
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!customerName.trim() || customerPhone.trim().length < 6 || shippingAddress.trim().length < 3) {
      setGatewayError('অনুগ্রহ করে সঠিক নাম, ফোন নম্বর এবং পূর্ণাঙ্গ ডেলিভারি ঠিকানা দিন।');
      return;
    }

    if (paymentMethod === 'cod') {
      void executeOrderPlacement('COD-VERIFIED');
    } else {
      setStep('gateway');
    }
  };

  const handleGatewayConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setGatewayError('');

    if (paymentMethod === 'bkash' || paymentMethod === 'nagad') {
      const digits = walletNumber.replace(/\D/g, '');
      if (digits.length < 11) {
        setGatewayError('অনুগ্রহ করে ১১ ডিজিটের সঠিক মোবাইল ব্যাংকিং নম্বর দিন।');
        return;
      }
      if (gatewayOtp.trim().length < 4) {
        setGatewayError('নিরাপদ ভেরিফিকেশন কোড (৪-৬ ডিজিট, যেমন: 123456) লিখুন।');
        return;
      }
      const tokenRef = `TXN-${paymentMethod.toUpperCase()}-${Date.now().toString().slice(-6)}`;
      void executeOrderPlacement(tokenRef);
    } else if (paymentMethod === 'card') {
      const cleanCard = cardNumber.replace(/\D/g, '');
      if (cleanCard.length < 12 || !cardHolder.trim() || !cardExpiry.trim() || cardCvv.trim().length < 3) {
        setGatewayError('কার্ডের সকল তথ্য সঠিকভাবে পূরণ করুন।');
        return;
      }
      const last4 = cleanCard.slice(-4);
      const tokenRef = `TXN-CARD-${last4}-${Date.now().toString().slice(-5)}`;
      void executeOrderPlacement(tokenRef);
    }
  };

  const executeOrderPlacement = async (paymentRef: string) => {
    if (!currentUser || cart.length === 0) return;
    setSubmitting(true);
    setGatewayError('');

    const orderId = `ord_${Date.now()}_${currentUser.uid.slice(0, 6)}`;
    const trackingCode = `SHL-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const totalItemCount = cart.reduce((acc, c) => acc + c.quantity, 0);
    const estimatedWindow =
      deliverySpeed === 'standard'
        ? '২৪ থেকে ৪৮ ঘণ্টার মধ্যে (ঢাকার ভেতরে)'
        : '৩ থেকে ৫ দিনের মধ্যে (ঢাকার বাইরে)';

    const batch = writeBatch(db);

    // 1. Private Order Record (PII isolated to owner & admin)
    batch.set(doc(db, 'orders', orderId), {
      id: orderId,
      trackingCode,
      userId: currentUser.uid,
      customerName: clampStr(customerName, 100),
      customerPhone: clampStr(customerPhone, 30),
      shippingAddress: clampStr(shippingAddress, 400),
      city: clampStr(city, 80),
      postalCode: clampStr(postalCode || '1000', 20),
      items: cart.slice(0, 25).map((item) => ({
        productId: item.product.id,
        name: clampStr(item.product.name, 140),
        price: item.product.price,
        quantity: item.quantity,
        imageUrl: clampStr(item.product.imageUrl, 500),
      })),
      subtotal,
      deliveryFee,
      totalAmount,
      deliverySpeed,
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending_cod' : 'paid',
      paymentReference: clampStr(paymentRef, 80),
      status: 'pending',
      courierNote:
        deliverySpeed === 'standard'
          ? 'ঢাকার ভেতরে ডেলিভারি (২৪-৪৮ ঘণ্টা)'
          : 'ঢাকার বাইরে কুরিয়ার ডেলিভারি (৩-৫ দিন)',
      source: trafficSource,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Sanitized Non-PII Public Tracking Projection (Atomic Pillar 7)
    batch.set(doc(db, 'orderTracking', trackingCode), {
      trackingCode,
      orderId,
      userId: currentUser.uid,
      status: 'pending',
      deliverySpeed,
      city: clampStr(city, 80),
      itemCount: totalItemCount,
      courierNote:
        deliverySpeed === 'standard'
          ? 'ঢাকার ভেতরে ডেলিভারি (২৪-৪৮ ঘণ্টা)'
          : 'ঢাকার বাইরে কুরিয়ার ডেলিভারি (৩-৫ দিন)',
      estimatedWindow,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 3. Atomic Stock Decrement on live Firestore products
    for (const item of cart) {
      if (firestoreProductIds.has(item.product.id) && item.product.stock >= item.quantity) {
        batch.update(doc(db, 'products', item.product.id), {
          stock: item.product.stock - item.quantity,
          soldCount: increment(item.quantity),
          updatedAt: serverTimestamp(),
        });
      }
    }

    // 4. Real-Time Notifications for Customer & Admin
    const custNotifId = `notif_cust_${Date.now()}`;
    batch.set(doc(db, 'notifications', custNotifId), {
      id: custNotifId,
      recipientId: currentUser.uid,
      title: `অর্ডার নিশ্চিত হয়েছে (${trackingCode})`,
      message: `আপনার ${formatBDT(totalAmount)} টাকার অর্ডারটি সফলভাবে গৃহীত হয়েছে। ট্র্যাকিং কোড: ${trackingCode}`,
      type: 'order_placed',
      relatedOrderId: orderId,
      read: false,
      createdAt: serverTimestamp(),
    });

    const adminNotifId = `notif_adm_${Date.now()}`;
    batch.set(doc(db, 'notifications', adminNotifId), {
      id: adminNotifId,
      recipientId: 'admin',
      title: `নতুন অর্ডার এসেছে (${trackingCode})`,
      message: `${clampStr(customerName, 50)} মোট ${formatBDT(totalAmount)} টাকার (${PAYMENT_METHOD_LABELS[paymentMethod]}) অর্ডার করেছেন।`,
      type: 'order_placed',
      relatedOrderId: orderId,
      read: false,
      createdAt: serverTimestamp(),
    });

    // 5. Save/Update User's Private Profile for future 1-click checkout
    batch.set(
      doc(db, 'users', currentUser.uid, 'private', 'profile'),
      {
        userId: currentUser.uid,
        email: clampStr(currentUser.email || '', 160),
        phone: clampStr(customerPhone, 30),
        address: clampStr(shippingAddress, 400),
        city: clampStr(city, 80),
        postalCode: clampStr(postalCode || '1000', 20),
        preferredDelivery: deliverySpeed,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    try {
      await batch.commit();
      setCompletedTrackingCode(trackingCode);
      onClearCart();
      setCardCvv('');
      setCardNumber('');
      setGatewayOtp('');
      setStep('success');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `orders/${orderId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="শপিং ব্যাগ ও চেকআউট"
    >
      <div className="w-full max-w-lg bg-white h-full border-l border-zinc-200 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">
              {step === 'cart' && 'আপনার শপিং ব্যাগ'}
              {step === 'checkout' && 'ডেলিভারি ও পেমেন্ট নির্বাচন'}
              {step === 'gateway' && 'নিরাপদ অনলাইন পেমেন্ট গেটওয়ে'}
              {step === 'success' && 'অর্ডার সফলভাবে সম্পন্ন হয়েছে'}
            </h2>
            {step !== 'success' && (
              <p className="text-xs text-zinc-500">
                {step === 'cart' && `মোট ${cart.reduce((a, b) => a + b.quantity, 0)}টি পণ্য`}
                {step === 'checkout' && 'তথ্য সম্পূর্ণ সুরক্ষিত ও এনক্রিপ্টেড'}
                {step === 'gateway' && 'TLS ২.৩ ও ২৫৬-বিট সিকিউরড গেটওয়ে'}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 cursor-pointer"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'cart' && (
            <>
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16">
                  <p className="text-base font-semibold text-zinc-900 mb-2">আপনার ব্যাগটি বর্তমানে খালি</p>
                  <p className="text-sm text-zinc-500 max-w-xs mb-6">
                    পছন্দের পণ্যগুলো ব্যাগে যোগ করে সহজেই অর্ডার সম্পন্ন করুন।
                  </p>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2.5 bg-zinc-950 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 cursor-pointer"
                  >
                    কেনাকাটা শুরু করুন
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Delivery Fee Info */}
                  <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700">
                    <p>
                      ঢাকার ভেতরে ডেলিভারি (২৪-৪৮ ঘণ্টা): <strong className="tabular-nums">{formatBDT(settings.standardDeliveryFee)}</strong> · ঢাকার বাইরে (৩-৫ দিন): <strong className="tabular-nums">{formatBDT(settings.expressDeliveryFee)}</strong>
                    </p>
                  </div>

                  {/* Items */}
                  <div className="divide-y divide-zinc-200">
                    {cart.map((item) => (
                      <div key={item.product.id} className="py-4 flex gap-4">
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                          <ResilientImage src={item.product.imageUrl} alt={item.product.name} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-950 truncate">
                            {item.product.name}
                          </h3>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {item.product.categoryName} · {formatBDT(item.product.price)}
                          </p>
                          <div className="flex items-center justify-between mt-3">
                            <div className="inline-flex items-center border border-zinc-200 rounded-md">
                              <button
                                type="button"
                                onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                                aria-label="কমান"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center text-xs font-semibold tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateQty(
                                    item.product.id,
                                    Math.min(item.product.stock, item.quantity + 1)
                                  )
                                }
                                className="w-7 h-7 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                                aria-label="বাড়ান"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(item.product.id)}
                              className="text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              সরান
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleCheckoutContinue} className="space-y-6">
              {/* Shipping Fields */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-zinc-950">১. গ্রাহকের ও ডেলিভারি তথ্য</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">পূর্ণ নাম *</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">মোবাইল নম্বর *</label>
                    <input
                      type="tel"
                      required
                      maxLength={30}
                      placeholder="017XXXXXXXX"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-zinc-600 mb-1">বিস্তারিত ঠিকানা *</label>
                  <textarea
                    rows={2}
                    required
                    maxLength={400}
                    placeholder="বাড়ি নং, রোড নং, এলাকা..."
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">শহর / জেলা *</label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">পোস্টাল কোড</label>
                    <input
                      type="text"
                      maxLength={20}
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery Location */}
              <div className="space-y-3 pt-4 border-t border-zinc-200">
                <h3 className="text-sm font-bold text-zinc-950">২. ডেলিভারির স্থান নির্বাচন</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {([
                    {
                      speed: 'standard' as DeliverySpeed,
                      title: 'ঢাকার ভেতরে',
                      subtitle: '২৪-৪৮ ঘণ্টার মধ্যে ডেলিভারি',
                      fee: settings.standardDeliveryFee,
                    },
                    {
                      speed: 'express' as DeliverySpeed,
                      title: 'ঢাকার বাইরে',
                      subtitle: '৩-৫ দিনের মধ্যে কুরিয়ার ডেলিভারি',
                      fee: settings.expressDeliveryFee,
                    },
                  ]).map((opt) => (
                    <label
                      key={opt.speed}
                      className={`flex items-center justify-between p-3.5 border rounded-xl cursor-pointer transition-colors ${
                        deliverySpeed === opt.speed
                          ? 'border-zinc-950 bg-zinc-50'
                          : 'border-zinc-200 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="deliverySpeed"
                          checked={deliverySpeed === opt.speed}
                          onChange={() => setDeliverySpeed(opt.speed)}
                          className="accent-zinc-950"
                        />
                        <div>
                          <p className="text-sm font-semibold text-zinc-950 flex items-center gap-1.5">
                            <Truck className="w-4 h-4 text-emerald-700" />
                            <span>{opt.title}</span>
                          </p>
                          <p className="text-xs text-zinc-500">{opt.subtitle}</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold tabular-nums text-zinc-950">
                        {formatBDT(opt.fee)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Payment Gateway Choice: COD vs Advance Payment */}
              <div className="space-y-3 pt-4 border-t border-zinc-200">
                <h3 className="text-sm font-bold text-zinc-950">৩. পেমেন্ট মাধ্যম নির্বাচন</h3>
                <div className="grid grid-cols-1 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('cod');
                      setPaymentMethod('cod');
                    }}
                    className={`p-3.5 border rounded-xl text-left transition-colors cursor-pointer ${
                      paymentMode === 'cod'
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                    }`}
                  >
                    <p className="text-sm font-semibold">১. ক্যাশ অন ডেলিভারি</p>
                    <p className={`text-xs mt-0.5 ${paymentMode === 'cod' ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      কোনো অগ্রিম টাকা প্রদান ছাড়াই ডেলিভারি তথ্য দিয়ে অর্ডার করুন
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('advance');
                      if (paymentMethod === 'cod') setPaymentMethod('bkash');
                    }}
                    className={`p-3.5 border rounded-xl text-left transition-colors cursor-pointer ${
                      paymentMode === 'advance'
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                    }`}
                  >
                    <p className="text-sm font-semibold">২. অ্যাডভান্স পেমেন্ট</p>
                    <p className={`text-xs mt-0.5 ${paymentMode === 'advance' ? 'text-zinc-300' : 'text-zinc-500'}`}>
                      বিকাশ, নগদ বা কার্ডের মাধ্যমে নিরাপদ অগ্রিম পেমেন্ট করুন
                    </p>
                  </button>
                </div>

                {paymentMode === 'advance' && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {(['bkash', 'nagad', 'card'] as PaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`p-2.5 border rounded-lg text-center transition-colors cursor-pointer ${
                          paymentMethod === method
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900 font-semibold'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                        }`}
                      >
                        <div className="flex flex-col items-center gap-1 text-xs">
                          {method === 'card' ? (
                            <CreditCard className="w-4 h-4 shrink-0" />
                          ) : (
                            <Smartphone className="w-4 h-4 shrink-0" />
                          )}
                          <span>{PAYMENT_METHOD_LABELS[method]}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {gatewayError && (
                <p className="text-xs text-rose-600 font-medium">{gatewayError}</p>
              )}
            </form>
          )}

          {step === 'gateway' && (
            <form id="gateway-form" onSubmit={handleGatewayConfirm} className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 space-y-1">
                  <p className="font-semibold">এনক্রিপ্টেড পেমেন্ট গেটওয়ে ({PAYMENT_METHOD_LABELS[paymentMethod]})</p>
                  <p>আপনার পেমেন্ট তথ্য টোকেনাইজড পদ্ধতিতে প্রক্রিয়া হয়। কোনো সংবেদনশীল পিন বা CVV সংরক্ষণ করা হয় না।</p>
                </div>
              </div>

              <div className="p-4 border border-zinc-200 rounded-xl flex items-center justify-between">
                <span className="text-sm text-zinc-600">পরিশোধযোগ্য মোট মূল্য</span>
                <span className="text-xl font-bold text-zinc-950 tabular-nums">
                  {formatBDT(totalAmount)}
                </span>
              </div>

              {(paymentMethod === 'bkash' || paymentMethod === 'nagad') && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">
                      {PAYMENT_METHOD_LABELS[paymentMethod]} অ্যাকাউন্ট নম্বর *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="01XXXXXXXXX"
                      value={walletNumber}
                      onChange={(e) => setWalletNumber(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">
                      ওটিপি ভেরিফিকেশন কোড (ডেমো কোড: 123456) *
                    </label>
                    <input
                      type="password"
                      required
                      maxLength={6}
                      placeholder="••••••"
                      value={gatewayOtp}
                      onChange={(e) => setGatewayOtp(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>
              )}

              {paymentMethod === 'card' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">কার্ডহোল্ডারের নাম *</label>
                    <input
                      type="text"
                      required
                      placeholder="MD SIYAM"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">কার্ড নম্বর *</label>
                    <input
                      type="text"
                      required
                      maxLength={19}
                      placeholder="4532 •••• •••• 1234"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">মেয়াদ (MM/YY) *</label>
                      <input
                        type="text"
                        required
                        maxLength={5}
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">CVV / CVC *</label>
                      <input
                        type="password"
                        required
                        maxLength={4}
                        placeholder="•••"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-zinc-200 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {gatewayError && (
                <p className="text-xs text-rose-600 font-medium">{gatewayError}</p>
              )}

              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="text-xs text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
              >
                ← পেছনে ফিরে যান
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="py-10 text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-zinc-950">আপনার অর্ডার নিশ্চিত হয়েছে!</h3>
                <p className="text-sm text-zinc-600 mt-1">
                  রিয়েল-টাইম নোটিফিকেশন এবং অর্ডার ট্র্যাকিং চালু করা হয়েছে।
                </p>
              </div>
              <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-xl inline-block">
                <p className="text-xs text-zinc-500 mb-1">আপনার ট্র্যাকিং কোড</p>
                <p className="text-xl font-bold font-mono-tabular text-zinc-950">
                  {completedTrackingCode}
                </p>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    onOrderSuccess(completedTrackingCode);
                    onClose();
                  }}
                  className="w-full py-3 px-5 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  লাইভ অর্ডার ট্র্যাক করুন
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Summary & Action */}
        {step !== 'success' && cart.length > 0 && (
          <div className="p-6 border-t border-zinc-200 bg-zinc-50 space-y-3">
            <div className="flex justify-between text-sm text-zinc-600">
              <span>পণ্যের মূল্য</span>
              <span className="tabular-nums">{formatBDT(subtotal)}</span>
            </div>
            {step !== 'cart' && (
              <div className="flex justify-between text-sm text-zinc-600">
                <span>ডেলিভারি চার্জ</span>
                <span className="tabular-nums">
                  {deliveryFee === 0 ? 'ফ্রি' : formatBDT(deliveryFee)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-zinc-950 pt-2 border-t border-zinc-200">
              <span>সর্বমোট</span>
              <span className="tabular-nums">
                {formatBDT(step === 'cart' ? subtotal : totalAmount)}
              </span>
            </div>

            {step === 'cart' && (
              <button
                type="button"
                onClick={handleProceedToCheckout}
                className="w-full py-3 px-5 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                {currentUser ? 'নিরাপদ চেকআউট করুন' : 'অর্ডার করতে গুগল সাইন ইন করুন'}
              </button>
            )}

            {step === 'checkout' && (
              <button
                type="submit"
                form="checkout-form"
                disabled={submitting}
                className="w-full py-3 px-5 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting
                  ? 'অর্ডার সম্পন্ন হচ্ছে...'
                  : paymentMethod === 'cod'
                  ? 'ক্যাশ অন ডেলিভারিতে অর্ডার নিশ্চিত করুন'
                  : 'নিরাপদ পেমেন্ট গেটওয়েতে যান'}
              </button>
            )}

            {step === 'gateway' && (
              <button
                type="submit"
                form="gateway-form"
                disabled={submitting}
                className="w-full py-3 px-5 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                {submitting ? 'পেমেন্ট যাচাই হচ্ছে...' : `${formatBDT(totalAmount)} পেমেন্ট নিশ্চিত করুন`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
