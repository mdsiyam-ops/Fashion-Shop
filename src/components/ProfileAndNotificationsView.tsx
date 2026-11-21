import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { Bell, Check, LogOut, ShieldCheck } from 'lucide-react';
import {
  clampStr,
  getDatabase,
  handleFirestoreError,
  isVerifiedCustomer,
  OperationType,
  updateDocument,
} from '../firebase';
import { formatBDT, formatTimestamp, ORDER_STATUS_LABELS } from '../lib/format';
import { AppNotification, DeliverySpeed, Order, UserPrivateProfile } from '../types';
import { AuthPanel } from './AuthPanel';

interface ProfileAndNotificationsViewProps {
  currentUser: User | null;
  isAdmin: boolean;
  privateProfile: UserPrivateProfile | null;
  notifications: AppNotification[];
  userOrders: Order[];
  onSignIn: () => void;
  onSignOut: () => void;
  onTrackOrder: (trackingCode: string) => void;
}

export const ProfileAndNotificationsView: React.FC<ProfileAndNotificationsViewProps> = ({
  currentUser,
  isAdmin,
  privateProfile,
  notifications,
  userOrders,
  onSignIn,
  onSignOut,
  onTrackOrder,
}) => {
  const [displayName, setDisplayName] = useState(currentUser?.displayName || '');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('ঢাকা');
  const [postalCode, setPostalCode] = useState('1205');
  const [preferredDelivery, setPreferredDelivery] = useState<DeliverySpeed>('express');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (currentUser?.displayName) setDisplayName(currentUser.displayName);
    if (currentUser?.phoneNumber) {
      setPhone((prev) => prev || currentUser.phoneNumber || '');
    }
  }, [currentUser]);

  useEffect(() => {
    if (privateProfile) {
      setPhone(privateProfile.phone || currentUser?.phoneNumber || '');
      setAddress(privateProfile.address || '');
      setCity(privateProfile.city || 'ঢাকা');
      setPostalCode(privateProfile.postalCode || '1205');
      setPreferredDelivery(privateProfile.preferredDelivery || 'express');
    }
  }, [privateProfile, currentUser]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerifiedCustomer(currentUser) || !currentUser) return;
    setSaving(true);
    setSavedNotice(false);
    try {
      const usersDb = getDatabase('users');
      const userRef = doc(usersDb, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      const cleanName = clampStr(displayName || 'গ্রাহক', 100);
      const batch = writeBatch(usersDb);
      if (!userSnap.exists()) {
        batch.set(userRef, {
          uid: currentUser.uid,
          displayName: cleanName,
          role: isAdmin ? 'admin' : 'customer',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(userRef, {
          displayName: cleanName,
          updatedAt: serverTimestamp(),
        });
      }

      batch.set(
        doc(usersDb, 'users', currentUser.uid, 'private', 'profile'),
        {
          userId: currentUser.uid,
          email: clampStr(currentUser.email || '', 160),
          phone: clampStr(phone, 30),
          address: clampStr(address, 400),
          city: clampStr(city, 80),
          postalCode: clampStr(postalCode, 20),
          preferredDelivery,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await batch.commit();
      setSavedNotice(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}/private/profile`);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkRead = async (notif: AppNotification) => {
    if (notif.read) return;
    try {
      await updateDocument(
        'users',
        'notifications',
        notif.id,
        { read: true },
        { includeUpdatedAt: false }
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `notifications/${notif.id}`);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const usersDb = getDatabase('users');
    const batch = writeBatch(usersDb);
    unread.forEach((n) => {
      batch.update(doc(usersDb, 'notifications', n.id), { read: true });
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'notifications/batch_read');
    }
  };

  if (!currentUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <AuthPanel />
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Account Summary Header */}
      <div className="bg-white border border-zinc-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>{isAdmin ? 'অ্যাডমিন ও যাচাইকৃত অ্যাকাউন্ট' : 'যাচাইকৃত গ্রাহক অ্যাকাউন্ট'}</span>
          </div>
          <h1 className="text-2xl font-bold text-zinc-950">
            {currentUser.displayName || currentUser.phoneNumber || 'সম্মানিত গ্রাহক'}
          </h1>
          <p className="text-xs text-zinc-500">
            {currentUser.email || currentUser.phoneNumber}
          </p>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-200 text-xs font-semibold text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <LogOut className="w-4 h-4" />
          <span>সাইন আউট</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Private Profile Management */}
        <div className="lg:col-span-6 bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-zinc-950">ব্যক্তিগত তথ্য ও ডেলিভারি প্রোফাইল</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              এই তথ্য কঠোরভাবে গোপন রাখা হয় এবং শুধুমাত্র আপনার ডেলিভারির কাজে ব্যবহৃত হয়
            </p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-600 mb-1">প্রদর্শিত নাম</label>
              <input
                type="text"
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-600 mb-1">ফোন নম্বর</label>
                <input
                  type="tel"
                  maxLength={30}
                  placeholder="017XXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-600 mb-1">পছন্দের ডেলিভারির স্থান</label>
                <select
                  value={preferredDelivery}
                  onChange={(e) => setPreferredDelivery(e.target.value as DeliverySpeed)}
                  className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="standard">ঢাকার ভেতরে (২৪-৪৮ ঘণ্টা · ৳৮০)</option>
                  <option value="express">ঢাকার বাইরে (৩-৫ দিন · ৳১২০)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">স্থায়ী ডেলিভারি ঠিকানা</label>
              <textarea
                rows={2}
                maxLength={400}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="বাড়ি নং, রোড নং, এলাকা..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-600 mb-1">শহর</label>
                <input
                  type="text"
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

            {savedNotice && (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                আপনার প্রোফাইল নিরাপদে সংরক্ষণ করা হয়েছে।
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !isVerifiedCustomer(currentUser)}
              className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {saving
                ? 'সংরক্ষণ হচ্ছে...'
                : !isVerifiedCustomer(currentUser)
                ? 'প্রথমে উপরের বার থেকে ইমেইল ভেরিফাই করুন'
                : 'প্রোফাইল আপডেট করুন'}
            </button>
          </form>
        </div>

        {/* Right: Real-Time Notifications & Recent Orders */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-zinc-950" />
                <h2 className="text-lg font-bold text-zinc-950">
                  রিয়েল-টাইম নোটিফিকেশন ({unreadCount} অপঠিত)
                </h2>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                >
                  সব পঠিত চিহ্নিত করুন
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <p className="text-sm text-zinc-500 py-6 text-center">
                এখনো কোনো নোটিফিকেশন আসেনি।
              </p>
            ) : (
              <div className="divide-y divide-zinc-200 max-h-72 overflow-y-auto">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    onClick={() => void handleMarkRead(notif)}
                    className={`py-3.5 px-2 cursor-pointer transition-colors ${
                      notif.read ? 'opacity-70' : 'bg-emerald-50/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-950">{notif.title}</p>
                      <span className="text-[11px] text-zinc-400 shrink-0">
                        {formatTimestamp(notif.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1 leading-relaxed">{notif.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-zinc-950">আমার অর্ডারের সংক্ষিপ্ত তালিকা</h2>
            {userOrders.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">কোনো অর্ডার ইতিহাস নেই।</p>
            ) : (
              <div className="divide-y divide-zinc-200">
                {userOrders.slice(0, 5).map((ord) => (
                  <div key={ord.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <p className="font-semibold font-mono-tabular text-zinc-950">{ord.trackingCode}</p>
                      <p className="text-xs text-zinc-500">{ORDER_STATUS_LABELS[ord.status]}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold tabular-nums">{formatBDT(ord.totalAmount)}</span>
                      <button
                        type="button"
                        onClick={() => onTrackOrder(ord.trackingCode)}
                        className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer"
                      >
                        ট্র্যাক
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
