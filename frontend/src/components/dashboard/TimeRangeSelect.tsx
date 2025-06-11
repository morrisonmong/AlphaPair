'use client';

import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// 定義TimeRange類型，需要與page.tsx中的定義保持一致
type TimeRange = 'today' | '7d' | '14d' | '30d' | '90d' | '180d' | '1y' | 'max' | 'custom';

interface TimeRangeSelectProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
}

export function TimeRangeSelect({ value, onChange }: TimeRangeSelectProps) {
  return (
    <div className="flex items-center">
      <span className="text-sm text-muted-foreground mr-2">時間範圍:</span>
      <Select value={value} onValueChange={(value) => onChange(value as TimeRange)}>
        <SelectTrigger className="w-[120px] h-8">
          <SelectValue placeholder="選擇時間範圍" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="7d">近7天</SelectItem>
          <SelectItem value="14d">近14天</SelectItem>
          <SelectItem value="30d">近30天</SelectItem>
          <SelectItem value="90d">近90天</SelectItem>
          <SelectItem value="180d">近180天</SelectItem>
          <SelectItem value="1y">近1年</SelectItem>
          <SelectItem value="max">全部</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
} 