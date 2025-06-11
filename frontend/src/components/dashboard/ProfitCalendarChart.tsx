'use client';

import React, { useState, useEffect } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { TradeHistoryBackwardCompatible } from '@/lib/api/trade-history';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, HelpCircle } from 'lucide-react';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';
import { cn } from '@/lib/utils';

interface ProfitCalendarChartProps {
  data: TradeHistoryBackwardCompatible[];
  timeRange: string;
  isLoading: boolean;
  onRetry: () => void;
  includeFees?: boolean;
}

interface DailyProfitData {
  date: Date;
  profit: number;
  tradeCount: number;
  cumulativeProfit: number;
}

interface CalendarTooltipData {
  date: string;
  dailyPnl: number;
  cumulativePnl: number;
  tradeCount: number;
}

const calculateDailyProfits = (data: TradeHistoryBackwardCompatible[], includeFees: boolean = true): DailyProfitData[] => {

  
  const dailyStats: { [key: string]: { totalProfit: number; tradeCount: number } } = {};
  
  // 處理交易數據
  data.forEach(item => {
    if (!item.closed_at && !item.close_time) return;
    
    const closeDate = item.closed_at ? parseISO(item.closed_at) : parseISO(item.close_time!);
    const dateStr = format(closeDate, 'yyyy-MM-dd');
    
    // 根據 includeFees 參數選擇使用總盈虧或淨盈虧
    const currentProfit = includeFees 
      ? (item.net_pnl !== undefined ? item.net_pnl : (item.total_pnl !== undefined ? item.total_pnl - (item.total_fee || 0) : 0))
      : (item.total_pnl !== undefined ? item.total_pnl : 0);
    
    if (!dailyStats[dateStr]) {
      dailyStats[dateStr] = { totalProfit: 0, tradeCount: 0 };
    }
    dailyStats[dateStr].totalProfit += currentProfit;
    dailyStats[dateStr].tradeCount += 1;
    

  });
  
  // 轉換為數組並計算累計盈虧
  const sortedDates = Object.keys(dailyStats).sort();
  let cumulativeProfit = 0;
  
  const result: DailyProfitData[] = sortedDates.map(dateStr => {
    const stats = dailyStats[dateStr];
    cumulativeProfit += stats.totalProfit;
    
    return {
      date: parseISO(dateStr),
      profit: stats.totalProfit,
      tradeCount: stats.tradeCount,
      cumulativeProfit
    };
  });
  

  return result;
};

const getProfitIntensity = (profit: number, maxAbsProfit: number): string => {
  if (maxAbsProfit === 0) return 'bg-muted/30';
  
  const intensity = Math.abs(profit) / maxAbsProfit;
  if (profit > 0) {
    if (intensity > 0.8) return 'bg-green-600 text-white';
    if (intensity > 0.6) return 'bg-green-500 text-white';
    if (intensity > 0.4) return 'bg-green-400 text-white';
    if (intensity > 0.2) return 'bg-green-300 text-gray-900';
    return 'bg-green-200 text-gray-900';
  } else if (profit < 0) {
    if (intensity > 0.8) return 'bg-red-600 text-white';
    if (intensity > 0.6) return 'bg-red-500 text-white';
    if (intensity > 0.4) return 'bg-red-400 text-white';
    if (intensity > 0.2) return 'bg-red-300 text-gray-900';
    return 'bg-red-200 text-gray-900';
  }
  return 'bg-muted/30 text-muted-foreground';
};

export const ProfitCalendarChart: React.FC<ProfitCalendarChartProps> = ({ 
  data, 
  isLoading,
  includeFees = true
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dailyData, setDailyData] = useState<DailyProfitData[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarTooltipData | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isLoading && data) {
      const profitData = calculateDailyProfits(data, includeFees);
      setDailyData(profitData);
    }
  }, [data, isLoading, includeFees]);

  // 獲取當月的所有日期（包含前後週的日期以填滿網格）
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // 計算最大絕對盈虧值用於顏色強度
  const maxAbsProfit = Math.max(...dailyData.map(d => Math.abs(d.profit)), 1);
  
  // 獲取指定日期的盈虧數據
  const getDayData = (date: Date): DailyProfitData | null => {
    return dailyData.find(d => isSameDay(d.date, date)) || null;
  };

  // 處理日期點擊
  const handleDayClick = (date: Date, event: React.MouseEvent) => {
    const dayData = getDayData(date);
    if (dayData) {
      const rect = event.currentTarget.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // 計算 tooltip 位置，避免超出螢幕邊界
      let tooltipX = rect.left + rect.width / 2;
      let tooltipY = rect.top - 10;
      
      // 如果 tooltip 會超出右邊界，調整到左邊
      if (tooltipX + 100 > viewportWidth) {
        tooltipX = viewportWidth - 210;
      }
      // 如果 tooltip 會超出左邊界，調整到右邊
      if (tooltipX - 100 < 0) {
        tooltipX = 110;
      }
      
      // 如果 tooltip 會超出上邊界，顯示在下方
      if (tooltipY - 140 < 0) {
        tooltipY = rect.bottom + 10;
      }
      
      setTooltipPosition({ x: tooltipX, y: tooltipY });
      
      setSelectedDay({
        date: format(date, 'yyyy-MM-dd'),
        dailyPnl: dayData.profit,
        cumulativePnl: dayData.cumulativeProfit,
        tradeCount: dayData.tradeCount
      });
      setShowTooltip(true);
    }
  };

  // 關閉提示框
  const closeTooltip = () => {
    setShowTooltip(false);
    setSelectedDay(null);
  };

  // 獲取月份的統計數據
  const getMonthStats = () => {
    const monthData = dailyData.filter(d => 
      d.date >= monthStart && d.date <= monthEnd
    );
    
    const totalProfit = monthData.reduce((sum, d) => sum + d.profit, 0);
    const totalTrades = monthData.reduce((sum, d) => sum + d.tradeCount, 0);
    const profitableDays = monthData.filter(d => d.profit > 0).length;
    
    return { totalProfit, totalTrades, profitableDays, totalDays: monthData.length };
  };

  const monthStats = getMonthStats();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 月份導航 */}
      <div className="flex items-center justify-between p-2 border-b bg-background/50 backdrop-blur-sm flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-3 w-3" />
        </Button>
        
        <div className="text-center">
          <h3 className="font-semibold text-xs mb-0.5">
            {format(currentMonth, 'yyyy年MM月')}
          </h3>
          <div className="text-xs text-muted-foreground space-x-1">
            <span>總盈虧: {monthStats.totalProfit.toFixed(0)}</span>
            <span>交易: {monthStats.totalTrades}筆</span>
            <span>獲利日: {monthStats.profitableDays}/{monthStats.totalDays}</span>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      {/* 星期標題 */}
      <div className="grid grid-cols-7 border-b bg-muted/30 flex-shrink-0">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1 border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* 日曆網格 */}
      <div className="flex-1 grid grid-cols-7 grid-rows-6 border-l border-b overflow-hidden min-h-0">
        {calendarDays.map((date) => {
          const dayData = getDayData(date);
          const hasData = dayData !== null;
          const profit = dayData?.profit || 0;
          const isCurrentMonth = date >= monthStart && date <= monthEnd;
          
          return (
            <div
              key={format(date, 'yyyy-MM-dd')}
              className={cn(
                "relative border-r border-t cursor-pointer transition-all duration-200 hover:ring-1 hover:ring-primary/50 hover:z-10 flex flex-col min-h-0",
                hasData ? getProfitIntensity(profit, maxAbsProfit) : "bg-background hover:bg-muted/50",
                !isCurrentMonth && "opacity-40"
              )}
              onClick={(e) => handleDayClick(date, e)}
            >
              {/* 日期數字 */}
              <div className="p-0.5 text-xs font-medium leading-none">
                {format(date, 'd')}
              </div>
              
              {/* 盈虧數據 */}
              {hasData && (
                <div className="flex-1 flex flex-col items-center justify-center p-0.5 min-h-0">
                  <div className="text-xs font-bold leading-none text-center">
                    {profit > 0 ? '+' : ''}{Math.abs(profit) >= 1000 ? `${(profit/1000).toFixed(1)}k` : profit.toFixed(0)}
                  </div>
                  {dayData.tradeCount > 0 && (
                    <div className="text-xs opacity-75 leading-none mt-0.5 text-center">
                      {dayData.tradeCount}筆
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 提示框 */}
      {showTooltip && selectedDay && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={closeTooltip}
          />
          <div 
            className="fixed z-50 bg-background border border-border rounded-lg shadow-xl p-3 min-w-[180px]"
            style={{
              left: Math.max(10, Math.min(tooltipPosition.x - 90, window.innerWidth - 200)),
              top: tooltipPosition.y < 120 ? tooltipPosition.y + 30 : tooltipPosition.y - 120,
            }}
          >
            <div className="text-sm font-semibold mb-2">{selectedDay.date}</div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>每日盈虧:</span>
                <span style={{ color: selectedDay.dailyPnl >= 0 ? '#22c55e' : '#ef4444' }} className="font-semibold">
                  {selectedDay.dailyPnl.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span>累計盈虧:</span>
                <span style={{ color: selectedDay.cumulativePnl >= 0 ? '#22c55e' : '#ef4444' }} className="font-semibold">
                  {selectedDay.cumulativePnl.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span>交易筆數:</span>
                <span style={{ color: '#3b82f6' }} className="font-semibold">
                  {selectedDay.tradeCount} 筆
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 帶說明的日曆圖表組件
export const ProfitCalendarChartWithTooltip: React.FC<ProfitCalendarChartProps> = (props) => {
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
            <div className="font-medium">📅 盈虧日曆</div>
            <p className="text-muted-foreground text-xs">以月曆形式顯示每日交易盈虧，直觀追蹤交易表現。</p>
            
            <div className="font-medium">💰 計算方式</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 使用{props.includeFees ? '淨盈虧（已扣除手續費）' : '總盈虧（未扣除手續費）'}</div>
              <div>• 累計盈虧：從開始到當日的總和</div>
            </div>
            
            <div className="font-medium">🎨 顏色說明</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• <span className="text-green-400">綠色</span>：盈利日</div>
              <div>• <span className="text-red-400">紅色</span>：虧損日</div>
              <div>• 顏色深淺：盈虧金額大小</div>
            </div>
            
            <div className="font-medium">📊 互動功能</div>
            <div className="text-muted-foreground text-xs space-y-0.5">
              <div>• 點擊日期查看詳細數據</div>
              <div>• 月份導航查看歷史</div>
              <div>• 放大查看完整日曆</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="盈虧日曆" 
      helpTooltip={helpTooltip}
      className="h-full"
      detailedView={<DetailedProfitCalendarChart {...props} />}
    >
      <div className="h-full overflow-hidden">
        <ProfitCalendarChart {...props} />
      </div>
    </ChartWrapperWithTitle>
  );
};

// 全螢幕詳細視圖組件
const DetailedProfitCalendarChart: React.FC<ProfitCalendarChartProps> = ({ 
  data, 
  isLoading,
  includeFees = true
}) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dailyData, setDailyData] = useState<DailyProfitData[]>([]);
  const [selectedDay, setSelectedDay] = useState<CalendarTooltipData | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!isLoading && data) {
      const profitData = calculateDailyProfits(data, includeFees);
      setDailyData(profitData);
    }
  }, [data, isLoading, includeFees]);

  // 獲取當月的所有日期（包含前後週的日期以填滿網格）
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  // 計算最大絕對盈虧值用於顏色強度
  const maxAbsProfit = Math.max(...dailyData.map(d => Math.abs(d.profit)), 1);
  
  // 獲取指定日期的盈虧數據
  const getDayData = (date: Date): DailyProfitData | null => {
    return dailyData.find(d => isSameDay(d.date, date)) || null;
  };

  // 處理日期點擊
  const handleDayClick = (date: Date, event: React.MouseEvent) => {
    const dayData = getDayData(date);
    if (dayData) {
      const rect = event.currentTarget.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      let tooltipX = rect.left + rect.width / 2;
      let tooltipY = rect.top - 10;
      
      if (tooltipX + 100 > viewportWidth) {
        tooltipX = viewportWidth - 210;
      }
      if (tooltipX - 100 < 0) {
        tooltipX = 110;
      }
      if (tooltipY - 140 < 0) {
        tooltipY = rect.bottom + 10;
      }
      
      setTooltipPosition({ x: tooltipX, y: tooltipY });
      
      setSelectedDay({
        date: format(date, 'yyyy-MM-dd'),
        dailyPnl: dayData.profit,
        cumulativePnl: dayData.cumulativeProfit,
        tradeCount: dayData.tradeCount
      });
      setShowTooltip(true);
    }
  };

  // 關閉提示框
  const closeTooltip = () => {
    setShowTooltip(false);
    setSelectedDay(null);
  };

  // 獲取月份的統計數據
  const getMonthStats = () => {
    const monthData = dailyData.filter(d => 
      d.date >= monthStart && d.date <= monthEnd
    );
    
    const totalProfit = monthData.reduce((sum, d) => sum + d.profit, 0);
    const totalTrades = monthData.reduce((sum, d) => sum + d.tradeCount, 0);
    const profitableDays = monthData.filter(d => d.profit > 0).length;
    
    return { totalProfit, totalTrades, profitableDays, totalDays: monthData.length };
  };

  const monthStats = getMonthStats();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* 月份導航 - 全螢幕版本 */}
      <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="h-10 w-10 p-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <div className="text-center">
          <h2 className="font-bold text-xl mb-1">
            {format(currentMonth, 'yyyy年MM月')}
          </h2>
          <div className="text-sm text-muted-foreground flex gap-4">
            <span>總盈虧: {monthStats.totalProfit.toFixed(2)} USDT</span>
            <span>交易: {monthStats.totalTrades}筆</span>
            <span>獲利日: {monthStats.profitableDays}/{monthStats.totalDays}</span>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="lg"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="h-10 w-10 p-0"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* 星期標題 - 全螢幕版本 */}
      <div className="grid grid-cols-7 border-b bg-muted/30 flex-shrink-0">
        {['日', '一', '二', '三', '四', '五', '六'].map(day => (
          <div key={day} className="text-center text-base font-semibold text-muted-foreground py-3 border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* 日曆網格 - 全螢幕版本，使用 flexbox 佈局 */}
      <div 
        className="flex-1 grid grid-cols-7 grid-rows-6 border-l border-b overflow-hidden min-h-0"
      >
        {calendarDays.map((date) => {
          const dayData = getDayData(date);
          const hasData = dayData !== null;
          const profit = dayData?.profit || 0;
          const isCurrentMonth = date >= monthStart && date <= monthEnd;
          
          return (
            <div
              key={format(date, 'yyyy-MM-dd')}
              className={cn(
                "relative border-r border-t cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:z-10 flex flex-col p-2 min-h-0",
                hasData ? getProfitIntensity(profit, maxAbsProfit) : "bg-background hover:bg-muted/50",
                !isCurrentMonth && "opacity-40"
              )}
              onClick={(e) => handleDayClick(date, e)}
            >
              {/* 日期數字 */}
              <div className="text-lg font-bold mb-1">
                {format(date, 'd')}
              </div>
              
              {/* 盈虧數據 */}
              {hasData && (
                <div className="flex-1 flex flex-col items-center justify-center min-h-0">
                  <div className="text-sm font-bold mb-1 text-center">
                    {profit > 0 ? '+' : ''}{Math.abs(profit) >= 1000 ? `${(profit/1000).toFixed(1)}k` : profit.toFixed(0)}
                  </div>
                  {dayData.tradeCount > 0 && (
                    <div className="text-xs opacity-75 text-center">
                      {dayData.tradeCount}筆
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 提示框 - 全螢幕版本 */}
      {showTooltip && selectedDay && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={closeTooltip}
          />
          <div 
            className="fixed z-50 bg-background border border-border rounded-lg shadow-xl p-4 min-w-[220px]"
            style={{
              left: Math.max(10, Math.min(tooltipPosition.x - 110, window.innerWidth - 240)),
              top: tooltipPosition.y < 160 ? tooltipPosition.y + 50 : tooltipPosition.y - 140,
            }}
          >
            <div className="text-base font-semibold mb-3">{selectedDay.date}</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>每日盈虧:</span>
                <span style={{ color: selectedDay.dailyPnl >= 0 ? '#22c55e' : '#ef4444' }} className="font-semibold">
                  {selectedDay.dailyPnl.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span>累計盈虧:</span>
                <span style={{ color: selectedDay.cumulativePnl >= 0 ? '#22c55e' : '#ef4444' }} className="font-semibold">
                  {selectedDay.cumulativePnl.toFixed(2)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span>交易筆數:</span>
                <span style={{ color: '#3b82f6' }} className="font-semibold">
                  {selectedDay.tradeCount} 筆
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}; 