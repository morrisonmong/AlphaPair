'use client';

import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';
import { formatDateTime } from '@/lib/utils';
import { 
  deleteTradeHistory, 
  batchDeleteTradeHistory,
  type TradeHistory,
  type TradeHistoryBackwardCompatible 
} from '@/lib/api/trade-history';
import { toast } from 'sonner';
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStartDateByTimeRange } from '@/lib/utils/date'; // 導入輔助函數
import { ImportDialog } from '@/components/trade-history/ImportDialog';
import { ExportDialog } from '@/components/trade-history/ExportDialog';
import { SimpleDateRangePicker, type DateRange } from '@/components/shared/SimpleDateRangePicker';
import { TradeDetailModal } from '@/components/shared/TradeDetailModal';

// 定義時間範圍類型，與其他頁面保持一致
type TimeRange = 'all' | 'today' | '7days' | '30days' | '90days' | '180days' | 'month' | 'quarter' | 'custom';



// 簡單的表格備用UI組件
const TableFallback = () => (
  <div className="flex flex-col items-center justify-center h-full p-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
    <p className="text-lg text-red-700 dark:text-red-300 mb-2">表格載入失敗</p>
    <p className="text-sm text-red-600 dark:text-red-400 mb-4">可能是資料格式問題或處理錯誤</p>
    <Button 
      variant="destructive" 
      onClick={() => window.location.reload()}
    >
      重新載入頁面
    </Button>
  </div>
);

// 獲取時間範圍的日期字符串
const getTimeRangeDates = (range: TimeRange, customDateRange?: DateRange): string => {
  const now = new Date();
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });

  switch (range) {
    case 'today':
      return formatDate(now);
    case '7days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 7);
      return `${formatDate(start)} - ${formatDate(now)}`;
    }
    case '30days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 30);
      return `${formatDate(start)} - ${formatDate(now)}`;
    }
    case '90days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 90);
      return `${formatDate(start)} - ${formatDate(now)}`;
    }
    case '180days': {
      const start = new Date(now);
      start.setDate(now.getDate() - 180);
      return `${formatDate(start)} - ${formatDate(now)}`;
    }
    case 'month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return `${formatDate(start)} - ${formatDate(end)}`;
    }
    case 'quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return `${formatDate(start)} - ${formatDate(end)}`;
    }
    case 'custom':
      if (customDateRange?.from) {
        if (customDateRange.to) {
          return `${formatDate(customDateRange.from)} - ${formatDate(customDateRange.to)}`;
        } else {
          return `${formatDate(customDateRange.from)} - Now`;
        }
      }
      return 'Select Date Range';
    case 'all':
    default:
      return 'All Time';
  }
};

function TradeHistoryPage() {
  const { histories, fetchHistories } = useTradeHistoryStore();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [timeRange, setTimeRange] = useState<TimeRange>('30days'); // 改為 timeRange，默認30天
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
  const [filteredAndSortedHistories, setFilteredAndSortedHistories] = useState(histories);
  const [visibleColumns] = useState(['tradeName', 'closeReason', 'netPnl', 'netPnlAfterFee', 'duration', 'maxLoss', 'stopCondition', 'expectedRiskReward', 'pnlDetails', 'volatility', 'openTime', 'closeTime', 'action']);
  // setVisibleColumns 預留給未來的列顯示控制功能
  const [selectedTrade, setSelectedTrade] = useState<TradeHistoryBackwardCompatible | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc' | 'desc'}>({
    key: 'created_at',
    direction: 'desc'
  });
  const [includeFees, setIncludeFees] = useState(true);
  const [showOnlyR, setShowOnlyR] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tradeToDelete, setTradeToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // 批量刪除相關狀態
  const [selectedTrades, setSelectedTrades] = useState<Set<string>>(new Set());
  const [batchDeleteConfirmOpen, setBatchDeleteConfirmOpen] = useState(false);
  const [isBatchDeleting, setIsBatchDeleting] = useState(false);
  
  // 選取模式狀態
  const [isInSelectionMode, setIsInSelectionMode] = useState(false);

  // 分頁相關狀態
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  // 應用自訂日期範圍
  const applyCustomDateRange = () => {
    // 確保 timeRange 保持為 custom
    setTimeRange('custom');
    toast.success('自訂日期範圍已套用');
  };

  // 處理時間範圍變更
  const handleTimeRangeChange = (value: string) => {
    const newTimeRange = value as TimeRange;
    
    if (newTimeRange === 'custom') {
      // 當選擇 custom 時，總是打開日期選擇器（即使已經是 custom 狀態）
      setTimeRange('custom');
      setIsCustomDatePickerOpen(true);
    } else {
      // 當切換到非自訂時間範圍時，清除日期範圍並關閉日期選擇器
      setTimeRange(newTimeRange);
      setDateRange(undefined);
      setIsCustomDatePickerOpen(false);
    }
  };

  // Effect to fetch data when time filter changes
  useEffect(() => {
    const loadHistories = async () => {
      let startDateStr: string | undefined = undefined;
      let endDateStr: string | undefined = undefined;
      const now = new Date();

      if (timeRange === 'custom' && dateRange?.from) {
        startDateStr = dateRange.from.toISOString();
        // Adjust end date to the end of the selected day
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          endDateStr = endOfDay.toISOString();
        } else {
          // If only start date is selected, set end date to now
           endDateStr = now.toISOString(); 
        }
      } else if (timeRange !== 'all' && timeRange !== 'custom') {
        // Calculate start date based on tab, end date is now
        const startDate = getStartDateByTimeRange(now, timeRange);
        if (startDate) { // 確保 getStartDateByTimeRange 返回有效日期
          startDateStr = startDate.toISOString();
          endDateStr = now.toISOString();
        } else {
          // If startDate is undefined (e.g. for 'all' or error in getStartDateByTimeRange for other specific tabs)
          // startDateStr and endDateStr will remain undefined, thus fetching all data.
          console.warn(`[TradeHistoryPage] getStartDateByTimeRange returned undefined for tab: ${timeRange}. Fetching all data.`);
        }
      }
      // If timeRange is 'all', startDateStr and endDateStr remain undefined
      // to fetch all history from the backend.


      // Optional: Add a loading state here, e.g., setIsLoading(true);
      try {
        await fetchHistories(startDateStr, endDateStr); // Pass dates to store action

      } catch (error) {
        console.error('[TradeHistoryPage] Error during fetchHistories call:', error);
        toast.error('獲取交易歷史記錄失敗，請檢查網絡或稍後再試。');
      } finally {
        // Optional: Reset loading state here, e.g., setIsLoading(false);
      }
    };

    loadHistories();

  }, [timeRange, dateRange, fetchHistories]); // Trigger fetch when tab or dateRange changes


  // Effect to sort histories whenever the raw histories from store or sortConfig changes
  useEffect(() => {
    if (!histories) {
      setFilteredAndSortedHistories([]);
      return;
    }



    // Data is already filtered by time in the backend.
    // We only need to sort here.
    const sorted = [...histories].sort((a, b) => {
      // Sorting logic (same as before)
      if (!a.closed_at && b.closed_at) return -1;
      if (a.closed_at && !b.closed_at) return 1;
      
      let keyToUse = sortConfig.key;
      // Handle specific date sorting keys
      if (sortConfig.key === 'openTime') keyToUse = 'created_at';
      if (sortConfig.key === 'closeTime') keyToUse = 'closed_at';
      
      if (keyToUse === 'created_at' || keyToUse === 'closed_at') {
         const dateA = a[keyToUse as keyof TradeHistory] ? new Date(a[keyToUse as keyof TradeHistory] as string) : new Date(0); // Default to epoch if null
         const dateB = b[keyToUse as keyof TradeHistory] ? new Date(b[keyToUse as keyof TradeHistory] as string) : new Date(0);
         // Handle potential invalid dates although backend data should be clean
         if (!isNaN(dateA.getTime()) && !isNaN(dateB.getTime())) {
            return sortConfig.direction === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
         }
         return 0; // Fallback for invalid dates
      }
      
      const aValue = a[keyToUse as keyof TradeHistoryBackwardCompatible];
      const bValue = b[keyToUse as keyof TradeHistoryBackwardCompatible];
      
      // Handle undefined values
      if (aValue === undefined || aValue === null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (bValue === undefined || bValue === null) return sortConfig.direction === 'asc' ? -1 : 1;
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortConfig.direction === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      // Fallback comparison if types are mixed or unknown
      return 0;
    });


    setFilteredAndSortedHistories(sorted);
    setCurrentPage(1); // Reset page to 1 after sorting/filtering

  }, [histories, sortConfig]); // Depend only on raw histories and sort config


  // Recalculate pagination based on the final sorted/filtered list
  const totalFilteredPages = Math.ceil(filteredAndSortedHistories.length / itemsPerPage);
  const currentPaginatedHistories = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      return filteredAndSortedHistories.slice(startIndex, endIndex);
  }, [filteredAndSortedHistories, currentPage, itemsPerPage]);

  // 處理查看詳情按鈕點擊
  const handleViewDetails = (id: string) => {
    // 查找對應的交易記錄
    const trade = histories.find(h => h.id === id);
    if (trade) {
      setSelectedTrade(trade);
      setIsDetailOpen(true);
    }
  };

  // 計算總體統計數據
  const stats = useMemo(() => {
    return filteredAndSortedHistories.reduce(
    (acc, history) => {
        // 只計算已平倉的交易
        if (history.closed_at) {
          acc.totalTrades += 1;
        
          // 根據是否考慮手續費選擇使用總盈虧或淨盈虧
          const pnl = includeFees 
            ? (history.net_pnl || history.total_pnl - (history.total_fee || 0)) 
            : (history.total_pnl || 0);
          acc.totalPnl += pnl;
          
          // 計算R值
          const rValue = includeFees 
            ? (history.net_risk_reward_ratio || 0) 
            : (history.risk_reward_ratio || 0);
          acc.totalRiskReward += rValue;
        
          // 直接根據平倉原因來計算勝敗
          if (history.close_reason === 'take_profit') {
            acc.winTrades += 1;
            acc.totalWin += pnl;
            acc.totalWinR += rValue;
          } else if (history.close_reason === 'stop_loss') {
            acc.lossTrades += 1;
            acc.totalLoss += pnl;
            acc.totalLossR += rValue;
            acc.stopLossTrades += 1;
          } else {
            // 手動平倉或其他原因，根據盈虧判斷
            if (pnl > 0) {
              acc.winTrades += 1;
              acc.totalWin += pnl;
              acc.totalWinR += rValue;
            } else if (pnl < 0) {
              acc.lossTrades += 1;
              acc.totalLoss += pnl;
              acc.totalLossR += rValue;
            }
          }
        
          // 計算總手續費
          const totalFee = history.total_fee || 0;
          acc.totalFees += totalFee;
          
          // 計算總手續費的R值
          if (history.max_loss && history.max_loss !== 0) {
            acc.totalFeesR += totalFee / history.max_loss;
          }
        }
      
      return acc;
    },
    { 
      totalTrades: 0, 
      winTrades: 0, 
      lossTrades: 0, 
      stopLossTrades: 0,
      totalPnl: 0, 
      totalWin: 0, 
      totalLoss: 0,
      totalRiskReward: 0,
      totalWinR: 0,
      totalLossR: 0,
        totalFees: 0,
        totalFeesR: 0
    }
  );
  }, [filteredAndSortedHistories, includeFees]);
  
  const winRate = stats.totalTrades > 0 ? (stats.winTrades / stats.totalTrades * 100).toFixed(2) : '0.00';
  const profitFactor = Math.abs(stats.totalLoss) > 0 ? (stats.totalWin / Math.abs(stats.totalLoss)).toFixed(2) : '∞';
  
  // 修正平均盈虧比R的計算
  const avgRiskRewardRatio = (() => {
    // 確保有勝利和虧損的交易
    if (stats.winTrades <= 0 || stats.lossTrades <= 0) return '0.00';
    
    // 計算平均盈利R和平均虧損R
    const avgWinR = stats.totalWinR / stats.winTrades;
    const avgLossR = Math.abs(stats.totalLossR / stats.lossTrades);
    
    // 避免除以零
    if (avgLossR === 0) return '∞';
    
    return (avgWinR / avgLossR).toFixed(2);
  })();


  // 處理刪除交易記錄
  const handleDeleteTrade = async (id: string) => {
    setTradeToDelete(id);
    setDeleteConfirmOpen(true);
  };

  // 確認刪除單筆記錄
  const confirmDelete = async () => {
    if (!tradeToDelete) return;
    
    setIsDeleting(true);
    try {
      const success = await deleteTradeHistory(tradeToDelete);
      
      if (success) {
        // Re-fetch with current date range after successful delete
        let startDateStr: string | undefined = undefined;
        let endDateStr: string | undefined = undefined;
        const now = new Date();
        if (timeRange === 'custom' && dateRange?.from) {
            startDateStr = dateRange.from.toISOString();
            if (dateRange.to) {
                const endOfDay = new Date(dateRange.to);
                endOfDay.setHours(23, 59, 59, 999);
                endDateStr = endOfDay.toISOString();
            } else {
                endDateStr = now.toISOString(); 
            }
        } else if (timeRange !== 'all' && timeRange !== 'custom') {
            const startDate = getStartDateByTimeRange(now, timeRange);
            if (startDate) {
              startDateStr = startDate.toISOString();
              endDateStr = now.toISOString();
            }
        }
        await fetchHistories(startDateStr, endDateStr);

        setDeleteConfirmOpen(false);
        setTradeToDelete(null);
        toast.success('交易記錄已成功刪除');
      } else {
        throw new Error('刪除失敗');
      }
    } catch (error) {
      console.error('刪除交易記錄時發生錯誤:', error);
      toast.error('刪除交易記錄失敗，請稍後再試。');
    } finally {
      setIsDeleting(false);
    }
  };

  // 處理批量刪除
  const handleBatchDelete = () => {
    if (selectedTrades.size === 0) {
      toast.error('請先選擇要刪除的記錄');
      return;
    }
    setBatchDeleteConfirmOpen(true);
  };

  // 處理全選/取消全選
  const handleSelectAll = () => {
    if (selectedTrades.size === currentPaginatedHistories.length) {
      // 如果當前頁面全部選中，則取消全選
      setSelectedTrades(new Set());
    } else {
      // 否則選中當前頁面所有項目
      const newSelected = new Set(currentPaginatedHistories.map(h => h.id));
      setSelectedTrades(newSelected);
    }
  };

  // 處理單個項目選擇
  const handleSelectTrade = (id: string) => {
    const newSelected = new Set(selectedTrades);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTrades(newSelected);
  };

  // 切換選取模式
  const toggleSelectionMode = () => {
    setIsInSelectionMode(prev => {
      // 如果從 true -> false (退出模式)，則清空已選項
      if (prev) {
        setSelectedTrades(new Set());
      }
      return !prev;
    });
  };

  // 確認批量刪除
  const confirmBatchDelete = async () => {
    if (selectedTrades.size === 0) return;
    
    setIsBatchDeleting(true);
    try {
      const result = await batchDeleteTradeHistory(Array.from(selectedTrades));
      
      if (result.successful_deletes > 0) {
        // 重新獲取數據
        let startDateStr: string | undefined = undefined;
        let endDateStr: string | undefined = undefined;
        const now = new Date();
        if (timeRange === 'custom' && dateRange?.from) {
            startDateStr = dateRange.from.toISOString();
            if (dateRange.to) {
                const endOfDay = new Date(dateRange.to);
                endOfDay.setHours(23, 59, 59, 999);
                endDateStr = endOfDay.toISOString();
            } else {
                endDateStr = now.toISOString(); 
            }
        } else if (timeRange !== 'all' && timeRange !== 'custom') {
            const startDate = getStartDateByTimeRange(now, timeRange);
            if (startDate) {
              startDateStr = startDate.toISOString();
              endDateStr = now.toISOString();
            }
        }
        await fetchHistories(startDateStr, endDateStr);

        setBatchDeleteConfirmOpen(false);
        setSelectedTrades(new Set());
        
        if (result.failed_deletes > 0) {
          toast.warning(`批量刪除完成：成功 ${result.successful_deletes} 筆，失敗 ${result.failed_deletes} 筆`);
        } else {
          toast.success(`成功刪除 ${result.successful_deletes} 筆交易記錄`);
        }
      } else {
        toast.error('批量刪除失敗，請稍後再試');
      }
    } catch (error) {
      console.error('批量刪除交易記錄時發生錯誤:', error);
      toast.error('批量刪除失敗，請稍後再試。');
    } finally {
      setIsBatchDeleting(false);
    }
  };

  // 處理導入成功後的刷新
  const handleImportSuccess = async () => {
    // 重新獲取交易歷史數據
    let startDateStr: string | undefined = undefined;
    let endDateStr: string | undefined = undefined;
    const now = new Date();
    
    if (timeRange === 'custom' && dateRange?.from) {
      startDateStr = dateRange.from.toISOString();
      if (dateRange.to) {
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        endDateStr = endOfDay.toISOString();
      } else {
        endDateStr = now.toISOString(); 
      }
    } else if (timeRange !== 'all' && timeRange !== 'custom') {
      const startDate = getStartDateByTimeRange(now, timeRange);
      if (startDate) {
        startDateStr = startDate.toISOString();
        endDateStr = now.toISOString();
      }
    }
    
    await fetchHistories(startDateStr, endDateStr);
  };

  // 處理頁碼變更
  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalFilteredPages) {
      setCurrentPage(page);
    }
  };

  // 處理每頁筆數變更
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1); // 重置到第一頁
  };

  // 生成頁碼按鈕
  const renderPaginationButtons = (): React.ReactNode[] => {
    const buttons: React.ReactNode[] = [];
    const maxButtonsToShow = 5; // 最多顯示的頁碼按鈕數量
    
    if (totalFilteredPages <= 1) return buttons;
    
    // 始終顯示第一頁
    buttons.push(
      <Button
        key="first"
        variant={currentPage === 1 ? "default" : "outline"}
        size="sm"
        onClick={() => handlePageChange(1)}
        className={currentPage === 1 
          ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-700" 
          : "bg-transparent border-gray-700 hover:bg-gray-800"}
      >
        1
      </Button>
    );
    
    const startPage = Math.max(2, currentPage - Math.floor(maxButtonsToShow / 2));
    const endPage = Math.min(totalFilteredPages - 1, startPage + maxButtonsToShow - 3);
    
    // 如果當前頁與第一頁之間有間隔，顯示省略號
    if (startPage > 2) {
      buttons.push(
        <span key="ellipsis1" className="px-2 text-gray-500">
          ...
        </span>
      );
    }
    
    // 顯示中間的頁碼
    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <Button
          key={i}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(i)}
          className={currentPage === i 
            ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-700" 
            : "bg-transparent border-gray-700 hover:bg-gray-800"}
        >
          {i}
        </Button>
      );
    }
    
    // 如果尾頁與最後顯示的頁碼之間有間隔，顯示省略號
    if (endPage < totalFilteredPages - 1) {
      buttons.push(
        <span key="ellipsis2" className="px-2 text-gray-500">
          ...
        </span>
      );
    }
    
    // 如果總頁數大於1，顯示最後一頁
    if (totalFilteredPages > 1) {
      buttons.push(
        <Button
          key="last"
          variant={currentPage === totalFilteredPages ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(totalFilteredPages)}
          className={currentPage === totalFilteredPages 
            ? "bg-blue-600 text-white hover:bg-blue-700 border-blue-700" 
            : "bg-transparent border-gray-700 hover:bg-gray-800"}
        >
          {totalFilteredPages}
        </Button>
      );
    }
    
    return buttons;
  };

  return (
    <div className="container mx-auto p-2 md:p-4 max-w-[98%] md:max-w-[95%]">    
      {/* 超緊湊工具欄設計 */}
      <div className="space-y-3 mb-4">
        {/* 桌面版：兩個橫向區塊 */}
        <div className="hidden lg:flex items-center gap-4">
          {/* 功能與設定區塊 */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg backdrop-blur-sm">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsImportDialogOpen(true)}
              className="flex items-center gap-2 bg-blue-500/10 border-blue-500/30 text-blue-500 hover:bg-blue-500/20 hover:text-blue-600 transition-all h-8"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              匯入
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsExportDialogOpen(true)}
              disabled={filteredAndSortedHistories.length === 0}
              className="flex items-center gap-2 bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20 hover:text-green-600 transition-all h-8 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              匯出
            </Button>
            
            <div className="h-6 w-px bg-gray-600"></div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch 
                  id="fee-switch"
                  checked={includeFees} 
                  onCheckedChange={setIncludeFees}
                  className={includeFees ? "bg-green-500" : ""} 
                />
                <Label htmlFor="fee-switch" className="text-sm font-medium whitespace-nowrap">
                  手續費
                  <div className="relative ml-1 group inline-block">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                      <path d="M12 17h.01"></path>
                    </svg>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                      開啟：使用淨盈虧和淨風險收益比（扣除手續費）<br/>
                      關閉：使用總盈虧和風險收益比（不扣除手續費）
                    </div>
                  </div>
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Switch 
                  id="r-only-switch"
                  checked={showOnlyR} 
                  onCheckedChange={setShowOnlyR}
                  className={showOnlyR ? "bg-blue-500" : ""} 
                />
                <Label htmlFor="r-only-switch" className="text-sm font-medium whitespace-nowrap">
                  R值
                  <div className="relative ml-1 group inline-block">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                      <path d="M12 17h.01"></path>
                    </svg>
                    <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                      開啟：僅顯示R值統計數據<br/>
                      關閉：同時顯示金額和R值
                    </div>
                  </div>
                </Label>
              </div>
            </div>
          </div>
          
          {/* 時間篩選區塊 */}
          <div className="flex items-center gap-3 p-3 bg-gray-800/30 border border-gray-700 rounded-lg flex-1">
            <Tabs value={timeRange} onValueChange={handleTimeRangeChange} className="flex-1">
              <TabsList className="bg-background/50 h-8 grid grid-cols-9 gap-1">
                <TabsTrigger value="all" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">All</TabsTrigger>
                <TabsTrigger value="today" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Today</TabsTrigger>
                <TabsTrigger value="7days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">7D</TabsTrigger>
                <TabsTrigger value="30days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">30D</TabsTrigger>
                <TabsTrigger value="90days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">90D</TabsTrigger>
                <TabsTrigger value="180days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">180D</TabsTrigger>
                <TabsTrigger value="month" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Month</TabsTrigger>
                <TabsTrigger value="quarter" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Quarter</TabsTrigger>
                <TabsTrigger 
                  value="custom" 
                  className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  onClick={() => {
                    // 如果已經是 custom 狀態，直接打開對話框
                    if (timeRange === 'custom') {
                      setIsCustomDatePickerOpen(true);
                    }
                  }}
                >
                  Custom
                </TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Badge variant="outline" className="text-xs whitespace-nowrap ml-2">
              {getTimeRangeDates(timeRange, dateRange)}
            </Badge>
          </div>
        </div>
        
        {/* 手機版：緊湊工具欄 */}
        <div className="lg:hidden space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
            <div className="flex items-center gap-3 flex-1">
              <div className="flex items-center gap-2">
                <Switch 
                  id="fee-switch-mobile"
                  checked={includeFees} 
                  onCheckedChange={setIncludeFees}
                  className={includeFees ? "bg-green-500" : ""} 
                />
                <Label htmlFor="fee-switch-mobile" className="text-sm font-medium whitespace-nowrap">
                  手續費
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Switch 
                  id="r-only-switch-mobile"
                  checked={showOnlyR} 
                  onCheckedChange={setShowOnlyR}
                  className={showOnlyR ? "bg-blue-500" : ""} 
                />
                <Label htmlFor="r-only-switch-mobile" className="text-sm font-medium whitespace-nowrap">
                  R值
                </Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-800/30 border border-gray-700 rounded-lg">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">Time:</span>
            <Select 
              value={timeRange} 
              onValueChange={(value) => {
                // 如果選擇的是 custom，無論當前狀態如何都處理
                if (value === 'custom') {
                  if (timeRange === 'custom') {
                    // 如果已經是 custom 狀態，直接打開對話框
                    setIsCustomDatePickerOpen(true);
                  } else {
                    // 如果不是 custom 狀態，先設置狀態再打開對話框
                    handleTimeRangeChange(value);
                  }
                } else {
                  handleTimeRangeChange(value);
                }
              }}
            >
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="7days">7D</SelectItem>
                <SelectItem value="30days">30D</SelectItem>
                <SelectItem value="90days">90D</SelectItem>
                <SelectItem value="180days">180D</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

          </div>
        </div>
        
        {/* 簡單日期範圍選擇器 */}
        <SimpleDateRangePicker
          isOpen={isCustomDatePickerOpen}
          onClose={() => {
            setIsCustomDatePickerOpen(false);
            // 如果沒有完整的日期範圍，切回 30D
            if (!dateRange?.from || !dateRange?.to) {
              setTimeRange('30days');
            }
            // 如果有完整的日期範圍，保持 custom 狀態
          }}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onApply={() => {
            applyCustomDateRange();
            setIsCustomDatePickerOpen(false);
          }}
        />
      </div>
      
      {/* 列表控制區 - 桌面版 */}      
      {/* 錯誤邊界和統計卡片 */}
      <ErrorBoundary fallback={<TableFallback />}>
        {/* 手機版統計卡片 - 3個大卡片 */}
        <div className="md:hidden grid grid-cols-1 gap-4 mb-6">
          {/* 核心績效卡片 */}
          <Card className="bg-gradient-to-br from-blue-600/20 via-blue-500/15 to-indigo-600/25 border-blue-600/40 backdrop-blur-md shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-300">
                    <path d="M3 3v18h18"/>
                    <path d="m19 9-5 5-4-4-3 3"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-blue-200">Core Performance</h3>
                  <p className="text-xs text-blue-300/70">Win Rate & Total P&L</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-400/20">
                  <div className="text-xs text-blue-300/80 mb-1">Win Rate</div>
                  <div className={`text-xl font-bold ${Number(winRate) >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                    {winRate}%
                  </div>
                  <div className="text-xs text-blue-300/60 mt-1">
                    {stats.winTrades}W / {stats.lossTrades}L
                  </div>
                </div>
                
                <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-400/20">
                  <div className="text-xs text-blue-300/80 mb-1">{includeFees ? "Net P&L" : "Total P&L"}</div>
                  <div className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {showOnlyR ? stats.totalRiskReward.toFixed(2) + ' R' : `${stats.totalPnl.toFixed(2)} U`}
                  </div>
                  {!showOnlyR && (
                    <div className={`text-xs mt-1 ${stats.totalRiskReward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {stats.totalRiskReward.toFixed(2)} R
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 交易分析卡片 */}
          <Card className="bg-gradient-to-br from-green-600/20 via-green-500/15 to-emerald-600/25 border-green-600/40 backdrop-blur-md shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-300">
                    <path d="M12 2v20"/>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-green-200">Trade Analysis</h3>
                  <p className="text-xs text-green-300/70">Profit Factor & Risk Reward</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-400/20">
                  <div className="text-xs text-green-300/80 mb-1">Profit Factor</div>
                  <div className={`text-xl font-bold ${Number(profitFactor) >= 1 ? 'text-green-400' : 'text-red-400'}`}>
                    {showOnlyR 
                      ? (Math.abs(stats.totalLossR) > 0 ? (stats.totalWinR / Math.abs(stats.totalLossR)).toFixed(2) : '∞')
                      : profitFactor
                    }
                  </div>
                  <div className="text-xs text-green-300/60 mt-1">
                    {Math.abs(stats.totalWin) > 0 && Math.abs(stats.totalLoss) > 0 
                      ? showOnlyR
                        ? `${Math.abs(stats.totalWinR).toFixed(1)}/${Math.abs(stats.totalLossR).toFixed(1)}`
                        : `${Math.abs(stats.totalWin).toFixed(0)}/${Math.abs(stats.totalLoss).toFixed(0)}`
                      : '-'}
                  </div>
                </div>
                
                <div className="bg-green-500/10 rounded-lg p-3 border border-green-400/20">
                  <div className="text-xs text-green-300/80 mb-1">Avg Risk Reward</div>
                  <div className="text-xl font-bold text-green-400">
                    {showOnlyR 
                      ? avgRiskRewardRatio + ' R'
                      : (stats.winTrades > 0 && stats.lossTrades > 0 
                        ? `${(Math.abs(stats.totalWin / stats.winTrades) / Math.abs(stats.totalLoss / stats.lossTrades)).toFixed(2)}`
                        : '0.00')
                    }
                  </div>
                  {!showOnlyR && <div className="text-xs text-green-400 mt-1">{avgRiskRewardRatio} R</div>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 費用與統計卡片 */}
          <Card className="bg-gradient-to-br from-amber-600/20 via-amber-500/15 to-orange-600/25 border-amber-600/40 backdrop-blur-md shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-300">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M16 8l-4 4-2-2-4 4"/>
                    <path d="M16 8h-6v6"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-200">Costs & Stats</h3>
                  <p className="text-xs text-amber-300/70">Fees & Average Performance</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-400/20">
                  <div className="text-xs text-amber-300/80 mb-1">Total Fees</div>
                  <div className="text-xl font-bold text-amber-400">
                    {showOnlyR ? stats.totalFeesR.toFixed(2) + ' R' : stats.totalFees.toFixed(2) + ' U'}
                  </div>
                  {!showOnlyR && (
                    <div className="text-xs text-amber-400 mt-1">
                      {stats.totalFeesR.toFixed(2)} R
                    </div>
                  )}
                </div>
                
                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-400/20">
                  <div className="text-xs text-amber-300/80 mb-1">Avg {includeFees ? "Net" : "Total"} P&L</div>
                  <div className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {showOnlyR 
                      ? (stats.totalTrades > 0 ? (stats.totalRiskReward / stats.totalTrades).toFixed(2) : '0.00') + ' R'
                      : `${stats.totalTrades > 0 ? (stats.totalPnl / stats.totalTrades).toFixed(2) : '0.00'} U`
                    }
                  </div>
                  {!showOnlyR && (
                    <div className={`text-xs mt-1 ${stats.totalRiskReward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {stats.totalTrades > 0 ? (stats.totalRiskReward / stats.totalTrades).toFixed(2) : '0.00'} R
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 桌面版統計卡片 - 保持原有的8個卡片佈局 */}
        <div className="hidden md:grid grid-cols-8 gap-2 mb-6">
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                勝率
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    勝率 = 獲利交易數 / 總交易數 × 100%
                  </div>
                </div>
              </div>
              <div className={`text-xl font-bold ${Number(winRate) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {winRate}%
              </div>
              <div className="flex justify-between mt-1">
                <div>
                  <div className="text-xs text-gray-400">總交易</div>
                  <div className="text-sm">{stats.totalTrades}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400">勝/敗</div>
                  <div className="text-sm">
                    <span className="text-green-500">{stats.winTrades}</span>
                    <span>/</span>
                    <span className="text-red-500">{stats.lossTrades}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                {includeFees ? "淨盈虧" : "總盈虧"}
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    {includeFees ? "所有交易的盈虧總和（已扣除手續費）" : "所有交易的盈虧總和（未扣除手續費）"}
                  </div>
                </div>
              </div>
              <div className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {showOnlyR ? stats.totalRiskReward.toFixed(2) + ' R' : `${stats.totalPnl.toFixed(2)} U`}
              </div>
              {!showOnlyR && (
                <div className={`text-sm ${stats.totalRiskReward >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stats.totalRiskReward.toFixed(2)} R
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                {includeFees ? "平均淨盈虧" : "平均總盈虧"}
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    {includeFees ? "淨盈虧 / 總交易數" : "總盈虧 / 總交易數"}
                  </div>
                </div>
              </div>
              <div className={`text-xl font-bold ${stats.totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {showOnlyR 
                  ? (stats.totalTrades > 0 ? (stats.totalRiskReward / stats.totalTrades).toFixed(2) : '0.00') + ' R'
                  : `${stats.totalTrades > 0 ? (stats.totalPnl / stats.totalTrades).toFixed(2) : '0.00'} U`
                }
              </div>
              {!showOnlyR && (
                <div className={`text-sm ${stats.totalRiskReward >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stats.totalTrades > 0 ? (stats.totalRiskReward / stats.totalTrades).toFixed(2) : '0.00'} R
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                獲利因子
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    總獲利 / 總虧損的絕對值<br/>
                    大於1表示系統有盈利能力
                  </div>
                </div>
              </div>
              <div className={`text-xl font-bold ${Number(profitFactor) >= 1 ? 'text-green-500' : 'text-red-500'}`}>
                {showOnlyR 
                  ? (Math.abs(stats.totalLossR) > 0 ? (stats.totalWinR / Math.abs(stats.totalLossR)).toFixed(2) : '∞')
                  : profitFactor
                }
              </div>
              <div className="text-xs text-gray-400 mt-1">盈利/虧損</div>
              <div className="text-sm">
                {Math.abs(stats.totalWin) > 0 && Math.abs(stats.totalLoss) > 0 
                  ? showOnlyR
                    ? `${Math.abs(stats.totalWinR).toFixed(2)}/${Math.abs(stats.totalLossR).toFixed(2)}`
                    : `${Math.abs(stats.totalWin).toFixed(2)}/${Math.abs(stats.totalLoss).toFixed(2)}`
                  : '-'}
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                平均盈虧比
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    平均盈利 / 平均虧損<br/>
                    R值 = 平均盈利R / 平均虧損R
                  </div>
                </div>
              </div>
              <div className="text-xl font-bold text-primary">
                {showOnlyR 
                  ? avgRiskRewardRatio + ' R'
                  : (stats.winTrades > 0 && stats.lossTrades > 0 
                    ? `${(Math.abs(stats.totalWin / stats.winTrades) / Math.abs(stats.totalLoss / stats.lossTrades)).toFixed(2)} U`
                    : '0.00 U')
                }
              </div>
              {!showOnlyR && <div className="text-sm text-primary">{avgRiskRewardRatio} R</div>}
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                總獲利
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    所有獲利交易的總和
                  </div>
                </div>
              </div>
              <div className="text-xl font-bold text-green-500">
                {showOnlyR ? stats.totalWinR.toFixed(2) + ' R' : stats.totalWin.toFixed(2) + ' U'}
              </div>
              {!showOnlyR && (
                <div className="text-sm text-green-500">
                  {stats.totalWinR.toFixed(2)} R
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                總虧損
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    所有虧損交易的總和
                  </div>
                </div>
              </div>
              <div className="text-xl font-bold text-red-500">
                {showOnlyR ? Math.abs(stats.totalLossR).toFixed(2) + ' R' : Math.abs(stats.totalLoss).toFixed(2) + ' U'}
              </div>
              {!showOnlyR && (
                <div className="text-sm text-red-500">
                  {Math.abs(stats.totalLossR).toFixed(2)} R
                </div>
              )}
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800 border-0 shadow-lg">
            <CardContent className="p-2">
              <div className="text-xs text-gray-400 flex items-center">
                總手續費
                <div className="relative ml-1 group">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <path d="M12 17h.01"></path>
                  </svg>
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                    所有交易的手續費總和
                  </div>
                </div>
              </div>
              <div className="text-xl font-bold text-accent">
                {showOnlyR ? stats.totalFeesR.toFixed(2) + ' R' : stats.totalFees.toFixed(2) + ' U'}
              </div>
              {!showOnlyR && (
                <div className="text-sm text-accent">
                  {stats.totalFeesR.toFixed(2)} R
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </ErrorBoundary>
      
      {/* 交易列表 */}
      <div className="mt-4 md:mt-6">
        {/* 欄位顯示設置和分頁信息 */}
        <div className="mb-3 md:mb-4 flex justify-between items-center">
          <h2 className="text-lg md:text-xl font-semibold">交易列表</h2>
          
          {/* 右側操作按鈕組 */}
          <div className="flex items-center gap-2">
            {/* 選取模式切換按鈕 */}
            <Button
              variant={isInSelectionMode ? "default" : "outline"}
              size="sm"
              onClick={toggleSelectionMode}
              className={`flex items-center gap-1 h-8 transition-all ${
                isInSelectionMode 
                  ? "bg-blue-600 text-white hover:bg-blue-700" 
                  : "border-blue-500/30 text-blue-500 hover:bg-blue-500/20 bg-gray-800"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4"/>
                <path d="M21 12c0 1.66-.4 3.22-1.1 4.61l-1.51-1.51C18.78 14.14 19 13.1 19 12c0-3.87-3.13-7-7-7s-7 3.13-7 7c0 1.1.22 2.14.61 3.1l-1.51 1.51C3.4 15.22 3 13.66 3 12c0-4.97 4.03-9 9-9s9 4.03 9 9z"/>
              </svg>
              <span className="text-sm">{isInSelectionMode ? "完成選取" : "選取"}</span>
            </Button>
            
            {/* 顯示欄位按鈕 */}
                          <Button variant="outline" size="sm" className="flex items-center h-8 bg-gray-800 border-gray-700">
                <span className="mr-1 md:mr-2 text-sm">顯示欄位</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              </Button>
          </div>
        </div>
        
        {/* 包裹資料表格的錯誤邊界 */}
        <ErrorBoundary fallback={<TableFallback />}>
          {/* 批量操作工具欄 */}
          {selectedTrades.size > 0 && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-400">
                已選擇 {selectedTrades.size} 筆記錄
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBatchDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                批量刪除
              </Button>
            </div>
          )}
          
          <div className="overflow-x-auto border border-gray-700 rounded-lg shadow-md table-scrollbar">
            <table className="w-full border-collapse table-auto">
              <colgroup>
                {isInSelectionMode && <col className="w-[4%]" />} {/* 複選框列 */}
                {visibleColumns.includes('tradeName') && <col className="w-[12%]" />}
                {visibleColumns.includes('closeReason') && <col className="w-[8%]" />}
                {visibleColumns.includes('netPnl') && <col className="w-[10%]" />}
                {visibleColumns.includes('netPnlAfterFee') && <col className="w-[8%]" />}
                {visibleColumns.includes('duration') && <col className="w-[6%]" />}
                {visibleColumns.includes('maxLoss') && <col className="w-[6%]" />}
                {visibleColumns.includes('stopCondition') && <col className="w-[7%]" />}
                {visibleColumns.includes('expectedRiskReward') && <col className="w-[6%]" />}
                {visibleColumns.includes('pnlDetails') && <col className="w-[10%]" />}
                {visibleColumns.includes('volatility') && <col className="w-[8%]" />}
                {visibleColumns.includes('openTime') && <col className="w-[10%]" />}
                {visibleColumns.includes('closeTime') && <col className="w-[10%]" />}
                {visibleColumns.includes('action') && <col className="w-[6%]" />}
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 border-b border-gray-700">
                  {/* 全選複選框 */}
                  {isInSelectionMode && (
                    <th className="p-2 md:p-3 text-center w-[4%] font-medium text-gray-300">
                      <input
                        type="checkbox"
                        checked={currentPaginatedHistories.length > 0 && selectedTrades.size === currentPaginatedHistories.length}
                        onChange={handleSelectAll}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  
                  {visibleColumns.includes('tradeName') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[12%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'name',
                        direction: sortConfig.key === 'name' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      交易名稱
                      {sortConfig.key === 'name' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('closeReason') && <th className="p-2 md:p-3 text-center w-[8%] font-medium text-gray-300 whitespace-nowrap">狀態</th>}
                  {visibleColumns.includes('netPnl') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[10%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'total_pnl',
                        direction: sortConfig.key === 'total_pnl' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      總損益
                      <div className="relative ml-1 group inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help inline-block">
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                          <path d="M12 17h.01"></path>
                        </svg>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                          未扣除手續費的總盈虧
                        </div>
                      </div>
                      {sortConfig.key === 'total_pnl' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('netPnlAfterFee') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[8%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'total_fee',
                        direction: sortConfig.key === 'total_fee' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      手續費
                      <div className="relative ml-1 group inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help inline-block">
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                          <path d="M12 17h.01"></path>
                        </svg>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                          交易產生的總手續費
                        </div>
                      </div>
                      {sortConfig.key === 'total_fee' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('duration') && <th className="p-2 md:p-3 text-center w-[6%] font-medium text-gray-300 whitespace-nowrap">持倉(H)</th>}
                  {visibleColumns.includes('maxLoss') && <th className="p-2 md:p-3 text-center w-[6%] font-medium text-gray-300 whitespace-nowrap">1R(U)</th>}
                  {visibleColumns.includes('stopCondition') && <th className="p-2 md:p-3 text-center w-[7%] font-medium text-gray-300 whitespace-nowrap">條件</th>}
                  {visibleColumns.includes('expectedRiskReward') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[6%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'take_profit',
                        direction: sortConfig.key === 'take_profit' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      期望R
                      {sortConfig.key === 'take_profit' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('pnlDetails') && <th className="p-2 md:p-3 text-center w-[10%] font-medium text-gray-300 whitespace-nowrap">
                    損益
                    <div className="relative ml-1 group inline-block">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help inline-block">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <path d="M12 17h.01"></path>
                      </svg>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                        多空雙邊的具體盈虧數據及百分比
                      </div>
                    </div>
                  </th>}
                  {visibleColumns.includes('volatility') && <th className="p-2 md:p-3 text-center w-[8%] font-medium text-gray-300 whitespace-nowrap">
                    波動
                    <div className="relative ml-1 group inline-block">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help inline-block">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                        <path d="M12 17h.01"></path>
                      </svg>
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                        MAE: 最大不利偏移 (交易期間最大虧損百分比)<br/>
                        MFE: 最大有利偏移 (交易期間最大盈利百分比)
                      </div>
                    </div>
                  </th>}
                  {visibleColumns.includes('openTime') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[10%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'created_at',
                        direction: sortConfig.key === 'created_at' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      開倉時間
                      {sortConfig.key === 'created_at' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('closeTime') && (
                    <th 
                      className="p-2 md:p-3 text-center w-[10%] font-medium text-gray-300 cursor-pointer hover:bg-gray-700 whitespace-nowrap"
                      onClick={() => setSortConfig({
                        key: 'closed_at',
                        direction: sortConfig.key === 'closed_at' && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                      })}
                    >
                      平倉時間
                      {sortConfig.key === 'closed_at' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </th>
                  )}
                  {visibleColumns.includes('action') && <th className="p-2 md:p-3 text-center w-[6%] font-medium text-gray-300 whitespace-nowrap">操作</th>}
                </tr>
              </thead>
              <tbody>
                {currentPaginatedHistories.map((history) => {
                  // 計算持倉時間（小時）
                  const durationHours = history.created_at && history.closed_at 
                    ? ((new Date(history.closed_at).getTime() - new Date(history.created_at).getTime()) / (1000 * 60 * 60)).toFixed(1) 
                    : '-';
                  
                  // 計算預期風險比
                  const expectedRiskReward = history.take_profit && history.stop_loss && history.stop_loss !== 0
                    ? (Math.abs(history.take_profit) / Math.abs(history.stop_loss)).toFixed(2)
                    : '-';
                  
                  return (
                    <tr key={history.id} className="border-t border-gray-700 hover:bg-gray-800">
                      {/* 行選擇複選框 */}
                      {isInSelectionMode && (
                        <td className="p-2 md:p-3 text-center w-[4%]">
                          <input
                            type="checkbox"
                            checked={selectedTrades.has(history.id)}
                            onChange={() => handleSelectTrade(history.id)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      
                      {visibleColumns.includes('tradeName') && <td className="p-2 md:p-3 w-[12%] truncate text-center" title={history.trade_name || history.name}>{history.trade_name || history.name || '無名稱'}</td>}
                      {visibleColumns.includes('closeReason') && (
                        <td className="p-2 md:p-3 w-[4%] text-center">
                          <Badge variant={
                            history.close_reason === 'take_profit' ? 'default' : 
                            history.close_reason === 'stop_loss' ? 'destructive' : 
                            history.close_reason === 'trailing_stop' ? 'default' :
                            history.close_reason === 'manual' ? 'default' :
                            history.close_reason === 'manual_close' ? 'default' :
                            history.close_reason === '手動平倉' ? 'default' :
                            history.closed_at === null ? 'outline' :
                            'secondary'
                          } className={
                            history.close_reason === 'take_profit' ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : 
                            history.close_reason === 'stop_loss' ? '' : 
                            history.close_reason === 'trailing_stop' ? 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30' :
                            history.closed_at === null ? 'bg-blue-500/20 text-blue-500 hover:bg-blue-500/30' :
                            history.close_reason === 'manual' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                            history.close_reason === 'manual_close' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                            history.close_reason === '手動平倉' ? 'bg-purple-500/20 text-purple-500 hover:bg-purple-500/30' :
                            ''
                          }>
                            {history.close_reason === 'take_profit' ? '止盈' : 
                             history.close_reason === 'stop_loss' ? '止損' : 
                             history.close_reason === 'trailing_stop' ? '停利' :
                             history.close_reason === 'manual' ? '手動' :
                             history.close_reason === 'manual_close' ? '手動' :
                             history.close_reason === '手動平倉' ? '手動' :
                             history.closed_at === null ? '持倉中' :
                             '手動'}
                          </Badge>
                        </td>
                      )}
                      
                      {visibleColumns.includes('netPnl') && (
                        <td className={`p-2 md:p-3 text-center w-[10%] ${(history.total_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>                          
                          <div>{(history.total_pnl || 0).toFixed(2)} U</div> 
                          <div>
                            {history.max_loss && history.max_loss !== 0 
                              ? ((history.total_pnl || 0) / history.max_loss).toFixed(2) + ' R'
                              : '0.00 R'}
                          </div> 
                        </td>
                      )}
                      
                      {visibleColumns.includes('netPnlAfterFee') && (
                        <td className="p-2 md:p-3 text-center w-[8%] text-accent">                          
                          <div>{(history.total_fee || 0).toFixed(2)} U</div> 
                          <div>
                            {history.max_loss && history.max_loss !== 0 
                              ? ((history.total_fee || 0) / history.max_loss).toFixed(2) + ' R'
                              : '0.00 R'}
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.includes('duration') && (
                        <td className="p-2 md:p-3 text-center w-[6%]">
                          {durationHours}
                        </td>
                      )}
                      
                      {visibleColumns.includes('maxLoss') && (
                        <td className="p-2 md:p-3 text-center w-[6%]">
                          {history.max_loss ? history.max_loss.toFixed(2) : '0.00'}
                        </td>
                      )}
                      
                      {visibleColumns.includes('stopCondition') && (
                        <td className="p-2 md:p-3 text-center w-[7%]">
                          <div className="text-xs grid grid-cols-[1fr] gap-x-1">
                            <div className="text-center text-green-500">{history.take_profit}%</div>                         
                            <div className="text-center text-red-500">{history.stop_loss}%</div>
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.includes('expectedRiskReward') && (
                        <td className="p-2 md:p-3 text-center w-[6%]">
                          {expectedRiskReward}
                        </td>
                      )}
                      
                      {visibleColumns.includes('pnlDetails') && (
                        <td className="p-2 md:p-3 text-center w-[10%]">
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="whitespace-nowrap">
                                <span className={(history.long_position?.pnl || history.long_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}>
                                {(history.long_position?.pnl || history.long_pnl || 0).toFixed(2)} U 
                                ({(history.long_position?.pnl_percent || history.long_pnl_percent || 0).toFixed(2)}%)
                                </span>
                            </div>
                            <div className="whitespace-nowrap">
                                <span className={(history.short_position?.pnl || history.short_pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}>
                                {(history.short_position?.pnl || history.short_pnl || 0).toFixed(2)} U 
                                ({(history.short_position?.pnl_percent || history.short_pnl_percent || 0).toFixed(2)}%)
                                </span>
                            </div>
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.includes('volatility') && (
                        <td className="p-2 md:p-3 text-center w-[8%]">
                          <div className="flex flex-col gap-1 text-xs">
                            <div className="flex justify-between gap-1">
                              <span className="font-medium">MAE:</span>
                              <span className={history.mae && history.mae < 0 ? "text-red-500" : "text-gray-400"}>
                                {history.mae !== undefined && history.mae !== null 
                                  ? (history.mae || 0).toFixed(2) + '%' 
                                  : '-'}
                              </span>
                            </div>
                            <div className="flex justify-between gap-1">
                              <span className="font-medium">MFE:</span>
                              <span className={history.mfe && history.mfe > 0 ? "text-green-500" : "text-gray-400"}>
                                {history.mfe !== undefined && history.mfe !== null 
                                  ? (history.mfe || 0).toFixed(2) + '%' 
                                  : '-'}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}
                      
                      {visibleColumns.includes('openTime') && (
                        <td className="p-2 md:p-3 w-[10%] text-xs md:text-sm text-center">
                          {history.created_at ? formatDateTime(new Date(history.created_at)) : '-'}
                        </td>
                      )}
                      
                      {visibleColumns.includes('closeTime') && (
                        <td className="p-2 md:p-3 w-[10%] text-xs md:text-sm text-center">
                          {history.closed_at ? formatDateTime(new Date(history.closed_at)) : '-'}
                        </td>
                      )}
                      
                      {visibleColumns.includes('action') && (
                        <td className="p-2 md:p-3 text-center w-[6%]">
                          <div className="flex flex-row gap-2 justify-center items-center">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="h-7 px-3 text-xs"                            
                              onClick={() => handleViewDetails(history.id)}
                            >
                              詳情
                            </Button>
                            {isInSelectionMode && (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700"
                                onClick={() => handleDeleteTrade(history.id)}
                              >
                                刪除
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls - Responsive design */}
          <div className="mt-4 space-y-4">
            {/* 手機版：垂直佈局 */}
            <div className="md:hidden space-y-3">
              {/* 頁碼控制 */}
              <div className="flex justify-center">
                <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border shadow-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {renderPaginationButtons()}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalFilteredPages || totalFilteredPages === 0}
                    className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {/* 分頁信息和每頁筆數 */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {/* 每頁筆數選擇 */}
                <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-lg border border-border shadow-sm">
                  <span className="text-sm text-muted-foreground">每頁</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={handleItemsPerPageChange} 
                  >
                    <SelectTrigger className="w-16 h-8 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">筆</span>
                </div>
                
                {/* 分頁信息 */}
                <div className="flex items-center gap-1 bg-card px-3 py-2 rounded-lg border border-border shadow-sm">
                  <span className="text-sm text-muted-foreground">顯示</span>
                  <span className="text-sm font-medium text-primary">{filteredAndSortedHistories.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span>
                  <span className="text-sm text-muted-foreground">-</span>
                  <span className="text-sm font-medium text-primary">{Math.min(currentPage * itemsPerPage, filteredAndSortedHistories.length)}</span>
                  <span className="text-sm text-muted-foreground">，共</span>
                  <span className="text-sm font-medium text-accent">{filteredAndSortedHistories.length}</span>
                  <span className="text-sm text-muted-foreground">筆</span>
                </div>
              </div>
            </div>
            
            {/* 桌面版：水平佈局 */}
            <div className="hidden md:flex justify-between items-center">
              <div className="flex items-center">
                <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border shadow-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {renderPaginationButtons()}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalFilteredPages || totalFilteredPages === 0}
                    className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-4">
                {/* 每頁筆數選擇 */}
                <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                  <span className="text-sm text-muted-foreground">每頁</span>
                  <Select
                    value={itemsPerPage.toString()}
                    onValueChange={handleItemsPerPageChange} 
                  >
                    <SelectTrigger className="w-16 h-8 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">筆</span>
                </div>
                
                {/* 分頁信息 */}
                <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                  <span className="text-sm text-muted-foreground">顯示</span>
                  <span className="text-sm font-medium text-primary">{filteredAndSortedHistories.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span>
                  <span className="text-sm text-muted-foreground">-</span>
                  <span className="text-sm font-medium text-primary">{Math.min(currentPage * itemsPerPage, filteredAndSortedHistories.length)}</span>
                  <span className="text-sm text-muted-foreground">，共</span>
                  <span className="text-sm font-medium text-accent">{filteredAndSortedHistories.length}</span>
                  <span className="text-sm text-muted-foreground">筆</span>
                </div>
              </div>
            </div>
          </div>
        </ErrorBoundary>
      </div>
      
      {/* 交易詳情彈窗 */}
      <TradeDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        trade={selectedTrade}
        type="trade-history"
      />
      
      {/* 交易歷史導入對話框 */}
      <ImportDialog 
        isOpen={isImportDialogOpen}
        onClose={() => setIsImportDialogOpen(false)}
        onImportSuccess={handleImportSuccess}
      />
      
      {/* 交易歷史匯出對話框 */}
      <ExportDialog 
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        startDate={timeRange === 'custom' && dateRange?.from ? dateRange.from.toISOString() : 
                   timeRange !== 'all' && timeRange !== 'custom' ? getStartDateByTimeRange(new Date(), timeRange)?.toISOString() : undefined}
        endDate={timeRange === 'custom' && dateRange?.to ? 
                 (() => {
                   const endOfDay = new Date(dateRange.to);
                   endOfDay.setHours(23, 59, 59, 999);
                   return endOfDay.toISOString();
                 })() :
                 timeRange !== 'all' && timeRange !== 'custom' ? new Date().toISOString() : undefined}
        totalRecords={filteredAndSortedHistories.length}
        dateRangeText={getTimeRangeDates(timeRange, dateRange)}
      />
      
      {/* 刪除確認模態框 */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">確認刪除交易記錄</DialogTitle>
            <DialogDescription>
              您確定要刪除「{selectedTrade?.trade_name || '該交易'}」記錄嗎？<br/>
              <span className="font-bold text-red-500">此操作無法撤銷</span>。
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-end space-x-4 mt-4">
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={isDeleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? (
                <>
                  <span className="inline-block animate-spin mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  </span>
                  刪除中...
                </>
              ) : '確認刪除'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 批量刪除確認模態框 */}
      <Dialog open={batchDeleteConfirmOpen} onOpenChange={setBatchDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-500">確認批量刪除交易記錄</DialogTitle>
            <DialogDescription>
              您確定要刪除選中的 {selectedTrades.size} 筆交易記錄嗎？<br/>
              <span className="font-bold text-red-500">此操作無法撤銷</span>。
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex justify-end space-x-4 mt-4">
            <Button variant="outline" onClick={() => setBatchDeleteConfirmOpen(false)} disabled={isBatchDeleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmBatchDelete} disabled={isBatchDeleting} className="bg-red-600 hover:bg-red-700">
              {isBatchDeleting ? (
                <>
                  <span className="inline-block animate-spin mr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  </span>
                  批量刪除中...
                </>
              ) : `確認刪除 ${selectedTrades.size} 筆記錄`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TradeHistoryPage;