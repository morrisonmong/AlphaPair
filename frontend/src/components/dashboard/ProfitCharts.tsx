'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';

export function ProfitCharts() {
  const { histories } = useTradeHistoryStore();

  // 生成收益趨勢圖數據
  const profitTrendData = useMemo(() => {
    if (histories.length === 0) return [];
    
    // 過濾掉沒有 close_time 的記錄
    const validHistories = histories.filter(h => h.close_time);
    
    // 按日期排序（從早到晚）
    const sortedHistories = [...validHistories].sort((a, b) => {
      const dateA = a.close_time ? new Date(a.close_time).getTime() : 0;
      const dateB = b.close_time ? new Date(b.close_time).getTime() : 0;
      return dateA - dateB;
    });
    
    // 計算累計盈虧
    let cumulativePnl = 0;
    return sortedHistories.map(history => {
      cumulativePnl += history.net_pnl || (history.total_pnl - history.total_fee);
      return {
        date: history.close_time ? format(new Date(history.close_time), 'MM/dd') : 'N/A',
        pnl: cumulativePnl.toFixed(2)
      };
    });
  }, [histories]);

  // 生成每日收益圖數據
  const dailyProfitData = useMemo(() => {
    if (histories.length === 0) return [];
    
    // 過濾掉沒有 close_time 的記錄
    const validHistories = histories.filter(h => h.close_time);
    
    // 按日期分組計算每日盈虧
    const dailyProfits = validHistories.reduce((acc: Record<string, number>, history) => {
      if (!history.close_time) return acc;
      
      const date = format(new Date(history.close_time), 'MM/dd');
      if (!acc[date]) {
        acc[date] = 0;
      }
      
      acc[date] += history.net_pnl || (history.total_pnl - history.total_fee);
      
      return acc;
    }, {});
    
    // 轉換為數組
    return Object.entries(dailyProfits).map(([date, profit]) => ({
      date,
      profit: profit.toFixed(2),
      color: profit >= 0 ? '#4ade80' : '#f87171'
    }));
  }, [histories]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      {/* 收益趨勢圖 */}
      <Card className="bg-gray-800 border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="text-sm text-gray-400 mb-2">收益趨勢</div>
          <div className="h-64">
            {profitTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profitTrendData}>
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                  <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      borderColor: '#374151',
                      color: 'white'
                    }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="pnl" 
                    stroke="#5d6d9e" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#60a5fa' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                暫無收益數據
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* 每日收益圖 */}
      <Card className="bg-gray-800 border-0 shadow-lg">
        <CardContent className="p-4">
          <div className="text-sm text-gray-400 mb-2">每日收益</div>
          <div className="h-64">
            {dailyProfitData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyProfitData}>
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                  <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      borderColor: '#374151',
                      color: 'white'
                    }} 
                  />
                  <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                    {dailyProfitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex justify-center items-center h-full text-gray-400 text-sm">
                暫無每日收益數據
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 