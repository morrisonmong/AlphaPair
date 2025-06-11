'use client';

import { useEffect, useState } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { TradeHistoryBackwardCompatible, TradeStatistics } from '@/lib/api/trade-history';

interface MaxDrawdownChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  tradeStats: TradeStatistics | null;
  currency?: string;
  timeRange?: string;
}

// 自定義工具提示的 props 類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
  }>;
  label?: string;
}

export function MaxDrawdownChart({ 
  tradeHistories, 
  tradeStats,
  currency = 'USDT',
  timeRange = 'today'
}: MaxDrawdownChartProps) {
  const [chartData, setChartData] = useState<Array<{ date: string; value: number; drawdown: number }>>([]);
  const [maxDrawdown, setMaxDrawdown] = useState<{ value: number; start: number; end: number }>({ value: 0, start: 0, end: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (!tradeHistories || tradeHistories.length === 0) {
        setChartData([]);
        return;
      }

      // Use tradeHistories directly, assuming it's pre-filtered by the parent
      const filteredHistories = tradeHistories.filter(history => {
        // Basic validation for closed_at/close_time
        return history.closed_at || history.close_time;
      });

      if (filteredHistories.length === 0) {
        setChartData([]);
        return;
      }

      // 按日期排序
      const sortedHistories = [...filteredHistories].sort((a, b) => {
        if ((a.closed_at || a.close_time) && (b.closed_at || b.close_time)) {
          const aTime = a.closed_at ? new Date(a.closed_at).getTime() : new Date(a.close_time!).getTime();
          const bTime = b.closed_at ? new Date(b.closed_at).getTime() : new Date(b.close_time!).getTime();
          return aTime - bTime;
        }
        return 0;
      });

      // 按日期分組
      const groupedByDate: Record<string, TradeHistoryBackwardCompatible[]> = {};
      sortedHistories.forEach(history => {
        if (history.closed_at || history.close_time) {
          const date = formatDate(new Date(history.closed_at || history.close_time!));
          if (!groupedByDate[date]) {
            groupedByDate[date] = [];
          }
          groupedByDate[date].push(history);
        }
      });

      // 計算每日累計盈虧和回撤
      let cumulativeValue = 0;
      let peakValue = 0;
      const data: Array<{ date: string; value: number; drawdown: number }> = [];
      let maxDrawdownValue = 0;
      let maxDrawdownStart = 0;
      let maxDrawdownEnd = 0;
      let currentPeakIndex = 0;

      // 確保日期連續
      const dateKeys = Object.keys(groupedByDate).sort((a, b) => {
        const dateA = new Date(a);
        const dateB = new Date(b);
        return dateA.getTime() - dateB.getTime();
      });

      if (dateKeys.length > 0) {
        // 添加起始日期的數據點
        const startDateStr = formatDate(new Date(dateKeys[0]));
        if (startDateStr !== dateKeys[0]) {
          data.push({
            date: startDateStr,
            value: 0,
            drawdown: 0
          });
          peakValue = 0;
        }

        // 添加每日數據
        dateKeys.forEach((date) => {
          const dailyHistories = groupedByDate[date];
          let dailyPnl = 0;

          dailyHistories.forEach(history => {
            // 使用淨盈虧（包含手續費）
            dailyPnl += history.net_pnl || (history.total_pnl - (history.total_fee || 0)) || 0;
          });

          cumulativeValue += dailyPnl;
          
          // 更新峰值
          if (cumulativeValue > peakValue) {
            peakValue = cumulativeValue;
            currentPeakIndex = data.length;
          }
          
          // 計算當前回撤（使用絕對值）
          const currentDrawdown = peakValue > 0 ? (Math.abs(peakValue - cumulativeValue) / Math.abs(peakValue)) * 100 : 0;
          
          // 更新最大回撤
          if (currentDrawdown > maxDrawdownValue) {
            maxDrawdownValue = currentDrawdown;
            maxDrawdownStart = currentPeakIndex;
            maxDrawdownEnd = data.length;
          }
          
          data.push({
            date,
            value: cumulativeValue,
            drawdown: currentDrawdown
          });
        });

        // 添加最後一天的數據點
        const endDateStr = formatDate(new Date(dateKeys[dateKeys.length - 1]));
        if (endDateStr !== dateKeys[dateKeys.length - 1]) {
          const currentDrawdown = peakValue > 0 ? (Math.abs(peakValue - cumulativeValue) / Math.abs(peakValue)) * 100 : 0;
          
          data.push({
            date: endDateStr,
            value: cumulativeValue,
            drawdown: currentDrawdown
          });
        }
      } else {
        // 如果沒有交易數據，設置為空數據
        setChartData([]);
        return;
      }

      setChartData(data);
      setMaxDrawdown({
        value: maxDrawdownValue,
        start: maxDrawdownStart,
        end: maxDrawdownEnd
      });
      setError(null);
    } catch (err) {
      console.error('處理最大回撤數據失敗:', err);
      setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setChartData([]);
    }
  }, [tradeHistories]);

  // 格式化日期
  const formatDate = (date: Date): string => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}/${day}`;
  };

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className={`text-sm ${entry.dataKey === 'drawdown' ? 'text-red-500' : 'text-green-500'}`}>
              {`${entry.dataKey === 'drawdown' ? '回撤' : '累計盈虧'}: ${entry.value.toFixed(2)}${entry.dataKey === 'drawdown' ? '%' : ` ${currency}`}`}
            </p>
          ))}
          <p className="text-xs text-muted-foreground mt-1">
            最大回撤：{tradeStats?.max_drawdown ? (tradeStats.max_drawdown * 100).toFixed(2) : maxDrawdown.value.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };

  // 如果有錯誤，顯示錯誤信息
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  // 如果沒有數據，顯示提示信息
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無最大回撤數據</p>
      </div>
    );
  }

  // 獲取最大回撤值
  const displayMaxDrawdown = tradeStats?.max_drawdown
    ? (tradeStats.max_drawdown * 100).toFixed(2)
    : maxDrawdown.value.toFixed(2);

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-0 right-0 bg-background/80 border border-border/30 p-1 rounded text-xs z-10">
        <span className="text-red-500 font-semibold">最大回撤: {displayMaxDrawdown}%</span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis 
            yAxisId="left"
            orientation="left"
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => value.toFixed(0)}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            domain={[0, 'dataMax']}
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => `${value.toFixed(0)}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="value"
            stroke="#4ade80"
            fill="#4ade80"
            fillOpacity={0.3}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="drawdown"
            stroke="#f87171"
            fill="#f87171"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
} 