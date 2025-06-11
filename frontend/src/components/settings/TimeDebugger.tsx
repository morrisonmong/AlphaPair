'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { formatDateTime, convertTimeWithAPI } from '@/lib/utils';

export function TimeDebugger() {
  const [currentUtcTime, setCurrentUtcTime] = useState<string>('');
  const [currentLocalTime, setCurrentLocalTime] = useState<string>('');
  const [customTime, setCustomTime] = useState<string>('');
  const [customTimeFormatted, setCustomTimeFormatted] = useState<string>('');
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Asia/Taipei');
  const [apiResponse, setApiResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // 獲取當前時間
  const handleGetCurrentTime = () => {
    const now = new Date();
    setCurrentUtcTime(`UTC時間: ${now.toISOString()}`);
    setCurrentLocalTime(`本地時間 (${selectedTimezone}): ${formatDateTime(now)}`);
  };

  // 格式化自定義時間
  const handleFormatCustomTime = () => {
    try {
      const date = new Date(customTime);
      if (isNaN(date.getTime())) {
        toast({
          title: '錯誤',
          description: '無效的日期格式',
          variant: 'destructive',
        });
        return;
      }
      setCustomTimeFormatted(`格式化後 (${selectedTimezone}): ${formatDateTime(date)}`);
    } catch (error) {
      console.error('格式化時間錯誤:', error);
      toast({
        title: '錯誤',
        description: '格式化時間時發生錯誤',
        variant: 'destructive',
      });
    }
  };

  // 使用API轉換時間
  const handleConvertTimeWithAPI = async () => {
    try {
      setIsLoading(true);
      const date = new Date(customTime);
      if (isNaN(date.getTime())) {
        toast({
          title: '錯誤',
          description: '無效的日期格式',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const result = await convertTimeWithAPI(date.toISOString(), 'UTC', selectedTimezone);
      setApiResponse(JSON.stringify(result, null, 2));
      toast({
        title: '成功',
        description: '時間轉換成功',
      });
    } catch (error) {
      console.error('API時間轉換錯誤:', error);
      toast({
        title: '錯誤',
        description: '使用API轉換時間時發生錯誤',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>時間調試工具</CardTitle>
        <CardDescription>測試時間轉換和顯示</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6">
          <div className="space-y-2">
            <Label htmlFor="timezone">時區</Label>
            <Select
              value={selectedTimezone}
              onValueChange={setSelectedTimezone}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder="選擇時區" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Asia/Taipei">Asia/Taipei (GMT+8)</SelectItem>
                <SelectItem value="Asia/Tokyo">Asia/Tokyo (GMT+9)</SelectItem>
                <SelectItem value="Europe/London">Europe/London (GMT+0/+1)</SelectItem>
                <SelectItem value="America/New_York">America/New_York (GMT-5/-4)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Button onClick={handleGetCurrentTime}>獲取當前時間</Button>
            {currentUtcTime && (
              <div className="p-2 bg-gray-100 rounded-md">
                <p className="text-sm font-mono">{currentUtcTime}</p>
                <p className="text-sm font-mono mt-1">{currentLocalTime}</p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customTime">自定義時間 (ISO格式)</Label>
            <Input
              id="customTime"
              placeholder="例如: 2025-03-14T15:30:00Z"
              value={customTime}
              onChange={(e) => setCustomTime(e.target.value)}
            />
            <div className="flex space-x-2">
              <Button onClick={handleFormatCustomTime}>格式化</Button>
              <Button onClick={handleConvertTimeWithAPI} disabled={isLoading}>
                {isLoading ? '轉換中...' : '使用API轉換'}
              </Button>
            </div>
            {customTimeFormatted && (
              <div className="p-2 bg-gray-100 rounded-md">
                <p className="text-sm font-mono">{customTimeFormatted}</p>
              </div>
            )}
            {apiResponse && (
              <div className="p-2 bg-gray-100 rounded-md">
                <p className="text-sm font-mono whitespace-pre-wrap">{apiResponse}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <p className="text-xs text-gray-500">
          此工具用於調試時間顯示問題。它可以幫助您了解時間如何在不同時區之間轉換和顯示。
        </p>
      </CardFooter>
    </Card>
  );
} 