import { create } from 'zustand';

interface UserSettings {
  binance_api_key: boolean;
  binance_api_secret: boolean;
  notification_settings: Record<string, boolean>;
  timezone: string;
}

interface UserSettingsUpdate {
  binance_api_key?: string;
  binance_api_secret?: string;
  notification_settings?: Record<string, string>;
  timezone?: string;
}

interface UserSettingsState {
  settings: UserSettings | null;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<void>;
  updateSettings: (settings: UserSettingsUpdate) => Promise<void>;
}

export const useUserSettingsStore = create<UserSettingsState>((set) => ({
  settings: null,
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    set({ isLoading: true, error: null });
    try {
      // 獲取 token
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/user/settings/status', {
        headers: {
          'Authorization': `Bearer ${token}` // 添加 Authorization 頭部
        }
      });
      if (!response.ok) {
        throw new Error('獲取用戶設置失敗');
      }
      const data = await response.json();
      set({ settings: data, isLoading: false });
    } catch (error) {
      console.error('獲取用戶設置錯誤:', error);
      set({ 
        error: error instanceof Error ? error.message : '獲取用戶設置失敗', 
        isLoading: false 
      });
    }
  },

  updateSettings: async (settingsUpdate: UserSettingsUpdate) => {
    set({ isLoading: true, error: null });
    try {
      // 獲取 token
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` // 添加 Authorization 頭部
        },
        body: JSON.stringify(settingsUpdate),
      });

      if (!response.ok) {
        throw new Error('更新用戶設置失敗');
      }

      const data = await response.json();
      set({ settings: data, isLoading: false });
    } catch (error) {
      console.error('更新用戶設置錯誤:', error);
      set({ 
        error: error instanceof Error ? error.message : '更新用戶設置失敗', 
        isLoading: false 
      });
    }
  },
})); 