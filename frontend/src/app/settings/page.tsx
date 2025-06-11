'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/store/auth-store';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { updatePassword, PasswordUpdatePayload } from '@/lib/api/user';
import { AxiosError } from 'axios';

interface ApiSettings {
  binance_api_key: string;
  binance_api_secret: string;
  line_token: string;
  discord_webhook: string;
  telegram_token: string;
  telegram_chat_id: string;
}

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [passwordData, setPasswordData] = useState<PasswordUpdatePayload>({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  
  // 追蹤每個欄位是否已設定
  const [isConfigured, setIsConfigured] = useState({
    binance_api_key: false,
    binance_api_secret: false,
    line_token: false,
    discord_webhook: false,
    telegram_token: false,
    telegram_chat_id: false
  });
  
  const [settings, setSettings] = useState<ApiSettings>({
    binance_api_key: '',
    binance_api_secret: '',
    line_token: '',
    discord_webhook: '',
    telegram_token: '',
    telegram_chat_id: ''
  });

  // 當頁面載入時獲取用戶設定
  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        // 獲取設定狀態（不包含敏感資訊）
        const statusResponse = await fetch(`/api/user/settings/status`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();

          
          // 獲取通知設定狀態
          const notificationSettings = statusData.notification_settings || {};

          
          // 更新已配置狀態
          const newConfigStatus = {
            binance_api_key: statusData.binance_api_key || false,
            binance_api_secret: statusData.binance_api_secret || false,
            line_token: notificationSettings.line_token || false,
            discord_webhook: notificationSettings.discord_webhook || false,
            telegram_token: notificationSettings.telegram_token || false,
            telegram_chat_id: notificationSettings.telegram_chat_id || false
          };
          

          setIsConfigured(newConfigStatus);
          
          // 設置空值或遮罩值
          setSettings({
            binance_api_key: statusData.binance_api_key ? '••••••••••••••••' : '',
            binance_api_secret: statusData.binance_api_secret ? '••••••••••••••••' : '',
            line_token: notificationSettings.line_token ? '••••••••••••••••' : '',
            discord_webhook: notificationSettings.discord_webhook ? '••••••••••••••••' : '',
            telegram_token: notificationSettings.telegram_token ? '••••••••••••••••' : '',
            telegram_chat_id: notificationSettings.telegram_chat_id ? '••••••••••••••••' : ''
          });
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        toast.error('無法獲取設定資料');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchSettings();
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPasswordData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      // 準備請求數據，將通知設定放在notification_settings物件中
      interface SettingsPayload {
        binance_api_key?: string;
        binance_api_secret?: string;
        notification_settings?: {
          line_token?: string;
          discord_webhook?: string;
          telegram_token?: string;
          telegram_chat_id?: string;
        }
      }
      
      const settingsToSend: SettingsPayload = {};
      
      // 幣安API設定直接放在根層級（只有當用戶輸入新值時才發送）
      if (settings.binance_api_key && !settings.binance_api_key.includes('•')) {
        settingsToSend.binance_api_key = settings.binance_api_key;
      }
      
      if (settings.binance_api_secret && !settings.binance_api_secret.includes('•')) {
        settingsToSend.binance_api_secret = settings.binance_api_secret;
      }
      
      // 通知設定：只有當用戶輸入新值時才加入到 notification_settings
      const notificationUpdates: Record<string, string> = {};
      
      if (settings.line_token && !settings.line_token.includes('•')) {
        notificationUpdates.line_token = settings.line_token;
      }
      
      if (settings.discord_webhook && !settings.discord_webhook.includes('•')) {
        notificationUpdates.discord_webhook = settings.discord_webhook;
      }
      
      if (settings.telegram_token && !settings.telegram_token.includes('•')) {
        notificationUpdates.telegram_token = settings.telegram_token;
      }
      
      if (settings.telegram_chat_id && !settings.telegram_chat_id.includes('•')) {
        notificationUpdates.telegram_chat_id = settings.telegram_chat_id;
      }
      
      // 只有當有通知設定更新時才加入 notification_settings
      if (Object.keys(notificationUpdates).length > 0) {
        settingsToSend.notification_settings = notificationUpdates;
      }
      

      
      const response = await fetch(`/api/user/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settingsToSend)
      });
      
      if (response.ok) {
        const statusData = await response.json();

        
        // 更新已配置狀態
        const notificationSettings = statusData.notification_settings || {};
        setIsConfigured({
          binance_api_key: statusData.binance_api_key || false,
          binance_api_secret: statusData.binance_api_secret || false,
          line_token: notificationSettings.line_token || false,
          discord_webhook: notificationSettings.discord_webhook || false,
          telegram_token: notificationSettings.telegram_token || false,
          telegram_chat_id: notificationSettings.telegram_chat_id || false
        });
        
        // 設置遮罩值
        setSettings({
          binance_api_key: statusData.binance_api_key ? '••••••••••••••••' : '',
          binance_api_secret: statusData.binance_api_secret ? '••••••••••••••••' : '',
          line_token: notificationSettings.line_token ? '••••••••••••••••' : '',
          discord_webhook: notificationSettings.discord_webhook ? '••••••••••••••••' : '',
          telegram_token: notificationSettings.telegram_token ? '••••••••••••••••' : '',
          telegram_chat_id: notificationSettings.telegram_chat_id ? '••••••••••••••••' : ''
        });
        
        toast.success('設定已保存');
      } else {
        const error = await response.json();
        throw new Error(error.message || '保存設定失敗');
      }
    } catch (error) {
      console.error('Save settings error:', error);
      toast.error(error instanceof Error ? error.message : '保存設定失敗');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      toast.error('新密碼與確認密碼不符');
      return;
    }
    setIsSaving(true);
    try {
      await updatePassword(passwordData);
      toast.success('密碼更新成功');
      setPasswordData({
        current_password: '',
        new_password: '',
        confirm_password: '',
      });
    } catch (error) {
      console.error('Update password error:', error);
      if (error instanceof AxiosError && error.response) {
        toast.error(error.response.data.detail || '密碼更新失敗');
      } else {
        toast.error('發生未知錯誤，密碼更新失敗');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (type: 'binance' | 'discord' | 'telegram') => {
    try {
      // 根據不同服務準備不同的請求數據
      let requestBody = {};
      
      switch (type) {
        case 'binance':
          // 判斷是否為遮罩值
          const isBinanceApiKeyMasked = settings.binance_api_key.includes('•');
          const isBinanceApiSecretMasked = settings.binance_api_secret.includes('•');
          
          if (isBinanceApiKeyMasked || isBinanceApiSecretMasked) {
            // 使用已保存的設定
            requestBody = { use_saved: true };
          } else {
            // 使用前端輸入的新值
            requestBody = {
              api_key: settings.binance_api_key,
              api_secret: settings.binance_api_secret
            };
          }
          break;
        case 'discord':
          // 判斷是否為遮罩值
          const isDiscordWebhookMasked = settings.discord_webhook.includes('•');
          
          if (isDiscordWebhookMasked) {
            // 使用已保存的設定
            requestBody = { use_saved: true };
          } else {
            // 使用前端輸入的新值
            requestBody = {
              webhook_url: settings.discord_webhook
            };
          }
          break;
        case 'telegram':
          // 判斷是否為遮罩值
          const isTelegramTokenMasked = settings.telegram_token.includes('•');
          const isTelegramChatIdMasked = settings.telegram_chat_id.includes('•');
          
          if (isTelegramTokenMasked || isTelegramChatIdMasked) {
            // 使用已保存的設定
            requestBody = { use_saved: true };
          } else {
            // 使用前端輸入的新值
            if (!settings.telegram_token) {
              toast.error('請先輸入Telegram Bot Token');
              return;
            }
            if (!settings.telegram_chat_id) {
              toast.error('請先輸入Telegram Chat ID');
              return;
            }
            requestBody = {
              bot_token: settings.telegram_token,
              chat_id: settings.telegram_chat_id
            };
          }
          break;
        default:
          throw new Error('不支援的服務類型');
      }



      const response = await fetch(`/api/test-connection/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const result = await response.json();

        
        // 檢查API返回的成功/失敗狀態
        if (result.success) {
          toast.success(result.message);
        } else {
          toast.error(`${type} 連接測試失敗: ${result.message}`);
        }
      } else {
        const error = await response.json();
        throw new Error(error.detail || error.message || `${type} 連接測試失敗`);
      }
    } catch (error) {
      console.error(`Test ${type} connection error:`, error);
      toast.error(error instanceof Error ? error.message : `${type} 連接測試失敗`);
    }
  };

  // 渲染已配置標記的輔助函數
  const renderConfiguredStatus = (field: keyof typeof isConfigured) => {

    if (isConfigured[field]) {
      return <span className="text-green-500 text-sm ml-2">（已配置）</span>;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-4rem)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-8">
      <h1 className="text-3xl font-bold">設定</h1>
      
      <Tabs defaultValue="api">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="api">API設定</TabsTrigger>
          <TabsTrigger value="notification">通知設定</TabsTrigger>
          <TabsTrigger value="security">安全性</TabsTrigger>
        </TabsList>
        
        <TabsContent value="api">
          {/* API 設定表單 */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">幣安 API 設定</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              請輸入您的幣安 API 金鑰和密鑰，以便系統能夠執行交易操作。
            </p>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 幣安 API 設定 */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    API Key {renderConfiguredStatus('binance_api_key')}
                  </label>
                  <input
                    type="text"
                    name="binance_api_key"
                    value={settings.binance_api_key}
                    onChange={handleChange}
                    placeholder="輸入您的幣安 API Key"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    API Secret {renderConfiguredStatus('binance_api_secret')}
                  </label>
                  <input
                    type="password"
                    name="binance_api_secret"
                    value={settings.binance_api_secret}
                    onChange={handleChange}
                    placeholder="輸入您的幣安 API Secret"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('binance')}
                    disabled={!settings.binance_api_key || !settings.binance_api_secret || isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                  >
                    測試連接
                  </button>
                  
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-green-500 text-white rounded-md disabled:opacity-50"
                  >
                    {isSaving ? '保存中...' : '保存設定'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </TabsContent>
        
        <TabsContent value="notification">
          {/* 通知設定表單 */}
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">通知設定</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              設定交易通知的接收方式，您可以選擇 Discord 或 Telegram。
            </p>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Discord 通知設定 */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Discord</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Webhook URL {renderConfiguredStatus('discord_webhook')}
                  </label>
                  <input
                    type="text"
                    name="discord_webhook"
                    value={settings.discord_webhook}
                    onChange={handleChange}
                    placeholder="輸入您的 Discord Webhook URL"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('discord')}
                    disabled={!settings.discord_webhook || isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                  >
                    測試 Discord 通知
                  </button>
                </div>
              </div>
              
              {/* Telegram 通知設定 */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Telegram</h3>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Bot Token {renderConfiguredStatus('telegram_token')}
                  </label>
                  <input
                    type="text"
                    name="telegram_token"
                    value={settings.telegram_token}
                    onChange={handleChange}
                    placeholder="輸入您的 Telegram Bot Token"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Chat ID {renderConfiguredStatus('telegram_chat_id')}
                  </label>
                  <input
                    type="text"
                    name="telegram_chat_id"
                    value={settings.telegram_chat_id}
                    onChange={handleChange}
                    placeholder="輸入您的 Telegram Chat ID"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                  />
                </div>
                
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleTestConnection('telegram')}
                    disabled={!settings.telegram_token || !settings.telegram_chat_id || isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:opacity-50"
                  >
                    測試 Telegram 通知
                  </button>
                </div>
              </div>
              
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-500 text-white rounded-md disabled:opacity-50"
                >
                  {isSaving ? '保存中...' : '保存設定'}
                </button>
              </div>
            </form>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">修改密碼</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              定期更換密碼以保護您的帳戶安全。
            </p>
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    目前密碼
                  </label>
                  <input
                    type="password"
                    name="current_password"
                    value={passwordData.current_password}
                    onChange={handlePasswordChange}
                    placeholder="輸入您目前的密碼"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    新密碼
                  </label>
                  <input
                    type="password"
                    name="new_password"
                    value={passwordData.new_password}
                    onChange={handlePasswordChange}
                    placeholder="輸入您的新密碼"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    確認新密碼
                  </label>
                  <input
                    type="password"
                    name="confirm_password"
                    value={passwordData.confirm_password}
                    onChange={handlePasswordChange}
                    placeholder="再次輸入您的新密碼"
                    className="w-full p-2 border rounded-md text-black dark:text-white bg-white dark:bg-gray-700"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-green-500 text-white rounded-md disabled:opacity-50"
                >
                  {isSaving ? '更新中...' : '更新密碼'}
                </button>
              </div>
            </form>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 