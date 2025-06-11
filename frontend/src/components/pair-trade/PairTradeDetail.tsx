'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { usePairTradeStore } from '@/lib/store/pair-trade-store';
import { formatDateTime } from '@/lib/utils';

interface PairTradeDetailProps {
  tradeId: string;
}

export function PairTradeDetail({ tradeId }: PairTradeDetailProps) {
  const router = useRouter();
  const { selectedTrade, isLoading, error, fetchTrade, updateTrade, closeTrade } = usePairTradeStore();

  // 獲取配對交易詳情
  useEffect(() => {
    fetchTrade(tradeId);
    
    // 每10秒刷新一次，但只有活躍交易才自動刷新
    const interval = setInterval(() => {
      if (selectedTrade?.status === 'active') {
        updateTrade(tradeId);
      }
    }, 10000);
    
    return () => clearInterval(interval);
  }, [tradeId, fetchTrade, updateTrade, selectedTrade?.status]);

  // 獲取狀態徽章顏色
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">活躍</Badge>;
      case 'closed':
        return <Badge variant="secondary">已平倉</Badge>;
      case 'pending':
        return <Badge variant="outline">等待中</Badge>;
      case 'failed':
        return <Badge variant="destructive">失敗</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 獲取盈虧顏色
  const getPnlColor = (pnl: number) => {
    if (pnl > 0) return 'text-green-500';
    if (pnl < 0) return 'text-red-500';
    return 'text-gray-500';
  };

  // 手動刷新
  const handleRefresh = async () => {
    await updateTrade(tradeId);
  };

  // 平倉交易
  const handleClose = async () => {
    if (window.confirm('確定要平倉此交易嗎？')) {
      await closeTrade(tradeId);
    }
  };

  // 返回列表
  const handleBack = () => {
    router.push('/dashboard');
  };

  if (isLoading && !selectedTrade) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">載入中...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8 text-red-500">{error}</div>
          <div className="flex justify-center">
            <Button onClick={handleBack}>返回</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!selectedTrade) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">找不到交易信息</div>
          <div className="flex justify-center">
            <Button onClick={handleBack}>返回</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{selectedTrade.name}</CardTitle>
            <CardDescription>
              創建於 {formatDateTime(new Date(selectedTrade.created_at))}
            </CardDescription>
          </div>
          <div>
            {getStatusBadge(selectedTrade.status)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* 總體信息 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">總盈虧</div>
            <div className={`text-2xl font-bold ${getPnlColor(selectedTrade.total_pnl_value || 0)}`}>
              {(selectedTrade.total_pnl_value || 0) >= 0 ? '+' : ''}{(selectedTrade.total_pnl_value || 0).toFixed(2)} USDT
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">淨盈虧</div>
            <div className={`text-2xl font-bold ${getPnlColor(selectedTrade.total_pnl_value - (selectedTrade.total_fee || 0) || 0)}`}>
              {(selectedTrade.total_pnl_value - (selectedTrade.total_fee || 0) || 0) >= 0 ? '+' : ''}{(selectedTrade.total_pnl_value - (selectedTrade.total_fee || 0) || 0).toFixed(2)} USDT
            </div>
            <div className="text-sm text-muted-foreground">
              扣除手續費後
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">總手續費</div>
            <div className="text-2xl font-bold">{(selectedTrade.total_fee || 0).toFixed(2)} USDT</div>
            <div className="text-xs text-muted-foreground">
              開倉: {(selectedTrade.total_entry_fee || 0).toFixed(2)} | 平倉: {(selectedTrade.total_exit_fee || 0).toFixed(2)}
            </div>
          </div>
        </div>
        
        <Separator />
        
        {/* 風險設置 & MAE/MFE */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">最大虧損</div>
            <div className="text-2xl font-bold">{selectedTrade.max_loss || 0} USDT</div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">止損/止盈</div>
            <div className="flex space-x-4">
              <div>
                <div className="text-sm text-red-500">止損</div>
                <div className="text-xl font-bold">{selectedTrade.stop_loss || 0}%</div>
              </div>
              <div>
                <div className="text-sm text-green-500">止盈</div>
                <div className="text-xl font-bold">{selectedTrade.take_profit || 0}%</div>
              </div>
            </div>
          </div>

          {/* 新增 MAE/MFE 顯示 */}
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">風險指標</div>
            <div className="flex space-x-4">
              <div>
                <div className="text-sm text-muted-foreground">比率變動</div>
                <div className={`text-xl font-bold ${getPnlColor(selectedTrade.total_ratio_percent || 0)}`}>
                  {(selectedTrade.total_ratio_percent || 0) >= 0 ? '+' : ''}{(selectedTrade.total_ratio_percent || 0).toFixed(2)}%
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">MAE</div>
                <div className="text-xl font-bold text-red-500">{typeof selectedTrade.mae === 'number' ? selectedTrade.mae.toFixed(2) : '-'}%</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">MFE</div>
                <div className="text-xl font-bold text-green-500">{typeof selectedTrade.mfe === 'number' ? selectedTrade.mfe.toFixed(2) : '-'}%</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 持倉信息 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 多單 */}
          {selectedTrade.long_position && (
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="text-lg font-bold">{selectedTrade.long_position.symbol}</div>
                <Badge variant="outline" className="bg-blue-500 text-white">多單</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-sm text-muted-foreground">數量</div>
                  <div className="text-lg">{selectedTrade.long_position.quantity ? selectedTrade.long_position.quantity.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">入場價格</div>
                  <div className="text-lg">{selectedTrade.long_position.entry_price ? selectedTrade.long_position.entry_price.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">當前價格</div>
                  <div className="text-lg">{selectedTrade.long_position.current_price ? selectedTrade.long_position.current_price.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">盈虧</div>
                  <div className={`text-lg ${getPnlColor(selectedTrade.long_position.pnl || 0)}`}>
                    {(selectedTrade.long_position.pnl || 0) >= 0 ? '+' : ''}{(selectedTrade.long_position.pnl || 0).toFixed(2)} USDT
                  </div>
                  <div className={`text-xs ${getPnlColor(selectedTrade.long_position.pnl_percent || 0)}`}>
                    {(selectedTrade.long_position.pnl_percent || 0) >= 0 ? '+' : ''}{(selectedTrade.long_position.pnl_percent || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">槓桿</div>
                  <div className="text-lg">{selectedTrade.long_position.leverage || 1}x</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">手續費</div>
                  <div className="text-xs">開倉: {(selectedTrade.long_position.entry_fee || 0).toFixed(2)} USDT</div>
                  <div className="text-xs">平倉: {(selectedTrade.long_position.exit_fee || 0).toFixed(2)} USDT</div>
                </div>
              </div>
            </div>
          )}
          
          {/* 空單 */}
          {selectedTrade.short_position && (
            <div className="border rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <div className="text-lg font-bold">{selectedTrade.short_position.symbol}</div>
                <Badge variant="outline" className="bg-red-500 text-white">空單</Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <div className="text-sm text-muted-foreground">數量</div>
                  <div className="text-lg">{selectedTrade.short_position.quantity ? selectedTrade.short_position.quantity.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">入場價格</div>
                  <div className="text-lg">{selectedTrade.short_position.entry_price ? selectedTrade.short_position.entry_price.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">當前價格</div>
                  <div className="text-lg">{selectedTrade.short_position.current_price ? selectedTrade.short_position.current_price.toString() : '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">盈虧</div>
                  <div className={`text-lg ${getPnlColor(selectedTrade.short_position.pnl || 0)}`}>
                    {(selectedTrade.short_position.pnl || 0) >= 0 ? '+' : ''}{(selectedTrade.short_position.pnl || 0).toFixed(2)} USDT
                  </div>
                  <div className={`text-xs ${getPnlColor(selectedTrade.short_position.pnl_percent || 0)}`}>
                    {(selectedTrade.short_position.pnl_percent || 0) >= 0 ? '+' : ''}{(selectedTrade.short_position.pnl_percent || 0).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">槓桿</div>
                  <div className="text-lg">{selectedTrade.short_position.leverage || 1}x</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">手續費</div>
                  <div className="text-xs">開倉: {(selectedTrade.short_position.entry_fee || 0).toFixed(2)} USDT</div>
                  <div className="text-xs">平倉: {(selectedTrade.short_position.exit_fee || 0).toFixed(2)} USDT</div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* 平倉信息 */}
        {selectedTrade.status === 'closed' && (
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm text-muted-foreground">平倉信息</div>
            <div className="mt-2">
              <div><span className="font-medium">平倉時間:</span> {selectedTrade.closed_at ? formatDateTime(new Date(selectedTrade.closed_at)) : '-'}</div>
              <div><span className="font-medium">平倉原因:</span> {selectedTrade.close_reason || '-'}</div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={handleBack}>
          返回
        </Button>
        <div className="space-x-2">
          <Button variant="secondary" onClick={handleRefresh}>
            更新數據
          </Button>
          {selectedTrade.status === 'active' && (
            <Button variant="destructive" onClick={handleClose}>
              平倉交易
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
} 