import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Category, Product, Review, StoreSettings } from '../types';

import heroAtelierImg from '../assets/images/hero_lifestyle_atelier_1795062469034.jpg';
import productWirelessAudioImg from '../assets/images/product_wireless_audio_1795062468395.jpg';
import productArtisanWatchImg from '../assets/images/product_artisan_watch_1795062468913.jpg';
import productAmberFragranceImg from '../assets/images/product_amber_fragrance_1795062469027.jpg';
import productCeramicLampImg from '../assets/images/product_ceramic_lamp_1795062468114.jpg';
import productLeatherToteImg from '../assets/images/product_leather_tote_1795062468753.jpg';

export const HERO_IMAGE_URL =
  './assets/aistudio/WhatsApp_Image_2026-11-19_at_12.07.35_0b9b29f8.jpeg';

export const STUDIO_IMAGE_GALLERY = [
  {
    label: 'ওয়্যারলেস স্টুডিও হেডফোন',
    url: productWirelessAudioImg,
  },
  {
    label: 'আর্টিসান অটোমেটিক ঘড়ি',
    url: productArtisanWatchImg,
  },
  {
    label: 'স্মোকড অ্যাম্বার পারফিউম',
    url: productAmberFragranceImg,
  },
  {
    label: 'সিরামিক ও ব্রাস ডেস্ক ল্যাম্প',
    url: productCeramicLampImg,
  },
  {
    label: 'ফুল-গ্রেইন লেদার টোট ব্যাগ',
    url: productLeatherToteImg,
  },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  id: 'store',
  storeName: 'Fashion Shop',
  tagline: 'ফ্যাশন, অ্যাক্সেসরিজ ও লাইফস্টাইলের বিশ্বস্ত অনলাইন শপ',
  facebookUrl: 'https://www.facebook.com/',
  messengerUrl: 'https://m.me/',
  whatsappNumber: '+8801700000000',
  instagramUrl: 'https://www.instagram.com/',
  freeDeliveryThreshold: 0,
  standardDeliveryFee: 80,
  expressDeliveryFee: 120,
};

export const STARTER_CATEGORIES: Category[] = [
  {
    id: 'cat_audio',
    name: 'অডিও ও টেক',
    slug: 'audio-tech',
    description: 'স্টুডিও-গ্রেড ওয়্যারলেস হেডফোন এবং প্রিমিয়াম সাউন্ড ডিভাইস।',
  },
  {
    id: 'cat_watches',
    name: 'ঘড়ি ও অ্যাক্সেসরিজ',
    slug: 'watches-accessories',
    description: 'হাতে তৈরি লেদার স্ট্র্যাপ ও মিনিমালিস্ট অটোমেটিক ঘড়ি।',
  },
  {
    id: 'cat_fragrance',
    name: 'পারফিউম ও সুগন্ধি',
    slug: 'fragrance',
    description: 'দীর্ঘস্থায়ী উডি, অ্যাম্বার এবং বোটানিক্যাল ইও দ্য পারফিউম।',
  },
  {
    id: 'cat_home',
    name: 'হোম ডেকোর ও লাইটিং',
    slug: 'home-lighting',
    description: 'হাতে গড়া সিরামিক ল্যাম্প এবং আধুনিক গৃহসজ্জার সামগ্রী।',
  },
  {
    id: 'cat_bags',
    name: 'ব্যাগ ও লেদার',
    slug: 'bags-leather',
    description: 'দৈনন্দিন ব্যবহার ও অফিসের জন্য টেকসই ফুল-গ্রেইন লেদার ব্যাগ।',
  },
];

export const STARTER_PRODUCTS: Product[] = [
  {
    id: 'prod_aether_headphones',
    name: 'ইথার স্টুডিও ওয়্যারলেস হেডফোন',
    description:
      'অ্যাক্টিভ নয়েজ ক্যান্সেলেশন (ANC), ব্রাশড অ্যালুমিনিয়াম ফ্রেম এবং ৪০ ঘণ্টার দীর্ঘ ব্যাটারি ব্যাকআপসহ প্রিমিয়াম ওয়্যারলেস হেডফোন। মিউজিক, অফিস কল ও ভ্রমণের জন্য আদর্শ।',
    categoryId: 'cat_audio',
    categoryName: 'অডিও ও টেক',
    price: 8900,
    compareAtPrice: 10500,
    stock: 18,
    sku: 'SHL-AUD-101',
    imageUrl: productWirelessAudioImg,
    featured: true,
    expressEligible: true,
    ratingAvg: 4.9,
    reviewCount: 2,
    soldCount: 42,
  },
  {
    id: 'prod_traverse_watch',
    name: 'ট্রাভার্স স্লেট অটোমেটিক ঘড়ি',
    description:
      'স্যাফায়ার ক্রিস্টাল গ্লাস, ব্রাশড স্টেইনলেস স্টিল কেস এবং আসল ইতালীয় লেদার স্ট্র্যাপে তৈরি ক্লাসিক রিস্টওয়াচ। ৫০ মিটার পর্যন্ত ওয়াটার-রেজিস্ট্যান্ট।',
    categoryId: 'cat_watches',
    categoryName: 'ঘড়ি ও অ্যাক্সেসরিজ',
    price: 12400,
    compareAtPrice: 14200,
    stock: 11,
    sku: 'SHL-WTC-204',
    imageUrl: productArtisanWatchImg,
    featured: true,
    expressEligible: true,
    ratingAvg: 4.8,
    reviewCount: 2,
    soldCount: 29,
  },
  {
    id: 'prod_amber_parfum',
    name: 'অব মিনেরাল স্মোকড অ্যাম্বার পারফিউম (১০০ মিলি)',
    description:
      'উষ্ণ অ্যাম্বার, সিডারউড, বারগামট এবং সাদা কস্তুরীর নিখুঁত সংমিশ্রণে তৈরি ১২+ ঘণ্টা স্থায়ী ইও দ্য পারফিউম। যেকোনো ঋতু ও অনুষ্ঠানের জন্য মানানসই।',
    categoryId: 'cat_fragrance',
    categoryName: 'পারফিউম ও সুগন্ধি',
    price: 4650,
    compareAtPrice: 5400,
    stock: 26,
    sku: 'SHL-FRG-309',
    imageUrl: productAmberFragranceImg,
    featured: true,
    expressEligible: true,
    ratingAvg: 4.9,
    reviewCount: 1,
    soldCount: 64,
  },
  {
    id: 'prod_ceramic_lamp',
    name: 'স্কাল্পচারাল সিরামিক ও ব্রাস ডেস্ক ল্যাম্প',
    description:
      'ম্যাট টেক্সচার্ড সিরামিক বেস এবং ব্রাশড ব্রাস শেডযুক্ত উষ্ণ আলোর টেবিল ল্যাম্প। স্টাডি ডেস্ক, বেডসাইড বা লিভিং রুমের সৌন্দর্য বাড়াতে দারুণ কার্যকর।',
    categoryId: 'cat_home',
    categoryName: 'হোম ডেকোর ও লাইটিং',
    price: 5200,
    compareAtPrice: 6000,
    stock: 9,
    sku: 'SHL-HOM-412',
    imageUrl: productCeramicLampImg,
    featured: false,
    expressEligible: true,
    ratingAvg: 4.7,
    reviewCount: 1,
    soldCount: 19,
  },
  {
    id: 'prod_leather_tote',
    name: 'অলিভ-চারকোল ফুল-গ্রেইন লেদার টোট ব্যাগ',
    description:
      '১৫ ইঞ্চি ল্যাপটপ স্লট, শক্ত ব্রাস জিপার এবং ভিজিটর/অফিস ব্যবহারের জন্য প্রশস্ত অভ্যন্তরীণ পকেটসহ হ্যান্ডক্রাফটেড অলিভ-চারকোল লেদার টোট ব্যাগ।',
    categoryId: 'cat_bags',
    categoryName: 'ব্যাগ ও লেদার',
    price: 6800,
    compareAtPrice: 7900,
    stock: 7,
    sku: 'SHL-BAG-505',
    imageUrl: productLeatherToteImg,
    featured: true,
    expressEligible: false,
    ratingAvg: 4.8,
    reviewCount: 1,
    soldCount: 33,
  },
  {
    id: 'prod_minimal_desk_kit',
    name: 'অডিও + ঘড়ি প্রিমিয়াম কম্বো এডিশন',
    description:
      'ইথার ওয়্যারলেস হেডফোন এবং ট্রাভার্স স্লেট ঘড়ির বিশেষ গিফট বক্স কম্বো। কর্পোরেট গিফটিং বা প্রিয়জনকে উপহার দেওয়ার জন্য সেরা পছন্দ।',
    categoryId: 'cat_audio',
    categoryName: 'অডিও ও টেক',
    price: 19500,
    compareAtPrice: 22900,
    stock: 4,
    sku: 'SHL-CMB-601',
    imageUrl: heroAtelierImg,
    featured: false,
    expressEligible: true,
    ratingAvg: 5.0,
    reviewCount: 1,
    soldCount: 12,
  },
];

export const STARTER_PRODUCT_IDS = new Set(STARTER_PRODUCTS.map((p) => p.id));

export const STARTER_REVIEWS: Review[] = [
  {
    id: 'rev_seed_1',
    productId: 'prod_aether_headphones',
    userId: 'seed_user_1',
    authorName: 'তানভীর আহমেদ',
    rating: 5,
    comment: 'সাউন্ড কোয়ালিটি এবং নয়েজ ক্যান্সেলেশন অসাধারণ। এক্সপ্রেস ডেলিভারিতে ১৮ ঘণ্টার মধ্যেই হাতে পেয়েছি।',
    verifiedPurchase: true,
  },
  {
    id: 'rev_seed_2',
    productId: 'prod_aether_headphones',
    userId: 'seed_user_2',
    authorName: 'নুসরাত জাহান',
    rating: 5,
    comment: 'মেটাল ফিনিশিং খুব প্রিমিয়াম আর দীর্ঘক্ষণ পরলেও কানে কোনো ব্যথা হয় না।',
    verifiedPurchase: true,
  },
  {
    id: 'rev_seed_3',
    productId: 'prod_traverse_watch',
    userId: 'seed_user_3',
    authorName: 'রাফিউজ্জামান চৌধুরী',
    rating: 5,
    comment: 'ডায়ালের স্লেট কালার ও লেদার স্ট্র্যাপ বাস্তবে ছবির চেয়েও সুন্দর।',
    verifiedPurchase: true,
  },
  {
    id: 'rev_seed_4',
    productId: 'prod_amber_parfum',
    userId: 'seed_user_4',
    authorName: 'মেহেদী হাসান',
    rating: 5,
    comment: 'একবার স্প্রে করলে সারাদিন সুগন্ধ থাকে। প্যাকেজিং ছিল খুব নিরাপদ।',
    verifiedPurchase: true,
  },
  {
    id: 'rev_seed_5',
    productId: 'prod_ceramic_lamp',
    userId: 'seed_user_5',
    authorName: 'সাবিহা সুলতানা',
    rating: 5,
    comment: 'আমার পড়ার টেবিলে দারুণ মানিয়েছে। আলো খুব আরামদায়ক ও সফট।',
    verifiedPurchase: true,
  },
  {
    id: 'rev_seed_6',
    productId: 'prod_leather_tote',
    userId: 'seed_user_6',
    authorName: 'আরিফুর রহমান',
    rating: 5,
    comment: 'ল্যাপটপ আর ডকুমেন্টস নিয়ে অফিসে যাওয়ার জন্য একদম পারফেক্ট ও মজবুত।',
    verifiedPurchase: true,
  },
];

export async function ensureCategoryInFirestore(cat: Category): Promise<void> {
  const catRef = doc(db, 'categories', cat.id);
  const snap = await getDoc(catRef);
  if (!snap.exists()) {
    await setDoc(catRef, {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function seedInitialStoreData(adminUid: string): Promise<void> {
  // Step 1: Categories (create only missing docs so existing immutable createdAt is never touched)
  try {
    const existingCatSnap = await getDocs(collection(db, 'categories'));
    const existingCatIds = new Set(existingCatSnap.docs.map((d) => d.id));
    const missingCategories = STARTER_CATEGORIES.filter((cat) => !existingCatIds.has(cat.id));
    if (missingCategories.length > 0) {
      const catBatch = writeBatch(db);
      for (const cat of missingCategories) {
        catBatch.set(doc(db, 'categories', cat.id), {
          ...cat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await catBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'categories');
  }

  // Step 2: Store Settings (create if missing, or migrate legacy storeName safely)
  try {
    const settingsRef = doc(db, 'settings', 'store');
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: serverTimestamp(),
      });
    } else if (settingsSnap.data()?.storeName === 'শৈলী স্টোর') {
      await updateDoc(settingsRef, {
        storeName: 'Fashion Shop',
        standardDeliveryFee: 80,
        expressDeliveryFee: 120,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/store');
  }

  // Step 3: Products (create only missing docs referencing existing categories)
  try {
    const existingProdSnap = await getDocs(collection(db, 'products'));
    const existingProdIds = new Set(existingProdSnap.docs.map((d) => d.id));
    const missingProducts = STARTER_PRODUCTS.filter((prod) => !existingProdIds.has(prod.id));
    if (missingProducts.length > 0) {
      const prodBatch = writeBatch(db);
      for (const prod of missingProducts) {
        prodBatch.set(doc(db, 'products', prod.id), {
          ...prod,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await prodBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }

  // Step 4: Reviews (create only missing docs referencing existing products)
  try {
    const existingRevSnap = await getDocs(collection(db, 'reviews'));
    const existingRevIds = new Set(existingRevSnap.docs.map((d) => d.id));
    const missingReviews = STARTER_REVIEWS.filter((rev) => !existingRevIds.has(rev.id));
    if (missingReviews.length > 0) {
      const revBatch = writeBatch(db);
      for (const rev of missingReviews) {
        revBatch.set(doc(db, 'reviews', rev.id), {
          ...rev,
          userId: adminUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await revBatch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reviews');
  }
}
