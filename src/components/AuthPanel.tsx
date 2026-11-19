import React, { useEffect, useId, useRef, useState } from 'react';
import {
  ConfirmationResult,
  createUserWithEmailAndPassword,
  RecaptchaVerifier,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, formatBangladeshPhone, googleProvider } from '../firebase';

type AuthMode = 'login' | 'signup' | 'phone' | 'forgot';

interface AuthPanelProps {
  isModal?: boolean;
  onSuccess?: () => void;
  onClose?: () => void;
}

function getFriendlyAuthError(error: unknown): string {
  const code = (error as { code?: string })?.code || '';
  const message = error instanceof Error ? error.message : '';

  if (code === 'auth/email-already-in-use' || message.includes('email-already-in-use')) {
    return 'এই জিমেইল দিয়ে ইতিমধ্যেই একটি অ্যাকাউন্ট খোলা আছে। একটি জিমেইল দিয়ে একটি অ্যাকাউন্টই খোলা যায় — অনুগ্রহ করে লগইন করুন অথবা "পাসওয়ার্ড ভুলে গেছেন?" ব্যবহার করুন।';
  }
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return 'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। পাসওয়ার্ড ভুলে গেলে নিচের "পাসওয়ার্ড ভুলে গেছেন?" বাটনে ক্লিক করুন।';
  }
  if (code === 'auth/weak-password') {
    return 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।';
  }
  if (code === 'auth/invalid-email') {
    return 'অনুগ্রহ করে একটি সঠিক জিমেইল/ইমেইল ঠিকানা লিখুন।';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'সঠিক মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX অথবা +88017XXXXXXXX)।';
  }
  if (code === 'auth/missing-phone-number') {
    return 'অনুগ্রহ করে আপনার মোবাইল নম্বর লিখুন।';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'OTP কোডটি সঠিক নয়। এসএমএস থেকে পাওয়া ৬ ডিজিটের কোডটি যাচাই করে আবার দিন।';
  }
  if (code === 'auth/code-expired') {
    return 'OTP কোডের মেয়াদ শেষ হয়ে গেছে। অনুগ্রহ করে আবার কোড পাঠান।';
  }
  if (code === 'auth/captcha-check-failed') {
    return 'নিরাপত্তা যাচাই (reCAPTCHA) সম্পন্ন হয়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';
  }
  if (code === 'auth/quota-exceeded' || code === 'auth/billing-not-enabled') {
    return 'Firebase প্রজেক্টে SMS OTP কোটা সীমা অতিক্রম হয়েছে বা Phone Auth বিলিং/কোটা কনফিগার প্রয়োজন।';
  }
  if (code === 'auth/too-many-requests') {
    return 'অতিরিক্ত চেষ্টার কারণে সাময়িকভাবে ব্লক করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Firebase Console → Authentication → Sign-in method থেকে সংশ্লিষ্ট সাইন-ইন মাধ্যমটি (Email/Password বা Phone) এখনো Enable করা হয়নি।';
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'এই জিমেইল দিয়ে আগেই অন্য মাধ্যমে অ্যাকাউন্ট খোলা হয়েছে। একটি জিমেইল দিয়ে একটি অ্যাকাউন্টই অনুমোদিত।';
  }
  if (code === 'auth/unauthorized-domain' || message.includes('unauthorized-domain')) {
    return `এই ডোমেইনটি (${window.location.hostname}) Firebase Authentication-এ অনুমোদিত নয়। Firebase Console → Authentication → Settings → Authorized domains-এ "${window.location.hostname}" যোগ করুন।`;
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'গুগল লগইন উইন্ডোটি বন্ধ করা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';
  }
  return 'প্রমাণীকরণ সম্পন্ন করা যায়নি। অনুগ্রহ করে তথ্য যাচাই করে আবার চেষ্টা করুন।';
}

export const AuthPanel: React.FC<AuthPanelProps> = ({
  isModal = false,
  onSuccess,
  onClose,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Phone OTP Auth state
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneName, setPhoneName] = useState('');
  const [formattedPhone, setFormattedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaId = useId().replace(/:/g, '_');
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const clearRecaptcha = () => {
    if (recaptchaVerifierRef.current) {
      try {
        recaptchaVerifierRef.current.clear();
      } catch {
        // ignore cleanup error
      }
      recaptchaVerifierRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearRecaptcha();
    };
  }, []);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setErrorMsg('');
    setSuccessMsg('');
    if (next !== 'phone') {
      setConfirmationResult(null);
      setOtpCode('');
      clearRecaptcha();
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onSuccess?.();
    } catch (error) {
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMsg('অনুগ্রহ করে আপনার জিমেইল এবং পাসওয়ার্ড দিন।');
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      onSuccess?.();
    } catch (error) {
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setErrorMsg('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('অনুগ্রহ করে একটি সঠিক জিমেইল ঠিকানা দিন।');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('দুটি পাসওয়ার্ড মিলছে না। অনুগ্রহ করে পুনরায় যাচাই করুন।');
      return;
    }

    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName });
      try {
        await sendEmailVerification(cred.user);
        setSuccessMsg(
          'অ্যাকাউন্ট তৈরি হয়েছে! আপনার জিমেইল ইনবক্সে একটি ভেরিফিকেশন লিংক পাঠানো হয়েছে — অনুগ্রহ করে সেটি কনফার্ম করুন।'
        );
      } catch {
        // Non-fatal if verification email rate-limited
      }
      onSuccess?.();
    } catch (error) {
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('পাসওয়ার্ড রিসেট করতে আপনার নিবন্ধিত জিমেইল ঠিকানা লিখুন।');
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setSuccessMsg(
        `আপনার "${cleanEmail}" ঠিকানায় পাসওয়ার্ড রিসেট করার লিংক পাঠানো হয়েছে। ইনবক্স বা Spam ফোল্ডার চেক করে নতুন পাসওয়ার্ড সেট করুন।`
      );
    } catch (error) {
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const e164Phone = formatBangladeshPhone(phoneInput);
    if (!e164Phone || e164Phone.length < 10) {
      setErrorMsg('সঠিক মোবাইল নম্বর লিখুন (যেমন: 01712345678 অথবা +8801712345678)।');
      return;
    }

    setLoading(true);
    try {
      clearRecaptcha();
      const verifier = new RecaptchaVerifier(auth, `recaptcha-${recaptchaId}`, {
        size: 'invisible',
      });
      recaptchaVerifierRef.current = verifier;
      const result = await signInWithPhoneNumber(auth, e164Phone, verifier);
      setConfirmationResult(result);
      setFormattedPhone(e164Phone);
      setSuccessMsg(`${e164Phone} নম্বরে ৬ ডিজিটের ভেরিফিকেশন কোড (OTP) পাঠানো হয়েছে।`);
    } catch (error) {
      clearRecaptcha();
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setErrorMsg('');
    setSuccessMsg('');

    const cleanOtp = otpCode.trim();
    if (cleanOtp.length < 4) {
      setErrorMsg('এসএমএস থেকে পাওয়া ৬ ডিজিটের OTP কোডটি লিখুন।');
      return;
    }

    setLoading(true);
    try {
      const cred = await confirmationResult.confirm(cleanOtp);
      const cleanName = phoneName.trim();
      if (cleanName && !cred.user.displayName) {
        try {
          await updateProfile(cred.user, { displayName: cleanName });
        } catch {
          // Non-fatal profile name update
        }
      }
      onSuccess?.();
    } catch (error) {
      setErrorMsg(getFriendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`bg-white border border-zinc-200 rounded-xl p-6 sm:p-8 space-y-5 relative ${
        isModal ? 'w-full max-w-md shadow-xl' : 'w-full'
      }`}
    >
      {isModal && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-100 cursor-pointer"
          aria-label="বন্ধ করুন"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <div className="space-y-1.5 pr-6">
        <h2 className="text-xl font-bold text-zinc-950">
          {mode === 'login' && 'অ্যাকাউন্টে লগইন করুন'}
          {mode === 'signup' && 'নতুন অ্যাকাউন্ট তৈরি করুন'}
          {mode === 'phone' && 'ফোন নম্বর দিয়ে সাইন ইন'}
          {mode === 'forgot' && 'পাসওয়ার্ড রিসেট করুন'}
        </h2>
        <p className="text-xs text-zinc-500 leading-relaxed">
          {mode === 'login' &&
            'ক্যাটালগ অর্ডার, লাইভ ট্র্যাকিং, রিভিউ ও প্রোফাইল ম্যানেজমেন্টের জন্য সাইন ইন করুন।'}
          {mode === 'signup' &&
            'একটি জিমেইল দিয়ে একটি অ্যাকাউন্টই খোলা যাবে। আপনার সকল ব্যক্তিগত তথ্য সম্পূর্ণ সুরক্ষিত।'}
          {mode === 'phone' &&
            'আপনার মোবাইল নম্বরে ৬ ডিজিটের ভেরিফিকেশন কোড (OTP) পাঠিয়ে দ্রুত সাইন ইন করুন।'}
          {mode === 'forgot' &&
            'আপনার অ্যাকাউন্টের জিমেইল ঠিকানা দিলে পাসওয়ার্ড রিসেট করার লিংক পাঠানো হবে।'}
        </p>
      </div>

      {/* Mode Switch Tabs */}
      {mode !== 'forgot' && (
        <div className="grid grid-cols-3 gap-1 p-1 bg-zinc-100 rounded-lg">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            জিমেইল লগইন
          </button>
          <button
            type="button"
            onClick={() => switchMode('signup')}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            নতুন অ্যাকাউন্ট
          </button>
          <button
            type="button"
            onClick={() => switchMode('phone')}
            className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'phone'
                ? 'bg-white text-zinc-950 shadow-xs'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            ফোন নম্বর
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 leading-relaxed flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Login Form */}
      {mode === 'login' && (
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-600 mb-1">জিমেইল / ইমেইল *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs text-zinc-600">পাসওয়ার্ড *</label>
              <button
                type="button"
                onClick={() => switchMode('forgot')}
                className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer"
              >
                পাসওয়ার্ড ভুলে গেছেন?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 p-1 cursor-pointer"
                aria-label={showPassword ? 'পাসওয়ার্ড লুকান' : 'পাসওয়ার্ড দেখুন'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'লগইন হচ্ছে...' : 'লগইন করুন'}
          </button>
        </form>
      )}

      {/* Signup Form */}
      {mode === 'signup' && (
        <form onSubmit={handleSignupSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs text-zinc-600 mb-1">আপনার পূর্ণ নাম *</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="যেমন: তানভীর আহমেদ"
                className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-zinc-600 mb-1">জিমেইল ঠিকানা * (১টি জিমেইলে ১টি অ্যাকাউন্ট)</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-600 mb-1">পাসওয়ার্ড * (কমপক্ষে ৬ অক্ষর)</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-600 mb-1">পাসওয়ার্ড নিশ্চিত করুন *</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
              className="accent-zinc-950"
            />
            পাসওয়ার্ড দেখান
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'অ্যাকাউন্ট তৈরি হচ্ছে...' : 'নতুন অ্যাকাউন্ট খুলুন'}
          </button>
        </form>
      )}

      {/* Phone Number (OTP) Form */}
      {mode === 'phone' && (
        <div className="space-y-4">
          {!confirmationResult ? (
            <form onSubmit={handleSendPhoneOtp} className="space-y-3.5">
              <div>
                <label className="block text-xs text-zinc-600 mb-1">আপনার নাম (ঐচ্ছিক)</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={100}
                    value={phoneName}
                    onChange={(e) => setPhoneName(e.target.value)}
                    placeholder="যেমন: সাদমান সাকিব"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-600 mb-1">মোবাইল নম্বর *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="01712345678 বা +8801712345678"
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono-tabular border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">
                  বাংলাদেশি ১১ ডিজিটের নম্বর দিলে স্বয়ংক্রিয়ভাবে +880 যুক্ত হবে
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'OTP কোড পাঠানো হচ্ছে...' : 'ভেরিফিকেশন কোড (OTP) পাঠান'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-700">
                  নম্বর: <strong className="font-mono-tabular text-zinc-950">{formattedPhone}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmationResult(null);
                    setOtpCode('');
                    setErrorMsg('');
                    setSuccessMsg('');
                    clearRecaptcha();
                  }}
                  className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  নম্বর পরিবর্তন
                </button>
              </div>

              <div>
                <label className="block text-xs text-zinc-600 mb-1">৬ ডিজিটের OTP কোড *</label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="১২৩৪৫৬"
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono-tabular tracking-widest border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'যাচাই হচ্ছে...' : 'OTP যাচাই করে সাইন ইন করুন'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Forgot Password Form */}
      {mode === 'forgot' && (
        <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-600 mb-1">নিবন্ধিত জিমেইল ঠিকানা *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-zinc-950 text-white text-sm font-semibold rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'রিসেট লিংক পাঠানো হচ্ছে...' : 'পাসওয়ার্ড রিসেট লিংক পাঠান'}
          </button>

          <button
            type="button"
            onClick={() => switchMode('login')}
            className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 cursor-pointer"
          >
            ← লগইন পেজে ফিরে যান
          </button>
        </form>
      )}

      {/* Alternative Sign-in Buttons */}
      {mode !== 'forgot' && (
        <>
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-[11px]">
              <span className="bg-white px-3 text-zinc-400">অথবা</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleGoogleLogin()}
              className="w-full py-2.5 px-4 border border-zinc-300 bg-white text-zinc-950 text-sm font-semibold rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Google (জিমেইল) দিয়ে সরাসরি সাইন ইন করুন
            </button>

            {mode !== 'phone' && (
              <button
                type="button"
                disabled={loading}
                onClick={() => switchMode('phone')}
                className="w-full py-2.5 px-4 border border-zinc-200 bg-zinc-50 text-zinc-900 text-sm font-semibold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <Phone className="w-4 h-4 text-emerald-700" />
                <span>ফোন নম্বর (OTP) দিয়ে সাইন ইন করুন</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Invisible reCAPTCHA anchor for Phone Auth */}
      <div id={`recaptcha-${recaptchaId}`} />

      <div className="pt-3 border-t border-zinc-200 flex items-center justify-center gap-2 text-[11px] text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span>জিমেইল ও ফোন নম্বর সাইন ইন সম্পূর্ণ নিরাপদ ও এনক্রিপ্টেড</span>
      </div>
    </div>
  );
};
