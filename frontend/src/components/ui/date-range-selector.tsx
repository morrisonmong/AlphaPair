"use client"

import * as React from "react"
import { addDays, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns"
import { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"

interface DateRangeSelectorProps {
  className?: string
  value: DateRange | undefined
  onChange: (date: DateRange | undefined) => void
}

export function DateRangeSelector({
  className,
  value,
  onChange,
}: DateRangeSelectorProps) {
  // 今天
  const handleToday = () => {
    const today = new Date()
    onChange({
      from: startOfDay(today),
      to: endOfDay(today)
    })
  }

  // 最近7天
  const handleLast7Days = () => {
    const today = new Date()
    onChange({
      from: startOfDay(addDays(today, -6)),
      to: endOfDay(today)
    })
  }

  // 最近30天
  const handleLast30Days = () => {
    const today = new Date()
    onChange({
      from: startOfDay(addDays(today, -29)),
      to: endOfDay(today)
    })
  }

  // 本月
  const handleThisMonth = () => {
    const today = new Date()
    onChange({
      from: startOfMonth(today),
      to: endOfMonth(today)
    })
  }

  // 清除選擇
  const handleClear = () => {
    onChange(undefined)
  }

  return (
    <div className="flex flex-col space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleToday}
        >
          今天
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleLast7Days}
        >
          最近7天
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleLast30Days}
        >
          最近30天
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleThisMonth}
        >
          本月
        </Button>
        {value && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClear}
          >
            清除
          </Button>
        )}
      </div>
      <DateRangePicker 
        value={value} 
        onChange={onChange} 
        className={className}
        placeholder="自定義日期範圍"
      />
    </div>
  )
} 