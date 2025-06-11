'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import React from 'react';
import axios from 'axios';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { usePairTradeStore } from '@/lib/store/pair-trade-store';
import { TrendingUp, TrendingDown, Calculator, AlertTriangle, CheckCircle, DollarSign, AlertCircle } from 'lucide-react';
import { getFuturesAvailableMargin, checkMarginRequirement } from '@/lib/api/binance';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 表單驗證模式
const formSchema = z.object({
  name: z.string().optional(),
  max_loss: z.coerce.number().positive('最大虧損必須大於0'),
  stop_loss: z.coerce.number().positive('止損百分比必須大於0'),
  take_profit: z.coerce.number().positive('止盈百分比必須大於0'),
  long_symbol: z.string().min(1, '請輸入多單標的'),
  short_symbol: z.string().min(1, '請輸入空單標的'),
  leverage: z.coerce.number().min(1, '槓桿必須至少為1倍').max(125, '槓桿最大為125倍'),
  margin_type: z.enum(['ISOLATED', 'CROSSED']),
});

// 表單值類型
type FormValues = z.infer<typeof formSchema>;

// 保證金狀態介面
interface MarginStatus {
  available: number;
  required: number;
  sufficient: boolean;
  longRequired: number;
  shortRequired: number;
  deficit?: number;
  loading: boolean;
  error?: string;
}

export function CreatePairTradeForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showMarginWarning, setShowMarginWarning] = useState(false);
  const { createTrade } = usePairTradeStore();
  const [isLoading, setIsLoading] = useState(false);

  // 使用 ref 管理防抖計時器，避免競態條件
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 格式化數字，自動移除不必要的小數點後的0
  const formatNumber = (value: number | string | undefined, maxDecimals: number = 2): string => {
    // 處理 undefined 和 null
    if (value === undefined || value === null) return '0';
    
    // 轉換為數字
    const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);
    
    // 檢查是否為有效數字
    if (isNaN(numValue)) return '0';
    if (numValue === 0) return '0';
    
    // 使用 parseFloat 來自動移除尾隨的 0
    return parseFloat(numValue.toFixed(maxDecimals)).toString();
  };

  // 表單默認值
  const defaultValues: Partial<FormValues> = {
    name: '',
    max_loss: 100,
    stop_loss: 1,
    take_profit: 3,
    long_symbol: '',
    short_symbol: '',
    leverage: 10,
    margin_type: 'CROSSED', // 默認使用全倉模式
  };

  // 初始化表單
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  // 監聽表單變化以便即時計算
  const [longSymbol, shortSymbol, maxLoss, stopLoss, takeProfit] = form.watch([
    "long_symbol", 
    "short_symbol", 
    "max_loss", 
    "stop_loss", 
    "take_profit"
  ]);

  // 當多空標的變化時，自動更新交易名稱
  React.useEffect(() => {
    if (longSymbol && shortSymbol) {
      // 移除USDT後綴，如果有的話
      const longBase = longSymbol.replace(/usdt$/i, '').toUpperCase();
      const shortBase = shortSymbol.replace(/usdt$/i, '').toUpperCase();
      form.setValue('name', `${longBase}/${shortBase}`);
    }
  }, [longSymbol, shortSymbol, form]);

  // 計算風險回報比
  const calculateRiskRewardRatio = (): number => {
    const stopLossNum = Number(stopLoss);
    const takeProfitNum = Number(takeProfit);
    
    if (stopLossNum && takeProfitNum && stopLossNum > 0) {
      return takeProfitNum / stopLossNum;
    }
    return 0;
  };

  const calculatePotentialProfit = (): number => {
    const maxLossNum = Number(maxLoss);
    const takeProfitNum = Number(takeProfit);
    const stopLossNum = Number(stopLoss);
    
    if (maxLossNum && takeProfitNum && stopLossNum && stopLossNum > 0) {
      return (maxLossNum * takeProfitNum) / stopLossNum;
    }
    return 0;
  };

  // 獲取可用保證金
  const fetchAvailableMargin = async () => {
    try {
      const result = await getFuturesAvailableMargin();
      setMarginStatus(prev => ({
        ...prev,
        available: result.available_margin || 0
      }));
    } catch (error) {
      console.error('獲取可用保證金失敗:', error);
      setMarginStatus(prev => ({
        ...prev,
        error: '無法獲取可用保證金'
      }));
    }
  };

  // 計算保證金需求
  const calculateMarginRequirement = async (formData: Partial<FormValues>) => {
    try {
      setMarginStatus(prev => ({ ...prev, loading: true, error: undefined }));

      const ensureUSDTPair = (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        return upperSymbol.endsWith('USDT') ? upperSymbol : `${upperSymbol}USDT`;
      };

      // 確保交易對格式正確
      const longSymbolFormatted = ensureUSDTPair(formData.long_symbol || '');
      const shortSymbolFormatted = ensureUSDTPair(formData.short_symbol || '');

      // 使用封裝好的 API 函數
      const response = await checkMarginRequirement({
        long_symbol: longSymbolFormatted,
        short_symbol: shortSymbolFormatted,
        max_loss: formData.max_loss || 0,
        stop_loss: formData.stop_loss || 0,
        long_leverage: formData.leverage || 1,
        short_leverage: formData.leverage || 1
      });

      if (response && typeof response.sufficient === 'boolean') {
        setMarginStatus({
          available: (response.available_margin ?? 0) as number,
          required: (response.required_margin ?? 0) as number,
          sufficient: response.sufficient,
          longRequired: (response.long_required ?? 0) as number,
          shortRequired: (response.short_required ?? 0) as number,
          deficit: (response.deficit ?? 0) as number,
          loading: false
        });
      } else {
        throw new Error('API 響應格式不正確');
      }
    } catch (error: unknown) {
      // 如果是取消請求，不顯示錯誤
      if (error instanceof Error && (error.name === 'CanceledError' || (error as Error & {code?: string}).code === 'ERR_CANCELED')) {

        return;
      }

      console.error('計算保證金失敗:', error);
      const errorMessage = error instanceof Error ? error.message : '計算保證金失敗';
      setMarginStatus(prev => ({
        ...prev,
        loading: false,
        error: errorMessage
      }));
    }
  };

  // 初始載入可用保證金
  useEffect(() => {
    fetchAvailableMargin();
  }, []);

  // 保證金狀態
  const [marginStatus, setMarginStatus] = useState<MarginStatus>({
    available: 0,
    required: 0,
    sufficient: false,
    longRequired: 0,
    shortRequired: 0,
    loading: false
  });

  // 穩定的防抖計算函數
  const debouncedCalculateMargin = useCallback((formData: Partial<FormValues>) => {
    // 清除之前的計時器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // 檢查所有必要字段是否完整
    const hasAllRequiredFields = 
      formData.long_symbol && 
      formData.short_symbol && 
      formData.max_loss && 
      formData.stop_loss && 
      formData.leverage &&
      formData.long_symbol.length > 2 &&
      formData.short_symbol.length > 2 &&
      Number(formData.max_loss) > 0 &&
      Number(formData.stop_loss) > 0 &&
      Number(formData.leverage) > 0;

    if (!hasAllRequiredFields) {
      // 清除保證金狀態（保留可用保證金）
      setMarginStatus(prev => ({
        ...prev,
        required: 0,
        sufficient: false,
        longRequired: 0,
        shortRequired: 0,
        deficit: 0,
        loading: false,
        error: undefined
      }));
      return;
    }

    // 設置新的計時器
    debounceTimerRef.current = setTimeout(() => {

      calculateMarginRequirement(formData);
      debounceTimerRef.current = null;
    }, 1500); // 增加到1.5秒，給用戶更多輸入時間
  }, []);

  // 清理計時器
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // 監聽表單變化並觸發防抖計算
  useEffect(() => {
    const subscription = form.watch((formData) => {
      debouncedCalculateMargin(formData);
    });
    return () => subscription.unsubscribe();
  }, [form, debouncedCalculateMargin]);

  // 提交表單
  const onSubmit = async (data: FormValues) => {
    // 檢查保證金是否充足
    if (!marginStatus.sufficient && !marginStatus.loading) {
      toast({
        title: "保證金不足",
        description: `您的保證金不足以執行此交易。需要 ${formatNumber(marginStatus.required)} USDT，可用 ${formatNumber(marginStatus.available)} USDT。`,
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setShowMarginWarning(false);
    
    try {
      // 確保交易對符號是完整的（添加USDT後綴）
      const ensureUSDTPair = (symbol: string) => {
        const upperSymbol = symbol.toUpperCase();
        return upperSymbol.endsWith('USDT') ? upperSymbol : `${upperSymbol}USDT`;
      };

      // 將 leverage 值同時設置為 long_leverage 和 short_leverage
      const tradeData = {
        ...data,
        long_symbol: ensureUSDTPair(data.long_symbol),
        short_symbol: ensureUSDTPair(data.short_symbol),
        name: data.name || `${ensureUSDTPair(data.long_symbol)}/${ensureUSDTPair(data.short_symbol)}`.toUpperCase(),
        long_leverage: data.leverage,
        short_leverage: data.leverage,
        margin_type: data.margin_type,
      };
      
 // 用於調試
      
      const trade = await createTrade(tradeData);
      if (trade) {
        toast({
          title: "成功",
          description: "配對交易創建成功",
        });
        router.push('/pair-trades');
      }
    } catch (error: unknown) {
      console.error('Error creating pair trade:', error);
      let errorMsg = "創建配對交易時發生未知錯誤";

      if (axios.isAxiosError(error)) {
        if (error.response?.data?.detail) {
          errorMsg = error.response.data.detail;
        } else if (error.response?.statusText) {
          errorMsg = error.response.statusText;
        } else if (error.message) {
          errorMsg = error.message;
        }
        
        if (errorMsg.includes("保證金不足") || errorMsg.includes("Margin is insufficient")) {
          setShowMarginWarning(true);
          setErrorMessage("保證金不足！請減少最大虧損金額或增加槓桿倍數。在保證金不足的情況下，系統可能只執行了一邊的訂單，請檢查您的倉位。");
          toast({
            title: "保證金不足",
            description: "請減少最大虧損金額或增加槓桿倍數",
            variant: "destructive",
          });
        } else {
          setErrorMessage(errorMsg);
          toast({
            title: "創建配對交易失敗",
            description: errorMsg,
            variant: "destructive",
          });
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 relative">
      {/* 懸浮計算預覽面板 */}
      <div className="fixed top-20 right-4 z-50 w-80 hidden lg:block">
        <Card className="bg-background/95 backdrop-blur-sm border-primary/20 shadow-xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Calculator className="w-5 h-5 text-primary" />
              實時計算預覽
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 基礎計算 */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">1R</span>
                <span className="font-bold text-blue-600">${formatNumber(form.watch("max_loss") || 0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">風險報酬比</span>
                <span className="font-bold text-orange-600">1:{formatNumber(calculateRiskRewardRatio())}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">預期收益</span>
                <span className="font-bold text-green-600">${formatNumber(calculatePotentialProfit())}</span>
              </div>
            </div>

            {/* 保證金狀態 */}
            <div className="pt-2 border-t border-border/50 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">可用保證金</span>
                <span className="font-medium">{formatNumber(marginStatus.available)} USDT</span>
              </div>
              
              {marginStatus.loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-primary"></div>
                  計算中...
                </div>
              )}
              
              {!marginStatus.loading && marginStatus.required > 0 && (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">需要保證金</span>
                    <span className="font-medium">{formatNumber(marginStatus.required)} USDT</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>多單:</span>
                    <span>{formatNumber(marginStatus.longRequired)} USDT</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>空單:</span>
                    <span>{formatNumber(marginStatus.shortRequired)} USDT</span>
                  </div>

                  {/* 保證金充足度指示器 */}
                  <div className="pt-2 space-y-2">
                    {marginStatus.sufficient ? (
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4" />
                        <span>保證金充足</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-red-600 text-sm">
                          <AlertCircle className="h-4 w-4" />
                          <span>保證金不足</span>
                        </div>
                        {marginStatus.deficit && marginStatus.deficit > 0 && (
                          <div className="text-xs text-red-500">
                            不足: {formatNumber(marginStatus.deficit)} USDT
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 保證金充足度進度條 */}
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          marginStatus.sufficient ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (marginStatus.available / Math.max(marginStatus.required, 1)) * 100)}%`
                        }}
                      ></div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      充足度: {marginStatus.required > 0 ? formatNumber((marginStatus.available / marginStatus.required) * 100, 1) : 0}%
                    </div>
                  </div>
                </>
              )}

              {marginStatus.error && (
                <div className="text-xs text-destructive">
                  {marginStatus.error}
                </div>
              )}
            </div>

            {/* 交易對信息 */}
            {longSymbol && shortSymbol && (
              <div className="pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-1">交易對</div>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                    多: {longSymbol.toUpperCase()}USDT
                  </span>
                  <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">
                    空: {shortSymbol.toUpperCase()}USDT
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 主表單 */}
      <Card className="bg-card/95 backdrop-blur-sm border-border/50 shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <TrendingUp className="w-6 h-6 text-green-500" />
            創建配對交易
          </CardTitle>
          <CardDescription>
            設置配對交易參數，系統將自動計算交易數量並執行市價下單
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* 多單標的 */}
                <FormField
                  control={form.control}
                  name="long_symbol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-green-600">
                        <TrendingUp className="w-4 h-4" />
                        多單標的
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="例如：BTC" 
                          className="border-green-200 focus:border-green-400" 
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value.toUpperCase();
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        輸入您想做多的標的名稱（無需添加USDT後綴）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 空單標的 */}
                <FormField
                  control={form.control}
                  name="short_symbol"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2 text-red-600">
                        <TrendingDown className="w-4 h-4" />
                        空單標的
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="例如：ETH" 
                          className="border-red-200 focus:border-red-400" 
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value.toUpperCase();
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        輸入您想做空的標的名稱（無需添加USDT後綴）
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 最大虧損 */}
                <FormField
                  control={form.control}
                  name="max_loss"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4" />
                        最大虧損 (1R)
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="10" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        輸入您的 1R 虧損金額，單位為USDT
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 槓桿倍數 */}
                <FormField
                  control={form.control}
                  name="leverage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Calculator className="w-4 h-4" />
                        槓桿倍數
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="1" 
                          max="125" 
                          placeholder="20" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        請注意該幣種槓桿上限，多空單會採用相同的槓桿倍數
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* 止損 */}
                <FormField
                  control={form.control}
                  name="stop_loss"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        止損 (%)
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="1" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 止盈 */}
                <FormField
                  control={form.control}
                  name="take_profit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        止盈 (%)
                      </FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01" 
                          placeholder="3" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 交易名稱 */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>交易名稱</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="AVAX/SOL" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      為配對交易設置一個識別的名稱（會根據交易對自動生成）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 手機版實時計算預覽 */}
              <div className="lg:hidden">
                <Card className="bg-muted/30 border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calculator className="w-4 h-4 text-primary" />
                      實時計算預覽
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 基礎計算 - 網格布局 */}
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">1R</div>
                        <div className="font-bold text-blue-600">${formatNumber(form.watch("max_loss") || 0)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">風險報酬比</div>
                        <div className="font-bold text-orange-600">1:{formatNumber(calculateRiskRewardRatio())}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">預期收益</div>
                        <div className="font-bold text-green-600">${formatNumber(calculatePotentialProfit())}</div>
                      </div>
                    </div>

                    {/* 保證金詳細信息 */}
                    <div className="pt-3 border-t border-border/50 space-y-3">
                      <div className="text-xs text-muted-foreground font-medium">保證金狀態</div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-muted-foreground">可用保證金</span>
                          <span className="font-medium">{formatNumber(marginStatus.available)} USDT</span>
                        </div>

                        {marginStatus.loading && (
                          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
                            <div className="h-3 w-3 animate-spin rounded-full border border-border border-t-primary"></div>
                            計算中...
                          </div>
                        )}
                        
                        {!marginStatus.loading && marginStatus.required > 0 && (
                          <>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-muted-foreground">需要保證金</span>
                              <span className="font-medium">{formatNumber(marginStatus.required)} USDT</span>
                            </div>
                            
                            {/* 多空保證金分解 */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="flex justify-between items-center text-muted-foreground">
                                <span>多單:</span>
                                <span>{formatNumber(marginStatus.longRequired)} USDT</span>
                              </div>
                              <div className="flex justify-between items-center text-muted-foreground">
                                <span>空單:</span>
                                <span>{formatNumber(marginStatus.shortRequired)} USDT</span>
                              </div>
                            </div>

                            {/* 保證金充足度指示器 */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-center gap-2">
                                {marginStatus.sufficient ? (
                                  <div className="flex items-center gap-2 text-green-600 text-sm">
                                    <CheckCircle className="h-4 w-4" />
                                    <span>保證金充足</span>
                                  </div>
                                ) : (
                                  <div className="text-center space-y-1">
                                    <div className="flex items-center justify-center gap-2 text-red-600 text-sm">
                                      <AlertCircle className="h-4 w-4" />
                                      <span>保證金不足</span>
                                    </div>
                                    {marginStatus.deficit && marginStatus.deficit > 0 && (
                                      <div className="text-xs text-red-500">
                                        不足: {formatNumber(marginStatus.deficit)} USDT
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              
                              {/* 保證金充足度進度條 */}
                              <div className="w-full bg-secondary rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all duration-300 ${
                                    marginStatus.sufficient ? 'bg-green-500' : 'bg-red-500'
                                  }`}
                                  style={{
                                    width: `${Math.min(100, (marginStatus.available / Math.max(marginStatus.required, 1)) * 100)}%`
                                  }}
                                ></div>
                              </div>
                              <div className="text-xs text-muted-foreground text-center">
                                充足度: {marginStatus.required > 0 ? formatNumber((marginStatus.available / marginStatus.required) * 100, 1) : 0}%
                              </div>
                            </div>
                          </>
                        )}

                        {marginStatus.error && (
                          <div className="text-xs text-destructive text-center py-2">
                            {marginStatus.error}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 交易對信息 */}
                    {longSymbol && shortSymbol && (
                      <div className="pt-3 border-t border-border/50">
                        <div className="text-xs text-muted-foreground mb-2 text-center">交易對</div>
                        <div className="flex gap-2 justify-center">
                          <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                            多: {longSymbol.toUpperCase()}USDT
                          </span>
                          <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">
                            空: {shortSymbol.toUpperCase()}USDT
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* 保證金不足警告 */}
              {showMarginWarning && (
                <Alert className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {errorMessage || "保證金不足，請調整倉位大小或槓桿倍數"}
                  </AlertDescription>
                </Alert>
              )}

              {/* 操作按鈕 */}
              <div className="flex flex-col sm:flex-row justify-end gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  取消
                </Button>
                <Button 
                  type="submit" 
                  className="w-full sm:w-auto" 
                  disabled={isLoading || (!marginStatus.sufficient && !marginStatus.loading)}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      處理中...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      創建配對交易
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
} 