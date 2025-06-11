'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BinanceAccountValue } from '@/lib/api/binance';
import { TradeHistory } from '@/lib/api/trade-history';
// 導入 polyfill
import '@/lib/polyfills';

interface AssetTrendChartProps {
  accountValue: BinanceAccountValue | null;
  currency?: string;
  timeRange?: string;
  tradeHistories?: TradeHistory[] | null;
}

// 自定義工具提示的 props 類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
  }>;
  label?: string;
}

// 圖表數據類型
interface ChartDataPoint {
  date: string;
  value: number;
}

export function AssetTrendChart({ 
  accountValue, 
  currency = 'USDT', 
  timeRange = 'today',
  tradeHistories = null
}: AssetTrendChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const chartType = '合約資產趨勢';

  useEffect(() => {
    try {
      console.log(`開始生成${chartType}圖表數據，時間範圍:`, timeRange);
      setIsLoading(true);
      setError(null);
      
      if (!accountValue || !accountValue.history || accountValue.history.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }
      
      const now = new Date();
      const startDate = getStartDateByTimeRange(now, timeRange);
      
      // 過濾數據點，只保留時間範圍內的數據
      const filteredData = accountValue.history.filter(item => {
        const itemDate = new Date(item.date);
        return itemDate >= startDate && itemDate <= now;
      });
      
      if (filteredData.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }
      
      // 處理數據並創建圖表數據點
      const data: ChartDataPoint[] = filteredData.map(item => ({
        date: formatDate(new Date(item.date)),
        value: parseFloat((item.total_value || 0).toFixed(2))
      }));
      
      // 按日期排序
      data.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });
      
      setChartData(data);
      setIsLoading(false);
      console.log(`${chartType}圖表數據生成完成，數據點數量:`, data.length);
    } catch (err) {
      console.error(`生成${chartType}圖表數據失敗:`, err);
      setError(`生成圖表數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setIsLoading(false);
      setChartData([]);
    }
  }, [accountValue, timeRange, tradeHistories, chartType]);

  // 根據時間範圍獲取開始日期
  const getStartDateByTimeRange = (now: Date, range: string): Date => {
    try {
      const startDate = new Date(now);
      
      switch (range) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7days':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30days':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '3months':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6months':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case '1year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        case 'custom':
          // 自訂日期範圍已在dashboard頁面處理
          startDate.setDate(startDate.getDate() - 30); // 默認顯示30天
          break;
        default:
          startDate.setDate(startDate.getDate() - 7); // 默認為7天
      }
      
      return startDate;
    } catch (error) {
      console.error('獲取時間範圍錯誤:', error);
      // 返回默認值：7天前
      const defaultDate = new Date(now);
      defaultDate.setDate(defaultDate.getDate() - 7);
      return defaultDate;
    }
  };

  // 格式化日期
  const formatDate = (date: Date): string => {
    try {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}/${day}`;
    } catch (error) {
      console.error('日期格式化錯誤:', error);
      return '無效日期';
    }
  };

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{label}</p>
          <p className="text-sm">
            {`${payload[0].value.toFixed(2)} ${currency}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {chartType}圖顯示資產隨時間的變化趨勢
          </p>
        </div>
      );
    }
    return null;
  };

  // 如果正在加載，顯示加載信息
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">載入中...</p>
      </div>
    );
  }

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
        <p className="text-muted-foreground">暫無資產趨勢數據</p>
      </div>
    );
  }

  // 使用一個穩定的 key 來強制 React 在需要時重新創建圖表
  const chartKey = `${chartType}-${timeRange}-chart`;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        key={chartKey}
        data={chartData}
        margin={{
          top: 5,
          right: 10,
          left: 10,
          bottom: 20,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
        <XAxis 
          dataKey="date" 
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          style={{ fontSize: '9px', fontWeight: 500 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <YAxis 
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickCount={6}
          style={{ fontSize: '9px', fontWeight: 500 }}
          stroke="hsl(var(--muted-foreground))"
        />
        <Tooltip content={<CustomTooltip />} />
        <Line 
          type="monotone" 
          dataKey="value" 
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
          activeDot={{ r: 4, fill: "hsl(var(--accent))", stroke: "hsl(var(--accent))", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
} 