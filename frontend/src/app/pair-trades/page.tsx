'use client';

import { useState, useMemo, useEffect } from 'react';
import { PairTradeList } from '@/components/pair-trade/PairTradeList';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, Plus, TestTube } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { toast } from '@/components/ui/use-toast';
import { PairTrade } from '@/lib/api/pair-trade';
import { usePairTradeStore } from '@/lib/store/pair-trade-store';
import { useTradeHistoryStore } from '@/lib/store/trade-history-store';
import { Badge } from '@/components/ui/badge';
import { SimpleDateRangePicker, type DateRange as SimpleDateRange } from '@/components/shared/SimpleDateRangePicker';
import { subDays } from 'date-fns';
import { CreateTestTradeModal } from '@/components/pair-trade/CreateTestTradeModal';

// 簡單的表格備用UI組件
const TableFallback = () => (
  <div className="flex flex-col items-center justify-center h-full p-6 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
    <p className="text-lg text-red-700 dark:text-red-300 mb-2">配對交易載入失敗</p>
    <p className="text-sm text-red-600 dark:text-red-400 mb-4">可能是資料格式問題或處理錯誤</p>
    <Button 
      variant="destructive" 
      onClick={() => window.location.reload()}
    >
      重新載入頁面
    </Button>
  </div>
);

export default function PairTradesPage() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'closed'>('active');
  const [timeRange, setTimeRange] = useState<string>('30days');
  const [isCustomDatePickerOpen, setIsCustomDatePickerOpen] = useState(false);
  const [dateRange, setDateRange] = useState<SimpleDateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date()
  });
  const [testTrades, setTestTrades] = useState<PairTrade[]>([]);
  
  // 新增：已平倉子篩選狀態
  const [closedSubFilter, setClosedSubFilter] = useState<'all' | 'profit' | 'loss'>('all');
  
  // 新增：用於存儲各個標籤頁的篩選後數量
  const [filteredCounts, setFilteredCounts] = useState({
    all: 0,
    active: 0,
    closed: 0
  });

  // 使用 store 獲取交易數據
  const { trades } = usePairTradeStore();
  const { histories } = useTradeHistoryStore();

  // 新增：計算篩選後的數量
  const calculateFilteredCounts = useMemo(() => {
    // 合併所有交易數據
    const convertedHistories = histories.map(history => ({
      ...history,
      status: 'closed' as const,
      created_at: history.created_at || history.entry_time || new Date().toISOString(),
    }));
    
    let allTrades = [...trades, ...testTrades, ...convertedHistories];
    
    // 根據時間範圍篩選
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let fromDate: Date;
      let toDate: Date = new Date(now);
      toDate.setHours(23, 59, 59, 999);
      
      switch (timeRange) {
        case 'today':
          fromDate = new Date(today);
          break;
        case '7days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 6);
          break;
        case '30days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 29);
          break;
        case '90days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 89);
          break;
        case '180days':
          fromDate = new Date(today);
          fromDate.setDate(today.getDate() - 179);
          break;
        case 'current_month':
          fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case 'current_quarter':
          const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
          fromDate = new Date(now.getFullYear(), quarterStartMonth, 1);
          break;
        case 'custom':
          if (dateRange?.from && dateRange?.to) {
            fromDate = dateRange.from;
            toDate = dateRange.to;
            toDate.setHours(23, 59, 59, 999);
          } else {
            fromDate = new Date(0);
          }
          break;
        default:
          fromDate = new Date(0);
      }

      if (fromDate) {
        allTrades = allTrades.filter(trade => {
          const tradeDate = new Date(trade.created_at);
          return tradeDate >= fromDate && tradeDate <= toDate;
        });
      }
    }
    
    // 計算各個狀態的數量
    const activeTrades = allTrades.filter(trade => trade.status === 'active');
    const closedTrades = allTrades.filter(trade => trade.status === 'closed');
    
    return {
      all: allTrades.length,
      active: activeTrades.length,
      closed: closedTrades.length
    };
  }, [trades, histories, testTrades, timeRange, dateRange]);

  // 更新篩選後的數量
  useEffect(() => {
    setFilteredCounts(calculateFilteredCounts);
  }, [calculateFilteredCounts]);

  // 處理頁碼變更
  const handlePageChange = (page: number) => {
    if (page > 0 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // 處理每頁筆數變更
  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1); // 重置到第一頁
  };

  // 計算總頁數
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // 生成頁碼按鈕
  const renderPaginationButtons = (): React.ReactNode[] => {
    const buttons: React.ReactNode[] = [];
    const maxButtonsToShow = 5; // 最多顯示的頁碼按鈕數量
    
    if (totalPages <= 1) return buttons;
    
    // 始終顯示第一頁
    buttons.push(
      <Button
        key="first"
        variant={currentPage === 1 ? "default" : "outline"}
        size="sm"
        onClick={() => handlePageChange(1)}
        className={currentPage === 1 
          ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" 
          : "bg-transparent border-border hover:bg-secondary"}
      >
        1
      </Button>
    );
    
    const startPage = Math.max(2, currentPage - Math.floor(maxButtonsToShow / 2));
    const endPage = Math.min(totalPages - 1, startPage + maxButtonsToShow - 3);
    
    // 如果當前頁與第一頁之間有間隔，顯示省略號
    if (startPage > 2) {
      buttons.push(
        <span key="ellipsis1" className="px-2 text-gray-500">
          ...
        </span>
      );
    }
    
    // 顯示中間的頁碼
    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <Button
          key={i}
          variant={currentPage === i ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(i)}
          className={currentPage === i 
            ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" 
            : "bg-transparent border-border hover:bg-secondary"}
        >
          {i}
        </Button>
      );
    }
    
    // 如果尾頁與最後顯示的頁碼之間有間隔，顯示省略號
    if (endPage < totalPages - 1) {
      buttons.push(
        <span key="ellipsis2" className="px-2 text-gray-500">
          ...
        </span>
      );
    }
    
    // 如果總頁數大於1，顯示最後一頁
    if (totalPages > 1) {
      buttons.push(
        <Button
          key="last"
          variant={currentPage === totalPages ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(totalPages)}
          className={currentPage === totalPages 
            ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" 
            : "bg-transparent border-border hover:bg-secondary"}
        >
          {totalPages}
        </Button>
      );
    }
    
    return buttons;
  };

  // 更新總項目數的回調函數
  const handleUpdateTotalItems = (total: number) => {
    setTotalItems(total);
  };



  // 應用自定義日期範圍
  const applyCustomDateRange = () => {
    if (dateRange?.from && dateRange?.to) {
      setTimeRange('custom');
      toast({
        title: "日期範圍已應用",
        description: `${format(dateRange.from, 'yyyy/MM/dd')} 至 ${format(dateRange.to, 'yyyy/MM/dd')}`,
      });
    }
  };

  // 格式化日期範圍顯示
  const formatDateRange = (range: string): string => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
      case 'today':
        return format(today, 'yyyy/MM/dd');
      case '7days':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - 6);
        return `${format(weekStart, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case '30days':
        const monthStart = new Date(today);
        monthStart.setDate(today.getDate() - 29);
        return `${format(monthStart, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case '90days':
        const quarter90Start = new Date(today);
        quarter90Start.setDate(today.getDate() - 89);
        return `${format(quarter90Start, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case '180days':
        const half180Start = new Date(today);
        half180Start.setDate(today.getDate() - 179);
        return `${format(half180Start, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case 'current_month':
        const monthFirstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        return `${format(monthFirstDay, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case 'current_quarter':
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
        const quarterFirstDay = new Date(now.getFullYear(), quarterStartMonth, 1);
        return `${format(quarterFirstDay, 'yyyy/MM/dd')} - ${format(today, 'yyyy/MM/dd')}`;
      case 'custom':
        if (dateRange?.from && dateRange?.to) {
          try {
            return `${format(dateRange.from, 'yyyy/MM/dd')} - ${format(dateRange.to, 'yyyy/MM/dd')}`;
          } catch (error) {
            console.error('日期格式化錯誤:', error);
          }
        }
        return '請選擇日期';
      case 'all':
      default:
        return '';
    }
  };

  // 獲取當前時間範圍的標籤
  const getCurrentTimeRangeLabel = (range: string): string => {
    switch (range) {
      case 'all': return 'All';
      case 'today': return 'Today';
      case '7days': return '7 Days';
      case '30days': return '30 Days';
      case '90days': return '90 Days';
      case '180days': return '180 Days';
      case 'current_month': return 'This Month';
      case 'current_quarter': return 'This Quarter';
      case 'custom': return 'Custom';
      default: return '7 Days';
    }
  };

  // 處理時間範圍變更
  const handleTimeRangeChange = (value: string) => {
    if (value === 'custom') {
      setTimeRange('custom');
      setIsCustomDatePickerOpen(true);
    } else {
      setTimeRange(value);
      setDateRange(undefined);
      setIsCustomDatePickerOpen(false);
    }
    setCurrentPage(1); // 重置到第一頁
  };

  // 處理已平倉子篩選變更
  const handleClosedSubFilterChange = (filter: 'all' | 'profit' | 'loss') => {
    setClosedSubFilter(filter);
    setCurrentPage(1); // 重置到第一頁
  };

  // 處理主標籤變更
  const handleActiveTabChange = (value: string) => {
    const tabValue = value as 'all' | 'active' | 'closed';
    setActiveTab(tabValue);
    setCurrentPage(1); // 重置到第一頁
    
    // 如果離開已平倉標籤，重置子篩選
    if (tabValue !== 'closed') {
      setClosedSubFilter('all');
    }
  };

  return (
    <div className="w-full -mx-2 -my-6 -mt-24 pt-24 px-4">
      <div className="w-full max-w-none mx-auto px-3 sm:px-4 lg:px-6 py-2">
        {/* 新的整合式頂部工具列 */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 p-3 bg-gray-800/30 border border-gray-700 rounded-lg">
          {/* 左側：主要操作 */}
          <div className="flex items-center gap-2">
            <Button onClick={() => router.push('/pair-trades/create')} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
              <Plus className="mr-2 h-4 w-4" />
              創建配對交易
            </Button>
          </div>

          {/* 中間：時間篩選器 */}
          <div className="flex-1 min-w-[200px]">
            {/* 桌面版時間篩選 */}
            <div className="hidden lg:block">
              <Tabs value={timeRange} onValueChange={handleTimeRangeChange}>
                <TabsList className="bg-background/50 h-8 grid grid-cols-8 gap-1">
                  <TabsTrigger value="all" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">All</TabsTrigger>
                  <TabsTrigger value="today" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Today</TabsTrigger>
                  <TabsTrigger value="7days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">7D</TabsTrigger>
                  <TabsTrigger value="30days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">30D</TabsTrigger>
                  <TabsTrigger value="90days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">90D</TabsTrigger>
                  <TabsTrigger value="180days" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">180D</TabsTrigger>
                  <TabsTrigger value="current_month" className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Month</TabsTrigger>
                  <TabsTrigger 
                    value="custom" 
                    className="px-2 h-6 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    onClick={() => {
                      if (timeRange === 'custom') {
                        setIsCustomDatePickerOpen(true);
                      }
                    }}
                  >
                    Custom
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {/* 手機版時間篩選 */}
            <div className="lg:hidden">
              <Select value={timeRange} onValueChange={(value) => {
                // 如果選擇的是 custom，無論當前狀態如何都處理
                if (value === 'custom') {
                  if (timeRange === 'custom') {
                    // 如果已經是 custom 狀態，直接打開對話框
                    setIsCustomDatePickerOpen(true);
                  } else {
                    // 如果不是 custom 狀態，先設置狀態再打開對話框
                    handleTimeRangeChange(value);
                  }
                } else {
                  handleTimeRangeChange(value);
                }
              }}>
                <SelectTrigger className="w-full h-9">
                  <SelectValue placeholder="選擇時間範圍" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有時間</SelectItem>
                  <SelectItem value="today">今天</SelectItem>
                  <SelectItem value="7days">最近7天</SelectItem>
                  <SelectItem value="30days">最近30天</SelectItem>
                  <SelectItem value="90days">最近90天</SelectItem>
                  <SelectItem value="180days">最近180天</SelectItem>
                  <SelectItem value="current_month">本月</SelectItem>
                  <SelectItem value="custom">自訂範圍</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {formatDateRange(timeRange) || getCurrentTimeRangeLabel(timeRange)}
          </Badge>

          {/* 右側：次要操作 */}
          {/* <div className="flex items-center gap-2">
            <CreateTestTradeModal onCreateTestTrade={(trade) => setTestTrades(prev => [...prev, trade])}>
              <Button variant="outline" size="sm" className="text-xs">
                <TestTube className="mr-1.5 h-3 w-3" />
                測試
              </Button>
            </CreateTestTradeModal>
          </div> */}
        </div>

        {/* 簡單日期範圍選擇器 */}
        <SimpleDateRangePicker
          isOpen={isCustomDatePickerOpen}
          onClose={() => {
            setIsCustomDatePickerOpen(false);
            // 如果沒有完整的日期範圍，切回 30days
            if (!dateRange?.from || !dateRange?.to) {
              setTimeRange('30days');
            }
          }}
          dateRange={dateRange}
          onDateRangeChange={(range) => setDateRange(range || undefined)}
          onApply={() => {
            applyCustomDateRange();
            setIsCustomDatePickerOpen(false);
          }}
        />

        {/* 交易狀態標籤 - 現代化設計 + 數量顯示 */}
        <div className="mb-6">
          <Card className="bg-card/80 backdrop-blur-sm border-border/60 shadow-lg">
            <CardContent className="p-4">
              <Tabs value={activeTab} onValueChange={handleActiveTabChange} className="w-full">
                <TabsList className="bg-background/50 backdrop-blur-sm h-12 w-full grid grid-cols-3 gap-2 p-1 rounded-xl border border-border/50">
                  <TabsTrigger 
                    value="all" 
                    className="px-6 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all duration-200 rounded-lg flex items-center gap-2"
                  >
                    <div className="w-2 h-2 bg-current rounded-full"></div>
                    全部
                    <span className="ml-1 px-2 py-0.5 bg-current/20 text-xs rounded-full">
                      {filteredCounts.all}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="active" 
                    className="px-6 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all duration-200 rounded-lg flex items-center gap-2"
                  >
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    持倉中
                    <span className="ml-1 px-2 py-0.5 bg-current/20 text-xs rounded-full">
                      {filteredCounts.active}
                    </span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="closed" 
                    className="px-6 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-lg data-[state=active]:shadow-primary/25 transition-all duration-200 rounded-lg flex items-center gap-2"
                  >
                    <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                    已平倉
                    <span className="ml-1 px-2 py-0.5 bg-current/20 text-xs rounded-full">
                      {filteredCounts.closed}
                    </span>
                  </TabsTrigger>
                </TabsList>

          {/* 交易列表內容 */}
          <TabsContent value="all" className="mt-4">
                  <ErrorBoundary fallback={<TableFallback />}>
                    <PairTradeList 
                      filterStatus={null} 
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onUpdateTotalItems={handleUpdateTotalItems}
                      timeRange={timeRange}
                      customStartDate={timeRange === 'custom' && dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''}
                      customEndDate={timeRange === 'custom' && dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''}
                      testTrades={testTrades}
                    />
                  </ErrorBoundary>
                </TabsContent>
                
                <TabsContent value="active" className="mt-4">
                  <ErrorBoundary fallback={<TableFallback />}>
                    <PairTradeList 
                      filterStatus="active" 
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onUpdateTotalItems={handleUpdateTotalItems}
                      timeRange={timeRange}
                      customStartDate={timeRange === 'custom' && dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''}
                      customEndDate={timeRange === 'custom' && dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''}
                      testTrades={testTrades}
                    />
                  </ErrorBoundary>
                </TabsContent>
                
                <TabsContent value="closed" className="mt-4">
                  {/* 已平倉子篩選 */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 bg-muted/30 p-2 rounded-lg">
                      <span className="text-sm font-medium text-muted-foreground">篩選：</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleClosedSubFilterChange('all')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
                            closedSubFilter === 'all'
                              ? 'bg-primary text-primary-foreground shadow-sm'
                              : 'bg-background/60 text-muted-foreground hover:bg-primary/10 hover:text-primary'
                          }`}
                        >
                          全部
                        </button>
                        <button
                          onClick={() => handleClosedSubFilterChange('profit')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                            closedSubFilter === 'profit'
                              ? 'bg-green-500 text-white shadow-sm'
                              : 'bg-background/60 text-muted-foreground hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400'
                          }`}
                        >
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          獲利
                        </button>
                        <button
                          onClick={() => handleClosedSubFilterChange('loss')}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center gap-1 ${
                            closedSubFilter === 'loss'
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-background/60 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400'
                          }`}
                        >
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          虧損
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  <ErrorBoundary fallback={<TableFallback />}>
                    <PairTradeList 
                      filterStatus="closed" 
                      currentPage={currentPage}
                      itemsPerPage={itemsPerPage}
                      onUpdateTotalItems={handleUpdateTotalItems}
                      timeRange={timeRange}
                      customStartDate={timeRange === 'custom' && dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : ''}
                      customEndDate={timeRange === 'custom' && dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : ''}
                      testTrades={testTrades}
                      closedSubFilter={closedSubFilter}
                    />
                  </ErrorBoundary>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* 分頁控制區域 - 響應式設計 */}
        <div className="mt-6 space-y-4">
          {/* 手機版：垂直佈局 */}
          <div className="md:hidden space-y-3">
            {/* 頁碼控制 */}
            <div className="flex justify-center">
              <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border shadow-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {renderPaginationButtons()}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === Math.ceil(totalItems / itemsPerPage) || totalItems === 0}
                  className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* 分頁信息和每頁筆數 */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {/* 每頁筆數選擇 */}
              <div className="flex items-center gap-2 bg-card px-3 py-2 rounded-lg border border-border shadow-sm">
                <span className="text-sm text-muted-foreground">每頁</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={handleItemsPerPageChange}
                >
                  <SelectTrigger className="w-16 h-8 bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">筆</span>
              </div>
              
              {/* 分頁信息 */}
              <div className="flex items-center gap-1 bg-card px-3 py-2 rounded-lg border border-border shadow-sm">
                <span className="text-sm text-muted-foreground">顯示</span>
                <span className="text-sm font-medium text-primary">{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm font-medium text-primary">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                <span className="text-sm text-muted-foreground">，共</span>
                <span className="text-sm font-medium text-accent">{totalItems}</span>
                <span className="text-sm text-muted-foreground">筆</span>
              </div>
            </div>
          </div>
          
          {/* 桌面版：水平佈局 */}
          <div className="hidden md:flex justify-between items-center">
            {/* 左側：頁碼切換 */}
            <div className="flex justify-center items-center">
              <div className="flex items-center gap-1 bg-card p-1 rounded-lg border border-border shadow-sm">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {renderPaginationButtons()}
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === Math.ceil(totalItems / itemsPerPage) || totalItems === 0}
                  className="bg-transparent border-border hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          
            {/* 右側：分頁信息和每頁筆數選擇 */}
            <div className="flex items-center gap-4">
              {/* 每頁筆數選擇 */}
              <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                <span className="text-sm text-muted-foreground">每頁</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={handleItemsPerPageChange}
                >
                  <SelectTrigger className="w-16 h-8 bg-background border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">筆</span>
              </div>
              
              {/* 分頁信息 */}
              <div className="flex items-center gap-2 bg-card px-3 py-1.5 rounded-lg border border-border shadow-sm">
                <span className="text-sm text-muted-foreground">顯示</span>
                <span className="text-sm font-medium text-primary">{totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span>
                <span className="text-sm text-muted-foreground">-</span>
                <span className="text-sm font-medium text-primary">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
                <span className="text-sm text-muted-foreground">，共</span>
                <span className="text-sm font-medium text-accent">{totalItems}</span>
                <span className="text-sm text-muted-foreground">筆</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 