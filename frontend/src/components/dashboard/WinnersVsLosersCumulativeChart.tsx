import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { format, isValid } from 'date-fns';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_COLORS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';

interface WinnersVsLosersCumulativeChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  currency: string;
  includeFees?: boolean;
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
      date: string;
      winners: number;
      losers: number;
      winRate: number;
    };
  }>;
  label?: string;
}

const chartConfig = {
  winners: {
    label: "獲利累計",
    color: "#22c55e", // 綠色
  },
  losers: {
    label: "虧損累計",
    color: "#ef4444", // 紅色
  },
} satisfies ChartConfig;

export const WinnersVsLosersCumulativeChart: React.FC<WinnersVsLosersCumulativeChartProps> = ({ 
  tradeHistories, 
  currency,
  includeFees = true // 預設值為 true
}) => {
  const chartData = useMemo(() => {
    if (!tradeHistories || tradeHistories.length === 0) {
      return [];
    }

    // 安全地解析日期
    const safeParseDate = (dateStr: string | undefined | null): Date | null => {
      if (!dateStr) return null;
      try {
        const date = new Date(dateStr);
        return isValid(date) ? date : null;
      } catch (e) {
        console.warn('無效日期格式:', dateStr, e);
        return null;
      }
    };

    // 過濾出已關閉且有有效日期的交易
    const validTrades = tradeHistories.filter(trade => {
      // 檢查是否有關閉時間
      const hasCloseTime = (trade.closed_at !== null && trade.closed_at !== undefined) || !!trade.close_time;
      
      // 確保所有必要的字段都存在
      const pnl = includeFees 
        ? (trade.net_pnl !== undefined ? trade.net_pnl : (trade.total_pnl !== undefined ? trade.total_pnl - (trade.total_fee || 0) : 0))
        : (trade.total_pnl !== undefined ? trade.total_pnl : 0);
      
      return hasCloseTime && pnl !== undefined && (pnl > -10000 && pnl < 10000);
    });

    if (validTrades.length === 0) {
      return [];
    }

    // 按照時間排序
    const sortedTrades = [...validTrades].sort((a, b) => {
      const dateA = safeParseDate(a.closed_at || a.close_time || a.created_at || a.entry_time);
      const dateB = safeParseDate(b.closed_at || b.close_time || b.created_at || b.entry_time);
      
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });

    let winnersCumulative = 0;
    let losersCumulative = 0;
    let totalWinners = 0;
    let totalTrades = 0;

    return sortedTrades.map((trade, index) => {
      const dateObj = safeParseDate(trade.closed_at || trade.close_time || trade.created_at || trade.entry_time);
      
      // 根據 includeFees 參數選擇使用總盈虧或淨盈虧
      const pnl = includeFees 
        ? (trade.net_pnl !== undefined ? trade.net_pnl : (trade.total_pnl !== undefined ? trade.total_pnl - (trade.total_fee || 0) : 0))
        : (trade.total_pnl !== undefined ? trade.total_pnl : 0);
      
      totalTrades++;
      
      if (pnl > 0) {
        winnersCumulative += pnl;
        totalWinners++;
      } else {
        losersCumulative += Math.abs(pnl);
      }
      
      const winRate = totalTrades > 0 ? (totalWinners / totalTrades) * 100 : 0;
      
      let formattedDate = '';
      try {
        formattedDate = dateObj ? format(dateObj, 'MM/dd') : `交易${index + 1}`;
      } catch {
        formattedDate = `交易${index + 1}`;
      }
      
      return {
        date: formattedDate,
        winners: winnersCumulative,
        losers: losersCumulative,
        winRate: winRate,
        index: index + 1
      };
    });
  }, [tradeHistories, includeFees]); // 添加 includeFees 到依賴項

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-sm" style={{ color: chartConfig.winners.color }}>
            獲利累計: {data.winners.toFixed(2)} {currency}
          </p>
          <p className="text-sm" style={{ color: chartConfig.losers.color }}>
            虧損累計: {data.losers.toFixed(2)} {currency}
          </p>
          <p className="text-sm text-muted-foreground">
            勝率: {data.winRate.toFixed(1)}%
          </p>
        </div>
      );
    }
    return null;
  };

  if (!tradeHistories || tradeHistories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">無交易數據</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">無有效交易數據</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <LineChart data={chartData} margin={CHART_MARGINS.default}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
            dataKey="date" 
            {...CHART_AXIS_CONFIG}
            interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
        />
        <YAxis 
            {...CHART_Y_AXIS_CONFIG}
            tickFormatter={(value) => `${value.toFixed(0)}`}
        />
        <Tooltip content={<CustomTooltip />} />
          <Legend 
            verticalAlign="top"
            height={20}
            wrapperStyle={{ fontSize: 11, paddingTop: 2, fontWeight: 600 }}
          />
        <Line 
          type="monotone" 
          dataKey="winners" 
            name="獲利累計"
            stroke={CHART_COLORS.profit}
            strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line 
          type="monotone" 
          dataKey="losers" 
            name="虧損累計"
            stroke={CHART_COLORS.loss}
            strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        </LineChart>
      </ChartContainer>
    </div>
  );
};

// 獲利累計vs虧損累計說明組件
export const WinnersVsLosersCumulativeChartWithTooltip: React.FC<WinnersVsLosersCumulativeChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // 計算統計數據
  const statisticsData = useMemo(() => {
    if (!props.tradeHistories || props.tradeHistories.length === 0) {
      return { totalProfit: 0, profitFactor: 0 };
    }

    const closedTrades = props.tradeHistories.filter(trade => trade.closed_at !== null);
    
    if (closedTrades.length === 0) {
      return { totalProfit: 0, profitFactor: 0 };
    }

    let totalWinnings = 0;
    let totalLosses = 0;

    closedTrades.forEach(trade => {
      // 根據 includeFees 參數選擇使用總盈虧或淨盈虧
      const pnl = props.includeFees 
        ? (trade.net_pnl !== undefined ? trade.net_pnl : (trade.total_pnl !== undefined ? trade.total_pnl - (trade.total_fee || 0) : 0))
        : (trade.total_pnl !== undefined ? trade.total_pnl : 0);
        
      if (pnl > 0) {
        totalWinnings += pnl;
      } else if (pnl < 0) {
        totalLosses += Math.abs(pnl);
      }
    });

    const totalProfit = totalWinnings - totalLosses;
    const profitFactor = totalLosses > 0 ? totalWinnings / totalLosses : (totalWinnings > 0 ? Infinity : 0);

    return { totalProfit, profitFactor };
  }, [props.tradeHistories, props.includeFees]); // 添加 includeFees 到依賴項

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
            <p className="text-muted-foreground text-xs">顯示獲利交易和虧損交易的累計變化趨勢，分析盈虧平衡點。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• <span className="text-green-400">綠線</span>：累計獲利</div>
              <div>• <span className="text-red-400">紅線</span>：累計虧損</div>
              <div>• 獲利因子 = 總獲利 / 總虧損</div>
              <div>• {'>'}1：策略盈利</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 評估策略的盈利能力</div>
              <div>• 監控風險控制效果</div>
              <div>• 識別策略轉折點</div>
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
        總盈虧: <span className={statisticsData.totalProfit >= 0 ? "text-green-500" : "text-red-500"}>
          {statisticsData.totalProfit >= 0 ? '+' : ''}{statisticsData.totalProfit.toFixed(2)} {props.currency}
        </span>
      </span>
      <span className="font-medium">
        獲利因子: <span className="text-blue-500">{statisticsData.profitFactor === Infinity ? '∞' : statisticsData.profitFactor.toFixed(2)}</span>
      </span>
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="獲利累計vs虧損累計" 
      helpTooltip={helpTooltip}
      statisticsInfo={statisticsInfo}
      className="h-full"
    >
      <WinnersVsLosersCumulativeChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 