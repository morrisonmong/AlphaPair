'use client';

import { PairTradeDetail } from '@/components/pair-trade/PairTradeDetail';
import { useParams } from 'next/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';

// 詳情錯誤備用UI組件
const DetailFallback = () => (
  <div className="flex flex-col items-center justify-center h-full p-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
    <p className="text-lg text-red-700 dark:text-red-300 mb-2">詳情載入失敗</p>
    <p className="text-sm text-red-600 dark:text-red-400 mb-4">配對交易詳情載入時出現錯誤</p>
    <Button 
      variant="destructive" 
      onClick={() => window.location.reload()}
    >
      重新載入頁面
    </Button>
  </div>
);

export default function PairTradePage() {
  // 使用 useParams 鉤子獲取參數
  const params = useParams();
  const id = params.id as string;

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">配對交易詳情</h1>
      <ErrorBoundary fallback={<DetailFallback />}>
        <PairTradeDetail tradeId={id} />
      </ErrorBoundary>
    </div>
  );
} 