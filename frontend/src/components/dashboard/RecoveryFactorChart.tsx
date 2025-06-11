import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { format, isValid } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { ProfitTooltip } from '@/components/ui/enhanced-tooltip';

interface RecoveryFactorChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  currency: string;
  timeRange: string; // 保留但不使用
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
      pnl: number;
      highWaterMark: number;
      drawdown: number;
      isNewHigh: boolean;
    };
  }>;
  label?: string;
}

const chartConfig = {
  pnl: {
    label: "累計盈虧",
    color: "#22c55e", // 綠色
  },
  highWaterMark: {
    label: "最高水位",
    color: "#5d6d9e", // 藍色
  },
  cumulativeProfit: {
    label: "累計盈虧",
    color: "#22c55e", // 綠色
  },
} satisfies ChartConfig;

// 安全地解析日期，避免無效日期造成的錯誤
const safeParseDate = (dateStr: string | undefined | null): Date | null => {
  if (!dateStr) return null;
  try {
    const date = new Date(dateStr);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
};

export const RecoveryFactorChart: React.FC<RecoveryFactorChartProps> = ({ tradeHistories, currency }) => {



  const chartData = useMemo(() => {


    if (!tradeHistories || tradeHistories.length === 0) {
      return { data: [], maxDrawdown: 0, recoveryFactor: 0, drawdownPeriods: [], maxDrawdownPeriod: null };
    }

    // 過濾掉無效日期的交易
    const validTrades = tradeHistories.filter(trade => {
      const dateTime = safeParseDate(trade.closed_at || trade.close_time || trade.created_at || trade.entry_time);
      return dateTime !== null;
    });

    if (validTrades.length === 0) {
      return { data: [], maxDrawdown: 0, recoveryFactor: 0, drawdownPeriods: [], maxDrawdownPeriod: null };
    }

    // 按照時間排序
    const sortedTrades = [...validTrades].sort((a, b) => {
      const aTime = safeParseDate(a.closed_at || a.close_time || a.created_at || a.entry_time);
      const bTime = safeParseDate(b.closed_at || b.close_time || b.created_at || b.entry_time);
      
      if (!aTime || !bTime) return 0;
      return aTime.getTime() - bTime.getTime();
    });

    // 計算累計盈虧和回撤
    let cumulativePnl = 0;
    let highWaterMark = 0;
    let currentDrawdown = 0;
    let maxDrawdown = 0;
    let maxDrawdownStartValue = 0;
    let maxDrawdownEndValue = 0;
    let maxDrawdownStart: number | null = null;
    let maxDrawdownEnd: number | null = null;
    let inDrawdown = false;
    let drawdownStartIndex: number | null = null;
    
    const drawdownPeriods: Array<{start: number, end: number, depth: number, startValue: number, endValue: number}> = [];
    
    const data = sortedTrades.map((trade, index) => {
      const dateObj = safeParseDate(trade.closed_at || trade.close_time || trade.created_at || trade.entry_time);
      const date = dateObj || new Date();
      
      // 使用淨盈虧（包含手續費）
      const tradePnl = trade.net_pnl || (trade.total_pnl - (trade.total_fee || 0)) || 0;
      cumulativePnl += tradePnl;
      
      // 更新最高水位線
      if (cumulativePnl > highWaterMark) {
        highWaterMark = cumulativePnl;
        
        // 如果之前在回撤中，現在回到新高，記錄回撤結束
        if (inDrawdown) {
          inDrawdown = false;
          if (drawdownStartIndex !== null && currentDrawdown > 0) {
            drawdownPeriods.push({
              start: drawdownStartIndex,
              end: index - 1,
              depth: currentDrawdown,
              startValue: maxDrawdownStartValue,
              endValue: maxDrawdownEndValue
            });
          }
          currentDrawdown = 0;
          drawdownStartIndex = null;
        }
      } else {
        // 計算當前回撤
        const drawdown = highWaterMark > 0 ? ((highWaterMark - cumulativePnl) / Math.abs(highWaterMark)) * 100 : 0;
        
        // 如果不在回撤中，開始新的回撤
        if (!inDrawdown && drawdown > 0) {
          inDrawdown = true;
          drawdownStartIndex = index;
          maxDrawdownStartValue = cumulativePnl;
        }
        
        // 更新當前回撤和最大回撤
        if (drawdown > currentDrawdown) {
          currentDrawdown = drawdown;
          maxDrawdownEndValue = cumulativePnl;
        }
        
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          maxDrawdownStart = index;
          maxDrawdownEnd = index;
          maxDrawdownStartValue = highWaterMark;
          maxDrawdownEndValue = cumulativePnl;
        }
      }
      
      let formattedDate = '';
      try {
        formattedDate = format(date, 'MM/dd', { locale: zhTW });
      } catch {
        formattedDate = `項目${index+1}`;
      }
      
      return {
        date: formattedDate,
        displayDate: formattedDate,
        index,
        timestamp: date.getTime(),
        pnl: cumulativePnl,
        cumulativeProfit: cumulativePnl,
        highWaterMark,
        isNewHigh: cumulativePnl >= highWaterMark,
        drawdown: highWaterMark > 0 ? ((highWaterMark - cumulativePnl) / Math.abs(highWaterMark)) * 100 : 0
      };
    });
    
    // 計算恢復因子
    const totalProfit = cumulativePnl > 0 ? cumulativePnl : 0;
    const recoveryFactor = maxDrawdown > 0 ? totalProfit / maxDrawdown : 0;
    
 // Log calculated results

    return { 
      data, 
      maxDrawdown, 
      recoveryFactor,
      maxDrawdownPeriod: maxDrawdownStart !== null && maxDrawdownEnd !== null 
        ? { 
            start: maxDrawdownStart, 
            end: maxDrawdownEnd,
            startValue: maxDrawdownStartValue,
            endValue: maxDrawdownEndValue
          } 
        : null,
      drawdownPeriods
    };
  }, [tradeHistories]);

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const displayPayload: Array<{
        value: number;
        name: string;
        color: string;
        dataKey: string;
      }> = [];
      
      payload.forEach(entry => {
        if (entry.dataKey === 'cumulativeProfit') {
          displayPayload.push({
            value: entry.value,
            name: '累計盈虧',
            color: chartConfig.cumulativeProfit.color,
            dataKey: 'cumulativeProfit'
          });
        } else if (entry.dataKey === 'highWaterMark') {
          displayPayload.push({
            value: entry.value,
            name: '最高水位線',
            color: chartConfig.highWaterMark.color,
            dataKey: 'highWaterMark'
          });
        }
      });

      return (
        <ProfitTooltip
          active={active}
          payload={displayPayload}
          label={label}
          currency={currency}
        />
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

  return (
    <div className="h-full w-full">
      <ChartContainer config={chartConfig} className="h-full w-full">
        <LineChart
          data={chartData.data}
          margin={CHART_MARGINS.default}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="displayDate" 
            {...CHART_AXIS_CONFIG}
            interval={Math.max(0, Math.floor(chartData.data.length / 6) - 1)}
          />
          <YAxis 
            {...CHART_Y_AXIS_CONFIG}
            tickFormatter={(value) => `${value.toFixed(0)}`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="cumulativeProfit" 
            stroke={chartConfig.cumulativeProfit.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ 
              r: 5, 
              fill: chartConfig.cumulativeProfit.color,
              stroke: '#fff',
              strokeWidth: 2,
              className: 'drop-shadow-md'
            }}
          />
          <Line 
            type="monotone" 
            dataKey="highWaterMark" 
            stroke={chartConfig.highWaterMark.color}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ 
              r: 5, 
              fill: chartConfig.highWaterMark.color,
              stroke: '#fff',
              strokeWidth: 2,
              className: 'drop-shadow-md'
            }}
          />
          
          {/* 標記最大回撤區域 */}
          {chartData.maxDrawdownPeriod && (
            <ReferenceArea
              x1={chartData.data[chartData.maxDrawdownPeriod.start]?.displayDate}
              x2={chartData.data[chartData.maxDrawdownPeriod.end]?.displayDate}
              fill="rgba(239, 68, 68, 0.1)"
              stroke="rgba(239, 68, 68, 0.3)"
            />
          )}
          
          {/* 標記所有回撤區域 - 使用索引而非日期 */}
          {chartData.drawdownPeriods.map((period, idx) => {
            // 檢查索引是否有效
            if (period.start < 0 || period.start >= chartData.data.length || 
                period.end < 0 || period.end >= chartData.data.length) {
              return null;
            }
            
            return (
              <ReferenceArea 
                key={`dd-${idx}`}
                x1={chartData.data[period.start].displayDate} 
                x2={chartData.data[period.end].displayDate}
                stroke="#f97316"
                strokeOpacity={0.2}
                fill="#f97316"
                fillOpacity={0.05}
              />
            );
          })}
        </LineChart>
      </ChartContainer>
    </div>
  );
};

// 資金回收曲線說明組件
export const RecoveryFactorChartWithTooltip: React.FC<RecoveryFactorChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

  // 計算統計數據
  const statisticsData = useMemo(() => {
    if (!props.tradeHistories || props.tradeHistories.length === 0) {
      return { recoveryFactor: 0, maxDrawdown: 0 };
    }

    // 使用與主圖表相同的計算邏輯
    const validTrades = props.tradeHistories.filter(trade => {
      const dateTime = safeParseDate(trade.closed_at || trade.close_time || trade.created_at || trade.entry_time);
      return dateTime !== null;
    });

    if (validTrades.length === 0) {
      return { recoveryFactor: 0, maxDrawdown: 0 };
    }

    const sortedTrades = [...validTrades].sort((a, b) => {
      const aTime = safeParseDate(a.closed_at || a.close_time || a.created_at || a.entry_time);
      const bTime = safeParseDate(b.closed_at || b.close_time || b.created_at || b.entry_time);
      
      if (!aTime || !bTime) return 0;
      return aTime.getTime() - bTime.getTime();
    });

    let cumulativePnl = 0;
    let highWaterMark = 0;
    let maxDrawdown = 0;

    sortedTrades.forEach(trade => {
      const tradePnl = trade.net_pnl || (trade.total_pnl - (trade.total_fee || 0)) || 0;
      cumulativePnl += tradePnl;
      
      if (cumulativePnl > highWaterMark) {
        highWaterMark = cumulativePnl;
      } else {
        const drawdown = highWaterMark > 0 ? ((highWaterMark - cumulativePnl) / Math.abs(highWaterMark)) * 100 : 0;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    });

    const totalProfit = cumulativePnl > 0 ? cumulativePnl : 0;
    const recoveryFactor = maxDrawdown > 0 ? totalProfit / maxDrawdown : 0;

    return { recoveryFactor, maxDrawdown };
  }, [props.tradeHistories]);

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
            <p className="text-muted-foreground text-xs">顯示資金回收因子的變化趨勢，評估策略的風險調整後收益。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 回收因子 = 淨利潤 / 最大回撤</div>
              <div>• 數值越高越好</div>
              <div>• {'>'}1：策略有效</div>
              <div>• {'<'}1：需要優化</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 評估風險調整後的收益</div>
              <div>• 比較不同策略的效率</div>
              <div>• 監控策略穩定性</div>
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
        恢復因子: <span className="text-blue-500">{statisticsData.recoveryFactor.toFixed(2)}</span>
      </span>
      <span className="font-medium">
        最大回撤: <span className="text-red-500">{statisticsData.maxDrawdown.toFixed(2)}%</span>
      </span>
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="資金回收曲線" 
      helpTooltip={helpTooltip}
      statisticsInfo={statisticsInfo}
      className="h-full"
    >
      <RecoveryFactorChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 