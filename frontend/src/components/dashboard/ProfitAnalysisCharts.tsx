'use client';

import React, { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';

// 時間範圍選項
const TIME_RANGES = [
  { label: '今日', value: 'today' },
  { label: '7日', value: '7d' },
  { label: '30日', value: '30d' },
  { label: '3個月', value: '3m' },
  { label: '1年', value: '1y' },
  { label: '自訂', value: 'custom' }
];

// 收益來源數據接口
interface ProfitSource {
  name: string;
  value: number;
  percentage: number;
}

// 勝率分析數據接口
interface WinRateData {
  name: string;
  value: number;
}

export function ProfitAnalysisCharts() {
  // 狀態
  const [timeRange, setTimeRange] = useState('7d');
  const [dailyProfitData, setDailyProfitData] = useState<{ date: string; profit: number; color: string }[]>([]);
  const [cumulativeProfitData, setCumulativeProfitData] = useState<{ date: string; profit: number }[]>([]);
  const [profitSourceData, setProfitSourceData] = useState<ProfitSource[]>([]);
  const [winRateData, setWinRateData] = useState<WinRateData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // 從store獲取交易歷史
  const { histories, fetchHistories } = useTradeHistoryStore();
  
  // 顏色數組
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

  // 獲取交易歷史數據
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        await fetchHistories();
      } catch (error) {
        console.error('獲取交易歷史失敗:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [fetchHistories]);

  // 根據時間範圍過濾交易歷史
  useEffect(() => {
    if (histories.length === 0) return;
    
    // 過濾交易歷史
    const filteredHistories = filterHistoriesByTimeRange(histories, timeRange);
    
    // 生成每日收益數據
    const dailyData = generateDailyProfitData(filteredHistories);
    setDailyProfitData(dailyData);
    
    // 生成累計盈虧數據
    const cumulativeData = generateCumulativeProfitData(filteredHistories);
    setCumulativeProfitData(cumulativeData);
    
    // 生成收益來源數據
    const sourceData = generateProfitSourceData(filteredHistories);
    setProfitSourceData(sourceData);
    
    // 生成勝率分析數據
    const rateData = generateWinRateData(filteredHistories);
    setWinRateData(rateData);
  }, [histories, timeRange]);

  // 過濾特定時間範圍的交易歷史
  const filterHistoriesByTimeRange = (trades: TradeHistoryBackwardCompatible[], range: string): TradeHistoryBackwardCompatible[] => {
    const now = new Date();
    const startDate = getStartDateByTimeRange(now, range);
    
    return trades.filter(history => {
      const closeTime = history.closed_at || history.close_time;
      if (!closeTime) return false;
      const closeDate = new Date(closeTime);
      return closeDate >= startDate && closeDate <= now;
    });
  };

  // 生成每日收益數據
  const generateDailyProfitData = (histories: TradeHistoryBackwardCompatible[]) => {
    if (histories.length === 0) return [];
    
    // 按日期分組
    const dailyProfits: Record<string, number> = {};
    
    histories.forEach(history => {
      const closeTime = history.closed_at || history.close_time;
      if (!closeTime) return;
      
      const date = format(new Date(closeTime), 'MM/dd');
      if (!dailyProfits[date]) {
        dailyProfits[date] = 0;
      }
      dailyProfits[date] += history.net_pnl || (history.total_pnl - history.total_fee);
    });
    
    // 轉換為數組
    return Object.entries(dailyProfits).map(([date, profit]) => ({
      date,
      profit,
      color: profit >= 0 ? '#4ade80' : '#f87171'
    }));
  };

  // 生成累計盈虧數據
  const generateCumulativeProfitData = (histories: TradeHistoryBackwardCompatible[]) => {
    if (histories.length === 0) return [];
    
    // 按日期排序
    const sortedHistories = [...histories].sort((a, b) => {
      const dateA = a.closed_at ? new Date(a.closed_at).getTime() : (a.close_time ? new Date(a.close_time).getTime() : 0);
      const dateB = b.closed_at ? new Date(b.closed_at).getTime() : (b.close_time ? new Date(b.close_time).getTime() : 0);
      return dateA - dateB;
    });
    
    // 計算累計盈虧
    let cumulativeProfit = 0;
    return sortedHistories.map(history => {
      cumulativeProfit += history.net_pnl || (history.total_pnl - history.total_fee);
      const closeTime = history.closed_at || history.close_time;
      return {
        date: closeTime ? format(new Date(closeTime), 'MM/dd') : 'N/A',
        profit: cumulativeProfit
      };
    });
  };

  // 生成收益來源數據
  const generateProfitSourceData = (histories: TradeHistoryBackwardCompatible[]) => {
    // 初始化各種收益來源
    let tradingProfit = 0;
    let fees = 0;
    const fundingFees = 0;

    // 計算各種收益來源
    histories.forEach(history => {
      if (history.total_pnl > 0) {
        tradingProfit += history.total_pnl;
      } else {
        // 負的交易損失已經計入 tradingProfit
      }
      
      fees += history.total_fee || 0;
      // 資金費率部分不再使用，因為 TradeHistory 接口中沒有這個屬性
    });
    
    // 計算總收益
    const totalProfit = tradingProfit - fees;
    
    // 生成數據
    return [
      {
        name: '交易盈虧',
        value: tradingProfit,
        percentage: (tradingProfit / totalProfit) * 100
      },
      {
        name: '資金費率',
        value: fundingFees,
        percentage: (fundingFees / totalProfit) * 100
      },
      {
        name: '交易手續費',
        value: -fees,
        percentage: (-fees / totalProfit) * 100
      }
    ];
  };

  // 生成勝率分析數據
  const generateWinRateData = (histories: TradeHistoryBackwardCompatible[]) => {
    if (histories.length === 0) return [];
    
    // 計算勝率相關數據
    let winTrades = 0;
    let loseTrades = 0;
    let actualTotalTrades = 0;
    let totalWin = 0;
    let totalLose = 0;
    
    histories.forEach(history => {
      const pnl = history.net_pnl || (history.total_pnl - history.total_fee);
      
      if (pnl > 0) {
        winTrades++;
        totalWin += pnl;
      } else if (pnl < 0) {
        loseTrades++;
        totalLose += Math.abs(pnl);
      }
      
      actualTotalTrades++;
    });
    
    // 計算勝率和盈虧比
    const winRate = actualTotalTrades > 0 ? (winTrades / actualTotalTrades) * 100 : 0;
    const profitFactor = totalLose > 0 ? totalWin / totalLose : 0;
    const avgWin = winTrades > 0 ? totalWin / winTrades : 0;
    const avgLoss = loseTrades > 0 ? totalLose / loseTrades : 0;
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
    
    // 生成雷達圖數據
    return [
      { name: '勝率', value: winRate },
      { name: '盈虧比', value: profitFactor * 20 }, // 縮放以適應雷達圖
      { name: '平均盈利', value: avgWin },
      { name: '平均虧損', value: avgLoss },
      { name: '風險收益比', value: riskRewardRatio * 20 } // 縮放以適應雷達圖
    ];
  };

  // 根據時間範圍獲取開始日期
  const getStartDateByTimeRange = (now: Date, range: string): Date => {
    let startDate: Date;
    
    switch (range) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '30d':
        startDate = subDays(now, 30);
        break;
      case '3m':
        startDate = subDays(now, 90);
        break;
      case '1y':
        startDate = subDays(now, 365);
        break;
      default:
        startDate = subDays(now, 7);
    }
    
    return startDate;
  };

  return (
    <div className="space-y-4">
      {/* 時間範圍選擇 */}
      <div className="flex justify-end mb-4">
        <Tabs defaultValue="7d" value={timeRange} onValueChange={setTimeRange}>
          <TabsList>
            {TIME_RANGES.map(range => (
              <TabsTrigger key={range.value} value={range.value}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      
      {/* 收益分析圖 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 合約每日收益柱狀圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">合約每日收益</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : dailyProfitData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyProfitData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Bar dataKey="profit" name="每日收益" radius={[4, 4, 0, 0]}>
                      {dailyProfitData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無收益數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 合約累計盈虧曲線圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">合約累計盈虧</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : cumulativeProfitData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulativeProfitData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="profit" 
                      name="累計盈虧" 
                      stroke="#5d6d9e" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#60a5fa' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無盈虧數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 收益來源分析圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">收益來源分析</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : profitSourceData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={profitSourceData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {profitSourceData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)} USDT`, '金額']}
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無收益來源數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 勝率分析圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">勝率分析</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : winRateData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius={80} data={winRateData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                    <Radar
                      name="績效"
                      dataKey="value"
                      stroke="#5d6d9e"
                      fill="#5d6d9e"
                      fillOpacity={0.6}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無勝率數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 