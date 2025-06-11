'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from 'sonner';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  
  const { register, isLoading, error, clearError } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 基本驗證
    if (!username || !email || !password || !confirmPassword) {
      toast.error('請填寫所有必填字段');
      return;
    }
    
    // 密碼匹配驗證
    if (password !== confirmPassword) {
      toast.error('兩次輸入的密碼不一致');
      return;
    }
    
    // 密碼強度驗證
    if (password.length < 8) {
      toast.error('密碼長度至少為8個字符');
      return;
    }
    
    try {
      await register(username, email, password, fullName || undefined);
      
      // 如果沒有錯誤，則註冊成功
      if (!useAuthStore.getState().error) {
        toast.success('註冊成功');
        
        // 跳轉到儀表板
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Register error:', error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-md p-8 bg-gray-800 rounded-lg shadow-xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">創建帳戶</h1>
          <p className="text-gray-400">
            開始您的量化交易之旅
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 text-sm text-red-400 bg-red-900/50 rounded-lg">
              {error}
              <button 
                onClick={clearError} 
                className="float-right font-bold text-red-400 hover:text-red-300"
                type="button"
              >
                ✕
              </button>
            </div>
          )}
          
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">
              用戶名 *
            </label>
            <input
              id="username"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="輸入用戶名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              電子郵件 *
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="輸入電子郵件"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="fullName" className="block text-sm font-medium text-gray-300">
              全名
            </label>
            <input
              id="fullName"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="輸入全名（可選）"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              密碼 *
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="輸入密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="text-xs text-gray-400">密碼長度至少為8個字符</p>
          </div>
          
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
              確認密碼 *
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-400"
              placeholder="再次輸入密碼"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading}
          >
            {isLoading ? '註冊中...' : '註冊'}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-gray-400">
            已有帳戶？{' '}
            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 hover:underline">
              立即登入
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 