import axios from 'axios';
import { toast } from 'sonner';

// 創建axios實例
const apiClient = axios.create({
  baseURL: '/api',  // 使用相對路徑
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 增加到30秒超時
});

// 網絡錯誤計數器與時間戳
let networkErrorCount = 0;
let lastNetworkErrorTime = 0;
const NETWORK_ERROR_THRESHOLD = 3; // 3次以上才顯示錯誤
const NETWORK_ERROR_COOLDOWN = 10000; // 10秒內不重複顯示錯誤

// 請求攔截器
apiClient.interceptors.request.use(
  (config) => {
    // 從localStorage獲取token
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    
    // 如果有token，添加到請求頭
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    console.error('請求攔截器錯誤:', error);
    return Promise.reject(error);
  }
);

// 是否正在刷新 token
let isRefreshing = false;
// 等待 token 刷新的請求隊列
let refreshSubscribers: ((token: string) => void)[] = [];

// 添加訂閱者
const subscribeTokenRefresh = (cb: (token: string) => void) => {
  refreshSubscribers.push(cb);
};

// 執行訂閱者
const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
};

// 響應攔截器
apiClient.interceptors.response.use(
  (response) => {
    // 成功響應重置錯誤計數器
    networkErrorCount = 0;
    return response;
  },
  async (error) => {
    // 處理網絡錯誤
    if (!error.response) {
      // 增加錯誤計數
      networkErrorCount++;
      const currentTime = Date.now();
      
      // 只有當錯誤次數超過閾值且距離上次顯示錯誤已經過了冷卻時間，才顯示錯誤提示
      if (networkErrorCount >= NETWORK_ERROR_THRESHOLD && 
          (currentTime - lastNetworkErrorTime > NETWORK_ERROR_COOLDOWN)) {
        console.error('網絡錯誤，無法連接到服務器:', error.message);
        toast.error('網絡錯誤，無法連接到服務器。請檢查您的網絡連接。');
        lastNetworkErrorTime = currentTime;
      }
      
      return Promise.reject(error);
    }
    
    // 處理401錯誤（未授權）
    if (error.response.status === 401) {
      const originalRequest = error.config;
      
      // 如果是登入相關的請求，直接返回錯誤，不嘗試刷新 token
      if (originalRequest.url.includes('/auth/token') || 
          originalRequest.url.includes('/auth/login') ||
          originalRequest.url.includes('/auth/register')) {
        return Promise.reject(error);
      }
      
      // 避免無限循環
      if (!originalRequest._retry) {
        originalRequest._retry = true;
        
        // 如果不是刷新 token 的請求
        if (!originalRequest.url.includes('/auth/refresh-token')) {
          // 如果當前沒有正在刷新 token
          if (!isRefreshing) {
            isRefreshing = true;
            
            try {

              // 嘗試刷新 token
              const refreshToken = localStorage.getItem('refreshToken');
              if (!refreshToken) {

                // 直接執行登出邏輯，而不是拋出錯誤
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('token');
                  localStorage.removeItem('refreshToken');
                  toast.error('您的連線已逾時，請重新登入', {
                    action: {
                      label: '去登入',
                      onClick: () => {
                        sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
                        window.location.href = '/auth/login';
                      }
                    }
                  });
                }
                isRefreshing = false;
                // 終止後續的請求
                return Promise.reject(new Error('登入已過期'));
              }
              
              const response = await axios.post('/api/auth/refresh-token', {
                refresh_token: refreshToken
              });
              
              const newToken = response.data.access_token;
              const newRefreshToken = response.data.refresh_token;
              
              localStorage.setItem('token', newToken);
              if (newRefreshToken) {
                localStorage.setItem('refreshToken', newRefreshToken);
              }
              

              
              // 更新原始請求的 Authorization 頭
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              
              // 通知所有等待的請求
              onRefreshed(newToken);
              
              isRefreshing = false;
              
              // 重試原始請求
              return axios(originalRequest);
            } catch (refreshError) {
              console.error('刷新 token 失敗:', refreshError);
              isRefreshing = false;
              
              // 清除本地存儲的token
              if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                
                // 檢查是否在監控頁面
                const isMonitoringPage = window.location.pathname.includes('/dashboard') || 
                                        window.location.pathname.includes('/pair-trades') ||
                                        window.location.pathname.includes('/trade-history');
                
                if (isMonitoringPage) {
                  // 在監控頁面上顯示一個通知，而不是直接重定向
                  toast.error('登入已過期，請重新登入', {
                    action: {
                      label: '去登入',
                      onClick: () => {
                        // 將當前頁面存入 sessionStorage，以便登錄後返回
                        sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
                        window.location.href = '/auth/login';
                      }
                    }
                  });
                } else {
                  // 非監控頁面直接重定向
                  window.location.href = '/auth/login';
                }
              }
              
              return Promise.reject(refreshError);
            }
          } else {
            // 如果已經有一個刷新請求在進行中，將當前請求添加到隊列
            return new Promise(resolve => {
              subscribeTokenRefresh(token => {
                originalRequest.headers.Authorization = `Bearer ${token}`;
                resolve(axios(originalRequest));
              });
            });
          }
        }
      }
    } else if (error.response.status === 403) {
      // 處理權限問題
      toast.error('您沒有權限執行此操作');
    } else if (error.response.status === 404) {
      // 資源不存在
      console.error('資源未找到:', error.response.data);
    } else if (error.response.status >= 500) {
      // 服務器錯誤
      toast.error('服務器錯誤，請稍後再試');
      console.error('服務器錯誤:', error.response.data);
    }
    
    return Promise.reject(error);
  }
);

export default apiClient; 