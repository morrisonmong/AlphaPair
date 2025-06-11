'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePairTradeStore } from '@/lib/store/pair-trade-store';
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';
import { PairTrade } from '@/lib/api/pair-trade';
import { calculateRunningTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updatePairTradeSettings } from '@/lib/api/pair-trade';
import { toast } from '@/components/ui/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { TradeDetailModal } from '@/components/shared/TradeDetailModal';

interface PairTradeListProps {
  filterStatus?: string | null;
  currentPage?: number;
  itemsPerPage?: number;
  onUpdateTotalItems?: (total: number) => void;
  timeRange?: string;
  customStartDate?: string;
  customEndDate?: string;
  testTrades?: PairTrade[];
  closedSubFilter?: 'all' | 'profit' | 'loss';
}

export function PairTradeList({ filterStatus = null, currentPage = 1, itemsPerPage = 10, onUpdateTotalItems, timeRange, customStartDate, customEndDate, testTrades = [], closedSubFilter = 'all' }: PairTradeListProps) {
  const { trades, isLoading, fetchTrades, fetchTradesSilently, closeTrade } = usePairTradeStore();
  const { histories, fetchHistories } = useTradeHistoryStore();
  const [showClosedTrades] = useState<boolean>(filterStatus === 'closed' || filterStatus === null);
  const [selectedTradeForDetail, setSelectedTradeForDetail] = useState<PairTrade | null>(null);
  const [selectedTradeForEdit, setSelectedTradeForEdit] = useState<PairTrade | null>(null);
  const [editTakeProfit, setEditTakeProfit] = useState<string>('');
  const [editStopLoss, setEditStopLoss] = useState<string>('');
  const [editTrailingStopEnabled, setEditTrailingStopEnabled] = useState<boolean>(false);
  const [editTrailingStopLevel, setEditTrailingStopLevel] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState(false);

  // 獲取所有配對交易
  useEffect(() => {

    fetchTrades();
    fetchHistories(); // 同時獲取交易歷史
    
    // 如果是活躍中的交易，每3秒靜默刷新一次
    const activeTradesInterval = setInterval(() => {
      const shouldRefresh = filterStatus === 'active' || filterStatus === null;
      
      if (shouldRefresh) {
        // 檢查是否有編輯對話框打開，如果有則跳過刷新
        const hasEditDialog = selectedTradeForEdit !== null;
        const hasDetailDialog = selectedTradeForDetail !== null;
        
        if (!hasEditDialog && !hasDetailDialog) {

          fetchTradesSilently();
        } else {

        }
      }
    }, 3000);
    
    // 每15分鐘刷新一次已平倉交易
    const closedTradesInterval = setInterval(() => {

      fetchHistories();
    }, 15 * 60 * 1000); // 15分鐘 = 15 * 60 * 1000毫秒
    
    return () => {
      clearInterval(activeTradesInterval);
      clearInterval(closedTradesInterval);
    };
  }, [fetchTrades, fetchTradesSilently, fetchHistories, filterStatus, selectedTradeForEdit, selectedTradeForDetail]);

  // 將交易歷史轉換為配對交易格式
  const convertedHistories = useMemo(() => {
    return histories.map(history => {
      // 創建一個符合 PairTrade 接口的對象
      const trade: PairTrade = {
        id: history.id,
        name: history.long_position?.symbol && history.short_position?.symbol
          ? `${history.long_position.symbol}/${history.short_position.symbol}`
          : history.name || '',
        status: 'closed',
        max_loss: history.max_loss || 0,
        stop_loss: history.stop_loss || 0,
        take_profit: history.take_profit || 0,
        trailing_stop_enabled: false,
        trailing_stop_level: 0,
        long_position: {
          symbol: history.long_position?.symbol || '',
          quantity: history.long_position?.quantity || 0,
          entry_price: history.long_position?.entry_price || 0,
          current_price: history.long_position?.exit_price || 0,
          exit_price: history.long_position?.exit_price || 0,
          pnl: history.long_position?.pnl || 0,
          pnl_percent: history.long_position?.pnl_percent || 0,
          entry_order_id: '',
          exit_order_id: '',
          entry_fee: history.long_position?.entry_fee || 0,
          exit_fee: history.long_position?.exit_fee || 0,
          leverage: history.leverage || 1,
          side: 'BUY',
          notional_value: (history.long_position?.quantity || 0) * (history.long_position?.entry_price || 0)
        },
        short_position: {
          symbol: history.short_position?.symbol || '',
          quantity: history.short_position?.quantity || 0,
          entry_price: history.short_position?.entry_price || 0,
          current_price: history.short_position?.exit_price || 0,
          exit_price: history.short_position?.exit_price || 0,
          pnl: history.short_position?.pnl || 0,
          pnl_percent: history.short_position?.pnl_percent || 0,
          entry_order_id: '',
          exit_order_id: '',
          entry_fee: history.short_position?.entry_fee || 0,
          exit_fee: history.short_position?.exit_fee || 0,
          leverage: history.leverage || 1,
          side: 'SELL',
          notional_value: (history.short_position?.quantity || 0) * (history.short_position?.entry_price || 0)
        },
        total_pnl_value: history.total_pnl || history.total_pnl_value || 0,
        total_ratio_percent: history.total_pnl_percent || history.total_ratio_percent || 0,
        total_fee: history.total_fee || 0,
        total_entry_fee: history.entry_fee || 
          (history.long_entry_fee != null && history.short_entry_fee != null ? 
            history.long_entry_fee + history.short_entry_fee : 0),
        total_exit_fee: history.exit_fee || 
          (history.long_exit_fee != null && history.short_exit_fee != null ? 
            history.long_exit_fee + history.short_exit_fee : 0),
        max_ratio: history.max_ratio || 0,
        min_ratio: history.min_ratio || 0,
        mae: history.mae || 0,
        mfe: history.mfe || 0,
        created_at: history.created_at || history.entry_time || new Date().toISOString(),
        updated_at: history.updated_at || history.entry_time || new Date().toISOString(),
        closed_at: history.closed_at || history.close_time || null,
        close_reason: history.close_reason || null
      };
      return trade;
    });
  }, [histories]);

  // 根據狀態和時間區間篩選交易
  const filteredTrades = useMemo(() => {
    // 合併活躍交易、已平倉交易和測試交易
    let allTrades = [...trades, ...testTrades];
    
    // 如果需要顯示已平倉交易，則添加交易歷史
    if (showClosedTrades || filterStatus === 'closed') {
      allTrades = [...allTrades, ...convertedHistories];
    }

    // 根據交易狀態過濾
    let filteredByStatus = allTrades;
    if (filterStatus === 'active') {
      filteredByStatus = allTrades.filter(trade => trade.status === 'active');
    } else if (filterStatus === 'closed') {
      filteredByStatus = allTrades.filter(trade => trade.status === 'closed');
      
      // 如果是已平倉狀態，進一步根據盈虧篩選
      if (closedSubFilter === 'profit') {
        filteredByStatus = filteredByStatus.filter(trade => (trade.total_pnl_value || 0) >= 0);
      } else if (closedSubFilter === 'loss') {
        filteredByStatus = filteredByStatus.filter(trade => (trade.total_pnl_value || 0) < 0);
      }
    }
    
    // 根據時間範圍過濾
    let result = filteredByStatus;
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let fromDate: Date;
      let toDate: Date = new Date(now);
      toDate.setHours(23, 59, 59, 999);
      
      switch (timeRange) {
        case 'today':
          fromDate = new Date(today);
          break;
        case '7days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 6);
          break;
        case '30days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 29);
          break;
        case '90days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 89);
          break;
        case '180days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 179);
          break;
        case 'current_month':
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'current_quarter':
          const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
          fromDate = new Date(now.getFullYear(), quarterStartMonth, 1);
          break;
        case 'custom':
          if (customStartDate && customEndDate) {
            fromDate = new Date(customStartDate);
            toDate = new Date(customEndDate);
            toDate.setHours(23, 59, 59, 999);
          } else {
            fromDate = new Date(0); // 如果沒有設定自定義日期，顯示所有
          }
          break;
        default:
          fromDate = new Date(0);
      }

      if (fromDate) {
      result = result.filter(trade => {
        const tradeDate = new Date(trade.created_at);
        return tradeDate >= fromDate && tradeDate <= toDate;
      });
      }
    }

    // 通知父組件更新總項目數
    if (onUpdateTotalItems) {
      onUpdateTotalItems(result.length);
    }
    
    return result;
  }, [trades, testTrades, convertedHistories, filterStatus, showClosedTrades, timeRange, customStartDate, customEndDate, onUpdateTotalItems, closedSubFilter]);

  // 獲取當前頁的數據
  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredTrades.slice(startIndex, endIndex);
  }, [filteredTrades, currentPage, itemsPerPage]);

  // 查看詳情
  const handleViewDetails = (id: string) => {
    setSelectedTradeForDetail(paginatedTrades.find(t => t.id === id) || null);
  };

  // 處理編輯按鈕點擊
  const handleEditClick = (trade: PairTrade) => {
    setSelectedTradeForEdit(trade);
    setEditTakeProfit(trade.take_profit.toString());
    setEditStopLoss(trade.stop_loss.toString());
    setEditTrailingStopEnabled(trade.trailing_stop_enabled || false);
    setEditTrailingStopLevel((trade.trailing_stop_level || 0).toString());
  };

  // 計算預期盈虧
  const calculateExpectedPnL = (percentage: number, type: 'take_profit' | 'stop_loss' | 'trailing_stop') => {
    if (!selectedTradeForEdit || !percentage) return null;
    
    const currentPnL = selectedTradeForEdit.total_pnl_value || 0;
    const currentRatio = selectedTradeForEdit.total_ratio_percent || 0;
    
    // 如果當前變動率為0，無法計算
    if (currentRatio === 0) return null;
    
    // 基於當前盈虧比例推算：目標盈虧 = 當前盈虧 × (目標% / 當前%)
    const expectedPnL = currentPnL * (percentage / currentRatio);
    
    switch (type) {
      case 'take_profit':
        return expectedPnL;
      case 'stop_loss':
        // 止損是負向的，所以取負值
        return -Math.abs(expectedPnL);
      case 'trailing_stop':
        return expectedPnL;
      default:
        return null;
    }
  };

  // 處理編輯提交
  const handleEditSubmit = async () => {
    if (!selectedTradeForEdit) return;
    
    setIsUpdating(true);
    try {
      await updatePairTradeSettings(selectedTradeForEdit.id, {
        take_profit: parseFloat(editTakeProfit),
        stop_loss: parseFloat(editStopLoss),
        trailing_stop_enabled: editTrailingStopEnabled,
        trailing_stop_level: parseFloat(editTrailingStopLevel)
      });

      // 重新獲取數據以確保同步
      await fetchTrades();
      setSelectedTradeForEdit(null);
      
      toast({
        title: "設定更新成功",
        description: "止盈止損設定已更新",
      });
    } catch (error) {
      console.error('更新設定失敗:', error);
      toast({
        title: "更新失敗",
        description: "無法更新止盈止損設定，請稍後再試",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // 平倉交易
  const handleClose = async (id: string) => {
    if (window.confirm('確定要平倉此交易嗎？')) {
      await closeTrade(id);
    }
  };

  // 交易卡片組件
  const TradeCard = ({ trade }: { trade: PairTrade }) => {
    
    const isClosed = trade.status === 'closed';
    const isProfit = (trade.total_pnl_value || 0) >= 0;
    
    const runningTime = useMemo(() => {
      return calculateRunningTime(trade.created_at, trade.closed_at);
    }, [trade.created_at, trade.closed_at]);

    return (
      <div 
        className={`group relative rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-md flex flex-col ${
          trade.status === 'active' 
            ? 'bg-[#11192B] border-blue-300 dark:border-blue-600 hover:bg-[#11192B]/80' 
            : 'bg-slate-100/80 dark:bg-slate-800/60 border-slate-300 dark:border-slate-600 hover:bg-slate-200/80 dark:hover:bg-slate-800/80'
        } ${isClosed ? 'opacity-85 hover:opacity-95' : ''}`}
        onClick={(e) => {
          // 防止點擊按鈕區域時觸發卡片點擊
          if ((e.target as HTMLElement).closest('.action-buttons')) {
            e.stopPropagation();
            return;
          }
          handleViewDetails(trade.id);
        }}
      >
        {/* 卡片內容區域 */}
        <div className="p-3 flex-1">
          {/* 第一行：交易名稱和狀態 */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <h3 className={`text-sm font-bold truncate transition-colors ${
                isClosed 
                  ? 'text-gray-600 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                  : 'text-gray-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400'
              }`}>{trade.name}</h3>
              
              {/* 盈虧指示小圓點 - 只在已平倉時顯示 */}
              {isClosed && (
                <div className={`w-2 h-2 rounded-full ${
                  isProfit ? 'bg-green-500' : 'bg-red-500'
                }`} title={isProfit ? '獲利交易' : '虧損交易'}></div>
              )}
            </div>
            <div className="flex items-center">
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium z-10 ${
                trade.status === 'active' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' 
                  : trade.status === 'closed'
                  ? 'bg-gray-100/80 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
              }`}>
                {trade.status === 'active' ? '持倉中' : 
                 trade.status === 'closed' ? '已平倉' : 
                 trade.status === 'pending' ? '等待中' : '未知'}
              </span>
              {trade.status === 'active' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(trade);
                  }}
                  className="ml-2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="編輯止盈止損"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="m18.5 2.5 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {/* 第二行：主要信息 - 左側損益，右側詳細信息 */}
          <div className="grid grid-cols-5 gap-2 mb-3">
            {/* 左側：未實現損益和變動率（手機60%，桌面佔3/5寬度）*/}
            <div className="col-span-3">
              {/* 未實現損益 */}
              <div className={`text-xs font-medium mb-1 ${
                isClosed 
                  ? (trade.total_pnl_value || 0) >= 0 
                    ? "text-green-600/80 dark:text-green-400/80" 
                    : "text-red-600/80 dark:text-red-400/80"
                  : (trade.total_pnl_value || 0) >= 0 
                    ? "text-green-700 dark:text-green-300" 
                    : "text-red-700 dark:text-red-300"
              }`}>
                {trade.status === 'active' ? '未實現盈虧' : '總收益'}
              </div>
              <div className={`font-bold mb-2 text-lg ${
                isClosed 
                  ? (trade.total_pnl_value || 0) >= 0 
                    ? "text-green-600/80 dark:text-green-400/80" 
                    : "text-red-600/80 dark:text-red-400/80"
                  : (trade.total_pnl_value || 0) >= 0 
                    ? "text-green-600 dark:text-green-400" 
                    : "text-red-600 dark:text-red-400"
              } ${
                Math.abs(trade.total_pnl_value || 0) >= 100000 ? 'text-sm' :
                Math.abs(trade.total_pnl_value || 0) >= 10000 ? 'text-base' : ''
              }`}>
                {(trade.total_pnl_value || 0).toFixed(2)} U
                  </div>
              
              {/* 變動率 */}
              <div className={`text-xs font-medium mb-1 ${
                isClosed 
                  ? (trade.total_ratio_percent || 0) >= 0 
                    ? "text-blue-600/80 dark:text-blue-400/80" 
                    : (trade.total_ratio_percent || 0) < -10 
                      ? "text-red-600/80 dark:text-red-400/80"
                      : "text-orange-600/80 dark:text-orange-400/80"
                  : (trade.total_ratio_percent || 0) >= 0 
                    ? "text-blue-700 dark:text-blue-300" 
                    : (trade.total_ratio_percent || 0) < -10 
                      ? "text-red-700 dark:text-red-300"
                      : "text-orange-700 dark:text-orange-300"
              }`}>
                變動率
                  </div>
              <div className={`text-base font-bold ${
                isClosed 
                  ? (trade.total_ratio_percent || 0) >= 0 
                    ? "text-blue-600/80 dark:text-blue-400/80" 
                    : (trade.total_ratio_percent || 0) < -10 
                      ? "text-red-600/80 dark:text-red-400/80"
                      : "text-orange-600/80 dark:text-orange-400/80"
                  : (trade.total_ratio_percent || 0) >= 0 
                    ? "text-blue-700 dark:text-blue-300" 
                    : (trade.total_ratio_percent || 0) < -10 
                      ? "text-red-700 dark:text-red-300"
                      : "text-orange-700 dark:text-orange-300"
              }`}>
                {(trade.total_ratio_percent || 0) >= 0 ? '+' : ''}{(trade.total_ratio_percent || 0).toFixed(2)}%
                  </div>
            </div>

            {/* 右側：詳細信息（手機40%，桌面佔2/5寬度）*/}
            <div className="col-span-2 space-y-1 text-xs">
              {/* 止盈 */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">止盈:</span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-green-500/80 dark:text-green-400/80' 
                    : 'text-green-600 dark:text-green-400'
                }`}>{trade.take_profit}%</span>
              </div>
              
              {/* 止損/停利保護 */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  {trade.trailing_stop_enabled ? '停利:' : '止損:'}
                </span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-red-500/80 dark:text-red-400/80' 
                    : trade.trailing_stop_enabled
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-red-600 dark:text-red-400'
                }`}>
                  {trade.trailing_stop_enabled 
                    ? `${trade.trailing_stop_level}%` 
                    : `${trade.stop_loss}%`
                  }
                </span>
              </div>
              
              {/* MFE */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">MFE:</span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-green-500/80 dark:text-green-400/80' 
                    : 'text-green-600 dark:text-green-400'
                }`}>{(trade.mfe || 0).toFixed(2)}%</span>
              </div>
              
              {/* MAE */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">MAE:</span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-red-500/80 dark:text-red-400/80' 
                    : 'text-red-600 dark:text-red-400'
                }`}>{(trade.mae || 0).toFixed(2)}%</span>
              </div>
              
              {/* 持倉時間 */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">持倉:</span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-gray-600 dark:text-gray-400' 
                    : 'text-gray-800 dark:text-gray-200'
                }`}>{runningTime}</span>
                </div>

              {/* 1R */}
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">1R:</span>
                <span className={`font-medium ${
                  isClosed 
                    ? 'text-gray-600 dark:text-gray-400' 
                    : 'text-gray-800 dark:text-gray-200'
                }`}>{(trade.max_loss || 0)} U</span>
                </div>
            </div>
          </div>
          
          {/* 多單和空單詳情 */}
          {trade.long_position && trade.short_position && (
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">            
              <div className="grid grid-cols-2 gap-2">
                {/* 多單詳情 */}
                <div className="p-2 rounded-md border" style={{ backgroundColor: '#1A274E', borderColor: '#2749AE' }}>
                  <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1 truncate">多單: {trade.long_position.symbol}</div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">入場價:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{typeof trade.long_position.entry_price === 'number' ? trade.long_position.entry_price.toString() : '-'}</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">當前價:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{typeof trade.long_position.current_price === 'number' ? trade.long_position.current_price.toString() : '-'}</span>
                  </div>
                  <div className="flex justify-between flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">槓桿:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{trade.long_position.leverage}x</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">數量:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{trade.long_position.quantity}</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">盈虧:</span>
                    <span className={`text-xs font-semibold text-right ${(trade.long_position.pnl || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      <div>{(trade.long_position.pnl || 0).toFixed(2)}</div>
                      <div className="text-[10px]">({(trade.long_position.pnl_percent || 0).toFixed(2)}%)</div>
                    </span>
                  </div>
                </div>
                
                {/* 空單詳情 */}
                <div className="p-2 rounded-md border" style={{ backgroundColor: '#351E2A', borderColor: '#8C2C22' }}>
                  <div className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1 truncate">空單: {trade.short_position.symbol}</div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">入場價:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{typeof trade.short_position.entry_price === 'number' ? trade.short_position.entry_price.toString() : '-'}</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">當前價:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{typeof trade.short_position.current_price === 'number' ? trade.short_position.current_price.toString() : '-'}</span>
                  </div>
                  <div className="flex justify-between flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">槓桿:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{trade.short_position.leverage}x</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">數量:</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{trade.short_position.quantity}</span>
                  </div>
                  <div className="flex justify-between mb-1 flex-wrap gap-x-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">盈虧:</span>
                    <span className={`text-xs font-semibold text-right ${(trade.short_position.pnl || 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      <div>{(trade.short_position.pnl || 0).toFixed(2)}</div>
                      <div className="text-[10px]">({(trade.short_position.pnl_percent || 0).toFixed(2)}%)</div>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {/* Stock Portfolio 風格的操作按鈕區域 */}
        <div className="action-buttons mt-auto border-t border-gray-200 dark:border-gray-700">
          {trade.status === 'active' ? (
            // 持倉中：雙層設計
            <div className="grid grid-cols-2 gap-0">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetails(trade.id);
                }}
                className="p-3 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200 border-r border-gray-200 dark:border-gray-700 flex items-center justify-center gap-1 group"
              >
                <span className="text-sm font-medium hidden sm:inline">詳情</span>
                <span className="text-xs font-medium sm:hidden">詳情</span>
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleClose(trade.id);
                }}
                className="p-3 text-center hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 rounded-br-lg text-red-600 flex items-center justify-center gap-1"
              >
                <span className="text-sm font-medium hidden sm:inline">平倉</span>
                <span className="text-xs font-medium sm:hidden">平倉</span>
              </button>
            </div>
          ) : (
            // 已平倉：單一按鈕
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleViewDetails(trade.id);
              }}
              className="w-full p-3 text-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-all duration-200 rounded-b-lg flex items-center justify-center gap-1 group"
            >
              <span className="text-sm font-medium hidden sm:inline">查看詳情</span>
              <span className="text-xs font-medium sm:hidden">詳情</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* 交易卡片區域 */}
      {isLoading && paginatedTrades.length === 0 ? (
        <div className="text-center py-8">載入中...</div>
      ) : paginatedTrades.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">暫無配對交易</p>
        </div>
      ) : (
        <div>
          {/* 顯示交易卡片 - 響應式網格佈局 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {/* 虛擬交易卡片 */}
            {paginatedTrades.map((trade, index) => (
              <TradeCard key={`virtual-${index}`} trade={trade} />
            ))}
          </div>
        </div>
      )}
      
      {/* 交易詳情模態框 */}
      <TradeDetailModal
        isOpen={selectedTradeForDetail !== null}
        onClose={() => setSelectedTradeForDetail(null)}
        trade={selectedTradeForDetail}
        type="pair-trade"
      />

      {/* 編輯止盈止損模態框 */}
      <Dialog open={selectedTradeForEdit !== null} onOpenChange={(open) => !open && setSelectedTradeForEdit(null)}>
        <DialogContent className="max-w-lg p-4 sm:p-6">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-lg sm:text-xl">編輯止盈止損設定</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">
              {selectedTradeForEdit && `交易: ${selectedTradeForEdit.name}`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2 sm:space-y-6 sm:py-4">
            {/* 當前盈虧和狀態顯示 */}
            {selectedTradeForEdit && (
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">當前變動率:</span>
                  <span className={`text-lg font-bold ${
                    (selectedTradeForEdit.total_ratio_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(selectedTradeForEdit.total_ratio_percent || 0) >= 0 ? '+' : ''}{(selectedTradeForEdit.total_ratio_percent || 0).toFixed(2)}%
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">當前盈虧:</span>
                  <span className={`text-lg font-bold ${
                    (selectedTradeForEdit.total_pnl_value || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {(selectedTradeForEdit.total_pnl_value || 0).toFixed(2)} USDT
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">狀態:</span>
                  <span className={`text-sm font-medium flex items-center gap-2 ${
                    selectedTradeForEdit.trailing_stop_enabled ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {selectedTradeForEdit.trailing_stop_enabled ? '🛡️ 停利保護中' : '🛡️ 止損模式'}
                    {selectedTradeForEdit.trailing_stop_enabled && (
                      <span className="text-xs">
                        (≤+{selectedTradeForEdit.trailing_stop_level}% 平倉)
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* 止盈設定 */}
            <div className="space-y-2">
              <Label htmlFor="take-profit">止盈 (%)</Label>
              <Input
                id="take-profit"
                type="number"
                step="0.1"
                value={editTakeProfit}
                onChange={(e) => setEditTakeProfit(e.target.value)}
                placeholder="輸入止盈百分比"
              />
              {editTakeProfit && parseFloat(editTakeProfit) > 0 && (
                <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  💰 觸發時預期盈利: {(() => {
                    const expectedPnL = calculateExpectedPnL(parseFloat(editTakeProfit), 'take_profit');
                    return expectedPnL !== null ? `+${expectedPnL.toFixed(2)} USDT` : '-';
                  })()}
                </div>
              )}
            </div>
            
            {/* 止損設定 */}
            <div className="space-y-2">
              <Label htmlFor="stop-loss">止損 (%) - 虧損時</Label>
              <Input
                id="stop-loss"
                type="number"
                step="0.1"
                value={editStopLoss}
                onChange={(e) => setEditStopLoss(e.target.value)}
                placeholder="輸入止損百分比"
              />
              {editStopLoss && parseFloat(editStopLoss) > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                  💸 觸發時預期虧損: {(() => {
                    const expectedPnL = calculateExpectedPnL(parseFloat(editStopLoss), 'stop_loss');
                    return expectedPnL !== null ? `${expectedPnL.toFixed(2)} USDT` : '-';
                  })()}
                </div>
              )}
            </div>

            {/* 停利保護設定 */}
            <div className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="trailing-stop"
                  checked={editTrailingStopEnabled}
                  onCheckedChange={(checked) => setEditTrailingStopEnabled(checked as boolean)}
                />
                <Label htmlFor="trailing-stop" className="text-sm font-medium">
                  啟用停利保護
                </Label>
              </div>
              
              {editTrailingStopEnabled && (
                                  <div className="space-y-2 ml-6">
                    <Label htmlFor="trailing-stop-level" className="text-sm">停利 (%) - 獲利時</Label>
                    <Input
                      id="trailing-stop-level"
                      type="number"
                      step="0.1"
                      value={editTrailingStopLevel}
                      onChange={(e) => setEditTrailingStopLevel(e.target.value)}
                      placeholder="輸入停利百分比"
                    />
                    {editTrailingStopLevel && parseFloat(editTrailingStopLevel) > 0 && (
                      <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                        🛡️ 觸發時預期保護: {(() => {
                          const expectedPnL = calculateExpectedPnL(parseFloat(editTrailingStopLevel), 'trailing_stop');
                          return expectedPnL !== null ? `+${expectedPnL.toFixed(2)} USDT` : '-';
                        })()}
                      </div>
                    )}
                    <p className="text-xs text-gray-500">
                      當盈虧跌破此水位時將自動平倉，保護既有獲利
                    </p>
                  </div>
              )}
            </div>
          </div>
          
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setSelectedTradeForEdit(null)} className="text-sm sm:text-base">
              取消
            </Button>
            <Button onClick={handleEditSubmit} disabled={isUpdating} className="text-sm sm:text-base">
              {isUpdating ? '更新中...' : '確認更新'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}