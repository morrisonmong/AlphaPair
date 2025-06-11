'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { TrendingUp, DollarSign, Activity } from 'lucide-react';

export function ColorShowcase() {
  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold text-foreground">新配色方案展示</h2>
      
      {/* 主要色彩展示 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-primary">主要色彩 (#5d6d9e)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              主要按鈕
            </Button>
            <Button variant="outline" className="border-primary text-primary hover:bg-primary hover:text-primary-foreground">
              邊框按鈕
            </Button>
            <Badge variant="default">主要徽章</Badge>
          </div>
          
          <div className="p-4 bg-primary/10 border border-primary/20 rounded-md">
            <p className="text-primary">這是使用主要色彩的背景區域</p>
          </div>
        </CardContent>
      </Card>

      {/* 強調色彩展示 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-accent">強調色彩 (#beb287)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4 flex-wrap">
            <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
              強調按鈕
            </Button>
            <Button variant="outline" className="border-accent text-accent hover:bg-accent hover:text-accent-foreground">
              強調邊框
            </Button>
            <Badge variant="accent">重要標籤</Badge>
          </div>
          
          <div className="p-4 bg-accent/10 border border-accent/20 rounded-md">
            <p className="text-accent">這是使用強調色彩的背景區域，適合重要提示</p>
          </div>
        </CardContent>
      </Card>

      {/* 實際應用示例 */}
      <Card>
        <CardHeader>
          <CardTitle>實際應用示例</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 統計卡片示例 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-accent/20">
              <CardContent className="p-4 flex items-center space-x-3">
                <DollarSign className="h-8 w-8 text-accent" />
                <div>
                  <p className="text-sm text-accent">總資產價值</p>
                  <p className="text-2xl font-bold text-accent">12,345.67 USDT</p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-primary/20">
              <CardContent className="p-4 flex items-center space-x-3">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-primary">運行中交易</p>
                  <p className="text-2xl font-bold text-primary">8</p>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 flex items-center space-x-3">
                <TrendingUp className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">今日盈虧</p>
                  <p className="text-2xl font-bold text-green-500">+234.56 USDT</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 警告組件示例 */}
          <div className="space-y-3">
            <Alert variant="success">
              <TrendingUp className="h-4 w-4" />
              <AlertTitle>交易成功</AlertTitle>
              <AlertDescription>
                您的配對交易已成功創建，使用了新的金黃色強調配色。
              </AlertDescription>
            </Alert>
            
            <Alert variant="info">
              <Activity className="h-4 w-4" />
              <AlertTitle>系統資訊</AlertTitle>
              <AlertDescription>
                這是使用主要色彩的資訊提示，適合一般通知。
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      {/* 圖表配色展示 */}
      <Card>
        <CardHeader>
          <CardTitle>圖表配色展示</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="w-full h-8 rounded" style={{ backgroundColor: 'hsl(0 84% 60%)' }}></div>
              <p className="text-xs mt-2">虧損 (紅色)</p>
            </div>
            <div className="text-center">
              <div className="w-full h-8 rounded" style={{ backgroundColor: 'hsl(142 76% 36%)' }}></div>
              <p className="text-xs mt-2">盈利 (綠色)</p>
            </div>
            <div className="text-center">
              <div className="w-full h-8 rounded" style={{ backgroundColor: 'hsl(225 25% 55%)' }}></div>
              <p className="text-xs mt-2">主要 (#5d6d9e)</p>
            </div>
            <div className="text-center">
              <div className="w-full h-8 rounded" style={{ backgroundColor: 'hsl(262 83% 58%)' }}></div>
              <p className="text-xs mt-2">紫色</p>
            </div>
            <div className="text-center">
              <div className="w-full h-8 rounded" style={{ backgroundColor: 'hsl(45 35% 63%)' }}></div>
              <p className="text-xs mt-2">金黃 (#beb287)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 使用建議 */}
      <Card>
        <CardHeader>
          <CardTitle>使用建議</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="p-3 bg-primary/5 border-l-4 border-primary rounded">
            <p className="text-sm"><strong>主要色彩 (#5d6d9e):</strong> 用於主要按鈕、連結、重要數據線條、系統資訊</p>
          </div>
          <div className="p-3 bg-accent/5 border-l-4 border-accent rounded">
            <p className="text-sm"><strong>強調色彩 (#beb287):</strong> 用於重要提示、成功狀態、特殊標籤、總資產等關鍵數據</p>
          </div>
          <div className="p-3 bg-muted border-l-4 border-border rounded">
            <p className="text-sm"><strong>中性色彩:</strong> 用於次要元素、背景、邊框</p>
          </div>
          <div className="p-3 bg-green-500/5 border-l-4 border-green-500 rounded">
            <p className="text-sm"><strong>盈利色彩 (綠色):</strong> 用於正向數據、盈利指標</p>
          </div>
          <div className="p-3 bg-red-500/5 border-l-4 border-red-500 rounded">
            <p className="text-sm"><strong>虧損色彩 (紅色):</strong> 用於負向數據、虧損指標</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 