'use client';

/**
 * 身份驗證工具函數
 */

// 從本地存儲獲取 token
export const getToken = (): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// 設置 token 到本地存儲
export const setToken = (token: string): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
  }
};

// 清除 token
export const clearToken = (): void => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
  }
};

// 檢查用戶是否已登錄
export const isAuthenticated = (): boolean => {
  return !!getToken();
}; 