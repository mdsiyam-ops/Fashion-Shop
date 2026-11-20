import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ExternalLink,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Star,
  Truck,
  X,
} from 'lucide-react';
import { formatBDT } from '../lib/format';
import { HERO_IMAGE_URL, STARTER_PRODUCT_IDS } from '../lib/seedData';
import { Category, Product, Review, StoreSettings } from '../types';
import { ResilientImage } from './ResilientImage';

interface StorefrontProps {
  products: Product[];
  productsLoaded: boolean;
  categories: Category[];
  reviews: Review[];
  settings: StoreSettings;
  trafficSource: 'web' | 'fb_shop_now';
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  onNavigateTracking: () => void;
}

export const Storefront: React.FC<StorefrontProps> = ({
  products,
  productsLoaded,
  categories,
  reviews,
  settings,
  trafficSource,
  onSelectProduct,
  onAddToCart,
  onBuyNow,
  onNavigateTracking,
}) => {
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [priceRange, setPriceRange] = useState<'all' | 'under3k' | '3kto8k' | 'above8k'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'popular' | 'price_asc' | 'price_desc' | 'rating'>('newest');
  const [expressOnly, setExpressOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Merge live Firestore reviews with product ratings
  const productReviewStats = useMemo(() => {
    const map: Record<string, { avg: number; count: number }> = {};
    reviews.forEach((rev) => {
      if (!map[rev.productId]) {
        map[rev.productId] = { avg: 0, count: 0 };
      }
      map[rev.productId].avg += rev.rating;
      map[rev.productId].count += 1;
    });
    Object.keys(map).forEach((pid) => {
      map[pid].avg = Number((map[pid].avg / map[pid].count).toFixed(1));
    });
    return map;
  }, [reviews]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = products.filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (expressOnly && !p.expressEligible) return false;
      if (inStockOnly && p.stock <= 0) return false;
      if (priceRange === 'under3k' && p.price >= 3000) return false;
      if (priceRange === '3kto8k' && (p.price < 3000 || p.price > 8000)) return false;
      if (priceRange === 'above8k' && p.price <= 8000) return false;
      if (q) {
        const hay = `${p.name} ${p.description} ${p.sku} ${p.categoryName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const getProductEpoch = (p: Product): number => {
      const val = p.createdAt;
      if (val && typeof val === 'object') {
        const ts = val as { seconds?: number; toMillis?: () => number };
        if (typeof ts.toMillis === 'function') return ts.toMillis();
        if (typeof ts.seconds === 'number') return ts.seconds * 1000;
      }
      const match = p.id.match(/^prod_(\d+)$/);
      if (match) return Number(match[1]) || 0;
      return 0;
    };

    return [...list].sort((a, b) => {
      if (sortBy === 'price_asc') return a.price - b.price;
      if (sortBy === 'price_desc') return b.price - a.price;
      if (sortBy === 'rating') {
        const ra = productReviewStats[a.id]?.avg ?? a.ratingAvg;
        const rb = productReviewStats[b.id]?.avg ?? b.ratingAvg;
        return rb - ra;
      }
      if (sortBy === 'popular') {
        return b.soldCount - a.soldCount;
      }
      // Custom admin-added products always appear first ahead of starter demo products
      const aIsDemo = STARTER_PRODUCT_IDS.has(a.id) ? 1 : 0;
      const bIsDemo = STARTER_PRODUCT_IDS.has(b.id) ? 1 : 0;
      if (aIsDemo !== bIsDemo) return aIsDemo - bIsDemo;

      const timeDiff = getProductEpoch(b) - getProductEpoch(a);
      if (timeDiff !== 0) return timeDiff;
      return b.soldCount - a.soldCount;
    });
  }, [
    products,
    searchQuery,
    selectedCategoryId,
    priceRange,
    sortBy,
    expressOnly,
    inStockOnly,
    productReviewStats,
  ]);

  const handleQuickAdd = (e: React.MouseEvent, product: Product) => {
    e.stopPropagation();
    onAddToCart(product, 1);
    setAddedId(product.id);
    setTimeout(() => setAddedId((prev) => (prev === product.id ? null : prev)), 1200);
  };

  const scrollToCatalog = () => {
    document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  const whatsappUrl = `https://wa.me/${settings.whatsappNumber.replace(/[^\d]/g, '')}`;

  return (
    <div className="space-y-12 pb-16">
      {/* Slim Dismissible Announcement Bar (<= 40px) */}
      {!bannerDismissed && (
        <div className="bg-zinc-950 text-white text-xs h-10 px-4 flex items-center justify-between">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
            <p className="truncate">
              {`${settings.storeName}-এ স্বাগতম · ঢাকার ভেতরে ২৪-৪৮ ঘণ্টা (${formatBDT(settings.standardDeliveryFee)}) · ঢাকার বাইরে ৩-৫ দিন (${formatBDT(settings.expressDeliveryFee)})`}
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="text-zinc-400 hover:text-white p-1 shrink-0 cursor-pointer"
              aria-label="বার্তা বন্ধ করুন"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Editorial Split Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-white border border-zinc-200 rounded-xl overflow-hidden">
          <div className="lg:col-span-5 p-8 lg:p-12 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-emerald-700 tracking-wide">
                দ্রুত হোম ডেলিভারি · নিরাপদ পেমেন্ট গেটওয়ে
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-zinc-950 leading-[1.18] [text-wrap:balance]">
                দৈনন্দিন আভিজাত্যের জন্য নির্মিত আধুনিক সংগ্রহ
              </h1>
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed max-w-md">
                {settings.tagline}। সহজে অর্ডার করুন, লাইভ ট্র্যাকিং দেখুন এবং নিরাপদ পেমেন্ট গেটওয়েতে নিশ্চিন্তে মূল্য পরিশোধ করুন।
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={scrollToCatalog}
                className="inline-flex items-center gap-2 px-6 py-3 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>সংগ্রহ দেখুন</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 bg-black flex items-center justify-center overflow-hidden">
            <ResilientImage
              src={HERO_IMAGE_URL}
              alt="Fashion Shop ফ্ল্যাগশিপ সংগ্রহ"
              className="w-full h-full object-contain"
              fallbackLabel="Fashion Shop সংগ্রহ"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Search, Powerful Filters & Featured Catalog Grid */}
      <section id="catalog-section" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <h2 className="text-2xl font-bold text-zinc-950">সকল পণ্য ও সংগ্রহ</h2>
            <p className="text-sm text-zinc-500 mt-1 tabular-nums">
              মোট {filteredProducts.length}টি পণ্য প্রদর্শিত হচ্ছে
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="পণ্য, SKU বা ধরন খুঁজুন..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        </div>

        {/* Category Filter Tabs & Advanced Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Dynamic Category Segmented Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-lg overflow-x-auto">
            <button
              type="button"
              onClick={() => setSelectedCategoryId('all')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-white text-zinc-950 shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              সকল ক্যাটাগরি
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Price, Sort & Quick Filter Toggles */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>ফিল্টার:</span>
            </div>

            <select
              value={priceRange}
              onChange={(e) => setPriceRange(e.target.value as typeof priceRange)}
              aria-label="দামের সীমা"
              className="px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
            >
              <option value="all">সকল দাম</option>
              <option value="under3k">৳ ৩,০০০-এর নিচে</option>
              <option value="3kto8k">৳ ৩,০০০ - ৳ ৮,০০০</option>
              <option value="above8k">৳ ৮,০০০-এর বেশি</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="সাজানোর ধরন"
              className="px-3 py-1.5 text-xs font-medium bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
            >
              <option value="newest">নতুন পণ্য আগে</option>
              <option value="popular">সর্বাধিক বিক্রিত</option>
              <option value="price_asc">দাম: কম থেকে বেশি</option>
              <option value="price_desc">দাম: বেশি থেকে কম</option>
              <option value="rating">সর্বোচ্চ রেটিং</option>
            </select>

            <button
              type="button"
              onClick={() => setExpressOnly((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                expressOnly
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              ২৪-৪৮ ঘণ্টায় ডেলিভারি
            </button>

            <button
              type="button"
              onClick={() => setInStockOnly((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                inStockOnly
                  ? 'bg-zinc-950 text-white border-zinc-950'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50'
              }`}
            >
              শুধু স্টকে আছে
            </button>
          </div>
        </div>

        {/* 3-Column Product Grid */}
        {!productsLoaded && products.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[0, 1, 2].map((skeletonIdx) => (
              <div
                key={skeletonIdx}
                className="bg-white border border-zinc-200 rounded-xl overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-zinc-200" />
                <div className="p-5 space-y-3">
                  <div className="h-3 w-24 bg-zinc-200 rounded" />
                  <div className="h-4 w-3/4 bg-zinc-200 rounded" />
                  <div className="h-5 w-1/3 bg-zinc-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-zinc-200 rounded-xl p-12 text-center space-y-3">
            <p className="text-base font-semibold text-zinc-900">কোনো পণ্য পাওয়া যায়নি</p>
            <p className="text-sm text-zinc-500">
              অন্য ক্যাটাগরি অথবা ভিন্ন কীওয়ার্ড দিয়ে আবার খুঁজে দেখুন।
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategoryId('all');
                setPriceRange('all');
                setExpressOnly(false);
                setInStockOnly(false);
              }}
              className="px-4 py-2 bg-zinc-950 text-white text-xs font-medium rounded-lg hover:bg-zinc-800 cursor-pointer"
            >
              সব ফিল্টার রিসেট করুন
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {filteredProducts.map((product) => {
              const liveStats = productReviewStats[product.id];
              const displayRating = liveStats?.avg ?? product.ratingAvg;
              const displayCount = liveStats?.count ?? product.reviewCount;
              const isOut = product.stock <= 0;
              const justAdded = addedId === product.id;

              return (
                <article
                  key={product.id}
                  onClick={() => onSelectProduct(product)}
                  className="group bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col hover:-translate-y-0.5 hover:shadow-md transition-all duration-150 cursor-pointer"
                >
                  {/* 4:3 Product Image */}
                  <div className="aspect-[4/3] bg-zinc-100 overflow-hidden">
                    <ResilientImage
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                      fallbackLabel={product.name}
                    />
                  </div>

                  {/* Clean Metadata & Pricing */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                        <span className="uppercase tracking-wide truncate">{product.categoryName}</span>
                        <span className="shrink-0">
                          {isOut ? 'স্টক নেই' : product.stock <= 5 ? `মাত্র ${product.stock}টি বাকি` : 'স্টকে আছে'}
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-zinc-950 leading-snug line-clamp-2">
                        {product.name}
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-zinc-600 pt-0.5">
                        <span className="inline-flex items-center gap-1 font-medium text-zinc-900 tabular-nums">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          {displayRating}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{displayCount} রিভিউ</span>
                        {product.expressEligible && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-medium">দ্রুত ডেলিভারি</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-zinc-950 tabular-nums">
                          {formatBDT(product.price)}
                        </span>
                        {product.compareAtPrice && product.compareAtPrice > product.price && (
                          <span className="text-xs text-zinc-400 line-through tabular-nums">
                            {formatBDT(product.compareAtPrice)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isOut}
                        onClick={(e) => handleQuickAdd(e, product)}
                        className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
                          justAdded
                            ? 'bg-emerald-700 text-white'
                            : 'bg-zinc-950 text-white hover:bg-zinc-800'
                        }`}
                      >
                        {isOut ? 'শেষ' : justAdded ? 'যুক্ত হয়েছে ✓' : 'ব্যাগে যোগ করুন'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3: Trust, Reviews & Facebook Direct Connect */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-950">গ্রাহকদের সাম্প্রতিক মতামত</h2>
              <p className="text-xs text-zinc-500 mt-0.5">সততা ও মানের ভিত্তিতে যাচাইকৃত রিভিউ</p>
            </div>
            <button
              type="button"
              onClick={onNavigateTracking}
              className="text-xs font-semibold text-emerald-700 hover:underline inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Truck className="w-3.5 h-3.5" />
              অর্ডার ট্র্যাক করুন
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {reviews.slice(0, 4).map((rev) => (
              <div key={rev.id} className="p-4 border border-zinc-200 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-950">{rev.authorName}</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-500 font-semibold tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {rev.rating}.0
                  </span>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed line-clamp-3">{rev.comment}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-zinc-950 text-white rounded-xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <p className="text-xs text-emerald-400 font-medium">সরাসরি যোগাযোগ ও সহায়তা</p>
            <h2 className="text-2xl font-bold leading-snug">
              তাৎক্ষণিক কাস্টমার সাপোর্ট ও সরাসরি যোগাযোগ
            </h2>
            <p className="text-sm text-zinc-300 leading-relaxed">
              পণ্যের বিস্তারিত জানতে বা জরুরি অর্ডারের জন্য সরাসরি আমাদের ফেসবুক পেজ, মেসেঞ্জার অথবা হোয়াটসঅ্যাপে যোগাযোগ করুন।
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href={settings.facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-white text-zinc-950 text-xs font-semibold rounded-lg hover:bg-zinc-200 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <span>ফেসবুক পেজ</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={settings.messengerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-zinc-800 text-white text-xs font-semibold rounded-lg hover:bg-zinc-700 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>মেসেঞ্জার চ্যাট</span>
            </a>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sm:col-span-2 px-4 py-2.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-600 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>হোয়াটসঅ্যাপে সরাসরি অর্ডার ({settings.whatsappNumber})</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
