'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store/auth-store';
import { toast } from 'sonner';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const { login, isLoading, error, clearError } = useAuthStore();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error('請填寫所有必填字段');
      return;
    }
    
    try {
      await login(username, password);
      
      if (!useAuthStore.getState().error) {
        toast.success('登入成功');
        router.push('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('用戶名或密碼錯誤');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)' }}>
      <div style={{ width: '100%', maxWidth: '28rem', padding: '2rem', backgroundColor: '#1f2937', borderRadius: '0.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'white', marginBottom: '0.5rem' }}>歡迎回來</h1>
          <p style={{ color: '#9ca3af' }}>
            登入您的帳戶以繼續
          </p>
        </div>
        
        <form onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
          {error && (
            <div style={{ padding: '1rem', fontSize: '0.875rem', color: '#f87171', backgroundColor: 'rgba(153, 27, 27, 0.5)', borderRadius: '0.5rem', marginBottom: '1.5rem' }}>
              {error}
              <button 
                onClick={clearError} 
                style={{ float: 'right', fontWeight: 'bold', color: '#f87171' }}
                type="button"
              >
                ✕
              </button>
            </div>
          )}
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="username" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
              用戶名
            </label>
            <input
              id="username"
              style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: '#374151', border: '1px solid #4b5563', borderRadius: '0.5rem', color: 'white', marginBottom: '0.5rem' }}
              placeholder="輸入用戶名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#d1d5db', marginBottom: '0.5rem' }}>
              密碼
            </label>
            <input
              id="password"
              type="password"
              style={{ width: '100%', padding: '0.75rem 1rem', backgroundColor: '#374151', border: '1px solid #4b5563', borderRadius: '0.5rem', color: 'white', marginBottom: '0.5rem' }}
              placeholder="輸入密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            style={{ 
              width: '100%', 
              padding: '0.75rem 1rem', 
              backgroundColor: '#2563eb', 
              color: 'white', 
              fontWeight: '500', 
              borderRadius: '0.5rem', 
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? '0.5' : '1'
            }}
            disabled={isLoading}
          >
            {isLoading ? '登入中...' : '登入'}
          </button>
        </form>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: '#9ca3af' }}>
            還沒有帳戶？{' '}
            <Link href="/auth/register" style={{ color: '#60a5fa', textDecoration: 'none' }}>
              立即註冊
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 