import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, Minus, Plus, ShieldCheck, Star, Truck, X } from 'lucide-react';
import { clampStr, db, handleFirestoreError, OperationType } from '../firebase';
import { formatBDT, formatTimestamp } from '../lib/format';
import { Product, Review } from '../types';
import { ResilientImage } from './ResilientImage';

interface ProductDetailModalProps {
  product: Product | null;
  reviews: Review[];
  currentUser: User | null;
  onClose: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onBuyNow: (product: Product, quantity: number) => void;
  onRequireAuth: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  reviews,
  currentUser,
  onClose,
  onAddToCart,
  onBuyNow,
  onRequireAuth,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [ratingInput, setRatingInput] = useState(5);
  const [commentInput, setCommentInput] = useState('');
  const [authorNameInput, setAuthorNameInput] = useState(currentUser?.displayName || '');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewFeedback, setReviewFeedback] = useState('');

  const productReviews = useMemo(() => {
    if (!product) return [];
    return reviews.filter((r) => r.productId === product.id);
  }, [product, reviews]);

  const computedAvg = useMemo(() => {
    if (!product) return 0;
    if (productReviews.length === 0) return product.ratingAvg;
    const sum = productReviews.reduce((acc, r) => acc + r.rating, 0);
    return Number((sum / productReviews.length).toFixed(1));
  }, [product, productReviews]);

  const ratingCounts = useMemo(() => {
    const map: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    productReviews.forEach((r) => {
      const rounded = Math.min(5, Math.max(1, Math.round(r.rating)));
      map[rounded] = (map[rounded] || 0) + 1;
    });
    return map;
  }, [productReviews]);

  if (!product) return null;

  const isOutOfStock = product.stock <= 0;
  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
      : 0;

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!currentUser.emailVerified) {
      setReviewFeedback('রিভিউ জমা দেওয়ার আগে উপরের বার থেকে আপনার ইমেইল ভেরিফাই সম্পন্ন করুন।');
      return;
    }
    const cleanComment = clampStr(commentInput, 1000);
    const cleanAuthor = clampStr(authorNameInput || currentUser.displayName || 'সম্মানিত গ্রাহক', 80);
    if (!cleanComment) return;

    setSubmittingReview(true);
    setReviewFeedback('');
    const reviewId = `rev_${Date.now()}_${currentUser.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'reviews', reviewId), {
        id: reviewId,
        productId: product.id,
        userId: currentUser.uid,
        authorName: cleanAuthor,
        rating: ratingInput,
        comment: cleanComment,
        verifiedPurchase: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCommentInput('');
      setRatingInput(5);
      setReviewFeedback('আপনার মূল্যবান রিভিউ সফলভাবে প্রকাশিত হয়েছে।');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${reviewId}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-0 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={product.name}
    >
      <div className="bg-white w-full max-w-5xl sm:rounded-xl border border-zinc-200 overflow-hidden max-h-[100vh] sm:max-h-[90vh] flex flex-col">
        {/* Top Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs text-zinc-500 truncate">
            <span>{product.categoryName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{product.sku}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 transition-colors cursor-pointer"
            aria-label="বন্ধ করুন"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-6 lg:p-8 space-y-10">
          {/* Split Product Overview & Contiguous Purchase Module */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Gallery Left */}
            <div className="lg:col-span-6">
              <div className="aspect-[4/3] rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
                <ResilientImage
                  src={product.imageUrl}
                  alt={product.name}
                  fallbackLabel={product.name}
                />
              </div>
            </div>

            {/* Contiguous Purchase Module Right */}
            <div className="lg:col-span-6 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-2">
                  <span>{product.categoryName}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {product.stock > 0 ? `স্টকে আছে (${product.stock}টি)` : 'স্টক শেষ'}
                  </span>
                  {product.expressEligible && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-700 font-medium">ঢাকার ভেতরে ২৪-৪৮ ঘণ্টায় ডেলিভারি</span>
                    </>
                  )}
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-zinc-950 leading-snug">
                  {product.name}
                </h2>
              </div>

              {/* Rating Summary Line */}
              <div className="flex items-center gap-3 text-sm">
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  <span className="font-semibold text-zinc-950 tabular-nums">{computedAvg}</span>
                </div>
                <span className="text-zinc-400" aria-hidden="true">·</span>
                <span className="text-zinc-600 tabular-nums">
                  {productReviews.length || product.reviewCount}টি গ্রাহক রিভিউ
                </span>
                <span className="text-zinc-400" aria-hidden="true">·</span>
                <span className="text-zinc-600 tabular-nums">{product.soldCount}টি বিক্রিত</span>
              </div>

              {/* Pricing */}
              <div className="flex items-baseline gap-3 pt-1">
                <span className="text-3xl font-bold text-zinc-950 tabular-nums">
                  {formatBDT(product.price)}
                </span>
                {product.compareAtPrice && product.compareAtPrice > product.price && (
                  <>
                    <span className="text-base text-zinc-400 line-through tabular-nums">
                      {formatBDT(product.compareAtPrice)}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                      ({discountPercent}% সাশ্রয়)
                    </span>
                  </>
                )}
              </div>

              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                {product.description}
              </p>

              {/* Quantity & Purchase CTAs */}
              <div className="pt-3 border-t border-zinc-200 space-y-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-zinc-700">পরিমাণ:</span>
                  <div className="inline-flex items-center border border-zinc-200 rounded-lg bg-white">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={isOutOfStock || quantity <= 1}
                      className="w-10 h-10 flex items-center justify-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                      aria-label="পরিমাণ কমান"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-12 text-center text-sm font-semibold tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(product.stock, q + 1))}
                      disabled={isOutOfStock || quantity >= product.stock}
                      className="w-10 h-10 flex items-center justify-center text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer"
                      aria-label="পরিমাণ বাড়ান"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => {
                      onAddToCart(product, quantity);
                      onClose();
                    }}
                    className="w-full py-3 px-5 border border-zinc-950 text-zinc-950 font-semibold text-sm rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    {isOutOfStock ? 'স্টক নেই' : 'ব্যাগে যোগ করুন'}
                  </button>
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => onBuyNow(product, quantity)}
                    className="w-full py-3 px-5 bg-emerald-700 text-white font-semibold text-sm rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                  >
                    এখনই অর্ডার করুন
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs text-zinc-600">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>ঢাকার ভেতরে ২৪-৪৮ ঘণ্টা (৳৮০) · ঢাকার বাইরে ৩-৫ দিন (৳১২০)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>ক্যাশ অন ডেলিভারি ও নিরাপদ অ্যাডভান্স পেমেন্ট সুবিধা</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Product Reviews & Feedback Section */}
          <div className="pt-8 border-t border-zinc-200 grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Rating Distribution & Submit Form */}
            <div className="lg:col-span-5 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-zinc-950 mb-1">গ্রাহক রিভিউ ও রেটিং</h3>
                <p className="text-xs text-zinc-500">
                  যাচাইকৃত ক্রেতাদের অভিজ্ঞতা ও মতামত
                </p>
              </div>

              <div className="p-5 bg-zinc-50 border border-zinc-200 rounded-xl space-y-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold text-zinc-950 tabular-nums">{computedAvg}</span>
                  <span className="text-sm text-zinc-500">/ ৫.০ ({productReviews.length}টি রিভিউ)</span>
                </div>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = ratingCounts[star] || 0;
                    const pct = productReviews.length > 0 ? (count / productReviews.length) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-3 text-xs">
                        <span className="w-8 text-zinc-600 tabular-nums">{star} ★</span>
                        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-zinc-500 tabular-nums">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Write Review Form */}
              <form onSubmit={handleSubmitReview} className="p-5 border border-zinc-200 rounded-xl space-y-4">
                <h4 className="text-sm font-semibold text-zinc-950">আপনার মতামত দিন</h4>
                <div>
                  <label className="block text-xs text-zinc-600 mb-1.5">রেটিং নির্বাচন করুন</label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingInput(star)}
                        className="p-1.5 rounded-md hover:bg-zinc-100 cursor-pointer"
                        aria-label={`${star} স্টার`}
                      >
                        <Star
                          className={`w-5 h-5 ${
                            star <= ratingInput
                              ? 'fill-amber-400 text-amber-500'
                              : 'text-zinc-300'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-zinc-600 mb-1">আপনার নাম</label>
                  <input
                    type="text"
                    value={authorNameInput}
                    onChange={(e) => setAuthorNameInput(e.target.value)}
                    placeholder="যেমন: রাফি আহমেদ"
                    maxLength={80}
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-600 mb-1">মতামত লিখুন</label>
                  <textarea
                    rows={3}
                    required
                    maxLength={1000}
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    placeholder="পণ্যের মান, প্যাকেজিং ও ডেলিভারি অভিজ্ঞতা শেয়ার করুন..."
                    className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                {reviewFeedback && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    {reviewFeedback}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {currentUser
                    ? submittingReview
                      ? 'জমা হচ্ছে...'
                      : 'রিভিউ জমা দিন'
                    : 'রিভিউ দিতে সাইন ইন করুন'}
                </button>
              </form>
            </div>

            {/* Right: Reviews Feed */}
            <div className="lg:col-span-7 space-y-4">
              {productReviews.length === 0 ? (
                <div className="p-8 border border-zinc-200 rounded-xl text-center text-sm text-zinc-500">
                  এই পণ্যে এখনো কোনো রিভিউ নেই। প্রথম রিভিউটি আপনিই দিন।
                </div>
              ) : (
                productReviews.map((rev) => (
                  <div key={rev.id} className="p-5 border border-zinc-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-semibold text-zinc-950">{rev.authorName}</span>
                        {rev.verifiedPurchase && (
                          <>
                            <span className="text-zinc-300" aria-hidden="true">·</span>
                            <span className="text-xs text-emerald-700 font-medium">যাচাইকৃত ক্রেতা</span>
                          </>
                        )}
                      </div>
                      <span className="text-xs text-zinc-400">{formatTimestamp(rev.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= rev.rating ? 'fill-amber-400 text-amber-500' : 'text-zinc-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-sm text-zinc-700 leading-relaxed">{rev.comment}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
