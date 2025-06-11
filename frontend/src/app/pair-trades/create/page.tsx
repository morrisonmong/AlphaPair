'use client';

import { CreatePairTradeForm } from '@/components/pair-trade/CreatePairTradeForm';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';

// 表單錯誤備用UI組件
const FormFallback = () => (
  <div className="flex flex-col items-center justify-center h-full p-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
    <p className="text-lg text-red-700 dark:text-red-300 mb-2">表單載入失敗</p>
    <p className="text-sm text-red-600 dark:text-red-400 mb-4">配對交易表單載入時出現錯誤</p>
    <Button 
      variant="destructive" 
      onClick={() => window.location.reload()}
    >
      重新載入頁面
    </Button>
  </div>
);

export default function CreatePairTradePage() {
  return (
    <div className="container py-8">
      <ErrorBoundary fallback={<FormFallback />}>
        <CreatePairTradeForm />
      </ErrorBoundary>
    </div>
  );
} 