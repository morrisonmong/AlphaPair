'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TradeHistoryBackwardCompatible, TradeStatistics } from '@/lib/api/trade-history';
import { isValid, format as formatDateFns } from 'date-fns';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { PercentageTooltip } from '@/components/ui/enhanced-tooltip';

interface VolatilityChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  statistics: TradeStatistics | null;
  timeRange: string;
  currency: string;
}

interface VolatilityData {
  date: string;
  volatility: number;
  returns: number;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: VolatilityData;
  }>;
  label?: string;
}

const chartConfig = {
  volatility: {
    label: "波動率",
    color: "hsl(var(--chart-3))",
  },
} satisfies ChartConfig;

export const VolatilityChart: React.FC<VolatilityChartProps> = ({ 
  tradeHistories, 
  timeRange
}) => {
  const [chartData, setChartData] = useState<VolatilityData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {


      if (!tradeHistories || tradeHistories.length === 0) {

        setChartData([]);
        return;
      }

      const filteredHistories = tradeHistories.filter(history => {
        if (!history.closed_at && !history.close_time) {
          return false;
        }
        const closedAt = new Date(history.closed_at || history.close_time || '');
        if (!isValid(closedAt)) {
          return false;
        }
        return true;
      });
      


      if (filteredHistories.length < 2) {

        setChartData([]);
        return;
      }

      // 按日期排序
      const sortedHistories = [...filteredHistories].sort((a, b) => {
        const aDate = new Date(a.closed_at || a.close_time || '');
        const bDate = new Date(b.closed_at || b.close_time || '');
        return aDate.getTime() - bDate.getTime();
      });

      // 按日期分組
      const groupedByDate: Record<string, TradeHistoryBackwardCompatible[]> = {};
      sortedHistories.forEach(history => {
        if (!history.closed_at && !history.close_time) return;
        const dateObj = new Date(history.closed_at || history.close_time || '');
        const dateStr = formatDateFns(dateObj, 'MM-dd');
        
        if (!groupedByDate[dateStr]) {
          groupedByDate[dateStr] = [];
        }
        groupedByDate[dateStr].push(history);
      });

      // 計算每日波動率和回報
      const volatilityData = Object.entries(groupedByDate).map(([date, trades]) => {
        const dailyReturn = trades.reduce((sum, trade) => {
          const pnlPercent = trade.total_pnl_percent || trade.total_ratio_percent || 0;
          return sum + pnlPercent;
        }, 0);

        const pnlValues = trades.map(trade => trade.total_pnl_percent || trade.total_ratio_percent || 0);
        const max = Math.max(...pnlValues);
        const min = Math.min(...pnlValues);
        const volatility = max - min;
        

        
        return {
          date,
          returns: dailyReturn,
          volatility
        };
      }).sort((a, b) => a.date.localeCompare(b.date));

      setChartData(volatilityData);

      setError(null);
    } catch (err) {
      console.error('處理波動率數據失敗:', err);
      setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setChartData([]);
    }
  }, [tradeHistories, timeRange]);

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const displayPayload = [{
        value: payload[0].value,
        name: '波動率',
        color: chartConfig.volatility.color,
        dataKey: 'volatility'
      }];

      return (
        <PercentageTooltip
          active={active}
          payload={displayPayload}
          label={label}
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
        <p className="text-muted-foreground">暫無波動率數據</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <ResponsiveContainer>
          <AreaChart
            data={chartData}
            margin={CHART_MARGINS.default}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              {...CHART_AXIS_CONFIG}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
            />
            <YAxis 
              {...CHART_Y_AXIS_CONFIG}
              domain={[0, 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(1)}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="volatility" 
              stroke="hsl(var(--chart-3))" 
              fill="hsl(var(--chart-3))" 
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
};

// 波動率說明組件
export const VolatilityChartWithTooltip: React.FC<VolatilityChartProps> = (props) => {
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
            <p className="text-muted-foreground text-xs">顯示每日交易波動率變化趨勢，評估交易風險和策略穩定性。</p>
            
            <p className="text-muted-foreground text-xs">每日波動率 = 當日最大盈虧百分比 - 最小盈虧百分比</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 高波動率：風險較高，但可能有更大收益</div>
              <div>• 低波動率：風險較低，收益相對穩定</div>
              <div>• 趨勢變化：策略適應性分析</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 評估交易策略的風險水平</div>
              <div>• 識別市場環境變化</div>
              <div>• 調整風險管理參數</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // 創建統計信息組件
  const statisticsInfo = (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <span className="text-purple-500 font-medium">
        平均波動率: {props.statistics?.volatility ? props.statistics.volatility.toFixed(2) : '0.00'}%
      </span>
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="波動率分析" 
      helpTooltip={helpTooltip}
      statisticsInfo={statisticsInfo}
      className="h-full"
    >
      <VolatilityChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 