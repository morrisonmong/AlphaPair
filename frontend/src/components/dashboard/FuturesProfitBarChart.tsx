'use client';

import React, { useState, useEffect } from 'react';
import { format, subDays, startOfDay } from 'date-fns';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, Tooltip, ReferenceLine } from 'recharts';
import { HelpCircle } from 'lucide-react';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_COLORS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';

interface FuturesProfitBarChartProps {
  data: TradeHistoryBackwardCompatible[];
  timeRange: string;
  isLoading: boolean;
  onRetry: () => void;
  includeFees?: boolean;
}

interface DailyProfitData {
  date: string;
  profit: number;
  formattedProfit: string;
  tradeCount: number;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: DailyProfitData;
  }>;
  label?: string;
}

const getStartDateByTimeRange = (timeRange: string): Date => {
  const today = startOfDay(new Date());
  switch (timeRange) {
    case 'today':
      return today;
    case '7days':
    case '7d':
      return subDays(today, 7);
    case '30days':
    case '30d':
      return subDays(today, 30);
    case '90days':
    case '90d':
      return subDays(today, 90);
    case '180days':
    case '180d':
      return subDays(today, 180);
    case '365days':
    case '365d':
      return subDays(today, 365);
    case 'ytd':
      const currentYear = new Date().getFullYear();
      return new Date(currentYear, 0, 1);
    case 'all':
      return new Date(2000, 0, 1);
    default:
      return subDays(today, 30);
  }
};

const calculateDailyProfits = (data: TradeHistoryBackwardCompatible[], timeRange: string, includeFees: boolean = true): DailyProfitData[] => {
  // console.log('FuturesProfitBarChart - 開始計算每日盈虧，原始數據:', data.length, '考慮手續費:', includeFees);
  
  const startDate = getStartDateByTimeRange(timeRange);
  const filteredData = data.filter(item => {
    const closeDate = item.closed_at ? new Date(item.closed_at) : (item.close_time ? new Date(item.close_time) : null);
    if (!closeDate) return false;
    return closeDate >= startDate;
  });
  
  // console.log('FuturesProfitBarChart - 過濾後數據:', filteredData.length);
  
  const dailyTradeStats: { 
    [key: string]: { 
      totalProfit: number; 
      tradeCount: number;
    } 
  } = {};
  
  filteredData.forEach(item => {
    const closeDate = item.closed_at ? new Date(item.closed_at) : (item.close_time ? new Date(item.close_time) : new Date());
    const dateStr = format(closeDate, 'MM-dd');
    
    // 根據 includeFees 參數選擇使用總盈虧或淨盈虧
    const currentProfit = includeFees 
      ? (item.net_pnl !== undefined ? item.net_pnl : (item.total_pnl !== undefined ? item.total_pnl - (item.total_fee || 0) : 0))
      : (item.total_pnl !== undefined ? item.total_pnl : 0);
    
    if (!dailyTradeStats[dateStr]) {
      dailyTradeStats[dateStr] = { totalProfit: 0, tradeCount: 0 };
    }
    dailyTradeStats[dateStr].totalProfit += currentProfit;
    dailyTradeStats[dateStr].tradeCount += 1;
    
    // console.log(`FuturesProfitBarChart - ${dateStr}: 交易 ${dailyTradeStats[dateStr].tradeCount}, 當筆${includeFees ? '淨' : '總'}盈虧: ${currentProfit}, 累計: ${dailyTradeStats[dateStr].totalProfit}`);
  });
  
  const result = Object.entries(dailyTradeStats).map(([date, stats]) => ({
    date,
    profit: stats.totalProfit,
    formattedProfit: stats.totalProfit.toFixed(2),
    tradeCount: stats.tradeCount,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // console.log('FuturesProfitBarChart - 最終結果:', result);
  return result;
};

const chartConfig = {
  profit: {
    label: "每日盈虧",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export const FuturesProfitBarChart: React.FC<FuturesProfitBarChartProps> = ({ 
  data, 
  timeRange, 
  isLoading,
  onRetry,
  includeFees = true
}) => {
  const [chartData, setChartData] = useState<DailyProfitData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState<boolean>(isLoading);
  
  useEffect(() => {
    setLocalLoading(isLoading);
    if (!isLoading && data) {
      try {
        const profitData = calculateDailyProfits(data, timeRange, includeFees);
        setChartData(profitData);
        setError(null);
      } catch (err) {
        console.error('處理每日盈虧數據時出錯:', err);
        setError('處理數據時出錯');
      }
    }
  }, [data, timeRange, isLoading, includeFees]);
  
  const showRetryButton = error || (chartData.length === 0 && !localLoading);

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border rounded-lg shadow-lg p-3 min-w-[180px]">
          <div className="text-sm font-medium mb-2">{label}</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>每日盈虧:</span>
              <span style={{ color: data.profit >= 0 ? '#22c55e' : '#ef4444' }}>
                {data.profit.toFixed(2)} USDT
              </span>
            </div>
            <div className="flex justify-between">
              <span>交易筆數:</span>
              <span style={{ color: '#3b82f6' }}>
                {data.tradeCount} 筆
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full">
      {localLoading ? (
        <div className="flex h-full items-center justify-center">
          <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center">
          <p className="text-muted-foreground mb-4">{error}</p>
          {showRetryButton && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-8 px-2 lg:px-3">
              <Loader2Icon className="mr-2 h-4 w-4" />
              重新載入
            </Button>
          )}
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center">
          <p className="text-muted-foreground">此期間無交易數據</p>
          {showRetryButton && (
            <Button variant="outline" size="sm" onClick={onRetry} className="h-8 px-2 lg:px-3">
               重新整理
            </Button>
          )}
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <BarChart
            data={chartData}
            margin={CHART_MARGINS.default}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              {...CHART_AXIS_CONFIG}
              type="category"
              interval={chartData.length > 10 ? Math.floor(chartData.length / 8) : 0}
              tick={{ fontSize: 10 }}
              height={chartData.length > 15 ? 60 : 40}
              angle={chartData.length > 15 ? -45 : 0}
              textAnchor={chartData.length > 15 ? 'end' : 'middle'}
            />
            <YAxis 
              {...CHART_Y_AXIS_CONFIG}
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(0)}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke={CHART_COLORS.neutral} strokeDasharray="2 2" />
            <Bar 
              dataKey="profit" 
              radius={[2, 2, 0, 0]}
              minPointSize={5}
              maxBarSize={chartData.length === 1 ? 120 : 60}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.profit >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss}
                  className="transition-opacity duration-200 hover:opacity-80"
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </div>
  );
};

// 合約收益說明組件
export const FuturesProfitBarChartWithTooltip: React.FC<FuturesProfitBarChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const helpTooltip = (
    <div className="relative">
      <HelpCircle 
        className="h-4 w-4 text-muted-foreground cursor-help" 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute left-6 top-0 z-50 w-48 p-2 bg-background border border-border rounded shadow-md text-xs">
          <div className="space-y-1">
            <div className="font-medium">📊 圖表功能</div>
            <p className="text-muted-foreground text-xs">顯示每日合約交易的盈虧情況，追蹤日常交易表現。</p>
            
            <div className="font-medium">💰 計算方式</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 使用{props.includeFees ? '淨盈虧（已扣除手續費）' : '總盈虧（未扣除手續費）'}</div>
              <div>• 按交易平倉日期統計</div>
            </div>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• <span className="text-green-400">綠色</span>：當日盈利</div>
              <div>• <span className="text-red-400">紅色</span>：當日虧損</div>
              <div>• 高度：盈虧金額大小</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 識別交易表現的週期性模式</div>
              <div>• 評估日常交易策略效果</div>
              <div>• 發現需要調整的時間段</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="合約收益" 
      helpTooltip={helpTooltip}
      className="h-full"
    >
      <FuturesProfitBarChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 