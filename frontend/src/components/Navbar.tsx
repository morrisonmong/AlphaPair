'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { useState, useEffect, useRef } from 'react';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 處理點擊外部區域關閉下拉選單
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  const toggleDropdown = () => {
    setShowDropdown(!showDropdown);
  };

  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  // 關閉手機選單的函數
  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  // 檢查是否為活動路徑的函數
  const isActivePath = (path: string): boolean => {
    return pathname === path || pathname.startsWith(path + '/');
  };

  // 獲取導航項目的樣式類名
  const getNavLinkClass = (path: string, isMobile: boolean = false): string => {
    const baseClass = isMobile 
      ? "block px-3 py-2 rounded-md text-base font-medium transition-colors"
      : "px-3 py-2 rounded-md text-sm font-medium transition-colors";
    
    if (isActivePath(path)) {
      return `${baseClass} bg-primary text-primary-foreground`;
    }
    
    return `${baseClass} text-muted-foreground hover:text-foreground hover:bg-secondary`;
  };

  // 未登入狀態的桌面版導覽
  const renderUnauthenticatedDesktopNav = () => (
    <div className="hidden md:flex items-center space-x-4">
      <Link 
        href="/auth/login" 
        className="px-4 py-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        登入
      </Link>
      <Link 
        href="/auth/register" 
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        註冊
      </Link>
    </div>
  );

  // 已登入狀態的桌面版導覽
  const renderAuthenticatedDesktopNav = () => (
    <div className="hidden md:flex items-center space-x-4">
      <Link 
        href="/dashboard" 
        className={getNavLinkClass('/dashboard')}
        prefetch={true}
      >
        儀表板
      </Link>
      <Link 
        href="/pair-trades" 
        className={getNavLinkClass('/pair-trades')}
        prefetch={true}
      >
        配對交易
      </Link>
      <Link 
        href="/trade-history" 
        className={getNavLinkClass('/trade-history')}
        prefetch={true}
      >
        交易紀錄
      </Link>
      
      {/* 用戶資訊和下拉選單 */}
      <div className="relative ml-3" ref={dropdownRef}>
        <button 
          className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-accent hover:text-accent/80 hover:bg-secondary transition-colors"
          onClick={toggleDropdown}
          aria-expanded={showDropdown}
          aria-haspopup="true"
        >
          {user?.username}
          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showDropdown && (
          <div 
            className="absolute right-0 w-48 mt-2 py-2 bg-card rounded-md shadow-lg z-10 border border-border"
            role="menu"
            aria-orientation="vertical"
            aria-labelledby="user-menu"
          >
            <Link 
              href="/settings" 
              className="block px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              role="menuitem"
              onClick={() => setShowDropdown(false)}
            >
              設定
            </Link>
            <button
              onClick={() => {
                handleLogout();
                setShowDropdown(false);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
              role="menuitem"
            >
              登出
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // 未登入狀態的手機版導覽
  const renderUnauthenticatedMobileNav = () => (
    <div className="px-2 pt-2 pb-3 space-y-1">
      <Link 
        href="/auth/login" 
        className="block px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        onClick={closeMobileMenu}
      >
        登入
      </Link>
      <Link 
        href="/auth/register" 
        className="block px-3 py-2 rounded-md text-base font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        onClick={closeMobileMenu}
      >
        註冊
      </Link>
    </div>
  );

  // 已登入狀態的手機版導覽
  const renderAuthenticatedMobileNav = () => (
    <div className="px-2 pt-2 pb-3 space-y-1">
      <Link 
        href="/dashboard" 
        className={getNavLinkClass('/dashboard', true)}
        onClick={closeMobileMenu}
      >
        儀表板
      </Link>
      <Link 
        href="/pair-trades" 
        className={getNavLinkClass('/pair-trades', true)}
        onClick={closeMobileMenu}
      >
        配對交易
      </Link>
      <Link 
        href="/trade-history" 
        className={getNavLinkClass('/trade-history', true)}
        onClick={closeMobileMenu}
      >
        交易紀錄
      </Link>
      
      {/* 手機版用戶選項 */}
      <div className="border-t border-border pt-4 pb-3">
        <div className="flex items-center px-3">
          <div className="flex-shrink-0">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-sm font-medium text-primary-foreground">
                {user?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div className="ml-3">
            <div className="text-base font-medium text-accent">{user?.username}</div>
            <div className="text-sm font-medium text-muted-foreground">{user?.email}</div>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Link 
            href="/settings" 
            className={getNavLinkClass('/settings', true)}
            onClick={closeMobileMenu}
          >
            設定
          </Link>
          <button
            onClick={() => {
              handleLogout();
              closeMobileMenu();
            }}
            className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            登出
          </button>
        </div>
      </div>
    </div>
  );

  // 如果還沒有掛載，返回空白導覽列以避免水合不匹配
  if (!isMounted) {
    return (
      <nav className="bg-background text-foreground shadow-md fixed top-0 left-0 right-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-primary">AlphaPair</span>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <header>
      <nav className="bg-background text-foreground shadow-md fixed top-0 left-0 right-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link 
                href={user ? "/dashboard" : "/"} 
                className="text-xl font-bold text-primary hover:text-accent transition-colors"
              >
                AlphaPair
              </Link>
            </div>

            {/* 桌面版導覽選項 */}
            {user ? renderAuthenticatedDesktopNav() : renderUnauthenticatedDesktopNav()}

            {/* 手機版選單按鈕 */}
            <div className="md:hidden flex items-center">
              <button
                onClick={toggleMobileMenu}
                className="inline-flex items-center justify-center p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary transition-colors"
                aria-expanded={showMobileMenu}
                aria-label="開啟主選單"
              >
                <svg 
                  className="h-6 w-6" 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  {showMobileMenu ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 手機版選單 */}
        {showMobileMenu && (
          <div className="md:hidden bg-card border-t border-border">
            {user ? renderAuthenticatedMobileNav() : renderUnauthenticatedMobileNav()}
          </div>
        )}
      </nav>
      {/* 添加一個空白元素，確保導覽列下方的內容不被覆蓋 */}
      <div className="h-16"></div>
    </header>
  );
} 