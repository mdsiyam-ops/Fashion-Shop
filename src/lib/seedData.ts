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
import { Category, StoreSettings } from '../types';

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

// IDs of previously seeded starter demo items so they can be hidden and purged from Firestore
export const STARTER_PRODUCT_IDS = new Set([
  'prod_aether_headphones',
  'prod_traverse_watch',
  'prod_amber_parfum',
  'prod_ceramic_lamp',
  'prod_leather_tote',
  'prod_minimal_desk_kit',
]);

export const STARTER_REVIEW_IDS = new Set([
  'rev_seed_1',
  'rev_seed_2',
  'rev_seed_3',
  'rev_seed_4',
  'rev_seed_5',
  'rev_seed_6',
]);

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

export async function purgeDemoDataFromFirestore(
  existingProductIds: string[],
  existingReviewIds: string[]
): Promise<void> {
  const demoProdIds = existingProductIds.filter((id) => STARTER_PRODUCT_IDS.has(id));
  const demoRevIds = existingReviewIds.filter((id) => STARTER_REVIEW_IDS.has(id));
  if (demoProdIds.length === 0 && demoRevIds.length === 0) return;

  const batch = writeBatch(db);
  demoProdIds.forEach((id) => {
    batch.delete(doc(db, 'products', id));
  });
  demoRevIds.forEach((id) => {
    batch.delete(doc(db, 'reviews', id));
  });
  await batch.commit();
}

export async function seedInitialStoreData(_adminUid: string): Promise<void> {
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
}
