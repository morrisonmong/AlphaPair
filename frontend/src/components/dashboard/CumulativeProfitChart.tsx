'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { format } from 'date-fns';
import { zhTW } from 'date-fns/locale';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart';
import { CHART_MARGINS } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { HelpCircle } from 'lucide-react';

interface CumulativeProfitChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  currency?: string;
  timeRange?: 'today' | '7d' | '30d' | '90d' | '180d' | '1y' | 'all' | 'custom';
  includeFees?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: {
      date: string;
      profit: number;
      dailyProfit: number;
      tradeCount: number;
    };
  }>;
  label?: string;
}

const chartConfig = {
  profit: {
    label: "累計盈虧",
    color: "hsl(25, 95%, 53%)", // 橘色
  },
} satisfies ChartConfig;

export function CumulativeProfitChart({ 
  tradeHistories, 
  currency = 'USDT',
  timeRange = '30d',
  includeFees = true
}: CumulativeProfitChartProps) {
  const [chartData, setChartData] = useState<Array<{ date: string; profit: number; dailyProfit: number; tradeCount: number }>>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processData = () => {
      try {
        setIsLoading(true);
        setError(null);
        
        if (!tradeHistories || tradeHistories.length === 0) {
          console.log('無交易歷史數據可用於累積盈虧圖表');
          setChartData([]);
          setIsLoading(false);
          return;
        }
        
        // 首先過濾掉沒有有效 closed_at 的交易，因為累積盈虧通常基於已平倉交易
        const closedTrades = tradeHistories.filter(trade => trade.closed_at);

        if (closedTrades.length === 0) {
          console.log('沒有有效的交易記錄可用於累積盈虧圖表');
          setChartData([]);
          setIsLoading(false);
          return;
        }
        
        // 按日期分組計算每日盈虧總和
        const dailyProfits: { [key: string]: { totalProfit: number; tradeCount: number; date: Date } } = {};
        
        closedTrades.forEach(trade => {
          const closeDate = new Date(trade.closed_at!);
          const dateKey = format(closeDate, 'yyyy-MM-dd'); // 使用完整日期作為 key 確保準確性
          
          // 根據 includeFees 參數選擇使用總盈虧或淨盈虧
          const pnl = includeFees 
            ? (trade.net_pnl !== undefined ? trade.net_pnl : (trade.total_pnl !== undefined ? trade.total_pnl - (trade.total_fee || 0) : 0))
            : (trade.total_pnl !== undefined ? trade.total_pnl : 0);
          
          if (!dailyProfits[dateKey]) {
            dailyProfits[dateKey] = { 
              totalProfit: 0, 
              tradeCount: 0, 
              date: closeDate 
            };
          }
          
          dailyProfits[dateKey].totalProfit += pnl;
          dailyProfits[dateKey].tradeCount += 1;
        });
        
        // 將日期排序並計算累計盈虧
        const sortedDates = Object.keys(dailyProfits).sort();
        let cumulativeProfit = 0;
        
        const data = sortedDates.map(dateKey => {
          const dayData = dailyProfits[dateKey];
          cumulativeProfit += dayData.totalProfit;
          
          return {
            date: format(dayData.date, 'MM/dd', { locale: zhTW }),
            profit: cumulativeProfit,
            dailyProfit: dayData.totalProfit, // 當日盈虧
            tradeCount: dayData.tradeCount, // 當日交易數量
          };
        });
        
        console.log(`累計盈虧圖表處理完成: ${data.length} 個數據點，最終累計盈虧: ${cumulativeProfit.toFixed(2)}，考慮手續費: ${includeFees}`);
        setChartData(data);
        setIsLoading(false);
      } catch (err) {
        console.error("Error processing cumulative profit data:", err);
        setError("無法載入圖表數據");
        setIsLoading(false);
        setChartData([]);
      }
    };
    
    processData();
  }, [tradeHistories, timeRange, includeFees]);

  // 自定義 Tooltip 組件
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="bg-background border border-border p-3 rounded shadow-md">
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">累計{includeFees ? '淨' : '總'}盈虧:</span>
              <span className={`font-medium ${data.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.profit >= 0 ? '+' : ''}{data.profit.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">當日{includeFees ? '淨' : '總'}盈虧:</span>
              <span className={`font-medium ${data.dailyProfit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.dailyProfit >= 0 ? '+' : ''}{data.dailyProfit.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">交易筆數:</span>
              <span className="font-medium text-blue-500">{data.tradeCount} 筆</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mr-2"></div>
        <span className="text-muted-foreground">載入中...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }
  
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無累積盈虧數據</p>
      </div>
    );
  }
  
  return (
    <ChartContainer config={chartConfig} className="h-full w-full">
      <LineChart data={chartData} margin={CHART_MARGINS.default}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis 
          dataKey="date" 
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          style={{ fontSize: '10px', fontWeight: 500 }}
          interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
        />
        <YAxis 
          tickLine={false}
          axisLine={false}
          tickMargin={6}
          tickCount={5}
          width={50}
          style={{ fontSize: '10px', fontWeight: 500 }}
          tickFormatter={(value) => `${value.toFixed(0)}`}
        />
        <ChartTooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" opacity={0.5} />
        <Line 
          type="monotone" 
          dataKey="profit" 
          stroke={chartConfig.profit.color}
          strokeWidth={2}
          dot={chartData.length < 30 ? { fill: chartConfig.profit.color, strokeWidth: 0, r: 3 } : false} 
          activeDot={{ 
            r: 5, 
            fill: chartConfig.profit.color, 
            stroke: '#fff', 
            strokeWidth: 2,
            className: 'drop-shadow-md'
          }}
        />
      </LineChart>
    </ChartContainer>
  );
}

// 合約累計盈虧說明組件
export const CumulativeProfitChartWithTooltip: React.FC<CumulativeProfitChartProps> = (props) => {
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
            <p className="text-muted-foreground text-xs">顯示合約交易的累計盈虧趨勢，追蹤資金增長軌跡。同一天的多筆交易會合併計算。</p>
            
            <div className="font-medium">🔍 指標說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 橘線：累計盈虧曲線</div>
              <div>• 上升：資金增長</div>
              <div>• 下降：資金回撤</div>
              <div>• 每個點代表一天的累計結果</div>
            </div>
            
            <div className="font-medium">📈 分析價值</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 評估整體交易表現</div>
              <div>• 識別回撤期間</div>
              <div>• 監控資金管理效果</div>
              <div>• 查看每日交易成果</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="合約累計盈虧" 
      helpTooltip={helpTooltip}
      className="h-full"
    >
      <CumulativeProfitChart {...props} />
    </ChartWrapperWithTitle>
  );
};
