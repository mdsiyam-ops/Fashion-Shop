import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
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
import { Bell, X } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
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
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  DEFAULT_STORE_SETTINGS,
  seedInitialStoreData,
  STARTER_CATEGORIES,
  STARTER_PRODUCTS,
  STARTER_REVIEWS,
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
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('store');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutInitialStep, setCheckoutInitialStep] = useState<'cart' | 'checkout'>('cart');
  const [trackingCodeFocus, setTrackingCodeFocus] = useState('');

  const [fsCategories, setFsCategories] = useState<Category[]>([]);
  const [fsProducts, setFsProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [fsReviews, setFsReviews] = useState<Review[]>([]);
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
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
  const seenNotifIdsRef = useRef<Set<string>>(new Set());

  const isAdmin = Boolean(
    currentUser &&
      currentUser.email === ADMIN_EMAIL &&
      currentUser.emailVerified === true
  );

  // Persist cart locally
  useEffect(() => {
    try {
      localStorage.setItem('shoili_cart_v1', JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAuthReady(true);
      if (user && user.emailVerified) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          const displayName = clampStr(user.displayName || 'সম্মানিত গ্রাহক', 100);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: user.uid,
              displayName,
              role: user.email === ADMIN_EMAIL ? 'admin' : 'customer',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(userRef, {
              displayName,
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
    const unsubCats = onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Category);
        setFsCategories(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
    );

    const unsubProds = onSnapshot(
      collection(db, 'products'),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Product);
        setFsProducts(list);
        setProductsLoaded(true);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'products')
    );

    const unsubRevs = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc')),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Review);
        setFsReviews(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
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
          if (merged.storeName === 'শৈলী স্টোর') {
            setSettings({
              ...merged,
              storeName: 'Fashion Shop',
              standardDeliveryFee: 80,
              expressDeliveryFee: 120,
            });
          } else {
            setSettings(merged);
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/store')
    );

    return () => {
      unsubCats();
      unsubProds();
      unsubRevs();
      unsubSettings();
    };
  }, []);

  // Auto-seed starter catalog once when admin signs in and Firestore products are confirmed empty
  useEffect(() => {
    if (authReady && productsLoaded && isAdmin && currentUser && fsProducts.length === 0 && !seededRef.current) {
      seededRef.current = true;
      void seedInitialStoreData(currentUser.uid);
    }
  }, [authReady, productsLoaded, isAdmin, currentUser, fsProducts.length]);

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
  const activeProducts = fsProducts.length > 0 ? fsProducts : STARTER_PRODUCTS;
  const activeReviews = fsReviews.length > 0 ? fsReviews : STARTER_REVIEWS;
  const firestoreProductIds = useMemo(
    () => new Set(fsProducts.map((p) => p.id)),
    [fsProducts]
  );

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      const msg = error instanceof Error ? error.message : '';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setAuthError(
          `এই ডোমেইনটি (${window.location.hostname}) Firebase Authentication-এ অনুমোদিত নয়। Firebase Console → Authentication → Settings → Authorized domains-এ "${window.location.hostname}" যোগ করুন।`
        );
      } else {
        setAuthError(
          error instanceof Error
            ? 'গুগল সাইন ইন সম্পন্ন করা যায়নি। অনুগ্রহ করে পপ-আপ ব্লকার বন্ধ রেখে আবার চেষ্টা করুন।'
            : 'লগইন ত্রুটি হয়েছে।'
        );
      }
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
        onSelectTab={setActiveTab}
        cartCount={cartCount}
        unreadNotifications={unreadNotifCount}
        onOpenCart={() => {
          setCheckoutInitialStep('cart');
          setCartOpen(true);
        }}
      />

      {authError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 text-xs text-rose-700 flex items-center justify-between">
          <span>{authError}</span>
          <button
            type="button"
            onClick={() => setAuthError('')}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
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
            onRequireAuth={() => void handleGoogleSignIn()}
          />
        )}

        {activeTab === 'reviews' && (
          <ReviewsSectionView
            products={activeProducts}
            reviews={activeReviews}
            currentUser={currentUser}
            onRequireAuth={() => void handleGoogleSignIn()}
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
            onSignIn={() => void handleGoogleSignIn()}
            onSignOut={() => void handleSignOut()}
            onTrackOrder={(code) => {
              setTrackingCodeFocus(code);
              setActiveTab('tracking');
            }}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboard
            currentUser={currentUser}
            isAdmin={isAdmin}
            products={activeProducts}
            categories={activeCategories}
            orders={adminOrders}
            settings={settings}
            hasFirestoreProducts={fsProducts.length > 0}
            onRequireAuth={() => void handleGoogleSignIn()}
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
        onRequireAuth={() => void handleGoogleSignIn()}
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
        onRequireAuth={() => void handleGoogleSignIn()}
        onOrderSuccess={(code) => {
          setTrackingCodeFocus(code);
          setActiveTab('tracking');
        }}
      />
    </div>
  );
}
