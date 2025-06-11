'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TestTube, TrendingUp, TrendingDown } from 'lucide-react';
import { PairTrade } from '@/lib/api/pair-trade';
import { toast } from '@/components/ui/use-toast';

interface CreateTestTradeModalProps {
  onCreateTestTrade: (trade: PairTrade) => void;
  children?: React.ReactNode;
}

interface TestTradeFormData {
  name: string;
  status: 'active' | 'closed';
  max_loss: number;
  stop_loss: number;
  take_profit: number;
  trailing_stop_enabled: boolean;
  trailing_stop_level: number;
  
  // Long Position
  long_symbol: string;
  long_quantity: number;
  long_entry_price: number;
  long_current_price: number;
  long_exit_price: number;
  long_entry_fee: number;
  long_exit_fee: number;
  long_leverage: number;
  long_notional_value: number;
  
  // Short Position
  short_symbol: string;
  short_quantity: number;
  short_entry_price: number;
  short_current_price: number;
  short_exit_price: number;
  short_entry_fee: number;
  short_exit_fee: number;
  short_leverage: number;
  short_notional_value: number;
  
  // Overall
  close_reason: string | null;
}

const defaultFormData: TestTradeFormData = {
  name: `測試交易_${new Date().toLocaleTimeString()}`,
  status: 'active',
  max_loss: 100,
  stop_loss: 2.0,
  take_profit: 5.0,
  trailing_stop_enabled: false,
  trailing_stop_level: 0,
  
  // Long Position (預設獲利)
  long_symbol: 'ETHUSDT',
  long_quantity: 0.1,
  long_entry_price: 2500,
  long_current_price: 2520,
  long_exit_price: 0,
  long_entry_fee: 0.5,
  long_exit_fee: 0,
  long_leverage: 20,
  long_notional_value: 250,
  
  // Short Position (預設獲利)
  short_symbol: 'XRPUSDT',
  short_quantity: 100,
  short_entry_price: 0.6,
  short_current_price: 0.595,
  short_exit_price: 0,
  short_entry_fee: 0.3,
  short_exit_fee: 0,
  short_leverage: 20,
  short_notional_value: 60,
  
  close_reason: null,
};

// 預設場景
const presetScenarios = {
  profit: {
    name: '獲利場景',
    long_current_price: 2520,
    short_current_price: 0.595,
  },
  loss: {
    name: '虧損場景',
    long_current_price: 2480,
    short_current_price: 0.605,
  },
  extreme_profit: {
    name: '極端獲利',
    long_current_price: 2600,
    short_current_price: 0.58,
  },
  extreme_loss: {
    name: '極端虧損',
    long_current_price: 2400,
    short_current_price: 0.62,
  },
  stop_loss: {
    name: '觸發停損',
    long_current_price: 2450,
    short_current_price: 0.615,
    status: 'closed' as const,
    close_reason: 'stop_loss',
  },
  take_profit: {
    name: '觸發止盈',
    long_current_price: 2625,
    short_current_price: 0.57,
    status: 'closed' as const,
    close_reason: 'take_profit',
  },
};

export function CreateTestTradeModal({ onCreateTestTrade, children }: CreateTestTradeModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState<TestTradeFormData>(defaultFormData);

  // 計算 PnL
  const calculatePnL = (entryPrice: number, currentPrice: number, quantity: number, side: 'BUY' | 'SELL') => {
    if (side === 'BUY') {
      return (currentPrice - entryPrice) * quantity;
    } else {
      return (entryPrice - currentPrice) * quantity;
    }
  };

  // 計算 PnL 百分比
  const calculatePnLPercent = (entryPrice: number, currentPrice: number, side: 'BUY' | 'SELL') => {
    if (side === 'BUY') {
      return ((currentPrice - entryPrice) / entryPrice) * 100;
    } else {
      return ((entryPrice - currentPrice) / entryPrice) * 100;
    }
  };

  // 應用預設場景
  const applyPreset = (presetKey: keyof typeof presetScenarios) => {
    const preset = presetScenarios[presetKey];
    const { name: presetName, ...presetData } = preset;
    setFormData(prev => ({
      ...prev,
      name: `${presetName}_${new Date().toLocaleTimeString()}`,
      ...presetData,
    }));
  };

  // 處理表單提交
  const handleSubmit = () => {
    try {
      const longPnL = calculatePnL(formData.long_entry_price, formData.long_current_price, formData.long_quantity, 'BUY');
      const shortPnL = calculatePnL(formData.short_entry_price, formData.short_current_price, formData.short_quantity, 'SELL');
      const totalPnL = longPnL + shortPnL;
      
      const longPnLPercent = calculatePnLPercent(formData.long_entry_price, formData.long_current_price, 'BUY');
      const shortPnLPercent = calculatePnLPercent(formData.short_entry_price, formData.short_current_price, 'SELL');
      
      const testTrade: PairTrade = {
        id: `test-${Date.now()}`,
        name: formData.name,
        status: formData.status,
        max_loss: formData.max_loss,
        stop_loss: formData.stop_loss,
        take_profit: formData.take_profit,
        trailing_stop_enabled: formData.trailing_stop_enabled,
        trailing_stop_level: formData.trailing_stop_level,
        long_position: {
          symbol: formData.long_symbol,
          quantity: formData.long_quantity,
          entry_price: formData.long_entry_price,
          current_price: formData.long_current_price,
          exit_price: formData.status === 'closed' ? formData.long_current_price : formData.long_exit_price,
          pnl: longPnL,
          pnl_percent: longPnLPercent,
          entry_order_id: '',
          exit_order_id: '',
          entry_fee: formData.long_entry_fee,
          exit_fee: formData.long_exit_fee,
          leverage: formData.long_leverage,
          side: 'BUY',
          notional_value: formData.long_notional_value,
        },
        short_position: {
          symbol: formData.short_symbol,
          quantity: formData.short_quantity,
          entry_price: formData.short_entry_price,
          current_price: formData.short_current_price,
          exit_price: formData.status === 'closed' ? formData.short_current_price : formData.short_exit_price,
          pnl: shortPnL,
          pnl_percent: shortPnLPercent,
          entry_order_id: '',
          exit_order_id: '',
          entry_fee: formData.short_entry_fee,
          exit_fee: formData.short_exit_fee,
          leverage: formData.short_leverage,
          side: 'SELL',
          notional_value: formData.short_notional_value,
        },
        total_pnl_value: totalPnL,
        total_ratio_percent: (longPnLPercent + shortPnLPercent) / 2,
        total_fee: formData.long_entry_fee + formData.long_exit_fee + formData.short_entry_fee + formData.short_exit_fee,
        total_entry_fee: formData.long_entry_fee + formData.short_entry_fee,
        total_exit_fee: formData.long_exit_fee + formData.short_exit_fee,
        max_ratio: Math.max(longPnLPercent, shortPnLPercent),
        min_ratio: Math.min(longPnLPercent, shortPnLPercent),
        mae: Math.min(longPnLPercent, shortPnLPercent), // 最大不利變動
        mfe: Math.max(longPnLPercent, shortPnLPercent), // 最大有利變動
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        closed_at: formData.status === 'closed' ? new Date().toISOString() : null,
        close_reason: formData.close_reason,
      };

      onCreateTestTrade(testTrade);
      setIsOpen(false);
      
      toast({
        title: "測試交易創建成功",
        description: `已創建測試交易：${formData.name}`,
      });
      
      // 重置表單
      setFormData({
        ...defaultFormData,
        name: `測試交易_${new Date().toLocaleTimeString()}`,
      });
    } catch (error) {
      console.error('創建測試交易失敗:', error);
      toast({
        title: "創建失敗",
        description: "無法創建測試交易，請檢查輸入數據",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="text-xs">
            <TestTube className="mr-1.5 h-3 w-3" />
            測試
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5" />
            創建測試配對交易
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 快速預設場景 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">快速場景</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(presetScenarios).map(([key, scenario]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(key as keyof typeof presetScenarios)}
                    className="text-xs"
                  >
                    {scenario.name}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">基本設定</TabsTrigger>
              <TabsTrigger value="long">多頭部位</TabsTrigger>
              <TabsTrigger value="short">空頭部位</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">交易名稱</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status">狀態</Label>
                  <Select value={formData.status} onValueChange={(value: 'active' | 'closed') => setFormData(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">持倉中</SelectItem>
                      <SelectItem value="closed">已平倉</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="max_loss">最大虧損</Label>
                  <Input
                    id="max_loss"
                    type="number"
                    step="0.01"
                    value={formData.max_loss}
                    onChange={(e) => setFormData(prev => ({ ...prev, max_loss: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="stop_loss">停損百分比 (%)</Label>
                  <Input
                    id="stop_loss"
                    type="number"
                    step="0.1"
                    value={formData.stop_loss}
                    onChange={(e) => setFormData(prev => ({ ...prev, stop_loss: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="take_profit">止盈百分比 (%)</Label>
                  <Input
                    id="take_profit"
                    type="number"
                    step="0.1"
                    value={formData.take_profit}
                    onChange={(e) => setFormData(prev => ({ ...prev, take_profit: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="trailing_stop"
                      checked={formData.trailing_stop_enabled}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, trailing_stop_enabled: checked }))}
                    />
                    <Label htmlFor="trailing_stop">啟用追蹤停損</Label>
                  </div>
                  {formData.trailing_stop_enabled && (
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="追蹤停損水平"
                      value={formData.trailing_stop_level}
                      onChange={(e) => setFormData(prev => ({ ...prev, trailing_stop_level: parseFloat(e.target.value) || 0 }))}
                    />
                  )}
                </div>
                
                {formData.status === 'closed' && (
                  <div className="space-y-2">
                    <Label htmlFor="close_reason">平倉原因</Label>
                    <Select value={formData.close_reason || ''} onValueChange={(value) => setFormData(prev => ({ ...prev, close_reason: value || null }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="選擇平倉原因" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="take_profit">觸發止盈</SelectItem>
                        <SelectItem value="stop_loss">觸發停損</SelectItem>
                        <SelectItem value="manual">手動平倉</SelectItem>
                        <SelectItem value="trailing_stop">追蹤停損</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="long" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    多頭部位設定
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>交易對</Label>
                    <Input
                      value={formData.long_symbol}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_symbol: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>數量</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.long_quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_quantity: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>進場價格</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.long_entry_price}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_entry_price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>當前價格</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.long_current_price}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_current_price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>進場手續費</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.long_entry_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_entry_fee: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>出場手續費</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.long_exit_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_exit_fee: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>槓桿倍數</Label>
                    <Input
                      type="number"
                      value={formData.long_leverage}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_leverage: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>名義價值</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.long_notional_value}
                      onChange={(e) => setFormData(prev => ({ ...prev, long_notional_value: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="short" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    空頭部位設定
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>交易對</Label>
                    <Input
                      value={formData.short_symbol}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_symbol: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>數量</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.short_quantity}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_quantity: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>進場價格</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.short_entry_price}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_entry_price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>當前價格</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.short_current_price}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_current_price: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>進場手續費</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.short_entry_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_entry_fee: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>出場手續費</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.short_exit_fee}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_exit_fee: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>槓桿倍數</Label>
                    <Input
                      type="number"
                      value={formData.short_leverage}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_leverage: parseInt(e.target.value) || 1 }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>名義價值</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.short_notional_value}
                      onChange={(e) => setFormData(prev => ({ ...prev, short_notional_value: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* 預覽計算結果 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">預覽計算結果</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">多頭 PnL</div>
                  <div className={`font-medium ${calculatePnL(formData.long_entry_price, formData.long_current_price, formData.long_quantity, 'BUY') >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {calculatePnL(formData.long_entry_price, formData.long_current_price, formData.long_quantity, 'BUY').toFixed(2)} USDT
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">空頭 PnL</div>
                  <div className={`font-medium ${calculatePnL(formData.short_entry_price, formData.short_current_price, formData.short_quantity, 'SELL') >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {calculatePnL(formData.short_entry_price, formData.short_current_price, formData.short_quantity, 'SELL').toFixed(2)} USDT
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">總 PnL</div>
                  <div className={`font-medium ${(calculatePnL(formData.long_entry_price, formData.long_current_price, formData.long_quantity, 'BUY') + calculatePnL(formData.short_entry_price, formData.short_current_price, formData.short_quantity, 'SELL')) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {(calculatePnL(formData.long_entry_price, formData.long_current_price, formData.long_quantity, 'BUY') + calculatePnL(formData.short_entry_price, formData.short_current_price, formData.short_quantity, 'SELL')).toFixed(2)} USDT
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">總手續費</div>
                  <div className="font-medium text-orange-500">
                    {(formData.long_entry_fee + formData.long_exit_fee + formData.short_entry_fee + formData.short_exit_fee).toFixed(2)} USDT
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSubmit}>
              創建測試交易
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 