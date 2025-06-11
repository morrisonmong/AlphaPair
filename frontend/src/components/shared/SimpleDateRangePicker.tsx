'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface SimpleDateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  dateRange?: DateRange;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onApply: () => void;
}

export function SimpleDateRangePicker({
  isOpen,
  onClose,
  dateRange,
  onDateRangeChange,
  onApply
}: SimpleDateRangePickerProps) {
  const [localFromDate, setLocalFromDate] = useState<string>(
    dateRange?.from ? dateRange.from.toISOString().split('T')[0] : ''
  );
  const [localToDate, setLocalToDate] = useState<string>(
    dateRange?.to ? dateRange.to.toISOString().split('T')[0] : ''
  );

  // 當對話框打開時，重置本地狀態為當前的 dateRange 值
  useEffect(() => {
    if (isOpen) {
      setLocalFromDate(dateRange?.from ? dateRange.from.toISOString().split('T')[0] : '');
      setLocalToDate(dateRange?.to ? dateRange.to.toISOString().split('T')[0] : '');
    }
  }, [isOpen, dateRange]);

  const handleFromDateChange = (value: string) => {
    setLocalFromDate(value);
    // 不立即更新 dateRange，等到用戶點擊套用時才更新
  };

  const handleToDateChange = (value: string) => {
    setLocalToDate(value);
    // 不立即更新 dateRange，等到用戶點擊套用時才更新
  };

  const handleApply = () => {
    // 檢查是否有完整的日期範圍
    if (!localFromDate || !localToDate) {
      return; // 按鈕已經被禁用，但這裡加個保險
    }
    
    // 只有在點擊套用時才更新 dateRange
    const fromDate = new Date(localFromDate);
    const toDate = new Date(localToDate);
    onDateRangeChange({ from: fromDate, to: toDate });
    onApply();
    // 讓父組件決定何時關閉對話框
  };

  const handleCancel = () => {
    // 重置為原始值
    setLocalFromDate(dateRange?.from ? dateRange.from.toISOString().split('T')[0] : '');
    setLocalToDate(dateRange?.to ? dateRange.to.toISOString().split('T')[0] : '');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>選擇日期範圍</DialogTitle>
          <DialogDescription>
            設定自訂的時間範圍來篩選交易記錄
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="from-date" className="text-sm font-medium">
              開始日期
            </label>
            <input
              id="from-date"
              type="date"
              value={localFromDate}
              onChange={(e) => handleFromDateChange(e.target.value)}
              className="w-full px-3 py-2 border border-blue-500 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 [&::-webkit-calendar-picker-indicator]:bg-blue-500 [&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:hover:bg-blue-600"

            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="to-date" className="text-sm font-medium">
              結束日期
            </label>
            <input
              id="to-date"
              type="date"
              value={localToDate}
              onChange={(e) => handleToDateChange(e.target.value)}
              min={localFromDate} // 確保結束日期不早於開始日期
              className="w-full px-3 py-2 border border-blue-500 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 [&::-webkit-calendar-picker-indicator]:bg-blue-500 [&::-webkit-calendar-picker-indicator]:rounded [&::-webkit-calendar-picker-indicator]:p-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:hover:bg-blue-600"
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            取消
          </Button>
          <Button 
            onClick={handleApply}
            disabled={!localFromDate || !localToDate}
          >
            套用
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 