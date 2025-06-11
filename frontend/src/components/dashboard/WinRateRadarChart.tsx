'use client';

import { useEffect, useState } from 'react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';

interface WinRateRadarChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  timeRange?: string;
}

interface MetricData {
  subject: string;
  A: number;
  fullMark: number;
}

export function WinRateRadarChart({ tradeHistories, timeRange = '30d' }: WinRateRadarChartProps) {
  const [data, setData] = useState<MetricData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const calculateMetrics = () => {
      try {
        setIsLoading(true);
        setError(null);
        
        if (!tradeHistories || tradeHistories.length === 0) {

          setData([]);
          setIsLoading(false);
          return;
        }

        // REMOVE INTERNAL TIME RANGE FILTERING
        // const now = new Date();
        // const startDate = getStartDateByTimeRange(now);
        // const validTrades = tradeHistories.filter(trade => {
        //   const entryTime = trade.created_at 
        //     ? new Date(trade.created_at).getTime() 
        //     : (trade.entry_time ? new Date(trade.entry_time).getTime() : 0);
        //   if (entryTime === 0) return false;
        //   return entryTime >= startDate.getTime() && entryTime <= now.getTime();
        // });

        // Directly use tradeHistories, assuming it's pre-filtered
        // Add a basic filter for valid entry time for calculations though
        const validTrades = tradeHistories.filter(trade => {
          return (trade.created_at || trade.entry_time);
        });

        // 2. 計算勝率
        const totalTrades = validTrades.length;
        const winningTrades = validTrades.filter(trade => (trade.net_pnl || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        // 3. 計算平均持倉時間（分鐘）
        const holdingTimes = validTrades.map(trade => {
          const entryTime = trade.created_at 
            ? new Date(trade.created_at).getTime() 
            : (trade.entry_time ? new Date(trade.entry_time).getTime() : 0);
          const closeTime = trade.closed_at 
            ? new Date(trade.closed_at).getTime() 
            : (trade.close_time ? new Date(trade.close_time).getTime() : 0);
          
          if (!entryTime || !closeTime) return 0;
          return (closeTime - entryTime) / (1000 * 60); // 轉換為分鐘
        }).filter(time => time > 0);
        
        const avgHoldingTime = holdingTimes.length > 0 
          ? holdingTimes.reduce((sum, time) => sum + time, 0) / holdingTimes.length 
          : 0;
        
        // 平均持倉時間評分（滿分為60分鐘，超過60分鐘評分下降）
        const holdingTimeScore = avgHoldingTime <= 60 
          ? (avgHoldingTime / 60) * 100 
          : Math.max(0, 100 - ((avgHoldingTime - 60) / 60) * 100);

        // 4. 計算盈虧比
        const winningAmount = validTrades
          .filter(trade => (trade.net_pnl || 0) > 0)
          .reduce((sum, trade) => sum + (trade.net_pnl || 0), 0);
          
        const losingAmount = Math.abs(validTrades
          .filter(trade => (trade.net_pnl || 0) < 0)
          .reduce((sum, trade) => sum + (trade.net_pnl || 0), 0));
          
        const profitFactor = losingAmount > 0 ? winningAmount / losingAmount : winningAmount > 0 ? 100 : 0;
        // 盈虧比評分（滿分為3以上）
        const profitFactorScore = Math.min(100, (profitFactor / 3) * 100);

        // 5. 計算交易頻率（每天交易次數）
        const tradesByDate: Record<string, TradeHistoryBackwardCompatible[]> = {};
        validTrades.forEach(trade => {
          if (trade.created_at || trade.entry_time) {
            const date = trade.created_at 
              ? new Date(trade.created_at).toISOString().split('T')[0]
              : new Date(trade.entry_time!).toISOString().split('T')[0];
            
            if (!tradesByDate[date]) {
              tradesByDate[date] = [];
            }
            
            tradesByDate[date].push(trade);
          }
        });
        
        const uniqueDays = Object.keys(tradesByDate).length;
        const tradesPerDay = uniqueDays > 0 ? totalTrades / uniqueDays : 0;
        // 交易頻率評分（最佳為2-5次/天）
        const frequencyScore = tradesPerDay >= 2 && tradesPerDay <= 5 
          ? 100 
          : tradesPerDay < 2 
            ? (tradesPerDay / 2) * 100 
            : Math.max(0, 100 - ((tradesPerDay - 5) / 5) * 100);

        // 6. 計算最大連續盈利/虧損交易
        let currentWinStreak = 0;
        let maxWinStreak = 0;
        let currentLossStreak = 0;
        let maxLossStreak = 0;

        const sortedTrades = [...validTrades].sort((a, b) => {
          const timeA = a.close_time || a.closed_at || '';
          const timeB = b.close_time || b.closed_at || '';
          return new Date(timeA).getTime() - new Date(timeB).getTime();
        });

        sortedTrades.forEach(trade => {
          const isProfitable = (trade.net_pnl || 0) > 0;
          
          if (isProfitable) {
            currentWinStreak++;
            currentLossStreak = 0;
          } else {
            currentLossStreak++;
            currentWinStreak = 0;
          }
          
          maxWinStreak = Math.max(maxWinStreak, currentWinStreak);
          maxLossStreak = Math.max(maxLossStreak, currentLossStreak);
        });

        // 最大連勝評分（滿分為5次以上）
        const winStreakScore = Math.min(100, (maxWinStreak / 5) * 100);
        
        // 最大連敗評分（越少越好，最多5次）
        const lossStreakScore = Math.max(0, 100 - (maxLossStreak / 5) * 100);

        // 設置雷達圖數據
        setData([
          { subject: '勝率', A: Math.round(winRate), fullMark: 100 },
          { subject: '持倉時間', A: Math.round(holdingTimeScore), fullMark: 100 },
          { subject: '盈虧比', A: Math.round(profitFactorScore), fullMark: 100 },
          { subject: '交易頻率', A: Math.round(frequencyScore), fullMark: 100 },
          { subject: '連勝', A: Math.round(winStreakScore), fullMark: 100 },
          { subject: '連敗', A: Math.round(lossStreakScore), fullMark: 100 },
        ]);
        
        setIsLoading(false);
      } catch (err) {
        console.error('處理勝率雷達圖數據失敗:', err);
        setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
        setData([]);
        setIsLoading(false);
      }
    };

    calculateMetrics();
  }, [tradeHistories]);

  // 自定義工具提示
  interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      name: string;
    }>;
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{label}</p>
          <p className={`text-sm ${payload[0].value >= 50 ? 'text-green-500' : 'text-red-500'}`}>
            評分: {payload[0].value}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {getMetricDescription(label)}
          </p>
        </div>
      );
    }
    return null;
  };

  // 獲取指標說明
  const getMetricDescription = (metric: string | undefined): string => {
    if (!metric) return '';
    
    switch (metric) {
      case '勝率':
        return '盈利交易佔總交易的百分比 (越高越好)';
      case '持倉時間':
        return '最佳持倉時間在30-60分鐘，過長或過短均降低評分';
      case '盈虧比':
        return '盈利交易總額與虧損交易總額之比 (理想值≥2.5)';
      case '交易頻率':
        return '每天交易次數，最佳頻率為2-5次/天';
      case '連勝':
        return '最大連續盈利交易次數 (越高越好)';
      case '連敗':
        return '最大連續虧損交易次數 (越低越好)';
      default:
        return '';
    }
  };

  // 如果正在加載中
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mr-2"></div>
        <span className="text-muted-foreground">載入中...</span>
      </div>
    );
  }

  // 如果有錯誤
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  // 如果沒有數據
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無交易數據</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis 
          dataKey="subject" 
          tick={{ fill: '#9ca3af', fontSize: 10 }} 
        />
        <PolarRadiusAxis 
          angle={30} 
          domain={[0, 100]} 
          tick={{ fill: '#9ca3af', fontSize: 10 }} 
          tickCount={5} 
        />
        <Radar
          name="交易表現"
          dataKey="A"
          stroke="#5d6d9e"
          fill="#5d6d9e"
          fillOpacity={0.5}
        />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
} 