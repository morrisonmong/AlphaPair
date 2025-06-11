'use client';

import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_COLORS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip';

interface ProfitLossDistributionChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  timeRange: string;
  currency: string;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: {
      range: string;
      count: number;
      isProfit: boolean;
    };
  }>;
  label?: string;
}

const chartConfig = {
  count: {
    label: "交易次數",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig;

export function ProfitLossDistributionChart({ 
  tradeHistories,
  timeRange = '30d'
}: ProfitLossDistributionChartProps) {
  const [error, setError] = useState<string | null>(null);

  const chartData = useMemo(() => {
    try {
      if (!tradeHistories || tradeHistories.length === 0) {
        return [];
      }

      // 只考慮已關閉的交易
      const closedTrades = tradeHistories.filter(trade => 
        trade.closed_at !== null && (trade.total_pnl_percent !== undefined || trade.total_ratio_percent !== undefined)
      );

      if (closedTrades.length === 0) {
        return [];
      }

      // 計算盈虧百分比的分佈
      // 將盈虧百分比分成不同的區間
      const buckets: Record<string, { count: number, isProfit: boolean }> = {};
      
      // 定義區間範圍，根據時間範圍調整區間粒度
      let ranges: number[] = [];
      
      // 根據時間範圍調整區間
      if (timeRange === 'today' || timeRange === '7d') {
        // 較短時間範圍使用更精細的區間
        ranges = [
          -30, -20, -15, -10, -7.5, -5, -2.5, -1, 0, 
          1, 2.5, 5, 7.5, 10, 15, 20, 30
        ];
      } else if (timeRange === '30d' || timeRange === '90d') {
        // 中等時間範圍
        ranges = [
          -50, -30, -20, -15, -10, -7.5, -5, -2.5, -1, 0, 
          1, 2.5, 5, 7.5, 10, 15, 20, 30, 50
        ];
      } else {
        // 較長時間範圍使用更寬的區間
        ranges = [
          -100, -50, -30, -20, -10, -5, 0, 
          5, 10, 20, 30, 50, 100
        ];
      }
      
      // 初始化區間
      for (let i = 0; i < ranges.length - 1; i++) {
        const bucketKey = `${ranges[i]}~${ranges[i+1]}`;
        buckets[bucketKey] = { count: 0, isProfit: ranges[i] >= 0 };
      }
      
      // 統計每個區間的交易數量
      closedTrades.forEach(trade => {
        const pnlPercent = trade.total_pnl_percent || trade.total_ratio_percent || 0;
        
        // 找到對應的區間
        for (let i = 0; i < ranges.length - 1; i++) {
          if (pnlPercent >= ranges[i] && pnlPercent < ranges[i+1]) {
            const bucketKey = `${ranges[i]}~${ranges[i+1]}`;
            buckets[bucketKey].count += 1;
            break;
          }
        }
        
        // 處理超出最大區間的情況
        if (pnlPercent >= ranges[ranges.length - 1]) {
          const bucketKey = `${ranges[ranges.length - 2]}~${ranges[ranges.length - 1]}`;
          buckets[bucketKey].count += 1;
        } else if (pnlPercent < ranges[0]) {
          const bucketKey = `${ranges[0]}~${ranges[1]}`;
          buckets[bucketKey].count += 1;
        }
      });
      
      // 轉換為圖表數據格式
      return Object.entries(buckets)
        .filter(([, value]) => value.count > 0) // 只顯示有交易的區間
        .map(([range, value]) => ({
          range,
          count: value.count,
          isProfit: value.isProfit
        })).sort((a, b) => {
          // 按照區間排序
          const rangeA = a.range.split('~').map(Number)[0];
          const rangeB = b.range.split('~').map(Number)[0];
          return rangeA - rangeB;
        });
    } catch (err) {
      console.error('處理盈虧分佈數據失敗:', err);
      setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      return [];
    }
  }, [tradeHistories, timeRange]);

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const displayPayload = [{
        value: payload[0].value,
        name: '交易數量',
        color: payload[0].payload.isProfit ? '#22c55e' : '#ef4444',
        dataKey: 'count'
      }];

      return (
        <EnhancedTooltip
          active={active}
          payload={displayPayload}
          label={`盈虧範圍: ${label}`}
          labelFormatter={(label) => label}
          formatter={(value) => `${value} 筆交易`}
        />
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
        <p className="text-muted-foreground">暫無盈虧分佈數據</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart data={chartData} margin={CHART_MARGINS.default}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
          dataKey="range" 
            {...CHART_AXIS_CONFIG}
          angle={-45}
          textAnchor="end"
          height={50}
            style={{ fontSize: '8px', fontWeight: 500 }}
            interval={0}
        />
        <YAxis 
            {...CHART_Y_AXIS_CONFIG}
        />
        <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[2, 2, 0, 0]}>
          {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.isProfit ? CHART_COLORS.profit : CHART_COLORS.loss}
                className="transition-opacity duration-200 hover:opacity-80"
              />
          ))}
        </Bar>
      </BarChart>
      </ChartContainer>
    </div>
  );
}

// 盈虧分佈說明組件
export const ProfitLossDistributionChartWithTooltip: React.FC<ProfitLossDistributionChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // 計算統計數據
  const statisticsData = useMemo(() => {
    if (!props.tradeHistories || props.tradeHistories.length === 0) {
      return { totalTrades: 0, winRate: 0 };
    }

    const closedTrades = props.tradeHistories.filter(trade => 
      trade.closed_at !== null && (trade.total_pnl_percent !== undefined || trade.total_ratio_percent !== undefined)
    );

    if (closedTrades.length === 0) {
      return { totalTrades: 0, winRate: 0 };
    }

    const profitTrades = closedTrades.filter(trade => {
      const pnlPercent = trade.total_pnl_percent || trade.total_ratio_percent || 0;
      return pnlPercent > 0;
    });

    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (profitTrades.length / totalTrades * 100) : 0;

    return { totalTrades, winRate };
  }, [props.tradeHistories, props.timeRange]);

  const helpTooltip = (
    <div className="relative">
      <HelpCircle 
        className="h-4 w-4 text-muted-foreground cursor-help" 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute left-6 top-0 z-50 w-52 p-2 bg-background border border-border rounded shadow-md text-xs">
          <div className="space-y-1">
            <div className="font-medium">📊 圖表功能</div>
            <p className="text-muted-foreground text-xs">顯示交易盈虧百分比的分佈情況，分析交易結果的集中度。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• X軸：盈虧百分比區間</div>
              <div>• Y軸：交易次數</div>
              <div>• <span className="text-green-400">綠色</span>：盈利區間</div>
              <div>• <span className="text-red-400">紅色</span>：虧損區間</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 了解交易結果的分佈特徵</div>
              <div>• 評估風險收益比</div>
              <div>• 優化止盈止損策略</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 創建統計信息組件
  const statisticsInfo = (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="font-medium">
        總交易: <span className="text-blue-500">{statisticsData.totalTrades}</span>
      </span>
      <span className="font-medium">
        勝率: <span className="text-green-500">{statisticsData.winRate.toFixed(1)}%</span>
      </span>
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="盈虧分佈" 
      helpTooltip={helpTooltip}
      statisticsInfo={statisticsInfo}
      className="h-full"
    >
      <ProfitLossDistributionChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 