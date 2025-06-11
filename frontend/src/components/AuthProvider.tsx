'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from 'sonner';

// 不需要身份驗證的路徑列表
const publicPaths = ['/auth/login', '/auth/register'];

// token 過期前多少毫秒開始刷新 (例如: 5分鐘)
const REFRESH_THRESHOLD = 5 * 60 * 1000;

// token 過期前多少毫秒顯示提醒 (例如: 10分鐘)
const WARNING_THRESHOLD = 10 * 60 * 1000;

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, fetchUser, refreshToken, getTokenExpiry } = useAuthStore();
  
  // 檢查當前路徑是否需要身份驗證
  const isPublicPath = publicPaths.includes(pathname);
  
  // 檢查是否為監控頁面
  const isMonitoringPage = pathname.includes('/dashboard') || 
                          pathname.includes('/pair-trades') || 
                          pathname.includes('/trade-history');
  
  useEffect(() => {
    // 在組件掛載時檢查身份驗證狀態
    const checkAuth = async () => {
      await fetchUser();
    };
    
    checkAuth();
    
    // 設置智能 token 刷新
    const tokenRefreshInterval = setInterval(async () => {
      const expiryTime = getTokenExpiry();
      
      if (expiryTime) {
        const currentTime = Date.now();
        const timeLeft = expiryTime - currentTime;
        
        // 如果 token 即將過期，則刷新
        if (timeLeft < REFRESH_THRESHOLD && timeLeft > 0) {

          await refreshToken();
        }
      }
    }, 60 * 1000); // 每分鐘檢查一次
    
    return () => clearInterval(tokenRefreshInterval);
  }, [fetchUser, refreshToken, getTokenExpiry]);
  
  // 顯示 token 過期提醒
  useEffect(() => {
    const tokenExpiryWarningInterval = setInterval(() => {
      const expiryTime = getTokenExpiry();
      
      if (expiryTime && isMonitoringPage) {
        const currentTime = Date.now();
        const timeLeft = expiryTime - currentTime;
        
        // 如果剩餘時間少於警告閾值且大於刷新閾值，顯示提醒
        if (timeLeft < WARNING_THRESHOLD && timeLeft > REFRESH_THRESHOLD) {
          toast.warning(`您的登錄將在 ${Math.floor(timeLeft / 60000)} 分鐘後過期，系統將自動刷新您的登錄狀態。`, {
            duration: 10000,
            action: {
              label: '立即刷新',
              onClick: () => refreshToken()
            }
          });
        }
      }
    }, 5 * 60 * 1000); // 每 5 分鐘檢查一次
    
    return () => clearInterval(tokenExpiryWarningInterval);
  }, [getTokenExpiry, isMonitoringPage, refreshToken]);
  
  // 路由保護邏輯
  useEffect(() => {
    // 如果不是公開路徑且用戶未登錄（且不在加載中），則重定向到登錄頁面
    if (!isPublicPath && !user && !isLoading) {
      router.push('/auth/login');
    }
    
    // 如果是公開路徑且用戶已登錄，則重定向到儀表板
    if (isPublicPath && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, isPublicPath, router]);
  
  // 在路徑變化時也檢查身份驗證狀態
  useEffect(() => {
    fetchUser();
  }, [pathname, fetchUser]);
  
  return <>{children}</>;
} 