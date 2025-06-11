'use client';

import * as React from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfDay, endOfDay } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { DateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
  dateRange?: DateRange;
  onDateChange: (dateRange: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  dateRange,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSelect = (range: DateRange | undefined) => {
    onDateChange(range);
  };
  
  const handlePresetChange = (value: string) => {
    const now = new Date();
    let from: Date | undefined;
    let to: Date | undefined = endOfDay(now);

    switch (value) {
      case 'today':
        from = startOfDay(now);
        break;
      case '7days':
        from = startOfDay(subDays(now, 6));
        break;
      case '30days':
        from = startOfDay(subDays(now, 29));
        break;
      case '90days':
        from = startOfDay(subDays(now, 89));
        break;
      case 'month':
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case 'quarter':
        from = startOfQuarter(now);
        to = endOfQuarter(now);
        break;
      case 'all':
        from = undefined;
        to = undefined;
        break;
      default:
        break;
    }
    
    onDateChange({ from, to });
    if(from && to) {
        setIsOpen(false);
    }
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={'outline'}
            className={cn(
              'w-[300px] justify-start text-left font-normal',
              !dateRange && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, 'LLL dd, y')} -{' '}
                  {format(dateRange.to, 'LLL dd, y')}
                </>
              ) : (
                format(dateRange.from, 'LLL dd, y')
              )
            ) : (
              <span>Pick a date</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <div className="p-4 border-r">
              <h4 className="mb-4 font-medium text-sm">Presets</h4>
              <div className="grid gap-2">
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('today')}>Today</Button>
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('7days')}>Last 7 days</Button>
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('30days')}>Last 30 days</Button>
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('90days')}>Last 90 days</Button>
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('month')}>This Month</Button>
                <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('quarter')}>This Quarter</Button>
                 <Button variant="ghost" className="justify-start font-normal" onClick={() => handlePresetChange('all')}>All Time</Button>
              </div>
            </div>
            <Calendar
              initialFocus
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={handleSelect}
              numberOfMonths={2}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
} 