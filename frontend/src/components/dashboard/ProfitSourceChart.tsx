'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';

interface ProfitSourceChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  timeRange?: string;
  currency?: string;
}

interface ProfitByPair {
  name: string;
  value: number;
}

export function ProfitSourceChart({ 
  tradeHistories, 
  timeRange = '30d',
  currency = 'USDT'
}: ProfitSourceChartProps) {
  const [chartData, setChartData] = useState<ProfitByPair[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processData = () => {
      try {
        setIsLoading(true);
        setError(null);
        
        if (!tradeHistories || tradeHistories.length === 0) {

          setChartData([]);
          setIsLoading(false);
          return;
        }

        // 計算每個交易對的凈盈利
        const profitByPair: Record<string, number> = {};

        // 只獲取有盈利的交易
        const profitableTrades = tradeHistories.filter(trade => (trade.net_pnl || 0) > 0);

        profitableTrades.forEach(trade => {
          try {
            // 獲取交易對名稱，優先使用symbol屬性，如果不可用則嘗試使用其他屬性或組合
            let pairName = '未知';
            
            // 檢查long_position和short_position以及它們的symbol屬性
            if (trade.long_position && trade.long_position.symbol && 
                trade.short_position && trade.short_position.symbol) {
              // 兩個都存在，使用它們組合
              pairName = `${trade.long_position.symbol}/${trade.short_position.symbol}`;
            } else if (trade.long_position && trade.long_position.symbol) {
              // 只有long存在
              pairName = `${trade.long_position.symbol}`;
            } else if (trade.short_position && trade.short_position.symbol) {
              // 只有short存在
              pairName = `${trade.short_position.symbol}`;
            } else if (trade.long_symbol && trade.short_symbol) {
              // 使用可能存在的長短符號屬性
              pairName = `${trade.long_symbol}/${trade.short_symbol}`;
            } else if (trade.long_symbol) {
              pairName = trade.long_symbol;
            } else if (trade.short_symbol) {
              pairName = trade.short_symbol;
            }
            
            // 計算盈利
            const net_pnl = trade.net_pnl || 0;
            
            // 更新該交易對的總盈利
            if (!profitByPair[pairName]) {
              profitByPair[pairName] = 0;
            }
            profitByPair[pairName] += net_pnl;
          } catch (err) {
            console.warn('處理交易記錄時出錯:', err);
            // 繼續處理下一個交易，不中斷流程
          }
        });

        // 轉換為圖表數據格式並排序
        const chartData = Object.entries(profitByPair)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // 如果條目太多，只保留前5個，其餘合併為"其他"
        if (chartData.length > 5) {
          const topEntries = chartData.slice(0, 5);
          const othersSum = chartData.slice(5).reduce((sum, item) => sum + item.value, 0);
          
          if (othersSum > 0) {
            topEntries.push({ name: '其他', value: othersSum });
          }
          
          setChartData(topEntries);
        } else {
          setChartData(chartData);
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('處理盈利來源數據失敗:', err);
        setError(`處理數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
        setChartData([]);
        setIsLoading(false);
      }
    };

    processData();
  }, [tradeHistories, timeRange]);

  // 圖表顏色
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#9370DB', '#A0A0A0'];

  // 自定義工具提示
  interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{
      name: string;
      value: number;
      payload: {
        name: string;
        value: number;
      };
    }>;
  }

  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const totalProfit = chartData.reduce((sum, item) => sum + item.value, 0);
      const percentage = ((data.value / totalProfit) * 100).toFixed(2);
      
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm text-green-500">
            {`${data.value.toFixed(2)} ${currency} (${percentage}%)`}
          </p>
        </div>
      );
    }
    return null;
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
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無盈利數據</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={1}
            dataKey="value"
            label={(entry) => `${((entry.value / chartData.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}