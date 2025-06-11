import React, { useMemo, useState, useCallback, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { HelpCircle } from 'lucide-react';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_COLORS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';

interface MAEMFEScatterChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  currency?: string;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      mae: number;
      mfe: number;
      pnl: number;
      pnlPercent: number;
      symbol: string;
      status: string;
      id: string;
      closeDate?: string;
      trade_name?: string;
      created_at?: string;
      closed_at?: string;
      total_pnl?: number;
    }
  }>;
  label?: string;
}

// 散點圖數據類型
interface ScatterDataPoint {
  mae: number;
  mfe: number;
  pnl: number;
  pnlPercent: number;
  symbol: string;
  status: string;
  id: string;
  closeDate?: string;
  color: string;
  trade_name?: string;
  created_at?: string;
  closed_at?: string;
  total_pnl?: number;
}

const chartConfig = {
  mae: {
    label: "MAE",
    color: "hsl(var(--chart-1))",
  },
  mfe: {
    label: "MFE", 
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export const MAEMFEScatterChart: React.FC<MAEMFEScatterChartProps> = ({ tradeHistories, currency }) => {
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const [stableTooltip, setStableTooltip] = useState<boolean>(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const scatterData = useMemo((): ScatterDataPoint[] => {
    if (!tradeHistories || tradeHistories.length === 0) {
      return [];
    }

    return tradeHistories
      .filter(trade => trade.mae != null && trade.mfe != null)
      .map(trade => {
        const tradeName = trade.trade_name || `${trade.long_position?.symbol || trade.long_symbol}/${trade.short_position?.symbol || trade.short_symbol}`;
        return {
          mae: parseFloat((trade.mae || 0).toFixed(2)),
          mfe: parseFloat((trade.mfe || 0).toFixed(2)),
          pnl: parseFloat(trade.total_pnl.toFixed(2)),
          pnlPercent: parseFloat((trade.total_pnl_percent || trade.total_ratio_percent || 0).toFixed(2)),
          symbol: tradeName,
          status: trade.close_reason || '活躍',
          id: trade.id,
          closeDate: trade.closed_at ? new Date(trade.closed_at).toLocaleDateString('zh-TW') : (trade.close_time ? new Date(trade.close_time).toLocaleDateString('zh-TW') : '未知日期'),
          color: trade.total_pnl >= 0 ? '#22c55e' : '#ef4444',
          trade_name: tradeName,
          created_at: trade.created_at ? (() => {
            const date = new Date(trade.created_at);
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : '未知開倉日期',
          closed_at: trade.closed_at ? (() => {
            const date = new Date(trade.closed_at);
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : (trade.close_time ? (() => {
            const date = new Date(trade.close_time);
            const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
            return `${utc8Date.toLocaleDateString('zh-TW')} ${utc8Date.toLocaleTimeString('zh-TW')}`;
          })() : '未知平倉日期'),
          total_pnl: trade.total_pnl,
        };
      });
  }, [tradeHistories]);

  // 計算最近的數據點
  const findNearestPoint = useCallback((mouseX: number, mouseY: number, chartArea: DOMRect): ScatterDataPoint | null => {
    if (!scatterData.length) return null;

    // 獲取圖表的數據範圍
    const maeRange = {
      min: Math.min(...scatterData.map(d => d.mae)),
      max: Math.max(...scatterData.map(d => d.mae))
    };
    const mfeRange = {
      min: Math.min(...scatterData.map(d => d.mfe)),
      max: Math.max(...scatterData.map(d => d.mfe))
    };

    // 將滑鼠座標轉換為數據座標
    const chartWidth = chartArea.width - CHART_MARGINS.default.left - CHART_MARGINS.default.right;
    const chartHeight = chartArea.height - CHART_MARGINS.default.top - CHART_MARGINS.default.bottom;
    
    const relativeX = mouseX - chartArea.left - CHART_MARGINS.default.left;
    const relativeY = mouseY - chartArea.top - CHART_MARGINS.default.top;
    
    const dataX = maeRange.min + (relativeX / chartWidth) * (maeRange.max - maeRange.min);
    const dataY = mfeRange.max - (relativeY / chartHeight) * (mfeRange.max - mfeRange.min);

    // 找到最近的點
    let nearestPoint: ScatterDataPoint | null = null;
    let minDistance = Infinity;

    scatterData.forEach(point => {
      const distance = Math.sqrt(
        Math.pow((point.mae - dataX) / (maeRange.max - maeRange.min), 2) +
        Math.pow((point.mfe - dataY) / (mfeRange.max - mfeRange.min), 2)
      );
      
      if (distance < minDistance && distance < 0.15) { // 增加捕捉範圍
        minDistance = distance;
        nearestPoint = point;
      }
    });

    return nearestPoint;
  }, [scatterData]);

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
      
      // 防抖設置活躍點
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

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    // 只有在穩定狀態下才顯示工具提示
    if (active && payload && payload.length && stableTooltip) {
      const data = payload[0].payload;
      
      // 獲取交易名稱和日期
      const tradeName = data.trade_name || '未知交易對';
      const trade_created_at = data.created_at || '未知開倉日期';
      const trade_closed_at = data.closed_at || '未知平倉日期';
      const pnlAmount = data.pnl || 0;
      const maeValue = data.mae || 0;
      const mfeValue = data.mfe || 0;

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
              <span className="text-xs text-foreground/90 font-medium">MAE (最大不利變動):</span>
              <span className="text-xs font-bold text-red-400 whitespace-nowrap">
                {maeValue.toFixed(2)} %
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground/90 font-medium">MFE (最大有利變動):</span>
              <span className="text-xs font-bold text-green-400 whitespace-nowrap">
                {mfeValue.toFixed(2)} %
              </span>
            </div>
            
            <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/50">
              <span className="text-xs text-foreground/80 font-medium">最終盈虧</span>
              <span className={`text-xs font-bold ${pnlAmount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {pnlAmount >= 0 ? '+' : ''}{pnlAmount.toFixed(2)} {currency}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // 自定義散點形狀
  interface CustomizedDotProps {
    cx?: number;
    cy?: number;
    r?: number;
    payload?: {
      mae: number;
      mfe: number;
      pnl: number;
      pnlPercent: number;
      symbol: string;
      status: string;
      id: string;
      closeDate?: string;
      trade_name?: string;
      created_at?: string;
      closed_at?: string;
      total_pnl?: number;
      color: string;
    };
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

  if (!tradeHistories || tradeHistories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">無交易數據</p>
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
        <ScatterChart margin={CHART_MARGINS.default}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            type="number" 
            dataKey="mae" 
            name="MAE" 
            domain={['dataMin', 'dataMax']} 
            {...CHART_AXIS_CONFIG}
            tickFormatter={(value) => `${value.toFixed(0)}`}
          />
          <YAxis 
            type="number" 
            dataKey="mfe" 
            name="MFE" 
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
          <ReferenceLine x={0} stroke={CHART_COLORS.neutral} strokeDasharray="2 2" />
          <ReferenceLine y={0} stroke={CHART_COLORS.neutral} strokeDasharray="2 2" />
          <Scatter 
            name="配對交易" 
            data={scatterData} 
            fill="hsl(var(--chart-1))"
            shape={<CustomizedDot />}
          />
        </ScatterChart>
      </ChartContainer>
    </div>
  );
};

// MAE/MFE 分析說明組件
export const MAEMFEScatterChartWithTooltip: React.FC<MAEMFEScatterChartProps> = (props) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const helpTooltip = (
    <div className="relative">
      <HelpCircle 
        className="h-4 w-4 text-muted-foreground cursor-help" 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute left-6 top-0 z-50 w-56 p-2 bg-background border border-border rounded shadow-md text-xs">
          <div className="space-y-1">
            <div className="font-medium">📊 圖表功能</div>
            <p className="text-muted-foreground text-xs">分析每筆交易的最大不利變動(MAE)和最大有利變動(MFE)，評估交易執行效率。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• <span className="text-red-400">MAE</span>：交易期間最大虧損百分比</div>
              <div>• <span className="text-green-400">MFE</span>：交易期間最大獲利百分比</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 評估止損止盈設置是否合理</div>
              <div>• 識別交易執行時機問題</div>
              <div>• 優化進出場策略</div>
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
      title="MAE/MFE 分析" 
      helpTooltip={helpTooltip}
      className="h-full"
    >
      <MAEMFEScatterChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 