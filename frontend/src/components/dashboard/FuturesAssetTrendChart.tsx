'use client';

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getAssetSnapshots, TrendDataPoint } from '@/lib/api/asset-snapshot';
import { Loader2 } from "lucide-react";
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG, CHART_TOOLTIP_HEADER_HEIGHT, CHART_CONTENT_HEIGHT } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { EnhancedTooltip } from '@/components/ui/enhanced-tooltip';

// 定義 TimeRange 類型
export type TimeRange = '7d' | '30d' | '90d' | '180d' | '1y';

interface FuturesAssetTrendChartProps {
  timeRange?: TimeRange;
  currency?: string;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: TrendDataPoint;
  }>;
  label?: string;
}

interface EnhancedTrendDataPoint extends TrendDataPoint {
  timestamp: number; // 添加時間戳屬性
}

const chartConfig = {
  value: {
    label: "合約資產",
    color: "#5FA5F9",
  },
} satisfies ChartConfig;

export function FuturesAssetTrendChart({ 
  timeRange = '30d',
  currency = 'USDT'
}: FuturesAssetTrendChartProps) {
  const [chartData, setChartData] = useState<TrendDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [changePercentage, setChangePercentage] = useState<number | null>(null);

  // 獲取資產快照數據的函數
  const fetchAssetSnapshotData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 根據時間範圍計算天數
      let days = 30; // 默認30天
      
      switch (timeRange) {
        case '7d':
          days = 7;
          break;
        case '30d':
          days = 30;
          break;
        case '90d':
          days = 90;
          break;
        case '180d':
          days = 180;
          break;
        case '1y':
          days = 365;
          break;
        default:
          days = 30;
      }
      

      
      // 從API獲取真實數據
      const snapshots = await getAssetSnapshots(days, 'day');
      
      console.log('合約資產趨勢圖 - 原始快照數據:', snapshots.slice(0, 5).map(s => ({
        timestamp: s.timestamp,
        date: s.timestamp ? new Date(s.timestamp).toISOString().split('T')[0] : 'N/A',
        futures_balance: s.futures_balance,
        total_balance: s.total_balance
      })));
      
      // 檢查數據完整性
      const dateSet = new Set();
      const duplicateDates = new Set();
      snapshots.forEach(snapshot => {
        if (snapshot.timestamp) {
          const date = new Date(snapshot.timestamp).toISOString().split('T')[0];
          if (dateSet.has(date)) {
            duplicateDates.add(date);
          }
          dateSet.add(date);
        }
      });
      
      console.log(`合約資產趨勢圖 - 數據分析:
        - 總快照數: ${snapshots.length}
        - 唯一日期數: ${dateSet.size}
        - 重複日期: ${Array.from(duplicateDates).join(', ') || '無'}
        - 時間範圍: ${Math.min(...snapshots.filter(s => s.timestamp).map(s => new Date(s.timestamp!).getTime()))} 到 ${Math.max(...snapshots.filter(s => s.timestamp).map(s => new Date(s.timestamp!).getTime()))}
      `);
      
      if (!snapshots || snapshots.length === 0) {

        setChartData([]);
        setIsLoading(false);
        return;
      }
      
      // 自定義處理快照數據，確保同一天只使用最新的數據
      const enhancedData: EnhancedTrendDataPoint[] = snapshots
        .filter(snapshot => snapshot.timestamp) // 過濾掉沒有時間戳的數據
        .map(snapshot => {
          const date = new Date(snapshot.timestamp!);
        const formattedDate = `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
        
        return {
          date: formattedDate,
          value: snapshot.futures_balance || 0,
            timestamp: new Date(snapshot.timestamp!).getTime() // 添加時間戳用於排序
        };
      }).sort((a, b) => {
        // 先按日期排序
        const [aMonth, aDay] = a.date.split('-').map(Number);
        const [bMonth, bDay] = b.date.split('-').map(Number);
        
        if (aMonth !== bMonth) return aMonth - bMonth;
        return aDay - bDay;
      });
      
      // 處理同一天有多個快照的情況，取最新的
      const latestDataByDate: Record<string, EnhancedTrendDataPoint> = {};
      
      // 遍歷所有數據點，找出每天最新的數據
      enhancedData.forEach(dataPoint => {
        if (
          !latestDataByDate[dataPoint.date] || 
          dataPoint.timestamp > latestDataByDate[dataPoint.date].timestamp
        ) {
          latestDataByDate[dataPoint.date] = dataPoint;
        }
      });
      
      // 將數據轉換回數組並按時間戳排序（使用實際快照數據，不填充）
      const finalChartData = Object.values(latestDataByDate).sort((a, b) => a.timestamp - b.timestamp);
      

      console.log('最終圖表數據（前5個）:', finalChartData.slice(0, 5).map(d => ({
        date: d.date,
        value: d.value,
        timestamp: new Date(d.timestamp).toISOString()
      })));
      
      // 計算變化百分比（使用實際數據）
      if (finalChartData.length >= 2) {
        const latestValue = finalChartData[finalChartData.length - 1].value;
        const oldestValue = finalChartData[0].value;
        const percentChange = oldestValue !== 0 ? ((latestValue - oldestValue) / oldestValue) * 100 : 0;
        setChangePercentage(percentChange);

      } else {
        setChangePercentage(null);
      }
      
      // 更新圖表數據
      setChartData(finalChartData);
      setIsLoading(false);
    } catch (err) {
      console.error('獲取資產趨勢數據失敗:', err);
      setError(`獲取資產數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setChartData([]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetSnapshotData();
  }, [timeRange]);

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const displayPayload = [{
        value: payload[0].value,
        name: '合約資產',
        color: chartConfig.value.color,
        dataKey: 'value'
      }];

      return (
        <EnhancedTooltip
          active={active}
          payload={displayPayload}
          label={label}
          currency={currency}
        />
      );
    }
    return null;
  };

  // 顯示錯誤
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-red-500 text-sm mb-2">{error}</p>
        <button 
          className="px-3 py-1 bg-primary/10 text-primary text-xs rounded hover:bg-primary/20"
          onClick={() => {
            setIsLoading(true);
            setError(null);
            fetchAssetSnapshotData();
          }}
        >
          重新加載
        </button>
      </div>
    );
  }
  
  // 如果沒有數據
  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground mb-2">暫無資產趨勢數據</p>
        <button 
          className="px-3 py-1 bg-primary/10 text-primary text-xs rounded hover:bg-primary/20"
          onClick={() => {
            setIsLoading(true);
            fetchAssetSnapshotData();
          }}
        >
          重新加載
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* 變化百分比顯示 */}
      {changePercentage !== null && (
        <div className="absolute top-1 right-1 z-10">
          <div className={`text-xs font-semibold ${changePercentage >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {changePercentage >= 0 ? '+' : ''}{changePercentage.toFixed(2)}%
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart 
            data={chartData} 
            margin={CHART_MARGINS.default}
            className="overflow-visible"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              {...CHART_AXIS_CONFIG}
              interval={Math.max(0, Math.floor(chartData.length / 6) - 1)}
            />
            <YAxis 
              {...CHART_Y_AXIS_CONFIG}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
              domain={['auto', 'auto']}
              allowDataOverflow={true}
            />
            <ChartTooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="value" 
              name="合約資產"
              stroke={chartConfig.value.color}
              fill={chartConfig.value.color}
              fillOpacity={0.2}
              strokeWidth={2}
              dot={false}
              activeDot={{ 
                r: 5, 
                fill: chartConfig.value.color,
                stroke: '#fff',
                strokeWidth: 2,
                className: 'drop-shadow-md'
              }}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}

// 合約資產趨勢說明組件
export const FuturesAssetTrendChartWithTooltip: React.FC<FuturesAssetTrendChartProps> = (props) => {
  return (
    <ChartWrapperWithTitle 
      title="合約資產趨勢"
      className="h-full"
    >
      <FuturesAssetTrendChart {...props} />
    </ChartWrapperWithTitle>
  );
}; 