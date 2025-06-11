// 此組件已不再需要，因為我們使用瀏覽器的本地時區
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function TimezoneSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>時區設置</CardTitle>
        <CardDescription>系統現在使用瀏覽器的本地時區設置</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          時區設置功能已被移除。系統現在會自動使用您瀏覽器的本地時區設置來顯示時間。
        </div>
      </CardContent>
    </Card>
  );
} 