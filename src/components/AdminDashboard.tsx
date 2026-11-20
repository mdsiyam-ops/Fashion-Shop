import React, { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  Edit3,
  FolderKanban,
  ImagePlus,
  Layers,
  PackagePlus,
  Share2,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { clampStr, db, handleFirestoreError, OperationType, sanitizeId, toSlug } from '../firebase';
import {
  formatBDT,
  formatTimestamp,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from '../lib/format';
import { compressImageFileToDataUrl } from '../lib/imageUpload';
import {
  ensureCategoryInFirestore,
  STARTER_PRODUCT_IDS,
  STUDIO_IMAGE_GALLERY,
} from '../lib/seedData';
import { Category, Order, OrderStatus, Product, StoreSettings } from '../types';
import { ResilientImage } from './ResilientImage';

interface AdminDashboardProps {
  currentUser: User | null;
  isAdmin: boolean;
  products: Product[];
  categories: Category[];
  orders: Order[];
  settings: StoreSettings;
  hasFirestoreProducts: boolean;
  onRequireAuth: () => void;
}

type AdminSection = 'reports' | 'inventory' | 'categories' | 'orders' | 'social';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  isAdmin,
  products,
  categories,
  orders,
  settings,
  hasFirestoreProducts,
  onRequireAuth,
}) => {
  const [section, setSection] = useState<AdminSection>('reports');
  const [seeding, setSeeding] = useState(false);

  // Quick inline edits map: productId -> { price, stock }
  const [inlineEdits, setInlineEdits] = useState<Record<string, { price: string; stock: string }>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  // Add/Edit Product Form state
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodCatId, setProdCatId] = useState(categories[0]?.id || '');
  const [prodPrice, setProdPrice] = useState('');
  const [prodComparePrice, setProdComparePrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodSku, setProdSku] = useState('');
  const [prodImages, setProdImages] = useState<string[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [savingProductForm, setSavingProductForm] = useState(false);
  const [productFormError, setProductFormError] = useState('');
  const [productSuccessMsg, setProductSuccessMsg] = useState('');
  const [prodFeatured, setProdFeatured] = useState(true);
  const [prodExpress, setProdExpress] = useState(true);
  const [showProductForm, setShowProductForm] = useState(false);

  // Category Form state
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Order Status Inline state
  const [orderDrafts, setOrderDrafts] = useState<Record<string, { status: OrderStatus; note: string }>>({});
  const [orderFilter, setOrderFilter] = useState<'all' | OrderStatus>('all');
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Settings Form state
  const [storeNameInput, setStoreNameInput] = useState(settings.storeName);
  const [taglineInput, setTaglineInput] = useState(settings.tagline);
  const [fbUrlInput, setFbUrlInput] = useState(settings.facebookUrl);
  const [messengerInput, setMessengerInput] = useState(settings.messengerUrl);
  const [whatsappInput, setWhatsappInput] = useState(settings.whatsappNumber);
  const [igInput, setIgInput] = useState(settings.instagramUrl);
  const [freeThresholdInput, setFreeThresholdInput] = useState(String(settings.freeDeliveryThreshold));
  const [stdFeeInput, setStdFeeInput] = useState(String(settings.standardDeliveryFee));
  const [expFeeInput, setExpFeeInput] = useState(String(settings.expressDeliveryFee));
  const [savedSettingsFlag, setSavedSettingsFlag] = useState(false);
  const [copiedFbLink, setCopiedFbLink] = useState(false);

  useEffect(() => {
    setStoreNameInput(settings.storeName);
    setTaglineInput(settings.tagline);
    setFbUrlInput(settings.facebookUrl);
    setMessengerInput(settings.messengerUrl);
    setWhatsappInput(settings.whatsappNumber);
    setIgInput(settings.instagramUrl);
    setFreeThresholdInput(String(settings.freeDeliveryThreshold));
    setStdFeeInput(String(settings.standardDeliveryFee));
    setExpFeeInput(String(settings.expressDeliveryFee));
  }, [settings]);

  // Analytics Computations
  const analytics = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = activeOrders.reduce((acc, o) => acc + o.totalAmount, 0);
    const totalOrders = orders.length;
    const avgOrderValue = activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0;
    const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
    const lowStockProducts = products.filter((p) => p.stock <= 5);
    const fbOrdersCount = orders.filter((o) => o.source === 'fb_shop_now').length;

    const categorySales: Record<string, { name: string; revenue: number; units: number }> = {};
    products.forEach((p) => {
      if (!categorySales[p.categoryId]) {
        categorySales[p.categoryId] = { name: p.categoryName, revenue: 0, units: 0 };
      }
      categorySales[p.categoryId].units += p.soldCount;
      categorySales[p.categoryId].revenue += p.soldCount * p.price;
    });

    const paymentCounts: Record<string, number> = { bkash: 0, nagad: 0, card: 0, cod: 0 };
    orders.forEach((o) => {
      paymentCounts[o.paymentMethod] = (paymentCounts[o.paymentMethod] || 0) + 1;
    });

    const topProducts = [...products].sort((a, b) => b.soldCount - a.soldCount).slice(0, 5);

    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      deliveredCount,
      lowStockProducts,
      fbOrdersCount,
      categorySales: Object.values(categorySales),
      paymentCounts,
      topProducts,
    };
  }, [orders, products]);

  if (!currentUser || !isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-amber-700" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-zinc-950">অ্যাডমিন প্যানেল অ্যাক্সেস সংরক্ষিত</h1>
            <p className="text-sm text-zinc-600 leading-relaxed">
              ইনভেন্টরি, ক্যাটাগরি, অর্ডার ও বিক্রয় প্রতিবেদন পরিচালনার জন্য অনুগ্রহ করে স্টোর অ্যাডমিন গুগল অ্যাকাউন্ট দিয়ে সাইন ইন করুন।
            </p>
          </div>
          {!currentUser ? (
            <button
              type="button"
              onClick={onRequireAuth}
              className="w-full py-3 px-5 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              অ্যাডমিন গুগল সাইন ইন করুন
            </button>
          ) : (
            <p className="text-xs text-zinc-500">
              বর্তমান অ্যাকাউন্ট: <span className="font-mono-tabular">{currentUser.email}</span> (অ্যাডমিন অনুমোদন নেই)
            </p>
          )}
        </div>
      </div>
    );
  }

  // Quick inline edit handler

  const openCreateProduct = () => {
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdCatId(categories[0]?.id || '');
    setProdPrice('');
    setProdComparePrice('');
    setProdStock('10');
    setProdSku(`SHL-${Date.now().toString().slice(-4)}`);
    setProdImages([]);
    setImageUploadError('');
    setProductFormError('');
    setProductSuccessMsg('');
    setProdFeatured(true);
    setProdExpress(true);
    setShowProductForm(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProdName(p.name);
    setProdDesc(p.description);
    setProdCatId(p.categoryId);
    setProdPrice(String(p.price));
    setProdComparePrice(p.compareAtPrice ? String(p.compareAtPrice) : '');
    setProdStock(String(p.stock));
    setProdSku(p.sku);
    const existingList =
      p.imageUrls && p.imageUrls.length > 0 ? p.imageUrls : p.imageUrl ? [p.imageUrl] : [];
    setProdImages(existingList);
    setImageUploadError('');
    setProductFormError('');
    setProductSuccessMsg('');
    setProdFeatured(p.featured);
    setProdExpress(p.expressEligible);
    setShowProductForm(true);
  };

  const handleImageFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageUploadError('');
    const remainingSlots = 5 - prodImages.length;
    if (remainingSlots <= 0) {
      setImageUploadError('একটি পণ্যে সর্বোচ্চ ৫টি ছবি আপলোড করা যাবে।');
      return;
    }

    const selected = Array.from(files).slice(0, remainingSlots);
    setUploadingImages(true);
    try {
      const processed: string[] = [];
      for (const file of selected) {
        const compressed = await compressImageFileToDataUrl(file);
        processed.push(compressed);
      }
      setProdImages((prev) => [...prev, ...processed].slice(0, 5));
      if (files.length > remainingSlots) {
        setImageUploadError('সর্বোচ্চ ৫টি ছবি রাখা হয়েছে। বাকিগুলো বাদ দেওয়া হয়েছে।');
      }
    } catch (err) {
      setImageUploadError(
        err instanceof Error ? err.message : 'ছবি আপলোড করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
      );
    } finally {
      setUploadingImages(false);
    }
  };

  const handleSetPrimaryImage = (index: number) => {
    setProdImages((prev) => {
      if (index <= 0 || index >= prev.length) return prev;
      const picked = prev[index];
      return [picked, ...prev.filter((_, i) => i !== index)];
    });
  };

  const handleRemoveImage = (index: number) => {
    setProdImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductFormError('');
    setProductSuccessMsg('');
    const cat = categories.find((c) => c.id === prodCatId) || categories[0];
    if (!cat) {
      setProductFormError('প্রথমে একটি ক্যাটাগরি তৈরি করুন।');
      return;
    }

    if (prodImages.length === 0) {
      setImageUploadError('অনুগ্রহ করে পণ্যের কমপক্ষে একটি ছবি আপলোড করুন।');
      return;
    }

    const id = editingProductId || sanitizeId(`prod_${Date.now()}`);
    const priceNum = Math.max(0, Number(prodPrice) || 0);
    const compareNum = Number(prodComparePrice) || 0;
    const stockNum = Math.max(0, Math.floor(Number(prodStock) || 0));
    const cleanImages = prodImages
      .slice(0, 5)
      .map((img) => clampStr(img, 250000))
      .filter(Boolean);
    const primaryImage = cleanImages[0] || STUDIO_IMAGE_GALLERY[0].url;

    const basePayload: Record<string, unknown> = {
      name: clampStr(prodName, 140),
      description: clampStr(prodDesc || prodName, 2000),
      categoryId: cat.id,
      categoryName: clampStr(cat.name, 80),
      price: priceNum,
      stock: stockNum,
      sku: clampStr(prodSku || `SHL-${Date.now().toString().slice(-4)}`, 64),
      imageUrl: primaryImage,
      imageUrls: cleanImages,
      featured: prodFeatured,
      expressEligible: prodExpress,
      updatedAt: serverTimestamp(),
    };

    if (compareNum > priceNum) {
      basePayload.compareAtPrice = compareNum;
    }

    setSavingProductForm(true);
    try {
      await ensureCategoryInFirestore(cat);
      if (editingProductId) {
        await updateDoc(doc(db, 'products', id), basePayload);
        setProductSuccessMsg('পণ্যটি সফলভাবে আপডেট হয়ে ওয়েবসাইটে প্রকাশিত হয়েছে।');
      } else {
        await setDoc(doc(db, 'products', id), {
          id,
          ...basePayload,
          ratingAvg: 5.0,
          reviewCount: 0,
          soldCount: 0,
          createdAt: serverTimestamp(),
        });
        setProductSuccessMsg('নতুন পণ্যটি সফলভাবে যুক্ত হয়ে ওয়েবসাইটে প্রকাশিত হয়েছে।');
      }
      setShowProductForm(false);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'সংরক্ষণ করা যায়নি';
      setProductFormError(`পণ্যটি সংরক্ষণ করা যায়নি (${msg})।`);
    } finally {
      setSavingProductForm(false);
    }
  };

  const handleInlineProductSave = async (p: Product) => {
    const draft = inlineEdits[p.id];
    if (!draft) return;
    setSavingProductId(p.id);
    const newPrice = Math.max(0, Number(draft.price) || p.price);
    const newStock = Math.max(0, Math.floor(Number(draft.stock) || 0));
    try {
      await updateDoc(doc(db, 'products', p.id), {
        price: newPrice,
        stock: newStock,
        updatedAt: serverTimestamp(),
      });
      setInlineEdits((prev) => {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${p.id}`);
    } finally {
      setSavingProductId(null);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
    }
  };

  const handleDeleteAllDemoProducts = async () => {
    const demoProds = products.filter((p) => STARTER_PRODUCT_IDS.has(p.id));
    if (demoProds.length === 0) return;
    setSeeding(true);
    try {
      try {
        localStorage.setItem('fashion_shop_demo_cleared_v1', 'true');
      } catch {
        // ignore storage errors
      }
      if (hasFirestoreProducts) {
        const batch = writeBatch(db);
        demoProds.forEach((p) => {
          batch.delete(doc(db, 'products', p.id));
        });
        await batch.commit();
      }
      setProductSuccessMsg('সকল ডেমো পণ্য মুছে ফেলা হয়েছে। এখন শুধু আপনার যুক্ত করা পণ্যগুলো প্রদর্শিত হবে।');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'মুছে ফেলা যায়নি';
      setProductFormError(`ডেমো পণ্য মুছতে সমস্যা হয়েছে (${msg})।`);
    } finally {
      setSeeding(false);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const id = editingCatId || sanitizeId(`cat_${Date.now()}`);
    try {
      if (editingCatId) {
        await updateDoc(doc(db, 'categories', id), {
          name: clampStr(catName, 80),
          slug: toSlug(catName),
          description: clampStr(catDesc, 300),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(doc(db, 'categories', id), {
          id,
          name: clampStr(catName, 80),
          slug: toSlug(catName),
          description: clampStr(catDesc, 300),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setCatName('');
      setCatDesc('');
      setEditingCatId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `categories/${id}`);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    try {
      await deleteDoc(doc(db, 'categories', catId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `categories/${catId}`);
    }
  };

  const handleUpdateOrderStatus = async (order: Order) => {
    const draft = orderDrafts[order.id];
    const nextStatus = draft?.status || order.status;
    const nextNote = clampStr(draft?.note ?? order.courierNote, 300);

    setUpdatingOrderId(order.id);
    const batch = writeBatch(db);
    batch.update(doc(db, 'orders', order.id), {
      status: nextStatus,
      courierNote: nextNote,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'orderTracking', order.trackingCode), {
      status: nextStatus,
      courierNote: nextNote,
      updatedAt: serverTimestamp(),
    });

    const notifId = `notif_status_${Date.now()}`;
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: order.userId,
      title: `অর্ডার আপডেট: ${ORDER_STATUS_LABELS[nextStatus]}`,
      message: `আপনার অর্ডার (${order.trackingCode}) এখন "${ORDER_STATUS_LABELS[nextStatus]}" পর্যায়ে রয়েছে। ${nextNote}`,
      type: 'order_status',
      relatedOrderId: order.id,
      read: false,
      createdAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${order.id}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSettingsFlag(false);
    try {
      await setDoc(doc(db, 'settings', 'store'), {
        id: 'store',
        storeName: clampStr(storeNameInput, 100),
        tagline: clampStr(taglineInput, 200),
        facebookUrl: clampStr(fbUrlInput, 300),
        messengerUrl: clampStr(messengerInput, 300),
        whatsappNumber: clampStr(whatsappInput, 30),
        instagramUrl: clampStr(igInput, 300),
        freeDeliveryThreshold: Math.max(0, Number(freeThresholdInput) || 0),
        standardDeliveryFee: Math.max(0, Number(stdFeeInput) || 0),
        expressDeliveryFee: Math.max(0, Number(expFeeInput) || 0),
        updatedAt: serverTimestamp(),
      });
      setSavedSettingsFlag(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/store');
    }
  };

  const handleDownloadCsv = () => {
    const header = ['TrackingCode', 'Customer', 'City', 'PaymentMethod', 'PaymentStatus', 'OrderStatus', 'TotalBDT', 'Source'];
    const rows = orders.map((o) => [
      o.trackingCode,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.city.replace(/"/g, '""')}"`,
      o.paymentMethod,
      o.paymentStatus,
      o.status,
      String(o.totalAmount),
      o.source,
    ]);
    const csvContent = '\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shoili-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fbShopNowLink = `${window.location.origin}${window.location.pathname}?source=fb_shop_now`;

  const handleCopyFbLink = async () => {
    try {
      await navigator.clipboard.writeText(fbShopNowLink);
      setCopiedFbLink(true);
      setTimeout(() => setCopiedFbLink(false), 1800);
    } catch {
      setCopiedFbLink(false);
    }
  };

  const navButtons: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
    { id: 'reports', label: 'বিক্রয় প্রতিবেদন', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'inventory', label: 'ইনভেন্টরি ও পণ্য', icon: <Layers className="w-4 h-4" /> },
    { id: 'categories', label: 'ক্যাটাগরি', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'orders', label: 'অর্ডার ও ডেলিভারি', icon: <ShoppingCart className="w-4 h-4" /> },
    { id: 'social', label: 'ফেসবুক ও সেটিংস', icon: <Share2 className="w-4 h-4" /> },
  ];

  const productsById = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const filteredOrders = useMemo(() => {
    const list = orderFilter === 'all' ? orders : orders.filter((o) => o.status === orderFilter);
    const getMillis = (val: unknown): number => {
      if (!val || typeof val !== 'object') return 0;
      const ts = val as { seconds?: number; toMillis?: () => number };
      if (typeof ts.toMillis === 'function') return ts.toMillis();
      if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      return 0;
    };
    return [...list].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
  }, [orders, orderFilter]);

  const sortedInventoryProducts = useMemo(() => {
    const getEpoch = (p: Product): number => {
      const val = p.createdAt;
      if (val && typeof val === 'object') {
        const ts = val as { seconds?: number; toMillis?: () => number };
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      }
      const match = p.id.match(/^prod_(\d+)$/);
      return match ? Number(match[1]) || 0 : 0;
    };
    return [...products].sort((a, b) => {
      const aDemo = STARTER_PRODUCT_IDS.has(a.id) ? 1 : 0;
      const bDemo = STARTER_PRODUCT_IDS.has(b.id) ? 1 : 0;
      if (aDemo !== bDemo) return aDemo - bDemo;
      return getEpoch(b) - getEpoch(a);
    });
  }, [products]);

  const demoProductCount = useMemo(
    () => products.filter((p) => STARTER_PRODUCT_IDS.has(p.id)).length,
    [products]
  );

  const maxCatRevenue = Math.max(1, ...analytics.categorySales.map((c) => c.revenue));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Contextual Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-200 mb-6">
        <div>
          <p className="text-xs text-zinc-500">অ্যাডমিন ম্যানেজমেন্ট কনসোল</p>
          <h1 className="text-2xl font-bold text-zinc-950">স্টোর অপারেশন ও বিশ্লেষণ</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-200 bg-white text-xs font-semibold text-zinc-900 rounded-lg hover:bg-zinc-100 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>বিক্রয় রিপোর্ট CSV</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Sidebar Navigation (240px feel) */}
        <aside className="lg:col-span-3 bg-white border border-zinc-200 rounded-xl p-2 space-y-1">
          {navButtons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setSection(btn.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
                section === btn.id
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {btn.icon}
              <span className="truncate">{btn.label}</span>
            </button>
          ))}
        </aside>

        {/* Main Content Viewport */}
        <main className="lg:col-span-9 space-y-6">
          {/* 1. SALES REPORT */}
          {section === 'reports' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <p className="text-xs text-zinc-500">মোট বিক্রয় আয়</p>
                  <p className="text-2xl font-bold text-zinc-950 tabular-nums mt-1">
                    {formatBDT(analytics.totalRevenue)}
                  </p>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <p className="text-xs text-zinc-500">মোট অর্ডার সংখ্যা</p>
                  <p className="text-2xl font-bold text-zinc-950 tabular-nums mt-1">
                    {analytics.totalOrders}টি
                  </p>
                  <p className="text-xs text-emerald-700 mt-1 tabular-nums">
                    ডেলিভারি সম্পন্ন: {analytics.deliveredCount}টি
                  </p>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <p className="text-xs text-zinc-500">গড় অর্ডার মূল্য</p>
                  <p className="text-2xl font-bold text-zinc-950 tabular-nums mt-1">
                    {formatBDT(analytics.avgOrderValue)}
                  </p>
                </div>
                <div className="bg-white border border-zinc-200 rounded-xl p-5">
                  <p className="text-xs text-zinc-500">কম স্টক সতর্কতা</p>
                  <p className="text-2xl font-bold text-amber-700 tabular-nums mt-1">
                    {analytics.lowStockProducts.length}টি পণ্য
                  </p>
                  <p className="text-xs text-zinc-500 mt-1 tabular-nums">
                    ফেসবুক শপ অর্ডার: {analytics.fbOrdersCount}টি
                  </p>
                </div>
              </div>

              {/* Category Revenue Breakdown */}
              <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-zinc-950">ক্যাটাগরি অনুযায়ী বিক্রয় বিশ্লেষণ</h2>
                  <span className="text-xs text-zinc-500">মোট ইউনিট ও বিক্রিত মূল্য</span>
                </div>
                <div className="space-y-3">
                  {analytics.categorySales.map((cat) => (
                    <div key={cat.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-zinc-800">{cat.name}</span>
                        <span className="font-mono-tabular text-zinc-700">
                          {cat.units}টি বিক্রিত · {formatBDT(cat.revenue)}
                        </span>
                      </div>
                      <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-700 rounded-full"
                          style={{ width: `${Math.max(4, (cat.revenue / maxCatRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Products & Low Stock Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-zinc-950">শীর্ষ বিক্রিত পণ্য</h2>
                  <div className="divide-y divide-zinc-200">
                    {analytics.topProducts.map((p) => (
                      <div key={p.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                        <span className="font-medium text-zinc-900 truncate">{p.name}</span>
                        <span className="font-mono-tabular text-zinc-600 shrink-0">
                          {p.soldCount}টি · {formatBDT(p.soldCount * p.price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-bold text-zinc-950">পেমেন্ট মাধ্যম বিশ্লেষণ</h2>
                  <div className="divide-y divide-zinc-200">
                    {(['bkash', 'nagad', 'card', 'cod'] as const).map((method) => (
                      <div key={method} className="py-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-zinc-900">{PAYMENT_METHOD_LABELS[method]}</span>
                        <span className="font-mono-tabular text-zinc-600">
                          {analytics.paymentCounts[method] || 0}টি অর্ডার
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. INVENTORY & PRODUCTS */}
          {section === 'inventory' && (
            <div className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">ইনভেন্টরি ও পণ্য ব্যবস্থাপনা</h2>
                  <p className="text-xs text-zinc-500">
                    সরাসরি টেবিল থেকেই যেকোনো পণ্যের দাম বা স্টক সংখ্যা তাৎক্ষণিক পরিবর্তন করুন
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  {hasFirestoreProducts && demoProductCount > 0 && (
                    <button
                      type="button"
                      disabled={seeding}
                      onClick={() => void handleDeleteAllDemoProducts()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2.5 border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold rounded-lg hover:bg-rose-100 cursor-pointer whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>ডেমো পণ্য মুছুন ({demoProductCount}টি)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={openCreateProduct}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                  >
                    <PackagePlus className="w-4 h-4" />
                    <span>নতুন পণ্য যুক্ত করুন</span>
                  </button>
                </div>
              </div>

              {productSuccessMsg && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-medium">
                  <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{productSuccessMsg}</span>
                </div>
              )}

              {showProductForm && (
                <form
                  onSubmit={handleSaveProduct}
                  className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
                >
                  <h3 className="text-base font-bold text-zinc-950">
                    {editingProductId ? 'পণ্য সম্পাদনা করুন' : 'নতুন পণ্য যোগ করুন'}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">পণ্যের নাম *</label>
                      <input
                        type="text"
                        required
                        maxLength={140}
                        value={prodName}
                        onChange={(e) => setProdName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">ক্যাটাগরি *</label>
                      <select
                        value={prodCatId}
                        onChange={(e) => setProdCatId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">বিক্রয় মূল্য (৳) *</label>
                      <input
                        type="number"
                        required
                        min={0}
                        value={prodPrice}
                        onChange={(e) => setProdPrice(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">পূর্বের মূল্য (ঐচ্ছিক)</label>
                      <input
                        type="number"
                        min={0}
                        value={prodComparePrice}
                        onChange={(e) => setProdComparePrice(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">স্টক পরিমাণ *</label>
                      <input
                        type="number"
                        required
                        min={0}
                        value={prodStock}
                        onChange={(e) => setProdStock(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-600 mb-1">SKU কোড *</label>
                      <input
                        type="text"
                        required
                        maxLength={64}
                        value={prodSku}
                        onChange={(e) => setProdSku(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg font-mono-tabular"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs text-zinc-600 font-medium">
                        পণ্যের ছবি আপলোড করুন * (১ থেকে সর্বোচ্চ ৫টি ছবি)
                      </label>
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {prodImages.length}/5টি যুক্ত হয়েছে
                      </span>
                    </div>

                    <label
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        void handleImageFilesSelected(e.dataTransfer.files);
                      }}
                      className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl text-center transition-colors cursor-pointer ${
                        uploadingImages
                          ? 'border-emerald-400 bg-emerald-50/40'
                          : 'border-zinc-300 bg-zinc-50/60 hover:border-zinc-950 hover:bg-zinc-50'
                      }`}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={uploadingImages || prodImages.length >= 5}
                        onChange={(e) => {
                          void handleImageFilesSelected(e.target.files);
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <div className="w-10 h-10 rounded-full bg-white border border-zinc-200 flex items-center justify-center text-zinc-700">
                        {uploadingImages ? (
                          <Upload className="w-4 h-4 text-emerald-700 animate-pulse" />
                        ) : (
                          <ImagePlus className="w-4 h-4 text-zinc-700" />
                        )}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-zinc-950">
                          {uploadingImages
                            ? 'ছবি প্রসেস হচ্ছে...'
                            : prodImages.length >= 5
                            ? 'সর্বোচ্চ ৫টি ছবি আপলোড সম্পন্ন'
                            : 'এক বা একাধিক ছবি সিলেক্ট করতে ক্লিক করুন অথবা এখানে ড্র্যাগ করুন'}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          ফোন গ্যালারি বা কম্পিউটার থেকে JPG, PNG বা WebP ফাইল আপলোড করুন
                        </p>
                      </div>
                    </label>

                    {imageUploadError && (
                      <p className="text-xs text-rose-600 font-medium">{imageUploadError}</p>
                    )}

                    {prodImages.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                        {prodImages.map((imgUrl, idx) => (
                          <div
                            key={`${idx}-${imgUrl.slice(0, 24)}`}
                            className={`relative group rounded-lg overflow-hidden border bg-zinc-100 aspect-square ${
                              idx === 0 ? 'border-emerald-700 ring-2 ring-emerald-700/20' : 'border-zinc-200'
                            }`}
                          >
                            <ResilientImage
                              src={imgUrl}
                              alt={`পণ্যের ছবি ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(idx)}
                              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-zinc-950/80 text-white flex items-center justify-center hover:bg-rose-600 transition-colors cursor-pointer"
                              aria-label="ছবি সরান"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {idx === 0 ? (
                              <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-emerald-700 text-white text-[10px] font-semibold">
                                মূল ছবি
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetPrimaryImage(idx)}
                                className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-zinc-950/75 text-white text-[10px] font-medium hover:bg-zinc-950 cursor-pointer"
                              >
                                মূল ছবি করুন
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">বিস্তারিত বিবরণ *</label>
                    <textarea
                      rows={3}
                      required
                      maxLength={2000}
                      value={prodDesc}
                      onChange={(e) => setProdDesc(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prodExpress}
                        onChange={(e) => setProdExpress(e.target.checked)}
                        className="accent-zinc-950"
                      />
                      <span>২৪ ঘণ্টা এক্সপ্রেস ডেলিভারি উপযোগী</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prodFeatured}
                        onChange={(e) => setProdFeatured(e.target.checked)}
                        className="accent-zinc-950"
                      />
                      <span>ফিচার্ড কালেকশনে প্রদর্শন করুন</span>
                    </label>
                  </div>

                  {productFormError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
                      {productFormError}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      type="submit"
                      disabled={savingProductForm || uploadingImages}
                      className="px-5 py-2.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
                    >
                      {savingProductForm ? 'সংরক্ষণ হচ্ছে...' : 'পণ্য সংরক্ষণ করুন'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowProductForm(false)}
                      className="px-4 py-2.5 border border-zinc-200 text-xs font-medium rounded-lg hover:bg-zinc-100 cursor-pointer"
                    >
                      বাতিল
                    </button>
                  </div>
                </form>
              )}

              {/* Inventory Data Grid */}
              <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
                      <th className="py-3 px-4 font-semibold">পণ্য</th>
                      <th className="py-3 px-4 font-semibold">ক্যাটাগরি</th>
                      <th className="py-3 px-4 font-semibold">দাম (৳)</th>
                      <th className="py-3 px-4 font-semibold">স্টক</th>
                      <th className="py-3 px-4 font-semibold text-right">অ্যাকশন</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {sortedInventoryProducts.map((p) => {
                      const draft = inlineEdits[p.id];
                      return (
                        <tr key={p.id} className="hover:bg-zinc-50/70">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-md overflow-hidden bg-zinc-100 border border-zinc-200 shrink-0">
                                <ResilientImage src={p.imageUrl} alt={p.name} />
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-zinc-950 truncate max-w-[200px]">
                                  {p.name}
                                </p>
                                <p className="text-[11px] font-mono-tabular text-zinc-400">{p.sku}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-zinc-600 whitespace-nowrap">{p.categoryName}</td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min={0}
                              value={draft ? draft.price : String(p.price)}
                              onChange={(e) =>
                                setInlineEdits((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    price: e.target.value,
                                    stock: prev[p.id]?.stock ?? String(p.stock),
                                  },
                                }))
                              }
                              className="w-24 px-2 py-1 border border-zinc-200 rounded font-mono-tabular bg-white"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              min={0}
                              value={draft ? draft.stock : String(p.stock)}
                              onChange={(e) =>
                                setInlineEdits((prev) => ({
                                  ...prev,
                                  [p.id]: {
                                    price: prev[p.id]?.price ?? String(p.price),
                                    stock: e.target.value,
                                  },
                                }))
                              }
                              className={`w-16 px-2 py-1 border rounded font-mono-tabular bg-white ${
                                p.stock <= 5 ? 'border-amber-400 text-amber-800' : 'border-zinc-200'
                              }`}
                            />
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                            {draft && (
                              <button
                                type="button"
                                disabled={savingProductId === p.id}
                                onClick={() => void handleInlineProductSave(p)}
                                className="px-2.5 py-1 bg-emerald-700 text-white rounded hover:bg-emerald-800 cursor-pointer"
                              >
                                {savingProductId === p.id ? '...' : 'সেভ'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditProduct(p)}
                              className="p-1.5 border border-zinc-200 rounded hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                              aria-label="সম্পাদনা"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteProduct(p.id)}
                              className="p-1.5 border border-zinc-200 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
                              aria-label="মুছে ফেলুন"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. CATEGORIES */}
          {section === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={handleSaveCategory}
                className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-zinc-950">
                  {editingCatId ? 'ক্যাটাগরি আপডেট করুন' : 'নতুন ক্যাটাগরি যুক্ত করুন'}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ক্যাটাগরির নাম *</label>
                    <input
                      type="text"
                      required
                      maxLength={80}
                      value={catName}
                      onChange={(e) => setCatName(e.target.value)}
                      placeholder="যেমন: স্মার্ট গ্যাজেট"
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">সংক্ষিপ্ত বিবরণ</label>
                    <input
                      type="text"
                      maxLength={300}
                      value={catDesc}
                      onChange={(e) => setCatDesc(e.target.value)}
                      placeholder="ক্যাটাগরি পরিচিতি..."
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                  >
                    {editingCatId ? 'আপডেট করুন' : 'ক্যাটাগরি যোগ করুন'}
                  </button>
                  {editingCatId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCatId(null);
                        setCatName('');
                        setCatDesc('');
                      }}
                      className="px-4 py-2.5 border border-zinc-200 text-xs rounded-lg cursor-pointer"
                    >
                      বাতিল
                    </button>
                  )}
                </div>
              </form>

              <div className="bg-white border border-zinc-200 rounded-xl divide-y divide-zinc-200">
                {categories.map((cat) => (
                  <div key={cat.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-950">{cat.name}</p>
                      <p className="text-xs text-zinc-500">{cat.description || cat.slug}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setCatName(cat.name);
                          setCatDesc(cat.description);
                        }}
                        className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg hover:bg-zinc-100 cursor-pointer"
                      >
                        সম্পাদনা
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCategory(cat.id)}
                        className="px-3 py-1.5 text-xs text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer"
                      >
                        ডিলিট
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. ORDERS & DELIVERY CONTROL */}
          {section === 'orders' && (
            <div className="space-y-5">
              <div className="bg-white border border-zinc-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">অর্ডার ও এক্সপ্রেস ডেলিভারি নিয়ন্ত্রণ</h2>
                  <p className="text-xs text-zinc-500">
                    স্ট্যাটাস পরিবর্তন করলে গ্রাহকের কাছে স্বয়ংক্রিয় রিয়েল-টাইম নোটিফিকেশন পৌঁছে যায়
                  </p>
                </div>
                <select
                  value={orderFilter}
                  onChange={(e) => setOrderFilter(e.target.value as typeof orderFilter)}
                  className="px-3 py-2 text-xs border border-zinc-200 rounded-lg bg-white"
                >
                  <option value="all">সকল অর্ডার ({orders.length})</option>
                  {(['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map(
                    (st) => (
                      <option key={st} value={st}>
                        {ORDER_STATUS_LABELS[st]}
                      </option>
                    )
                  )}
                </select>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="bg-white border border-zinc-200 rounded-xl p-10 text-center text-sm text-zinc-500">
                  কোনো অর্ডার পাওয়া যায়নি।
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredOrders.map((ord) => {
                    const draft = orderDrafts[ord.id] || {
                      status: ord.status,
                      note: ord.courierNote,
                    };
                    return (
                      <div
                        key={ord.id}
                        className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-100 pb-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="font-bold font-mono-tabular text-zinc-950">
                                {ord.trackingCode}
                              </span>
                              <span className="text-zinc-300" aria-hidden="true">·</span>
                              <span className="font-semibold text-zinc-900">{ord.customerName}</span>
                              <span className="text-xs text-zinc-500 font-mono-tabular">
                                ({ord.customerPhone})
                              </span>
                            </div>
                            <p className="text-xs text-zinc-500">
                              {ord.shippingAddress}, {ord.city} · {formatTimestamp(ord.createdAt)}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span
                              className={`px-2.5 py-1 rounded border font-semibold ${
                                ORDER_STATUS_TONE[ord.status]
                              }`}
                            >
                              {ORDER_STATUS_LABELS[ord.status]}
                            </span>
                            <span className="font-bold text-sm text-zinc-950 tabular-nums">
                              {formatBDT(ord.totalAmount)}
                            </span>
                          </div>
                        </div>

                        {/* Ordered Products List with Photos */}
                        {ord.items && ord.items.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wide">
                              অর্ডারকৃত পণ্য ({ord.items.length}টি আইটেম)
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {ord.items.map((item, idx) => {
                                const catalogProd = productsById[item.productId];
                                const itemImg =
                                  item.imageUrl ||
                                  catalogProd?.imageUrl ||
                                  catalogProd?.imageUrls?.[0] ||
                                  '';
                                return (
                                  <div
                                    key={`${ord.id}-item-${item.productId}-${idx}`}
                                    className="flex items-center gap-3 p-2.5 rounded-lg bg-zinc-50 border border-zinc-200/80"
                                  >
                                    <div className="w-14 h-14 rounded-md overflow-hidden bg-white border border-zinc-200 shrink-0">
                                      <ResilientImage
                                        src={itemImg}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                        fallbackLabel={item.name}
                                      />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <p className="text-xs font-semibold text-zinc-950 truncate">
                                        {item.name}
                                      </p>
                                      {catalogProd?.sku && (
                                        <p className="text-[11px] font-mono-tabular text-zinc-400">
                                          SKU: {catalogProd.sku}
                                        </p>
                                      )}
                                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-600 pt-0.5">
                                        <span className="tabular-nums">
                                          {item.quantity} × {formatBDT(item.price)}
                                        </span>
                                        <span className="font-semibold text-zinc-950 tabular-nums">
                                          {formatBDT(item.price * item.quantity)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-zinc-600 flex flex-wrap items-center gap-4">
                          <span>পেমেন্ট: {PAYMENT_METHOD_LABELS[ord.paymentMethod]} ({PAYMENT_STATUS_LABELS[ord.paymentStatus]})</span>
                          <span className="font-mono-tabular">রেফারেন্স: {ord.paymentReference}</span>
                          <span>ডেলিভারি স্থান: {ord.deliverySpeed === 'standard' ? 'ঢাকার ভেতরে (২৪-৪৮ ঘণ্টা)' : 'ঢাকার বাইরে (৩-৫ দিন)'}</span>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-1">
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setOrderDrafts((prev) => ({
                                ...prev,
                                [ord.id]: { ...draft, status: e.target.value as OrderStatus },
                              }))
                            }
                            className="px-3 py-2 text-xs border border-zinc-200 rounded-lg bg-white"
                          >
                            {(['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as OrderStatus[]).map(
                              (st) => (
                                <option key={st} value={st}>
                                  {ORDER_STATUS_LABELS[st]}
                                </option>
                              )
                            )}
                          </select>

                          <input
                            type="text"
                            maxLength={300}
                            value={draft.note}
                            onChange={(e) =>
                              setOrderDrafts((prev) => ({
                                ...prev,
                                [ord.id]: { ...draft, note: e.target.value },
                              }))
                            }
                            placeholder="কুরিয়ার বা ডেলিভারি নোট লিখুন..."
                            className="flex-1 px-3 py-2 text-xs border border-zinc-200 rounded-lg"
                          />

                          <button
                            type="button"
                            disabled={updatingOrderId === ord.id}
                            onClick={() => void handleUpdateOrderStatus(ord)}
                            className="px-4 py-2 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                          >
                            {updatingOrderId === ord.id ? 'আপডেট হচ্ছে...' : 'স্ট্যাটাস আপডেট'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 5. FACEBOOK SHOP NOW & SOCIAL SETTINGS */}
          {section === 'social' && (
            <div className="space-y-6">
              {/* Facebook Shop Now Integration Box */}
              <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-950">
                    ফেসবুক অ্যাকশন বাটন ("Shop Now") ডিরেক্ট সেলিং লিংক
                  </h2>
                  <p className="text-xs text-zinc-500 mt-1">
                    আপনার ফেসবুক পেজের "Shop Now" বাটনে নিচের লিংকটি যুক্ত করুন যাতে ফেসবুক গ্রাহকরা সরাসরি এই ওয়েবসাইটে এসে পণ্য কিনতে পারেন।
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={fbShopNowLink}
                    className="flex-1 px-3 py-2 text-xs font-mono-tabular bg-zinc-50 border border-zinc-200 rounded-lg text-zinc-800"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyFbLink()}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
                  >
                    {copiedFbLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFbLink ? 'কপি হয়েছে' : 'লিংক কপি করুন'}</span>
                  </button>
                </div>
              </div>

              {/* Store & Social Contact Links Form */}
              <form
                onSubmit={handleSaveSettings}
                className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="text-lg font-bold text-zinc-950">স্টোর, ডেলিভারি চার্জ ও সোশ্যাল মিডিয়া লিংক</h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">দোকানের নাম</label>
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={storeNameInput}
                      onChange={(e) => setStoreNameInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ট্যাগলাইন</label>
                    <input
                      type="text"
                      maxLength={200}
                      value={taglineInput}
                      onChange={(e) => setTaglineInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ফেসবুক পেজ লিংক</label>
                    <input
                      type="url"
                      maxLength={300}
                      value={fbUrlInput}
                      onChange={(e) => setFbUrlInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">মেসেঞ্জার লিংক</label>
                    <input
                      type="url"
                      maxLength={300}
                      value={messengerInput}
                      onChange={(e) => setMessengerInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">হোয়াটসঅ্যাপ নম্বর</label>
                    <input
                      type="text"
                      maxLength={30}
                      value={whatsappInput}
                      onChange={(e) => setWhatsappInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ইনস্টাগ্রাম লিংক</label>
                    <input
                      type="url"
                      maxLength={300}
                      value={igInput}
                      onChange={(e) => setIgInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ঢাকার ভেতরে ডেলিভারি ফি (২৪-৪৮ ঘণ্টা) (৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={stdFeeInput}
                      onChange={(e) => setStdFeeInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-600 mb-1">ঢাকার বাইরে ডেলিভারি ফি (৩-৫ দিন) (৳)</label>
                    <input
                      type="number"
                      min={0}
                      value={expFeeInput}
                      onChange={(e) => setExpFeeInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg tabular-nums"
                    />
                  </div>
                </div>

                {savedSettingsFlag && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    স্টোর সেটিংস ও সোশ্যাল মিডিয়া লিংক সংরক্ষিত হয়েছে।
                  </p>
                )}

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-zinc-950 text-white text-xs font-semibold rounded-lg hover:bg-zinc-800 cursor-pointer"
                >
                  সেটিংস সেভ করুন
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
