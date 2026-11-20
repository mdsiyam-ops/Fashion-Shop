import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onIdTokenChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Bell, MailCheck, X } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthPanel } from './components/AuthPanel';
import { CartAndCheckoutModal } from './components/CartAndCheckoutModal';
import { ActiveTab, Navbar } from './components/Navbar';
import { OrderTrackingView } from './components/OrderTrackingView';
import { ProductDetailModal } from './components/ProductDetailModal';
import { ProfileAndNotificationsView } from './components/ProfileAndNotificationsView';
import { ReviewsSectionView } from './components/ReviewsSectionView';
import { Storefront } from './components/Storefront';
import {
  ADMIN_EMAIL,
  auth,
  clampStr,
  db,
  handleFirestoreError,
  isQuotaExceededError,
  isVerifiedCustomer,
  OperationType,
} from './firebase';
import {
  DEFAULT_STORE_SETTINGS,
  purgeDemoDataFromFirestore,
  seedInitialStoreData,
  STARTER_CATEGORIES,
  STARTER_PRODUCT_IDS,
  STARTER_REVIEW_IDS,
} from './lib/seedData';
import {
  AppNotification,
  CartItem,
  Category,
  Order,
  Product,
  Review,
  StoreSettings,
  UserPrivateProfile,
} from './types';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [verifyFeedback, setVerifyFeedback] = useState('');
  const [checkingVerify, setCheckingVerify] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('store');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutInitialStep, setCheckoutInitialStep] = useState<'cart' | 'checkout'>('cart');
  const [trackingCodeFocus, setTrackingCodeFocus] = useState('');

  const [fsCategories, setFsCategories] = useState<Category[]>(() => {
    try {
      const raw = localStorage.getItem('fashion_shop_categories_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as Category[];
      }
    } catch {
      // ignore cache read errors
    }
    return [];
  });
  const [fsProducts, setFsProducts] = useState<Product[]>(() => {
    try {
      const raw = localStorage.getItem('fashion_shop_products_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return (parsed as Product[]).filter((p) => !STARTER_PRODUCT_IDS.has(p.id));
        }
      }
    } catch {
      // ignore cache read errors
    }
    return [];
  });
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [firestoreIssue, setFirestoreIssue] = useState<'quota' | 'network' | null>(null);
  const [listenerEpoch, setListenerEpoch] = useState(0);
  const [fsReviews, setFsReviews] = useState<Review[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(() => {
    try {
      const raw = localStorage.getItem('fashion_shop_settings_cache_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoreSettings>;
        return { ...DEFAULT_STORE_SETTINGS, ...parsed };
      }
    } catch {
      // ignore cache read errors
    }
    return DEFAULT_STORE_SETTINGS;
  });
  const [privateProfile, setPrivateProfile] = useState<UserPrivateProfile | null>(null);
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [liveToast, setLiveToast] = useState<AppNotification | null>(null);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('shoili_cart_v1');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter(
            (item): item is CartItem =>
              Boolean(
                item &&
                  item.product &&
                  typeof item.product.id === 'string' &&
                  typeof item.product.price === 'number' &&
                  typeof item.quantity === 'number'
              )
          )
        : [];
    } catch {
      return [];
    }
  });

  const trafficSource: 'web' | 'fb_shop_now' = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('source') === 'fb_shop_now' ? 'fb_shop_now' : 'web';
  }, []);

  const seededRef = useRef(false);
  const purgedDemoRef = useRef(false);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());

  const isAdmin = Boolean(
    currentUser &&
      currentUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
      currentUser.emailVerified === true
  );

  // Guard against non-admin users accessing admin tab
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('store');
    }
  }, [activeTab, isAdmin]);

  // Persist cart locally
  useEffect(() => {
    try {
      localStorage.setItem('shoili_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  // Auth Listener (responds to sign-in, sign-out, and token refresh after email verification)
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user) {
        setAuthModalOpen(false);
      }
      if (user && isVerifiedCustomer(user)) {
        setVerifyFeedback('');
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          const fallbackName = clampStr(
            user.displayName || user.phoneNumber || 'সম্মানিত গ্রাহক',
            100
          );
          const isAdminEmail = user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: user.uid,
              displayName: fallbackName,
              role: isAdminEmail ? 'admin' : 'customer',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else if (user.displayName) {
            await updateDoc(userRef, {
              displayName: clampStr(user.displayName, 100),
              updatedAt: serverTimestamp(),
            });
          }
        } catch {
          // Non-fatal user sync guard
        }
      }
    });
    return () => unsub();
  }, []);

  // Public Storefront Subscriptions (Categories, Products, Reviews, Settings)
  useEffect(() => {
    let resolvedProducts = false;

    const loadingTimeout = window.setTimeout(() => {
      if (!resolvedProducts) {
        setProductsLoaded(true);
        setFirestoreIssue((prev) => prev ?? 'network');
      }
    }, 6000);

    const handlePublicListenerError = (err: unknown, op: OperationType, path: string) => {
      if (path === 'products') {
        resolvedProducts = true;
        setProductsLoaded(true);
      }
      if (isQuotaExceededError(err)) {
        setFirestoreIssue('quota');
        return;
      }
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      if (msg.includes('permission') || msg.includes('insufficient')) {
        handleFirestoreError(err, op, path);
        return;
      }
      setFirestoreIssue((prev) => prev ?? 'network');
    };

    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Category);
        setFsCategories(list);
        try {
          localStorage.setItem('fashion_shop_categories_cache_v1', JSON.stringify(list));
        } catch {
          // ignore storage quota errors
        }
      },
      (err) => handlePublicListenerError(err, OperationType.LIST, 'categories')
    );

    const unsubProds = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        resolvedProducts = true;
        window.clearTimeout(loadingTimeout);
        const list = snap.docs.map((d) => d.data() as Product);
        setFsProducts(list);
        setProductsLoaded(true);
        setFirestoreIssue(null);
        try {
          const cleanCache = list.filter((p) => !STARTER_PRODUCT_IDS.has(p.id));
          localStorage.setItem('fashion_shop_products_cache_v1', JSON.stringify(cleanCache));
        } catch {
          // ignore storage quota errors
        }
      },
      (err) => {
        window.clearTimeout(loadingTimeout);
        handlePublicListenerError(err, OperationType.LIST, 'products');
      }
    );

    const unsubRevs = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Review);
        setFsReviews(list);
      },
      (err) => handlePublicListenerError(err, OperationType.LIST, 'reviews')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'store'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<StoreSettings>;
          const merged: StoreSettings = {
            ...DEFAULT_STORE_SETTINGS,
            ...data,
          };
          const normalized =
            merged.storeName === 'শৈলী স্টোর'
              ? {
                  ...merged,
                  storeName: 'Fashion Shop',
                  standardDeliveryFee: 80,
                  expressDeliveryFee: 120,
                }
              : merged;
          setSettings(normalized);
          try {
            localStorage.setItem('fashion_shop_settings_cache_v1', JSON.stringify(normalized));
          } catch {
            // ignore storage quota errors
          }
        }
      },
      (err) => handlePublicListenerError(err, OperationType.GET, 'settings/store')
    );

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubCats();
      unsubProds();
      unsubRevs();
      unsubSettings();
    };
  }, [listenerEpoch]);

  // Automatically purge any leftover starter demo products/reviews from Firestore when Admin connects
  useEffect(() => {
    if (!authReady || !productsLoaded || !isAdmin || !currentUser || purgedDemoRef.current) {
      return;
    }
    const prodIds = fsProducts.map((p) => p.id);
    const revIds = fsReviews.map((r) => r.id);
    const hasDemoProds = prodIds.some((id) => STARTER_PRODUCT_IDS.has(id));
    const hasDemoRevs = revIds.some((id) => STARTER_REVIEW_IDS.has(id));
    if (hasDemoProds || hasDemoRevs) {
      purgedDemoRef.current = true;
      void purgeDemoDataFromFirestore(prodIds, revIds).catch(() => {
        purgedDemoRef.current = false;
      });
    }
  }, [authReady, productsLoaded, isAdmin, currentUser, fsProducts, fsReviews]);

  // Ensure initial categories & store settings exist (without seeding any demo products)
  useEffect(() => {
    if (
      authReady &&
      productsLoaded &&
      isAdmin &&
      currentUser &&
      fsCategories.length === 0 &&
      !seededRef.current
    ) {
      seededRef.current = true;
      void seedInitialStoreData(currentUser.uid).catch(() => {
        seededRef.current = false;
      });
    }
  }, [authReady, productsLoaded, isAdmin, currentUser, fsCategories.length]);

  // Authenticated Private Profile, Orders & Real-Time Notifications Subscriptions
  useEffect(() => {
    if (!authReady || !currentUser) {
      setPrivateProfile(null);
      setUserOrders([]);
      setAdminOrders([]);
      setNotifications([]);
      return;
    }

    const unsubProfile = onSnapshot(
      doc(db, 'users', currentUser.uid, 'private', 'profile'),
      (snap) => {
        setPrivateProfile(snap.exists() ? (snap.data() as UserPrivateProfile) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}/private/profile`)
    );

    const unsubUserOrders = onSnapshot(
      query(collection(db, 'orders'), where('userId', '==', currentUser.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Order);
        setUserOrders(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
    );

    const unsubNotifs = onSnapshot(
      query(
        collection(db, 'notifications'),
        where('recipientId', '==', isAdmin ? 'admin' : currentUser.uid)
      ),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as AppNotification);
        setNotifications(list);
        const newestUnread = list.find((n) => !n.read && !seenNotifIdsRef.current.has(n.id));
        if (newestUnread) {
          seenNotifIdsRef.current.add(newestUnread.id);
          setLiveToast(newestUnread);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    let unsubAdminOrders = () => {};
    if (isAdmin) {
      unsubAdminOrders = onSnapshot(
        collection(db, 'orders'),
        (snap) => {
          setAdminOrders(snap.docs.map((d) => d.data() as Order));
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
      );
    }

    return () => {
      unsubProfile();
      unsubUserOrders();
      unsubNotifs();
      unsubAdminOrders();
    };
  }, [authReady, currentUser, isAdmin]);

  const activeCategories = fsCategories.length > 0 ? fsCategories : STARTER_CATEGORIES;
  const activeProducts = useMemo(
    () => fsProducts.filter((p) => !STARTER_PRODUCT_IDS.has(p.id)),
    [fsProducts]
  );
  const activeReviews = useMemo(
    () => fsReviews.filter((r) => !STARTER_REVIEW_IDS.has(r.id)),
    [fsReviews]
  );
  const firestoreProductIds = useMemo(
    () => new Set(activeProducts.map((p) => p.id)),
    [activeProducts]
  );

  const openAuthModal = () => {
    setAuthModalOpen(true);
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyFeedback('ভেরিফিকেশন লিংক আপনার জিমেইল ইনবক্সে পাঠানো হয়েছে।');
    } catch {
      setVerifyFeedback('কিছুক্ষণ অপেক্ষা করে আবার ভেরিফিকেশন ইমেইল পাঠান।');
    }
  };

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    setCheckingVerify(true);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      if (!auth.currentUser.emailVerified) {
        setVerifyFeedback('ইমেইল এখনো ভেরিফাই হয়নি। অনুগ্রহ করে ইনবক্সের লিংকে ক্লিক করে আবার যাচাই করুন।');
      }
    } catch {
      setVerifyFeedback('স্ট্যাটাস রিফ্রেশ করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setCheckingVerify(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleAddToCart = (product: Product, quantity: number) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: Math.min(product.stock, c.quantity + quantity) }
            : c
        );
      }
      return [...prev, { product, quantity: Math.min(product.stock, quantity) }];
    });
  };

  const handleBuyNow = (product: Product, quantity: number) => {
    handleAddToCart(product, quantity);
    setSelectedProduct(null);
    setCheckoutInitialStep('checkout');
    setCartOpen(true);
  };

  const handleUpdateCartQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((c) => c.product.id !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((c) => (c.product.id === productId ? { ...c, quantity: qty } : c))
    );
  };

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F9FA] text-zinc-950">
      <Navbar
        storeName={settings.storeName}
        activeTab={activeTab}
        isAdmin={isAdmin}
        onSelectTab={setActiveTab}
        cartCount={cartCount}
        unreadNotifications={unreadNotifCount}
        onOpenCart={() => {
          setCheckoutInitialStep('cart');
          setCartOpen(true);
        }}
      />

      {/* Email Verification Prompt for newly created Email/Password accounts */}
      {currentUser && currentUser.email && !currentUser.emailVerified && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-xs text-amber-900">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2">
              <MailCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                অর্ডার, রিভিউ ও সম্পূর্ণ অ্যাকাউন্ট সুবিধা চালু করতে আপনার ইমেইল (
                <strong>{currentUser.email}</strong>) ভেরিফাই করুন। {verifyFeedback}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-md font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                লিংক পুনরায় পাঠান
              </button>
              <button
                type="button"
                disabled={checkingVerify}
                onClick={() => void handleRefreshVerification()}
                className="px-3 py-1.5 bg-zinc-950 text-white rounded-md font-semibold hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
              >
                {checkingVerify ? 'যাচাই হচ্ছে...' : 'ভেরিফাই সম্পন্ন করেছি'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Notification Toast */}
      {liveToast && (
        <div className="fixed bottom-5 right-5 z-40 max-w-sm bg-zinc-950 text-white border border-zinc-800 rounded-xl p-4 shadow-lg flex items-start gap-3">
          <Bell className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-xs space-y-1">
            <p className="font-semibold text-white">{liveToast.title}</p>
            <p className="text-zinc-300 leading-relaxed">{liveToast.message}</p>
            <button
              type="button"
              onClick={() => {
                setActiveTab('profile');
                setLiveToast(null);
              }}
              className="text-emerald-400 font-medium hover:underline cursor-pointer"
            >
              বিস্তারিত দেখুন →
            </button>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Route View */}
      <div className="flex-1">
        {activeTab === 'store' && (
          <Storefront
            products={activeProducts}
            productsLoaded={productsLoaded}
            firestoreIssue={firestoreIssue}
            onRetryConnection={() => {
              setFirestoreIssue(null);
              setProductsLoaded(false);
              setListenerEpoch((e) => e + 1);
            }}
            categories={activeCategories}
            reviews={activeReviews}
            settings={settings}
            trafficSource={trafficSource}
            onSelectProduct={setSelectedProduct}
            onAddToCart={handleAddToCart}
            onBuyNow={handleBuyNow}
            onNavigateTracking={() => setActiveTab('tracking')}
          />
        )}

        {activeTab === 'tracking' && (
          <OrderTrackingView
            initialTrackingCode={trackingCodeFocus}
            currentUser={currentUser}
            userOrders={userOrders}
            onRequireAuth={openAuthModal}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewsSectionView
            products={activeProducts}
            reviews={activeReviews}
            currentUser={currentUser}
            onRequireAuth={openAuthModal}
            onSelectProduct={setSelectedProduct}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileAndNotificationsView
            currentUser={currentUser}
            isAdmin={isAdmin}
            privateProfile={privateProfile}
            notifications={notifications}
            userOrders={userOrders}
            onSignIn={openAuthModal}
            onSignOut={() => void handleSignOut()}
            onTrackOrder={(code) => {
              setTrackingCodeFocus(code);
              setActiveTab('tracking');
            }}
          />
        )}

        {activeTab === 'admin' && isAdmin && (
          <AdminDashboard
            currentUser={currentUser}
            isAdmin={isAdmin}
            products={activeProducts}
            categories={activeCategories}
            orders={adminOrders}
            settings={settings}
            hasFirestoreProducts={activeProducts.length > 0}
            onRequireAuth={openAuthModal}
          />
        )}
      </div>

      {/* Clean Quiet Footer */}
      <footer className="bg-white border-t border-zinc-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="font-bold text-zinc-950">{settings.storeName}</span>
            <span aria-hidden="true">·</span>
            <span>সকল ব্যক্তিগত তথ্য সুরক্ষিত ও এনক্রিপ্টেড</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <a
              href={settings.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-950"
            >
              ফেসবুক
            </a>
            <a
              href={settings.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-950"
            >
              মেসেঞ্জার
            </a>
            <a
              href={settings.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-zinc-950"
            >
              ইনস্টাগ্রাম
            </a>
            <button
              type="button"
              onClick={() => setActiveTab('tracking')}
              className="hover:text-zinc-950 cursor-pointer"
            >
              অর্ডার ট্র্যাকিং
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ProductDetailModal
        product={selectedProduct}
        reviews={activeReviews}
        currentUser={currentUser}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onBuyNow={handleBuyNow}
        onRequireAuth={openAuthModal}
      />

      <CartAndCheckoutModal
        isOpen={cartOpen}
        initialStep={checkoutInitialStep}
        cart={cart}
        settings={settings}
        currentUser={currentUser}
        privateProfile={privateProfile}
        firestoreProductIds={firestoreProductIds}
        trafficSource={trafficSource}
        onClose={() => setCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={(id) => setCart((prev) => prev.filter((c) => c.product.id !== id))}
        onClearCart={() => setCart([])}
        onRequireAuth={openAuthModal}
        onOrderSuccess={(code) => {
          setTrackingCodeFocus(code);
          setActiveTab('tracking');
        }}
      />

      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label="অ্যাকাউন্ট লগইন ও নিবন্ধন"
        >
          <AuthPanel
            isModal
            onSuccess={() => setAuthModalOpen(false)}
            onClose={() => setAuthModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
