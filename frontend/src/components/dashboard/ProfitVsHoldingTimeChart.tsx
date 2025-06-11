'use client';

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { differenceInHours, isValid } from 'date-fns';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_COLORS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';

interface ProfitVsHoldingTimeChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  currency: string;
  timeRange: string;
}

interface ChartDataPoint {
  pnl: number;
  holdingTime: number;
  symbol: string;
  color: string;
  isValidPnl: boolean;
  isValidEntryTime: boolean;
  isValidExitTime: boolean;
  closeDate?: string;
  trade_name?: string;
  created_at?: string;
  closed_at?: string;
  id: string;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: ChartDataPoint;
  }>;
  label?: string;
}

const chartConfig = {
  pnl: {
    label: "盈虧",
    color: "hsl(var(--chart-1))",
  },
  holdingTime: {
    label: "持倉時間",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export function ProfitVsHoldingTimeChart({ 
  tradeHistories, 
  currency = 'USDT'
}: ProfitVsHoldingTimeChartProps) {
  const [error, setError] = useState<string | null>(null);
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const [stableTooltip, setStableTooltip] = useState<boolean>(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo((): ChartDataPoint[] => {
    try {
      if (!tradeHistories || tradeHistories.length === 0) {
        return [];
      }

      // 只考慮已關閉的交易
      const closedTrades = tradeHistories.filter(trade => 
        (trade.closed_at !== null || trade.close_time !== null) && 
        (trade.created_at !== null || trade.entry_time !== null)
      );

      if (closedTrades.length === 0) {
        return [];
      }

      const processedTrades = closedTrades.map(trade => {
        // 優先使用 net_pnl，然後是 total_pnl
        const pnlValue = trade.net_pnl ?? trade.total_pnl ?? trade.total_pnl_value ?? 0;
        const entryTime = new Date(trade.created_at || trade.entry_time || '');
        const exitTime = new Date(trade.closed_at || trade.close_time || '');
        const holdingHours = differenceInHours(exitTime, entryTime);
        let symbolDisplay = '未知';
        if (trade.trade_name) {
          symbolDisplay = trade.trade_name;
        } else if (trade.long_position && trade.short_position) {
          symbolDisplay = `${trade.long_position.symbol}/${trade.short_position.symbol}`;
        } else if (trade.long_position) {
          symbolDisplay = trade.long_position.symbol;
        } else if (trade.short_position) {
          symbolDisplay = trade.short_position.symbol;
        }

        return {
          ...trade, // 保留原始交易信息，以防 tooltip 等需要
          pnl: pnlValue,
          holdingTime: holdingHours,
          symbol: symbolDisplay,
          color: pnlValue >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss,
          isValidPnl: isFinite(pnlValue), // 只檢查數值有效性，不限制金額大小
          isValidEntryTime: isValid(entryTime),
          isValidExitTime: isValid(exitTime),
          closeDate: trade.closed_at || trade.close_time ? exitTime.toISOString().split('T')[0] : undefined,
          trade_name: symbolDisplay,
          created_at: trade.created_at ? (() => {
            const date = new Date(trade.created_at);
            // 將 UTC 時間轉換為 UTC+8 (台北時間)
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : '未知開倉日期',
          closed_at: trade.closed_at ? (() => {
            const date = new Date(trade.closed_at);
            // 將 UTC 時間轉換為 UTC+8 (台北時間)
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : (trade.close_time ? (() => {
            const date = new Date(trade.close_time);
            // 將 UTC 時間轉換為 UTC+8 (台北時間)
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : '未知平倉日期'),
          id: trade.id,
        };
      });

      // 過濾掉無效的數據點 (PNL不是有效數字，或進出場時間無效，或持倉時間異常)
      const validChartDataPoints = processedTrades.filter(trade => 
        trade.isValidPnl && 
        trade.isValidEntryTime && 
        trade.isValidExitTime &&
        trade.holdingTime > 0 && // 持倉時間必須大於0
        trade.holdingTime < 8760 // 持倉時間不能超過一年(8760小時)
      );

      return validChartDataPoints;
    } catch (err) {
      console.error('處理持倉時間與盈虧關係數據失敗:', err);
      setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      return [];
    }
  }, [tradeHistories]);

  // 計算最近的數據點
  const findNearestPoint = useCallback((mouseX: number, mouseY: number, chartArea: DOMRect): ChartDataPoint | null => {
    if (!chartData.length) return null;

    // 獲取圖表的數據範圍
    const holdingTimeRange = {
      min: Math.min(...chartData.map(d => d.holdingTime)),
      max: Math.max(...chartData.map(d => d.holdingTime))
    };
    const pnlRange = {
      min: Math.min(...chartData.map(d => d.pnl)),
      max: Math.max(...chartData.map(d => d.pnl))
    };

    // 將滑鼠座標轉換為數據座標
    const chartWidth = chartArea.width - CHART_MARGINS.default.left - CHART_MARGINS.default.right;
    const chartHeight = chartArea.height - CHART_MARGINS.default.top - CHART_MARGINS.default.bottom;
    
    const relativeX = mouseX - chartArea.left - CHART_MARGINS.default.left;
    const relativeY = mouseY - chartArea.top - CHART_MARGINS.default.top;
    
    const dataX = holdingTimeRange.min + (relativeX / chartWidth) * (holdingTimeRange.max - holdingTimeRange.min);
    const dataY = pnlRange.max - (relativeY / chartHeight) * (pnlRange.max - pnlRange.min);

    // 找到最近的點
    let nearestPoint: ChartDataPoint | null = null;
    let minDistance = Infinity;

    chartData.forEach(point => {
      const distance = Math.sqrt(
        Math.pow((point.holdingTime - dataX) / (holdingTimeRange.max - holdingTimeRange.min), 2) +
        Math.pow((point.pnl - dataY) / (pnlRange.max - pnlRange.min), 2)
      );
      
      if (distance < minDistance && distance < 0.15) { // 增加捕捉範圍
        minDistance = distance;
        nearestPoint = point;
      }
    });

    return nearestPoint;
  }, [chartData]);

  // 處理滑鼠移動 - 簡化版本
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!chartRef.current) return;

    const chartArea = chartRef.current.getBoundingClientRect();
    const mouseX = event.clientX;
    const mouseY = event.clientY;

    // 檢查是否在圖表區域內
    const isInChart = mouseX >= chartArea.left + CHART_MARGINS.default.left &&
                     mouseX <= chartArea.right - CHART_MARGINS.default.right &&
                     mouseY >= chartArea.top + CHART_MARGINS.default.top &&
                     mouseY <= chartArea.bottom - CHART_MARGINS.default.bottom;

    if (isInChart) {
      const nearestPoint = findNearestPoint(mouseX, mouseY, chartArea);
      setActivePoint(nearestPoint?.id || null);
      setStableTooltip(!!nearestPoint);
    } else {
      setActivePoint(null);
      setStableTooltip(false);
    }
  }, [findNearestPoint]);

  // 處理滑鼠離開
  const handleMouseLeave = useCallback(() => {
    setActivePoint(null);
    setStableTooltip(false);
  }, []);

  // 處理觸摸事件
  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    if (!chartRef.current || !event.touches.length) return;

    const touch = event.touches[0];
    const chartArea = chartRef.current.getBoundingClientRect();
    const nearestPoint = findNearestPoint(touch.clientX, touch.clientY, chartArea);
    
    if (nearestPoint) {
      setActivePoint(nearestPoint.id);
      setStableTooltip(true);
    }
  }, [findNearestPoint]);

  // 自定義散點形狀
  interface CustomizedDotProps {
    cx?: number;
    cy?: number;
    r?: number;
    payload?: ChartDataPoint;
  }

  const CustomizedDot = (props: CustomizedDotProps) => {
    const { cx = 0, cy = 0, r = 4, payload } = props;
    
    const color = (payload?.pnl ?? 0) >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;
    const isActive = activePoint === payload?.id;
    
    return (
      <g>
        {/* 大範圍的透明觸發區域 - 手機優化 */}
        <circle 
          cx={cx} 
          cy={cy} 
          r={r * 6} 
          fill="transparent"
          stroke="none"
          style={{ cursor: 'pointer' }}
          className="hover-trigger touch-manipulation"
        />
        
        {/* 中等範圍的半透明區域，用於磁性吸附效果 */}
        <circle 
          cx={cx} 
          cy={cy} 
          r={r * 3} 
          fill={color}
          fillOpacity={isActive ? 0.15 : 0}
          stroke="none"
          className="transition-all duration-200"
        />
        
        {/* 實際顯示的點 */}
        <circle 
          cx={cx} 
          cy={cy} 
          r={isActive ? r * 1.5 : r} 
          stroke="white" 
          strokeWidth={isActive ? 2.5 : 1.5}
          fill={color}
          fillOpacity={0.9}
          style={{ cursor: 'pointer' }}
          className="transition-all duration-200 hover:drop-shadow-lg"
        />
        
        {/* 活躍狀態的外圈光暈效果 */}
        {isActive && (
          <>
            <circle 
              cx={cx} 
              cy={cy} 
              r={r + 4} 
              stroke={color} 
              strokeWidth={2}
              fill="none"
              fillOpacity={0}
              className="opacity-60 animate-pulse"
            />
            <circle 
              cx={cx} 
              cy={cy} 
              r={r + 8} 
              stroke={color} 
              strokeWidth={1}
              fill="none"
              fillOpacity={0}
              className="opacity-30 animate-pulse"
              style={{ animationDelay: '0.2s' }}
            />
          </>
        )}
      </g>
    );
  };

  // 自定義工具提示
  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    // 只有在穩定狀態下才顯示工具提示
    if (active && payload && payload.length && stableTooltip) {
      const data = payload[0].payload;
      
      // 獲取交易名稱和日期
      const tradeName = data.trade_name || '未知交易對';
      const trade_created_at = data.created_at || '未知開倉日期';
      const trade_closed_at = data.closed_at || '未知平倉日期';
      const pnlAmount = data.pnl || 0;
      const holdingHours = data.holdingTime || 0;

      // 將小時轉換為更友好的顯示格式
      const formatHoldingTime = (hours: number): string => {
        if (hours < 1) {
          return `${Math.round(hours * 60)} 分鐘`;
        } else if (hours < 24) {
          return `${hours.toFixed(1)} 小時`;
        } else {
          const days = Math.floor(hours / 24);
          const remainingHours = Math.round(hours % 24);
          return `${days} 天 ${remainingHours} 小時`;
        }
      };

      return (
        <div className="bg-background/95 backdrop-blur-md border border-border/80 rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-200 max-w-xs">
          <p className="font-semibold text-sm text-foreground mb-2 border-b border-border/50 pb-1">
            {tradeName}
          </p>
          <p className="text-xs text-foreground/70 mb-2">
            開倉日期: {trade_created_at}
          </p>
          <p className="text-xs text-foreground/70 mb-2">
            平倉日期: {trade_closed_at}
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground/90 font-medium">持倉時間:</span>
              <span className="text-xs font-bold text-blue-400 whitespace-nowrap">
                {formatHoldingTime(holdingHours)}
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/50">
              <span className="text-xs text-foreground/80 font-medium">盈虧金額</span>
              <span className={`text-xs font-bold ${pnlAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnlAmount >= 0 ? '+' : ''}{pnlAmount.toFixed(2)} {currency}
              </span>
            </div>
            
            <div className="text-xs text-foreground/60 mt-2 pt-1.5 border-t border-border/30">
              <div className="flex justify-between">
                <span>時間效率:</span>
                <span className="font-medium">
                  {holdingHours > 0 ? (pnlAmount / holdingHours).toFixed(2) : 'N/A'} {currency}/小時
                </span>
              </div>
            </div>
          </div>
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
        <p className="text-muted-foreground">暫無持倉時間數據</p>
      </div>
    );
  }

  return (
    <div 
      ref={chartRef}
      className="relative h-full w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseLeave}
    >
      <ChartContainer config={chartConfig} className="h-full w-full">
        <ScatterChart data={chartData} margin={CHART_MARGINS.default}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            type="number" 
            dataKey="holdingTime" 
            name="持倉時間" 
            domain={['dataMin', 'dataMax']} 
            {...CHART_AXIS_CONFIG}
            tickFormatter={(value) => `${value.toFixed(0)}h`}
          />
          <YAxis 
            type="number" 
            dataKey="pnl" 
            name="盈虧" 
            domain={['dataMin', 'dataMax']} 
            {...CHART_Y_AXIS_CONFIG}
            tickFormatter={(value) => `${value.toFixed(0)}`}
          />
          <Tooltip 
            content={<CustomTooltip />} 
            cursor={false}
            trigger="hover"
            allowEscapeViewBox={{ x: false, y: false }}
            animationDuration={200}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.neutral} strokeDasharray="2 2" />
          <Scatter 
            name="配對交易" 
            data={chartData} 
            fill="hsl(var(--chart-1))"
            shape={<CustomizedDot />}
          />
        </ScatterChart>
      </ChartContainer>
    </div>
  );
}

// 持倉時間vs盈虧說明組件
export const ProfitVsHoldingTimeChartWithTooltip: React.FC<ProfitVsHoldingTimeChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

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
            <p className="text-muted-foreground text-xs">分析持倉時間與交易盈虧的關係，識別最佳持倉週期。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• X軸：持倉時間（小時）</div>
              <div>• Y軸：盈虧金額</div>
              <div>• <span className="text-green-400">綠點</span>：盈利交易</div>
              <div>• <span className="text-red-400">紅點</span>：虧損交易</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 找出最佳持倉時間範圍</div>
              <div>• 識別過早或過晚平倉的模式</div>
              <div>• 優化交易時機策略</div>
            </div>

            <div className="font-medium">🎯 互動功能</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 滑鼠移動顯示智能十字線</div>
              <div>• 自動捕捉最近的數據點</div>
              <div>• 觸摸設備優化支持</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="持倉時間vs盈虧" 
      helpTooltip={helpTooltip}
      className="h-full"
    >
      <ProfitVsHoldingTimeChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 