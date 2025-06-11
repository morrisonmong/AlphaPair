'use client';

import { useEffect, useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { isValid } from 'date-fns';
import { generateDeterministicId } from '@/lib/utils';

interface ProfitMetricsChartProps {
  tradeHistories: TradeHistoryBackwardCompatible[] | null;
  timeRange?: string;
}

// 自定義工具提示的 props 類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
  }>;
  label?: string;
}

export function ProfitMetricsChart({ 
  tradeHistories, 
  timeRange = 'today'
}: ProfitMetricsChartProps) {
  // 使用確定性 key - 移到頂部確保總是被調用
  const chartKey = useMemo(() => `profit-metrics-chart-${timeRange}`, [timeRange]);
  
  const [chartData, setChartData] = useState<Array<{ 
    date: string; 
    profitFactor: number; 
    riskRewardRatio: number;
    id: string;
  }>>([]);

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

  useEffect(() => {
    if (!tradeHistories || tradeHistories.length === 0) {
      // 如果沒有交易歷史數據，生成模擬數據用於展示
      generateMockData();
      return;
    }

    // 根據時間範圍過濾數據
    const filteredHistories = filterHistoriesByTimeRange(tradeHistories);
    
    // 按日期分組
    const groupedByDate = groupHistoriesByDate(filteredHistories);
    
    // 計算每日的獲利因子和平均盈虧比
    const metricsData = calculateDailyMetrics(groupedByDate);
    
    setChartData(metricsData);
  }, [tradeHistories, timeRange]);

  // 根據時間範圍過濾交易歷史
  const filterHistoriesByTimeRange = (histories: TradeHistoryBackwardCompatible[]): TradeHistoryBackwardCompatible[] => {
    const now = new Date();
    const startDate = getStartDateByTimeRange(now, timeRange);
    
    return histories.filter(history => {
      const closeTime = history.closed_at || history.close_time;
      if (!closeTime) return false;
      
      const parsedDate = safeParseDate(closeTime);
      if (!parsedDate) return false;
      
      return parsedDate >= startDate && parsedDate <= now;
    });
  };

  // 根據時間範圍獲取開始日期
  const getStartDateByTimeRange = (now: Date, range: string): Date => {
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
      default:
        startDate.setDate(startDate.getDate() - 7); // 默認為7天
    }
    
    return startDate;
  };

  // 按日期分組
  const groupHistoriesByDate = (histories: TradeHistoryBackwardCompatible[]): Record<string, TradeHistoryBackwardCompatible[]> => {
    const grouped: Record<string, TradeHistoryBackwardCompatible[]> = {};
    
    histories.forEach(history => {
      const closeTime = history.closed_at || history.close_time;
      if (!closeTime) return;
      
      const parsedDate = safeParseDate(closeTime);
      if (!parsedDate) return;
      
      const dateStr = formatDate(parsedDate);
      
      if (!grouped[dateStr]) {
        grouped[dateStr] = [];
      }
      
      grouped[dateStr].push(history);
    });
    
    return grouped;
  };

  // 計算每日的獲利因子和平均盈虧比
  const calculateDailyMetrics = (groupedHistories: Record<string, TradeHistoryBackwardCompatible[]>): Array<{ 
    date: string; 
    profitFactor: number; 
    riskRewardRatio: number;
    id: string;
  }> => {
    const result: Array<{ 
      date: string; 
      profitFactor: number; 
      riskRewardRatio: number;
      id: string;
    }> = [];
    
    // 按日期排序
    const sortedDates = Object.keys(groupedHistories).sort((a, b) => {
      const dateA = safeParseDate(a);
      const dateB = safeParseDate(b);
      
      if (!dateA || !dateB) return 0;
      return dateA.getTime() - dateB.getTime();
    });
    
    sortedDates.forEach((date, index) => {
      const dailyHistories = groupedHistories[date];
      
      // 計算獲利因子
      let totalPnl = 0;
      let totalWin = 0;
      let totalRR = 0;
      
      dailyHistories.forEach(history => {
        const pnl = history.net_pnl || (history.total_pnl - history.total_fee);
        totalPnl += pnl;
        
        if (pnl > 0) {
          totalWin += pnl;
        }
        
        const rr = history.risk_reward_ratio || 0;
        totalRR += rr;
      });
      
      const profitFactor = totalWin > 0 ? totalPnl / totalWin : totalPnl > 0 ? 999 : 0;
      
      // 計算平均盈虧比
      const riskRewardRatio = totalRR / dailyHistories.length;
      
      result.push({
        date,
        profitFactor: Number(profitFactor.toFixed(2)),
        riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
        id: generateDeterministicId('profitMetrics', index)
      });
    });
    
    return result;
  };

  // 格式化日期
  const formatDate = (date: Date): string => {
    try {
      const month = date.getMonth() + 1;
      const day = date.getDate();
      return `${month}/${day}`;
    } catch (e) {
      console.warn('日期格式化錯誤:', e);
      return '無效日期';
    }
  };

  // 生成模擬數據
  const generateMockData = () => {
    const now = new Date();
    const startDate = getStartDateByTimeRange(now, timeRange);
    const data: Array<{ 
      date: string; 
      profitFactor: number; 
      riskRewardRatio: number;
      id: string;
    }> = [];
    
    const currentDate = new Date(startDate);
    let index = 0;
    
    while (currentDate <= now) {
      // 添加一些隨機波動
      const profitFactor = 1 + Math.random() * 2; // 1 到 3 之間的隨機數
      const riskRewardRatio = 0.8 + Math.random() * 1.2; // 0.8 到 2 之間的隨機數
      
      data.push({
        date: formatDate(new Date(currentDate)),
        profitFactor: Number(profitFactor.toFixed(2)),
        riskRewardRatio: Number(riskRewardRatio.toFixed(2)),
        id: generateDeterministicId('mockProfitMetrics', index)
      });
      
      // 增加一天
      currentDate.setDate(currentDate.getDate() + 1);
      index++;
    }
    
    setChartData(data);
  };

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{label}</p>
          <p className="text-sm" style={{ color: 'hsl(var(--primary))' }}>{`獲利因子: ${payload[0].value}`}</p>
          <p className="text-sm" style={{ color: 'hsl(var(--accent))' }}>{`平均盈虧比: ${payload[1].value}`}</p>
        </div>
      );
    }
    return null;
  };

  // 如果沒有數據，顯示提示信息
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無獲益指標數據</p>
      </div>
    );
  }

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
          domain={[0, 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="profitFactor" 
          name="獲利因子"
          stroke="hsl(var(--primary))" 
          strokeWidth={2}
          dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 3 }}
          activeDot={{ r: 4, fill: "hsl(var(--primary))", stroke: "hsl(var(--primary))", strokeWidth: 2 }}
        />
        <Line 
          type="monotone" 
          dataKey="riskRewardRatio" 
          name="平均盈虧比"
          stroke="hsl(var(--accent))" 
          strokeWidth={2}
          dot={{ fill: "hsl(var(--accent))", strokeWidth: 0, r: 3 }}
          activeDot={{ r: 4, fill: "hsl(var(--accent))", stroke: "hsl(var(--accent))", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
} 