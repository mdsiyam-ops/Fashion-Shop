import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let friendlyMsg = 'অ্যাপ্লিকেশন লোড করতে একটি অপ্রত্যাশিত সমস্যা হয়েছে।';
      if (this.state.errorMessage.includes('Missing or insufficient permissions')) {
        friendlyMsg = 'নিরাপত্তা নীতির কারণে এই তথ্য অ্যাক্সেস করার অনুমতি নেই। অনুগ্রহ করে সঠিক অ্যাকাউন্ট দিয়ে লগইন করুন।';
      } else if (
        this.state.errorMessage.toLowerCase().includes('quota') ||
        this.state.errorMessage.toLowerCase().includes('resource-exhausted')
      ) {
        friendlyMsg =
          'Firebase Firestore-এর আজকের ফ্রি রিড কোটা পূর্ণ হয়ে গেছে। আগামীকাল কোটা রিসেট হবে অথবা Firebase Console থেকে প্ল্যান আপগ্রেড করতে পারবেন।';
      }
      return (
        <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-zinc-200 rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-zinc-950 mb-3">সাময়িক ত্রুটি ঘটেছে</h2>
            <p className="text-sm text-zinc-600 mb-6 leading-relaxed">{friendlyMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-zinc-950 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              পুনরায় লোড করুন
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
