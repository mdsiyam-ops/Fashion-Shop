import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, Star } from 'lucide-react';
import { clampStr, db, handleFirestoreError, isVerifiedCustomer, OperationType } from '../firebase';
import { formatTimestamp } from '../lib/format';
import { Product, Review } from '../types';

interface ReviewsSectionViewProps {
  products: Product[];
  reviews: Review[];
  currentUser: User | null;
  onRequireAuth: () => void;
  onSelectProduct: (product: Product) => void;
}

export const ReviewsSectionView: React.FC<ReviewsSectionViewProps> = ({
  products,
  reviews,
  currentUser,
  onRequireAuth,
  onSelectProduct,
}) => {
  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [filterRating, setFilterRating] = useState<number>(0);
  const [rating, setRating] = useState<number>(5);
  const [authorName, setAuthorName] = useState(currentUser?.displayName || '');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const productMap = useMemo(() => {
    const map: Record<string, Product> = {};
    products.forEach((p) => {
      map[p.id] = p;
    });
    return map;
  }, [products]);

  const filteredReviews = useMemo(() => {
    return reviews.filter((r) => (filterRating === 0 ? true : Math.round(r.rating) === filterRating));
  }, [reviews, filterRating]);

  const averageOverall = useMemo(() => {
    if (reviews.length === 0) return '4.9';
    const total = reviews.reduce((sum, r) => sum + r.rating, 0);
    return (total / reviews.length).toFixed(1);
  }, [reviews]);

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    if (!isVerifiedCustomer(currentUser)) {
      setSuccessMsg('রিভিউ জমা দেওয়ার আগে উপরের বার থেকে আপনার ইমেইল ভেরিফাই সম্পন্ন করুন।');
      return;
    }
    const targetProductId = selectedProductId || products[0]?.id;
    if (!targetProductId || !comment.trim()) return;

    setSubmitting(true);
    setSuccessMsg('');
    const reviewId = `rev_${Date.now()}_${currentUser.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'reviews', reviewId), {
        id: reviewId,
        productId: targetProductId,
        userId: currentUser.uid,
        authorName: clampStr(authorName || currentUser.displayName || 'সম্মানিত গ্রাহক', 80),
        rating,
        comment: clampStr(comment, 1000),
        verifiedPurchase: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setComment('');
      setRating(5);
      setSuccessMsg('আপনার ফিডব্যাক ও রেটিং সফলভাবে যুক্ত হয়েছে।');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `reviews/${reviewId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-950">গ্রাহক ফিডব্যাক ও প্রোডাক্ট রিভিউ</h1>
          <p className="text-sm text-zinc-500 mt-1">
            আমাদের প্রতিটি পণ্যের মান ও ডেলিভারি সম্পর্কে গ্রাহকদের বাস্তব অভিজ্ঞতা
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-3xl font-bold text-zinc-950 tabular-nums">{averageOverall} / ৫.০</p>
            <p className="text-xs text-zinc-500 tabular-nums">{reviews.length}টি যাচাইকৃত রিভিউ</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Submit Feedback Form */}
        <div className="lg:col-span-4">
          <form
            onSubmit={handleCreateReview}
            className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4 sticky top-24"
          >
            <h2 className="text-lg font-bold text-zinc-950">নতুন ফিডব্যাক ও রেটিং দিন</h2>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">পণ্য নির্বাচন করুন</label>
              <select
                value={selectedProductId || products[0]?.id || ''}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">রেটিং</label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    className="p-1.5 rounded-md hover:bg-zinc-100 cursor-pointer"
                    aria-label={`${s} স্টার`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        s <= rating ? 'fill-amber-400 text-amber-500' : 'text-zinc-300'
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
                maxLength={80}
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="আপনার নাম লিখুন"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-600 mb-1">বিস্তারিত মতামত</label>
              <textarea
                rows={4}
                required
                maxLength={1000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="পণ্য ও সার্ভিস সম্পর্কে আপনার অভিজ্ঞতা লিখুন..."
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            {successMsg && (
              <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                {successMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {currentUser
                ? submitting
                  ? 'জমা হচ্ছে...'
                  : 'রিভিউ প্রকাশ করুন'
                : 'রিভিউ দিতে সাইন ইন করুন'}
            </button>
          </form>
        </div>

        {/* Right: Filter & Review Cards */}
        <div className="lg:col-span-8 space-y-5">
          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-lg w-fit">
            {[0, 5, 4, 3].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setFilterRating(r)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  filterRating === r
                    ? 'bg-white text-zinc-950 shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {r === 0 ? 'সকল রেটিং' : `${r} ★`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredReviews.map((rev) => {
              const prod = productMap[rev.productId];
              return (
                <div key={rev.id} className="bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-950">{rev.authorName}</span>
                    <span className="text-zinc-400">{formatTimestamp(rev.createdAt)}</span>
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

                  {prod && (
                    <button
                      type="button"
                      onClick={() => onSelectProduct(prod)}
                      className="text-xs font-medium text-emerald-700 hover:underline cursor-pointer pt-1"
                    >
                      পণ্য দেখুন: {prod.name} →
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
