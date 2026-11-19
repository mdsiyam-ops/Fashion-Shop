import React, { useState } from 'react';
import { Menu, ShoppingBag, X } from 'lucide-react';

export type ActiveTab = 'store' | 'tracking' | 'reviews' | 'profile' | 'admin';

interface NavbarProps {
  storeName: string;
  activeTab: ActiveTab;
  isAdmin: boolean;
  onSelectTab: (tab: ActiveTab) => void;
  cartCount: number;
  unreadNotifications: number;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  storeName,
  activeTab,
  isAdmin,
  onSelectTab,
  cartCount,
  unreadNotifications,
  onOpenCart,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'store', label: 'ক্যাটালগ' },
    { id: 'tracking', label: 'অর্ডার ট্র্যাকিং' },
    { id: 'reviews', label: 'রিভিউ' },
    {
      id: 'profile',
      label: unreadNotifications > 0 ? `প্রোফাইল (${unreadNotifications})` : 'প্রোফাইল',
    },
    ...(isAdmin ? [{ id: 'admin' as ActiveTab, label: 'অ্যাডমিন' }] : []),
  ];

  const handleNavClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-zinc-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNavClick('store')}
          className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 rounded-md px-1"
        >
          {storeName}
        </button>

        {/* Zone 2: Clean Single-Line Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-7" aria-label="মূল নেভিগেশন">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`text-sm font-medium whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                  isActive
                    ? 'text-zinc-950 border-zinc-950'
                    : 'text-zinc-600 border-transparent hover:text-zinc-950 hover:border-zinc-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-950 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
          >
            <ShoppingBag className="w-4 h-4" strokeWidth={1.75} />
            <span className="tabular-nums">ব্যাগ ({cartCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label={mobileMenuOpen ? 'মেনু বন্ধ করুন' : 'মেনু খুলুন'}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white px-4 py-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-zinc-950 text-white'
                    : 'text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
