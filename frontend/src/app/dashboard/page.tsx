'use client';

import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from '@/lib/store/auth-store';
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';
import { usePairTradeStore } from '@/lib/store/pair-trade-store';
import { getBinanceAccountSummary } from '@/lib/api/binance';
import { TradeHistoryBackwardCompatible, getTradeHistories, getTradeStatistics, TradeStatistics } from '@/lib/api/trade-history';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Switch } from "@/components/ui/switch";
import { Label } from '@/components/ui/label';
import { Wallet, TrendingUp, GitMerge, ArrowUpRight } from 'lucide-react';
// import { WinRateRadarChart } from '@/components/dashboard/WinRateRadarChart'; // 未使用
import { FuturesProfitBarChartWithTooltip } from '@/components/dashboard/FuturesProfitBarChart';
import { CumulativeProfitChartWithTooltip } from '@/components/dashboard/CumulativeProfitChart';
// import { MaxDrawdownChart } from '@/components/dashboard/MaxDrawdownChart'; // 未使用
import { VolatilityChartWithTooltip } from '@/components/dashboard/VolatilityChart';
import { MAEMFEScatterChartWithTooltip } from '@/components/dashboard/MAEMFEScatterChart';
import { RecoveryFactorChartWithTooltip } from '@/components/dashboard/RecoveryFactorChart';
import { ProfitLossDistributionChartWithTooltip } from '@/components/dashboard/ProfitLossDistributionChart';
import { ProfitVsHoldingTimeChartWithTooltip } from '@/components/dashboard/ProfitVsHoldingTimeChart';
import { WinnersVsLosersCumulativeChartWithTooltip } from '@/components/dashboard/WinnersVsLosersCumulativeChart';
import { ErrorBoundary } from '@/components/error-boundary';
import { FuturesAssetTrendChartWithTooltip } from '@/components/dashboard/FuturesAssetTrendChart';
import { TotalAssetTrendChartWithTooltip, TimeRange as ChartTimeRange } from '@/components/dashboard/TotalAssetTrendChart';
import '@/lib/polyfills';
import { formatDateToYYYYMMDD, getStartDateByTimeRange } from '@/lib/utils/date';
import { ChartFallback } from '@/components/chart-fallback';
import { useToast } from '@/components/ui/use-toast';
import { ProfitCalendarChartWithTooltip } from '@/components/dashboard/ProfitCalendarChart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SimpleDateRangePicker, type DateRange as SimpleDateRange } from '@/components/shared/SimpleDateRangePicker';

// 定義頁面級別的 TimeRange 類型
type PageTimeRange = 'all' | 'today' | '7days' | '30days' | '90days' | '180days' | 'month' | 'quarter' | 'custom';

// 定義 DateRange 類型


// 為資產趨勢圖創建特殊的時間範圍轉換
function convertToAssetTrendTimeRange(range: PageTimeRange): ChartTimeRange {
  switch (range) {
    case 'today':
      return '7d'; // 今天也顯示7天，因為資產趨勢需要對比
    case '7days':
      return '7d';
    case '30days':
    case 'month':
      return '30d';
    case '90days':
    case 'quarter':
      return '90d';
    case '180days':
      return '180d';
    case 'all':
    case 'custom':
    default:
      return '30d';
  }
}

// 將新的 TimeRange 轉換為舊的 TimeRange 格式 (主要用於兼容舊的圖表組件)
function convertToOldTimeRangeFormat(newRange: PageTimeRange): 'all' | 'today' | 'custom' | '7d' | '30d' | '90d' | '180d' | '1y' | undefined {
  switch (newRange) {
    case 'all': return 'all';
    case 'today': return 'today';
    case '7days': return '7d';
    case '30days': return '30d';
    case '90days': return '90d';
    case '180days': return '180d';
    // 'month' and 'quarter' don't have direct old equivalents, map to a common one or undefined
    case 'month': return '30d'; // Or undefined, depending on how the old component handles it
    case 'quarter': return '90d'; // Or undefined
    case 'custom': return 'custom';
    default: return undefined; // Fallback
  }
}

// 計算交易統計數據
const calculateTradeStats = (histories: TradeHistoryBackwardCompatible[], includeFees: boolean): TradeStatistics => {
  const stats = histories.reduce(
    (acc, history) => {
      if (history.closed_at) {
        acc.total_trades += 1;
        
        // 計算總手續費
        const totalFee = history.total_fee || 0;
        acc.total_fees += totalFee;
        
        // 根據是否考慮手續費選擇使用總盈虧或淨盈虧
        const pnl = includeFees 
          ? (history.net_pnl || history.total_pnl - totalFee) 
          : (history.total_pnl || 0);
        
        // 計算 R 值
        const rValue = history.max_loss && history.max_loss !== 0 
          ? pnl / Math.abs(history.max_loss)
          : 0;
        
        // 計算手續費的 R 值
        const feeR = history.max_loss && history.max_loss !== 0
          ? totalFee / Math.abs(history.max_loss)
          : 0;
        
        acc.total_fee_r += feeR;
        
        if (pnl > 0) {
          acc.winning_trades += 1;
          acc.total_profit += pnl;
          acc.total_win_r += rValue;
        } else if (pnl < 0) {
          acc.losing_trades += 1;
          acc.total_loss += pnl;
          acc.total_loss_r += rValue;
        }
      }
      return acc;
    },
    { 
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_profit: 0,
      total_loss: 0,
      total_win_r: 0,
      total_loss_r: 0,
      total_fees: 0,
      total_fee_r: 0
    }
  );

  // 計算其他統計數據
  const win_rate = stats.total_trades > 0 ? (stats.winning_trades / stats.total_trades) * 100 : 0;
  const avg_profit = stats.winning_trades > 0 ? stats.total_profit / stats.winning_trades : 0;
  const avg_loss = stats.losing_trades > 0 ? Math.abs(stats.total_loss / stats.losing_trades) : 0;
  const profit_factor = Math.abs(stats.total_loss) > 0 ? stats.total_profit / Math.abs(stats.total_loss) : (stats.total_profit > 0 ? Infinity : 0);
  
  // 計算 R 值的平均值
  const avg_win_r = stats.winning_trades > 0 ? stats.total_win_r / stats.winning_trades : 0;
  const avg_loss_r = stats.losing_trades > 0 ? Math.abs(stats.total_loss_r / stats.losing_trades) : 0;
  const total_r = stats.total_win_r + stats.total_loss_r;
  
  // 計算最大回撤和波動率
  const max_drawdown = Math.abs(stats.total_loss);
  const volatility = Math.sqrt(
    histories.reduce((sum, history) => {
      const pnl = includeFees 
        ? (history.net_pnl || history.total_pnl - (history.total_fee || 0)) 
        : (history.total_pnl || 0);
      return sum + Math.pow(pnl, 2);
    }, 0) / (stats.total_trades || 1)
  );

  return {
    total_trades: stats.total_trades,
    winning_trades: stats.winning_trades,
    losing_trades: stats.losing_trades,
    win_rate,
    avg_profit,
    avg_loss,
    profit_factor,
    avg_risk_reward_ratio: avg_win_r,
    avg_net_risk_reward_ratio: avg_loss_r,
    total_profit: stats.total_profit,
    total_loss: stats.total_loss,
    net_profit: stats.total_profit + stats.total_loss,
    max_drawdown,
    volatility,
    total_fees: stats.total_fees,
    total_r,
    total_fee_r: stats.total_fee_r
  };
};

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { fetchHistories } = useTradeHistoryStore();
  const { fetchTrades } = usePairTradeStore();
  const { toast } = useToast();
  const [tradeHistories, setTradeHistories] = useState<TradeHistoryBackwardCompatible[]>([]);
  const [tradeStatistics, setTradeStatistics] = useState<TradeStatistics | null>(null);
  const [currency] = useState<string>('USDT');
  const [timeRange, setTimeRange] = useState<PageTimeRange>('30days');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeFees, setIncludeFees] = useState(true);
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);

  console.log('[DashboardPage] Initializing state - timeRange:', timeRange); // Log initial timeRange

  // 自訂時間區間的狀態 - 使用 SimpleDateRangePicker 的 DateRange 類型
  const [dateRange, setDateRange] = useState<SimpleDateRange | undefined>();


  const [accountSummary, setAccountSummary] = useState<{
    total_value: number;
    futures_value: number;
  } | null>(null);

  const [activePairTrades, setActivePairTrades] = useState<number | undefined>(undefined);

  // 獲取 Binance 賬戶摘要
  const fetchAccountSummary = useCallback(async () => {
    try {
      const summary = await getBinanceAccountSummary();
      setAccountSummary(summary);
    } catch (error) {
      console.error("無法獲取幣安賬戶摘要:", error);
      toast({ variant: 'destructive', description: '無法獲取幣安賬戶摘要' });
    }
  }, []);

  // 使用 useCallback 來優化函數，避免不必要的重新創建
  const fetchTradeData = useCallback(async () => {
    try {
      console.log('[DashboardPage] fetchTradeData triggered. Current timeRange:', timeRange, 'dateRange:', dateRange);
      setError(null);
      setIsLoading(true);
      // 獲取交易歷史數據
      let startDate: Date | undefined;
      let endDate = new Date();
      
      if (timeRange === 'custom' && dateRange?.from && dateRange?.to) {
        startDate = dateRange.from;
        endDate = dateRange.to;
        console.log('使用自定義時間範圍:', { startISO: startDate.toISOString(), endISO: endDate.toISOString() });
      } else {
        startDate = getStartDateByTimeRange(new Date(), timeRange);
        // If startDate is undefined (for 'all'), endDate might also be considered undefined for API call
        // or API handles undefined startDate as 'all time' up to endDate.
        // For dashboard, 'all' usually implies a very long range or is handled by specific chart queries.
        console.log('使用預設時間範圍:', { timeRange, startISO: startDate?.toISOString(), endISO: endDate.toISOString() });
      }
      
      console.log('[DashboardPage] fetchTradeData - Requesting histories with params:', { 
        start_date: startDate?.toISOString(),
        end_date: endDate.toISOString(),
        sort_by: 'closed_at',
        sort_order: 'asc'
      });
      
      let histories;
      try {
        histories = await getTradeHistories({
          start_date: startDate?.toISOString(),
          end_date: endDate.toISOString(),
          sort_by: 'closed_at',
          sort_order: 'asc'
        });
        
        console.log(`獲取到 ${histories?.length || 0} 條交易歷史記錄`);
        
        // 檢查並過濾無效的交易記錄
        if (histories && histories.length > 0) {
          // 檢查每條記錄是否有必要的屬性
          const validHistories = histories.filter(history => {
            // 基本有效性檢查
            if (!history) return false;
            
            // 檢查必須的屬性
            return true; // 將返回所有非null/undefined的記錄
          });
          
          console.log(`[DashboardPage] fetchTradeData - Fetched ${validHistories.length} valid histories. First ID: ${validHistories[0]?.id}. Setting tradeHistories state.`);
          setTradeHistories(validHistories);
        } else {
          console.log('[DashboardPage] fetchTradeData - No histories from API or empty after validation. Setting empty tradeHistories state.');
          setTradeHistories([]);
        }
      } catch (historyError) {
        console.error('獲取交易歷史記錄失敗:', historyError);
        setTradeHistories([]);
        toast({ variant: 'destructive', description: '獲取交易歷史失敗，請稍後重試' });
      }

      try {
        // 獲取交易統計數據
        const formattedStartDate = startDate 
          ? formatDateToYYYYMMDD(startDate) 
          : undefined; // Handle undefined startDate
        const formattedEndDate = formatDateToYYYYMMDD(endDate);
        
        console.log('請求交易統計數據, 參數:', {
          start_date: formattedStartDate,
          end_date: formattedEndDate,
          include_fees: true
        });
        
        const stats = await getTradeStatistics(formattedStartDate, formattedEndDate, true);
        console.log('獲取統計數據結果:', stats);
        
        // 確保沒有負數的統計值，如果沒有數據則使用默認值
        if (stats) {
          // 安全處理可能導致圖表問題的負值數據
          setTradeStatistics({
            ...stats,
            // 確保值不為負數
            max_drawdown: Math.abs(stats.max_drawdown || 0),
            volatility: Math.abs(stats.volatility || 0),
            // 確保其他值的有效性
            win_rate: stats.win_rate || 0,
            avg_profit: stats.avg_profit || 0, 
            avg_loss: stats.avg_loss || 0,
            profit_factor: stats.profit_factor || 0,
            avg_risk_reward_ratio: stats.avg_risk_reward_ratio || 0,
            avg_net_risk_reward_ratio: stats.avg_net_risk_reward_ratio || 0
          });
        } else {
          console.log('沒有統計數據，設置為 null');
          setTradeStatistics(null);
        }
      } catch (statsError) {
        console.error('獲取交易統計數據失敗:', statsError);
        setTradeStatistics(null);
        toast({ variant: 'destructive', description: '獲取交易統計失敗，部分圖表可能無法顯示' });
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('獲取交易數據失敗:', error);
      // 設置默認空數據
      setTradeHistories([]);
      setTradeStatistics(null);
      setError('獲取數據時發生錯誤，請稍後重試');
      toast({ variant: 'destructive', description: '數據加載失敗，請稍後重試或聯繫支持團隊' });
      setIsLoading(false);
    }
  }, [timeRange, dateRange]);

  // 獲取活躍配對交易數量
  const fetchActivePairTrades = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('沒有找到認證令牌');
        setActivePairTrades(0);
        return;
      }


      
      // 使用正確的 API 端點路徑，並添加 status=active 參數
      const response = await fetch('/api/pair-trades?status=active', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      

      
      if (response.ok) {
        const trades = await response.json();


        
        // 檢查每個交易的狀態（用於除錯）
        // trades.forEach((trade, index) => {
        //   console.log(`[fetchActivePairTrades] 交易 ${index + 1}:`, {
        //     id: trade.id,
        //     status: trade.status,
        //     symbol: trade.symbol || `${trade.long_symbol}/${trade.short_symbol}`,
        //     created_at: trade.created_at
        //   });
        // });
        
        // 由於後端已經過濾了 active 狀態，這裡直接使用返回的數量

        setActivePairTrades(trades.length);
      } else {
        const errorText = await response.text();
        console.error('[fetchActivePairTrades] 獲取活躍配對交易失敗:', response.status, errorText);
        setActivePairTrades(0);
      }
    } catch (error) {
      console.error('[fetchActivePairTrades] 獲取活躍配對交易錯誤:', error);
      setActivePairTrades(0);
    }
  };

  // 第一個 useEffect：初始化數據
  useEffect(() => {
    const initializeDashboard = async () => {
      if (!user) return;
      
      try {

        setIsLoading(true);
        setError(null);
        
        // 加載數據
        await Promise.all([
          fetchTrades().catch(e => {
            console.error('獲取配對交易失敗:', e);
            toast({ variant: 'destructive', description: '無法獲取配對交易數據' });
          }),
          
          fetchHistories().catch(e => {
            console.error('獲取歷史記錄失敗:', e);
          }),
          
          fetchTradeData().catch(e => {
            console.error('獲取交易數據失敗:', e);
            setTradeHistories([]);
            setTradeStatistics(null);
            setError('獲取數據時發生錯誤，請稍後重試');
          }),
          
          fetchActivePairTrades().catch(e => {
            console.error('獲取活躍配對交易失敗:', e);
          })
        ]);
        

      } catch (error) {
        console.error('儀表板初始化失敗:', error);
        setError('儀表板初始化失敗，請刷新頁面重試');
      } finally {
        setIsLoading(false);
      }
    };

    initializeDashboard();
  }, [user, fetchTrades, fetchHistories, fetchTradeData]);

  // 第二個 useEffect：更新交易數據
  useEffect(() => {
    const updateTradeData = async () => {
      if (!user) return;
      await fetchTradeData();
    };

    updateTradeData();
  }, [timeRange, dateRange, user, fetchTradeData]);

  // 第三個 useEffect：獲取賬戶摘要
  useEffect(() => {
    const updateAccountSummary = async () => {
      if (!user) return;
      await fetchAccountSummary();
    };

    updateAccountSummary();
    const timer = setInterval(updateAccountSummary, 3600000);
    return () => clearInterval(timer);
  }, [fetchAccountSummary, user]);

  // 第四個 useEffect：更新交易統計
  useEffect(() => {
    if (isLoading || tradeHistories.length === 0) return;

    const startDateObj = 
      timeRange === 'custom' && dateRange?.from 
        ? dateRange.from 
        : getStartDateByTimeRange(new Date(), timeRange);
    
    const endDateObj = 
      timeRange === 'custom' && dateRange?.to 
        ? dateRange.to
        : new Date();
    
    const filteredHistories = tradeHistories.filter(history => {
      const closeDate = history.closed_at 
        ? new Date(history.closed_at) 
        : (history.close_time ? new Date(history.close_time) : null);
      
      if (!closeDate) return false;
      
      // 如果 startDateObj 未定義 (例如 timeRange 為 'all')，則認為開始日期條件滿足
      const isAfterStartDate = startDateObj ? closeDate >= startDateObj : true;
      const isBeforeEndDate = endDateObj ? closeDate <= endDateObj : true;
      
      return isAfterStartDate && isBeforeEndDate;
    });
    
    const newStats = calculateTradeStats(filteredHistories, includeFees);
    setTradeStatistics(newStats);
  }, [timeRange, dateRange, tradeHistories, isLoading, includeFees]);

  // 獲取時間範圍的可讀標籤
  const getTimeRangeLabel = (range: string): string => {
    switch (range) {
      case 'all':
        return '全部';
      case 'today':
        return '今日';
      case '7days':
        return '7天';
      case '30days':
        return '30天';
      case '90days':
        return '90天';
      case '180days':
        return '180天';
      case 'month':
        return '本月';
      case 'quarter':
        return '本季';
      default:
        return '自訂';
    }
  };

  // 獲取時間範圍的實際日期範圍
  const getTimeRangeDates = (range: PageTimeRange): string => {
    const today = new Date();
    const formatDate = (date: Date) => date.toLocaleDateString('zh-TW', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).replace(/\//g, '-');

    switch (range) {
      case 'today':
        return formatDate(today);
      case '7days': {
        const start = new Date(today);
        start.setDate(today.getDate() - 7);
        return `${formatDate(start)} - ${formatDate(today)}`;
      }
      case '30days': {
        const start = new Date(today);
        start.setDate(today.getDate() - 30);
        return `${formatDate(start)} - ${formatDate(today)}`;
      }
      case '90days': {
        const start = new Date(today);
        start.setDate(today.getDate() - 90);
        return `${formatDate(start)} - ${formatDate(today)}`;
      }
      case '180days': {
        const start = new Date(today);
        start.setDate(today.getDate() - 180);
        return `${formatDate(start)} - ${formatDate(today)}`;
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return `${formatDate(start)} - ${formatDate(end)}`;
      }
      case 'quarter': {
        const quarter = Math.floor(today.getMonth() / 3);
        const start = new Date(today.getFullYear(), quarter * 3, 1);
        const end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
        return `${formatDate(start)} - ${formatDate(end)}`;
      }
      case 'custom':
        if (dateRange?.from && dateRange?.to) {
          return `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`;
        }
        return '請選擇日期';
      case 'all':
      default:
        return '所有時間';
    }
  };

  // 應用自訂日期範圍
  const applyCustomDateRange = () => {
    // 確保 timeRange 保持為 custom
    setTimeRange('custom');
    toast({ description: '自訂日期範圍已套用' });
  };

  // 處理時間範圍變更的函數
  const handleTimeRangeChange = (value: string) => {
    console.log('[DashboardPage] handleTimeRangeChange, new timeRange value:', value);
    const newTimeRange = value as PageTimeRange;
    
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
    
    // 清除之前可能存在的錯誤
    setError(null);
  };

  // Log props being passed to charts just before returning JSX
  console.log('[DashboardPage] Preparing to render charts with props:', {
    timeRange,
    tradeHistoriesLength: tradeHistories?.length,
    tradeHistoriesFirstId: tradeHistories?.[0]?.id,
    tradeStatistics, 
    currency
  });

  // 顯示錯誤信息
  if (error) {
    toast({ 
      variant: 'destructive', 
      description: `獲取交易歷史記錄失敗: ${error}` 
    });
    return (
      <div className="container">
        <div className="p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg my-6">
          <h2 className="text-xl font-semibold text-red-700 dark:text-red-300 mb-2">載入錯誤</h2>
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <button 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            onClick={() => window.location.reload()}
          >
            重新載入頁面
          </button>
        </div>
      </div>
    );
  }

  // 顯示加載狀態
  if (isLoading) {
    return (
      <div className="container flex justify-center items-center min-h-[50vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">正在載入儀表板數據...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="w-full max-w-none mx-auto px-1 sm:px-2 lg:px-4 pb-32">
        {/* 頂部工具列與狀態列整合 */}
        <div className="grid grid-cols-12 gap-2 sm:gap-3 mb-4">
          {/* 左側時間範圍選擇器 */}
          <div className="col-span-12 lg:col-span-4 mb-3 lg:mb-0">
            {/* 手機版：使用下拉選單 */}
            <div className="lg:hidden">
              <Card className="bg-card border-border/60 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-primary rounded-full"></div>
                      <span className="text-sm font-medium text-foreground">Time Range</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {getTimeRangeLabel(timeRange)}
                    </Badge>
                  </div>
                  
                  <Select value={timeRange} onValueChange={(value) => {
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
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Time Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="7days">7 Days</SelectItem>
                      <SelectItem value="30days">30 Days</SelectItem>
                      <SelectItem value="90days">90 Days</SelectItem>
                      <SelectItem value="180days">180 Days</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                      <SelectItem value="quarter">This Quarter</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {/* 顯示選中的日期範圍 */}
                  {timeRange !== 'all' && (
                    <div className="mt-3 p-2 bg-muted/50 rounded-md">
                      <div className="text-xs text-muted-foreground mb-1">Selected Range</div>
                      <div className="text-sm font-medium">
                        {getTimeRangeDates(timeRange)}
                      </div>
                    </div>
                  )}
                  
                  {/* 手機版手續費開關 */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                    <Switch 
                      id="fee-switch-mobile"
                      checked={includeFees} 
                      onCheckedChange={setIncludeFees}
                      className={includeFees ? "bg-green-500" : ""} 
                    />
                    <Label htmlFor="fee-switch-mobile" className="text-sm font-medium whitespace-nowrap">
                      考慮手續費
                      <div className="relative ml-1 group inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                          <path d="M12 17h.01"></path>
                        </svg>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 sm:w-64 p-3 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                          {/* 箭頭 */}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          
                          <div className="space-y-2">
                            <div className="font-semibold text-gray-200">💰 計算方式</div>
                            <div>
                              <strong>開啟：</strong>使用淨盈虧（扣除手續費）<br/>
                              <strong>關閉：</strong>使用總盈虧（不扣除手續費）
                            </div>
                            
                            <div className="font-semibold text-gray-200">📊 影響圖表</div>
                            <div className="space-y-1">
                              <div>• 合約收益圖</div>
                              <div>• 合約累計盈虧</div>
                              <div>• 盈虧日曆</div>
                              <div>• 獲利累計vs虧損累計</div>
                            </div>
                            
                            <div className="font-semibold text-gray-200">💡 建議</div>
                            <div>建議開啟以獲得更準確的實際盈虧分析</div>
                          </div>
                        </div>
                      </div>
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* 桌面版：使用標籤頁 */}
            <div className="hidden lg:block">
              <Card className="bg-card border-border/60 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-sm font-medium text-foreground">Time Range</span>
                    <div className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-md font-medium">
                      {getTimeRangeLabel(timeRange)}
                    </div>
                    <div className="px-2 py-1 bg-muted/50 text-muted-foreground text-xs rounded-md">
                      {getTimeRangeDates(timeRange)}
                    </div>
                  </div>
                  <Tabs value={timeRange} onValueChange={handleTimeRangeChange} className="w-full">
                    <TabsList className="bg-background/50 h-8 w-full grid grid-cols-5 gap-1">
                      <TabsTrigger 
                        value="all" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        All
                      </TabsTrigger>
                      <TabsTrigger 
                        value="today" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        Today
                      </TabsTrigger>
                      <TabsTrigger 
                        value="7days" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        7 Days
                      </TabsTrigger>
                      <TabsTrigger 
                        value="30days" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        30 Days
                      </TabsTrigger>
                      <TabsTrigger 
                        value="90days" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        90 Days
                      </TabsTrigger>
                    </TabsList>
                    <TabsList className="bg-background/50 h-8 w-full grid grid-cols-4 gap-1 mt-2">
                      <TabsTrigger 
                        value="180days" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        180 Days
                      </TabsTrigger>
                      <TabsTrigger 
                        value="month" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        Month
                      </TabsTrigger>
                      <TabsTrigger 
                        value="quarter" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                      >
                        Quarter
                      </TabsTrigger>
                      <TabsTrigger 
                        value="custom" 
                        className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all"
                        onClick={() => {
                          if (timeRange === 'custom') {
                            setIsCustomDatePickerOpen(true);
                          }
                        }}
                      >
                        Custom
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {/* 桌面版手續費開關 */}
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/30">
                    <Switch 
                      id="fee-switch-desktop"
                      checked={includeFees} 
                      onCheckedChange={setIncludeFees}
                      className={includeFees ? "bg-green-500" : ""} 
                    />
                    <Label htmlFor="fee-switch-desktop" className="text-sm font-medium whitespace-nowrap">
                      考慮手續費
                      <div className="relative ml-1 group inline-block">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 cursor-help">
                          <circle cx="12" cy="12" r="10"></circle>
                          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                          <path d="M12 17h.01"></path>
                        </svg>
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 sm:w-64 p-3 bg-gray-900 text-xs text-gray-300 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-50">
                          {/* 箭頭 */}
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
                          
                          <div className="space-y-2">
                            <div className="font-semibold text-gray-200">💰 計算方式</div>
                            <div>
                              <strong>開啟：</strong>使用淨盈虧（扣除手續費）<br/>
                              <strong>關閉：</strong>使用總盈虧（不扣除手續費）
                            </div>
                            
                            <div className="font-semibold text-gray-200">📊 影響圖表</div>
                            <div className="space-y-1">
                              <div>• 合約收益圖</div>
                              <div>• 合約累計盈虧</div>
                              <div>• 盈虧日曆</div>
                              <div>• 獲利累計vs虧損累計</div>
                            </div>
                            
                            <div className="font-semibold text-gray-200">💡 建議</div>
                            <div>建議開啟以獲得更準確的實際盈虧分析</div>
                          </div>
                        </div>
                      </div>
                    </Label>
                  </div>
                </CardContent>
              </Card>
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

          {/* 中央資產統計 */}
          <div className="col-span-12 lg:col-span-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 h-full">
              {/* 總賬戶價值卡片 - 深綠配色 */}
              <Card className="relative overflow-hidden border-emerald-600/40 bg-gradient-to-br from-emerald-600/20 via-emerald-500/15 to-green-600/25 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/20 hover:border-emerald-500/60 hover:scale-[1.02] group">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50"></div>
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-400/20 rounded-full blur-xl transform translate-x-8 -translate-y-8"></div>
                <CardContent className="relative p-4 flex flex-col justify-center h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-emerald-500/20 rounded-lg backdrop-blur-sm border border-emerald-400/30">
                        <Wallet className="w-4 h-4 text-emerald-300" />
                      </div>
                      <CardTitle className="text-xs text-emerald-100/80 font-medium">Account Value</CardTitle>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ArrowUpRight className="w-3 h-3 text-emerald-300" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-emerald-200 tracking-tight">
                    {accountSummary?.total_value ? `$${accountSummary.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '--'}
                  </div>
                  <div className="text-xs text-emerald-300/60 mt-1">
                    Total Portfolio Value
                  </div>
                </CardContent>
              </Card>

              {/* 合約賬戶價值卡片 - 金色配色 */}
              <Card className="relative overflow-hidden border-amber-600/40 bg-gradient-to-br from-amber-600/20 via-yellow-500/15 to-orange-600/25 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-amber-500/20 hover:border-amber-500/60 hover:scale-[1.02] group">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50"></div>
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-400/20 rounded-full blur-xl transform translate-x-8 -translate-y-8"></div>
                <CardContent className="relative p-4 flex flex-col justify-center h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-amber-500/20 rounded-lg backdrop-blur-sm border border-amber-400/30">
                        <TrendingUp className="w-4 h-4 text-amber-300" />
                      </div>
                      <CardTitle className="text-xs text-amber-100/80 font-medium">Perpetual Account Value</CardTitle>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ArrowUpRight className="w-3 h-3 text-amber-300" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-amber-200 tracking-tight">
                    {accountSummary?.futures_value ? `$${accountSummary.futures_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '--'}
                  </div>
                  <div className="text-xs text-amber-300/60 mt-1">
                    Futures Trading Balance
                  </div>
                </CardContent>
              </Card>

              {/* 活躍配對交易卡片 - 靛藍配色 */}
              <Card className="relative overflow-hidden border-indigo-600/40 bg-gradient-to-br from-indigo-600/20 via-blue-500/15 to-purple-600/25 backdrop-blur-md transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/20 hover:border-indigo-500/60 hover:scale-[1.02] group">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-50"></div>
                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-400/20 rounded-full blur-xl transform translate-x-8 -translate-y-8"></div>
                <CardContent className="relative p-4 flex flex-col justify-center h-full">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-indigo-500/20 rounded-lg backdrop-blur-sm border border-indigo-400/30">
                        <GitMerge className="w-4 h-4 text-indigo-300" />
                      </div>
                      <CardTitle className="text-xs text-indigo-100/80 font-medium">Active Pair Trades</CardTitle>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <ArrowUpRight className="w-3 h-3 text-indigo-300" />
                    </div>
                  </div>
                  <div className="text-xl font-bold text-indigo-200 tracking-tight">
                    {activePairTrades !== undefined 
                      ? `${activePairTrades} ${activePairTrades === 1 ? 'Pair' : 'Pairs'}`
                      : '--'
                    }
                  </div>
                  <div className="text-xs text-indigo-300/60 mt-1">
                    Currently Running Strategies
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* 主要圖表區域 */}
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 md:gap-5 lg:gap-6 pb-32 mb-16">
          {/* 第一行 - 主要趨勢圖 */}
          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="總資產趨勢" />}>
                <TotalAssetTrendChartWithTooltip timeRange={convertToAssetTrendTimeRange(timeRange)} />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="合約資產趨勢" />}>
                <FuturesAssetTrendChartWithTooltip timeRange={convertToAssetTrendTimeRange(timeRange)} />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="合約累計盈虧" />}>
                <CumulativeProfitChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                  timeRange={convertToOldTimeRangeFormat(timeRange)}
                  includeFees={includeFees}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="合約收益" />}>
                <FuturesProfitBarChartWithTooltip 
                  data={tradeHistories} 
                  timeRange={timeRange}
                  isLoading={isLoading}
                  onRetry={() => fetchTradeData()}
                  includeFees={includeFees}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="MAE/MFE 分析" />}>
                <MAEMFEScatterChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="盈虧持倉時間" />}>
                <ProfitVsHoldingTimeChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                  timeRange={timeRange}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="波動率分析" />}>
                <VolatilityChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  statistics={tradeStatistics}
                  currency={currency}
                  timeRange={timeRange}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="資金回收曲線" />}>
                <RecoveryFactorChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                  timeRange={timeRange}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="盈虧分佈" />}>
                <ProfitLossDistributionChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                  timeRange={timeRange}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="獲利累計vs虧損累計" />}>
                <WinnersVsLosersCumulativeChartWithTooltip 
                  tradeHistories={tradeHistories} 
                  currency={currency}
                  includeFees={includeFees}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>

          <Card className="group transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 border-border/50 hover:border-primary/20 overflow-hidden">
            <CardContent className="p-3 h-[350px] sm:h-[400px] md:h-[350px] lg:h-[400px] xl:h-[450px] overflow-hidden">
              <ErrorBoundary fallback={<ChartFallback title="合約盈虧日曆" />}>
                <ProfitCalendarChartWithTooltip 
                  data={tradeHistories} 
                  timeRange={timeRange}
                  isLoading={isLoading}
                  onRetry={() => fetchTradeData()}
                  includeFees={includeFees}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
