import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, login as apiLogin, register as apiRegister, getCurrentUser, refreshToken as apiRefreshToken } from '../api/auth';
import { jwtDecode } from 'jwt-decode';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  
  // 操作
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  getTokenExpiry: () => number | null;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      
      login: async (username: string, password: string) => {
        try {
          set({ isLoading: true, error: null });
          
          const response = await apiLogin({ username, password });
          
          // 保存token
          localStorage.setItem('token', response.access_token);
          
          // 獲取用戶信息
          const user = await getCurrentUser();
          
          set({ 
            user, 
            token: response.access_token, 
            isLoading: false 
          });
        } catch (error) {
          console.error('Login error:', error);
          set({ 
            error: '用戶名或密碼錯誤', 
            isLoading: false 
          });
        }
      },
      
      register: async (username: string, email: string, password: string, fullName?: string) => {
        try {
          set({ isLoading: true, error: null });
          
          await apiRegister({ 
            username, 
            email, 
            password, 
            full_name: fullName 
          });
          
          // 註冊成功後自動登錄
          await get().login(username, password);
        } catch (error) {
          console.error('Register error:', error);
          set({ 
            error: error instanceof Error ? error.message : '註冊失敗，請稍後再試', 
            isLoading: false 
          });
        }
      },
      
      logout: () => {
        // 清除token
        localStorage.removeItem('token');
        
        set({ user: null, token: null });
      },
      
      fetchUser: async () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
          return;
        }
        
        try {
          set({ isLoading: true, error: null });
          
          const user = await getCurrentUser();
          
          set({ user, token, isLoading: false });
        } catch (error) {
          console.error('Fetch user error:', error);
          
          // 如果獲取用戶信息失敗，可能是token過期，清除token
          localStorage.removeItem('token');
          
          set({ 
            user: null, 
            token: null, 
            error: error instanceof Error ? error.message : '獲取用戶信息失敗', 
            isLoading: false 
          });
        }
      },
      
      refreshToken: async () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
          return false;
        }
        
        try {
          set({ isLoading: true, error: null });
          
          // 調用後端的 token 刷新 API
          const response = await apiRefreshToken(token);
          
          // 保存新的 token
          const newToken = response.access_token;
          localStorage.setItem('token', newToken);
          
          // 獲取用戶信息
          const user = await getCurrentUser();
          
          set({ 
            user, 
            token: newToken, 
            isLoading: false 
          });
          
          return true;
        } catch (error) {
          console.error('Token refresh error:', error);
          
          // 如果刷新失敗，可能是 token 已經完全失效，清除 token
          localStorage.removeItem('token');
          
          set({ 
            user: null, 
            token: null, 
            error: error instanceof Error ? error.message : 'Token 刷新失敗', 
            isLoading: false 
          });
          
          return false;
        }
      },
      
      getTokenExpiry: () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
          return null;
        }
        
        try {
          const decoded = jwtDecode<{ exp: number }>(token);
          return decoded.exp * 1000; // 轉換為毫秒
        } catch (error) {
          console.error('Token decode error:', error);
          return null;
        }
      },
      
      clearError: () => {
        set({ error: null });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ token: state.token }),
    }
  )
); 