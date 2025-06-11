'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import { PairTrade } from '@/lib/api/pair-trade';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';

interface TradeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: PairTrade | TradeHistoryBackwardCompatible | null;
  type: 'pair-trade' | 'trade-history';
}

export function TradeDetailModal({ isOpen, onClose, trade, type }: TradeDetailModalProps) {
  if (!trade) return null;

  // 統一數據格式
  const unifiedTrade = {
    id: trade.id,
    name: type === 'pair-trade' ? (trade as PairTrade).name : (trade as TradeHistoryBackwardCompatible).trade_name || '無名稱',
    status: type === 'pair-trade' ? (trade as PairTrade).status : 'closed',
    created_at: trade.created_at,
    closed_at: trade.closed_at,
    
    // 盈虧信息
    total_pnl: type === 'pair-trade' 
      ? (trade as PairTrade).total_pnl_value || 0 
      : (trade as TradeHistoryBackwardCompatible).total_pnl || 0,
    total_ratio_percent: type === 'pair-trade' 
      ? (trade as PairTrade).total_ratio_percent || 0 
      : (trade as TradeHistoryBackwardCompatible).total_pnl_percent || (trade as TradeHistoryBackwardCompatible).total_ratio_percent || 0,
    total_fee: type === 'pair-trade' 
      ? (trade as PairTrade).total_fee || 0 
      : (trade as TradeHistoryBackwardCompatible).total_fee || 0,
    net_pnl: type === 'pair-trade' 
      ? ((trade as PairTrade).total_pnl_value || 0) - ((trade as PairTrade).total_fee || 0)
      : (trade as TradeHistoryBackwardCompatible).net_pnl || ((trade as TradeHistoryBackwardCompatible).total_pnl || 0) - ((trade as TradeHistoryBackwardCompatible).total_fee || 0),
    
    // 交易設置
    stop_loss: trade.stop_loss || 0,
    take_profit: trade.take_profit || 0,
    max_loss: trade.max_loss || 0,
    leverage: type === 'pair-trade' 
      ? (trade as PairTrade).long_position?.leverage || 1 
      : (trade as TradeHistoryBackwardCompatible).leverage || 1,
    
    // 風險指標
    mae: type === 'pair-trade' ? (trade as PairTrade).mae || 0 : (trade as TradeHistoryBackwardCompatible).mae || 0,
    mfe: type === 'pair-trade' ? (trade as PairTrade).mfe || 0 : (trade as TradeHistoryBackwardCompatible).mfe || 0,
    max_ratio: type === 'pair-trade' ? (trade as PairTrade).max_ratio || 0 : (trade as TradeHistoryBackwardCompatible).max_ratio || 0,
    min_ratio: type === 'pair-trade' ? (trade as PairTrade).min_ratio || 0 : (trade as TradeHistoryBackwardCompatible).min_ratio || 0,
    
    // 平倉原因
    close_reason: type === 'pair-trade' 
      ? (trade as PairTrade).close_reason 
      : (trade as TradeHistoryBackwardCompatible).close_reason,
    
    // 多空單信息
    long_position: type === 'pair-trade' 
      ? (trade as PairTrade).long_position 
      : (trade as TradeHistoryBackwardCompatible).long_position || {
          symbol: (trade as TradeHistoryBackwardCompatible).long_symbol || '',
          quantity: (trade as TradeHistoryBackwardCompatible).long_quantity || 0,
          entry_price: (trade as TradeHistoryBackwardCompatible).long_entry_price || 0,
          exit_price: (trade as TradeHistoryBackwardCompatible).long_exit_price || 0,
          current_price: (trade as TradeHistoryBackwardCompatible).long_exit_price || 0,
          pnl: (trade as TradeHistoryBackwardCompatible).long_pnl || 0,
          pnl_percent: (trade as TradeHistoryBackwardCompatible).long_pnl_percent || 0,
          entry_fee: (trade as TradeHistoryBackwardCompatible).long_entry_fee || 0,
          exit_fee: (trade as TradeHistoryBackwardCompatible).long_exit_fee || 0,
          leverage: (trade as TradeHistoryBackwardCompatible).leverage || 1,
          side: 'BUY' as const,
          entry_order_id: '',
          exit_order_id: '',
          notional_value: ((trade as TradeHistoryBackwardCompatible).long_quantity || 0) * ((trade as TradeHistoryBackwardCompatible).long_entry_price || 0)
        },
    short_position: type === 'pair-trade' 
      ? (trade as PairTrade).short_position 
      : (trade as TradeHistoryBackwardCompatible).short_position || {
          symbol: (trade as TradeHistoryBackwardCompatible).short_symbol || '',
          quantity: (trade as TradeHistoryBackwardCompatible).short_quantity || 0,
          entry_price: (trade as TradeHistoryBackwardCompatible).short_entry_price || 0,
          exit_price: (trade as TradeHistoryBackwardCompatible).short_exit_price || 0,
          current_price: (trade as TradeHistoryBackwardCompatible).short_exit_price || 0,
          pnl: (trade as TradeHistoryBackwardCompatible).short_pnl || 0,
          pnl_percent: (trade as TradeHistoryBackwardCompatible).short_pnl_percent || 0,
          entry_fee: (trade as TradeHistoryBackwardCompatible).short_entry_fee || 0,
          exit_fee: (trade as TradeHistoryBackwardCompatible).short_exit_fee || 0,
          leverage: (trade as TradeHistoryBackwardCompatible).leverage || 1,
          side: 'SELL' as const,
          entry_order_id: '',
          exit_order_id: '',
          notional_value: ((trade as TradeHistoryBackwardCompatible).short_quantity || 0) * ((trade as TradeHistoryBackwardCompatible).short_entry_price || 0)
        },
    
    // 停利保護設置（僅 pair-trade）
    trailing_stop_enabled: type === 'pair-trade' ? (trade as PairTrade).trailing_stop_enabled : false,
    trailing_stop_level: type === 'pair-trade' ? (trade as PairTrade).trailing_stop_level || 0 : 0,
  };

  // 獲取狀態徽章
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500 hover:bg-green-600">持倉中</Badge>;
      case 'closed':
        return <Badge variant="accent">已平倉</Badge>;
      case 'pending':
        return <Badge variant="outline">等待中</Badge>;
      case 'failed':
        return <Badge variant="destructive">失敗</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 獲取平倉原因顯示
  const getCloseReasonDisplay = (reason: string | null | undefined) => {
    if (!reason) return '手動';
    switch (reason) {
      case 'take_profit':
        return '止盈';
      case 'stop_loss':
        return '止損';
      case 'trailing_stop':
        return '停利';
      case 'manual':
      case 'manual_close':
      case '手動平倉':
        return '手動';
      default:
        return reason;
    }
  };

  // 計算持倉時間
  const calculateDuration = () => {
    if (!unifiedTrade.created_at) return '-';
    const start = new Date(unifiedTrade.created_at);
    const end = unifiedTrade.closed_at ? new Date(unifiedTrade.closed_at) : new Date();
    const durationMs = end.getTime() - start.getTime();
    const hours = (durationMs / (1000 * 60 * 60)).toFixed(1);
    return `${hours} 小時`;
  };

  // 計算預期風險收益比
  const calculateRiskReward = () => {
    if (!unifiedTrade.take_profit || !unifiedTrade.stop_loss || unifiedTrade.stop_loss === 0) {
      return '-';
    }
    return (Math.abs(unifiedTrade.take_profit) / Math.abs(unifiedTrade.stop_loss)).toFixed(2);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            交易詳情: {unifiedTrade.name}
          </DialogTitle>
          <DialogDescription>
            {unifiedTrade.status === 'active' ? '持倉中交易的詳細信息' : 
             unifiedTrade.status === 'closed' ? '已平倉交易的詳細信息' :
             unifiedTrade.status === 'pending' ? '等待中交易的詳細信息' : '交易詳細信息'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          {/* 第一行：基本信息和盈虧信息 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 基本信息 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">基本信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">交易名稱:</span>
                  <span className="font-medium">{unifiedTrade.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">狀態:</span>
                  {getStatusBadge(unifiedTrade.status)}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">創建時間:</span>
                  <span className="font-medium text-sm">
                    {unifiedTrade.created_at ? formatDateTime(new Date(unifiedTrade.created_at)) : '-'}
                  </span>
                </div>
                {unifiedTrade.closed_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">平倉時間:</span>
                    <span className="font-medium text-sm">
                      {formatDateTime(new Date(unifiedTrade.closed_at))}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">持倉時間:</span>
                  <span className="font-medium">{calculateDuration()}</span>
                </div>
                {unifiedTrade.close_reason && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">平倉原因:</span>
                    <Badge 
                      variant={
                        unifiedTrade.close_reason === 'take_profit' ? 'default' : 
                        unifiedTrade.close_reason === 'stop_loss' ? 'destructive' : 
                        unifiedTrade.close_reason === 'trailing_stop' ? 'default' :
                        unifiedTrade.close_reason === 'manual' ? 'default' :
                        unifiedTrade.close_reason === 'manual_close' ? 'default' :
                        unifiedTrade.close_reason === '手動平倉' ? 'default' :
                        'secondary'
                      } 
                      className={`text-xs ${
                        unifiedTrade.close_reason === 'take_profit' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : 
                        unifiedTrade.close_reason === 'stop_loss' ? '' : 
                        unifiedTrade.close_reason === 'trailing_stop' ? 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30' :
                        unifiedTrade.close_reason === 'manual' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                        unifiedTrade.close_reason === 'manual_close' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                        unifiedTrade.close_reason === '手動平倉' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                        ''
                      }`}
                    >
                      {getCloseReasonDisplay(unifiedTrade.close_reason)}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 盈虧信息 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">盈虧信息</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">總盈虧:</span>
                  <div className="text-right">
                    <div className={`font-bold ${unifiedTrade.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {unifiedTrade.total_pnl >= 0 ? '+' : ''}{unifiedTrade.total_pnl.toFixed(2)} USDT
                    </div>
                    {unifiedTrade.max_loss > 0 && (
                      <div className="text-sm text-gray-500">
                        {(unifiedTrade.total_pnl / unifiedTrade.max_loss).toFixed(2)} R
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">總手續費:</span>
                  <div className="text-right">
                    <span className="font-medium text-orange-500">
                      -{unifiedTrade.total_fee.toFixed(4)} USDT
                    </span>
                    {unifiedTrade.max_loss > 0 && (
                    <div className="text-sm text-gray-500">
                      {(unifiedTrade.total_fee / unifiedTrade.max_loss).toFixed(2)} R
                    </div>
                  )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">淨盈虧:</span>
                  <div className="text-right">
                    <div className={`font-bold ${unifiedTrade.net_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {unifiedTrade.net_pnl >= 0 ? '+' : ''}{unifiedTrade.net_pnl.toFixed(2)} USDT
                    </div>
                    {unifiedTrade.max_loss > 0 && (
                      <div className="text-sm text-gray-500">
                        {(unifiedTrade.net_pnl / unifiedTrade.max_loss).toFixed(2)} R
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">最大虧損(1R):</span>
                  <span className="font-medium">{unifiedTrade.max_loss} USDT</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 第二行：交易設置和風險指標 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 交易設置 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">交易設置</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">止損設置:</span>
                  <span className="font-medium text-red-500">{unifiedTrade.stop_loss}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">止盈設置:</span>
                  <span className="font-medium text-green-500">{unifiedTrade.take_profit}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">預期風險收益比:</span>
                  <span className="font-medium">{calculateRiskReward()} R</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">槓桿倍數:</span>
                  <span className="font-medium">{unifiedTrade.leverage}x</span>
                </div>
                {unifiedTrade.trailing_stop_enabled && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">停利保護:</span>
                    <span className="font-medium text-blue-500">{unifiedTrade.trailing_stop_level}%</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 風險指標 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">風險指標</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">出場百分比:</span>
                  <span className={`font-medium ${unifiedTrade.total_ratio_percent >= 0 ? 'text-green-500' : 'text-red-500'}`}>{unifiedTrade.total_ratio_percent.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">MFE (最大有利變動):</span>
                  <span className="font-medium text-green-500">{unifiedTrade.mfe.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">MAE (最大不利變動):</span>
                  <span className="font-medium text-red-500">{unifiedTrade.mae.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">最高價格比:</span>
                  <span className="font-medium">{unifiedTrade.max_ratio.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">最低價格比:</span>
                  <span className="font-medium">{unifiedTrade.min_ratio.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">波動率:</span>
                  <span className="font-medium">
                    {((unifiedTrade.max_ratio - unifiedTrade.min_ratio) / unifiedTrade.min_ratio * 100).toFixed(2)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 第三行：多空單詳情 */}
          {unifiedTrade.long_position && unifiedTrade.short_position && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 多單詳情 */}
              <Card className="border-green-200 dark:border-green-800">
                <CardHeader className="bg-green-50 dark:bg-green-950/20">
                  <CardTitle className="text-lg text-green-700 dark:text-green-300">
                    多單: {unifiedTrade.long_position.symbol}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">入場價格:</span>
                    <span className="font-medium">{unifiedTrade.long_position.entry_price}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {unifiedTrade.status === 'active' ? '當前價格:' : '出場價格:'}
                    </span>
                    <span className="font-medium">
                      {unifiedTrade.long_position.exit_price || unifiedTrade.long_position.current_price}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">數量:</span>
                    <span className="font-medium">{unifiedTrade.long_position.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">槓桿:</span>
                    <span className="font-medium">{unifiedTrade.long_position.leverage}x</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {unifiedTrade.status === 'active' ? '未實現盈虧:' : '盈虧:'}
                    </span>
                    <div className="text-right">
                      <div className={`font-bold ${(unifiedTrade.long_position.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(unifiedTrade.long_position.pnl || 0) >= 0 ? '+' : ''}{(unifiedTrade.long_position.pnl || 0).toFixed(2)} USDT
                      </div>
                      <div className={`text-sm ${(unifiedTrade.long_position.pnl_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ({(unifiedTrade.long_position.pnl_percent || 0).toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                  {unifiedTrade.status === 'closed' && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">手續費:</span>
                      <span className="font-medium text-orange-500">
                        -{((unifiedTrade.long_position.entry_fee || 0) + (unifiedTrade.long_position.exit_fee || 0)).toFixed(4)} USDT
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 空單詳情 */}
              <Card className="border-amber-200 dark:border-amber-800">
                <CardHeader className="bg-amber-50 dark:bg-amber-950/20">
                  <CardTitle className="text-lg text-red-700 dark:text-red-300">
                    空單: {unifiedTrade.short_position.symbol}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">入場價格:</span>
                    <span className="font-medium">{unifiedTrade.short_position.entry_price}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {unifiedTrade.status === 'active' ? '當前價格:' : '出場價格:'}
                    </span>
                    <span className="font-medium">
                      {unifiedTrade.short_position.exit_price || unifiedTrade.short_position.current_price}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">數量:</span>
                    <span className="font-medium">{unifiedTrade.short_position.quantity}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">槓桿:</span>
                    <span className="font-medium">{unifiedTrade.short_position.leverage}x</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">
                      {unifiedTrade.status === 'active' ? '未實現盈虧:' : '盈虧:'}
                    </span>
                    <div className="text-right">
                      <div className={`font-bold ${(unifiedTrade.short_position.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {(unifiedTrade.short_position.pnl || 0) >= 0 ? '+' : ''}{(unifiedTrade.short_position.pnl || 0).toFixed(2)} USDT
                      </div>
                      <div className={`text-sm ${(unifiedTrade.short_position.pnl_percent || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        ({(unifiedTrade.short_position.pnl_percent || 0).toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                  {unifiedTrade.status === 'closed' && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600 dark:text-gray-400">手續費:</span>
                      <span className="font-medium text-orange-500">
                        -{((unifiedTrade.short_position.entry_fee || 0) + (unifiedTrade.short_position.exit_fee || 0)).toFixed(4)} USDT
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            關閉
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 