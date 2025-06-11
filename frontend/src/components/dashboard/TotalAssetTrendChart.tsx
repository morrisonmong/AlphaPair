'use client';

import { useEffect, useState } from 'react';
import { Line, Area, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ComposedChart } from 'recharts';
import { getAssetSnapshots, TrendDataPoint } from '@/lib/api/asset-snapshot';
import { Loader2, Settings2, Camera } from "lucide-react";
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import type { ChartConfig } from '@/components/ui/chart';
import {
  ChartContainer,
} from '@/components/ui/chart';
import { CHART_MARGINS, CHART_AXIS_CONFIG, CHART_Y_AXIS_CONFIG } from '@/lib/utils/chart-config';
import { ChartWrapperWithTitle } from '@/components/ui/chart-modal';

// 定義 TimeRange 類型
export type TimeRange = '7d' | '30d' | '90d' | '180d' | '1y';

interface TotalAssetTrendChartProps {
  timeRange?: TimeRange;
  currency?: string;
  visibleAssets?: Set<AssetType>;
}

interface ExtendedTrendDataPoint extends TrendDataPoint {
  spot: number;
  funding: number;
  futures: number;
  timestamp: number;
}

// 資產類型定義
type AssetType = 'value' | 'spot' | 'funding' | 'futures';

interface AssetTypeConfig {
  key: AssetType;
  label: string;
  color: string;
}

// 自定義工具提示的類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    name: string;
    color: string;
    payload: ExtendedTrendDataPoint;
  }>;
  label?: string;
}

const chartConfig = {
  value: {
    label: "總額",
    color: "hsl(var(--chart-1))",
  },
  spot: {
    label: "現貨",
    color: "hsl(var(--chart-2))",
  },
  funding: {
    label: "理財",
    color: "hsl(var(--chart-3))",
  },
  futures: {
    label: "合約",
    color: "#5FA5F9",
  },
} satisfies ChartConfig;

export function TotalAssetTrendChart({ 
  timeRange = '30d',
  currency = 'USDT',
  visibleAssets = new Set(['value', 'spot', 'funding', 'futures'])
}: TotalAssetTrendChartProps) {
  const [chartData, setChartData] = useState<ExtendedTrendDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // 資產類型配置
  /*
  const assetTypes: AssetTypeConfig[] = [
    { key: 'value', label: '總額', color: chartConfig.value.color },
    { key: 'spot', label: '現貨', color: chartConfig.spot.color },
    { key: 'funding', label: '理財', color: chartConfig.funding.color },
    { key: 'futures', label: '合約', color: chartConfig.futures.color },
  ];
  */

  // 獲取資產快照數據的函數
  const fetchAssetSnapshotData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // 根據時間範圍計算天數
      let days = 30; // 默認30天
      
      switch (timeRange) {
        case '7d':
          days = 7;
          break;
        case '30d':
          days = 30;
          break;
        case '90d':
          days = 90;
          break;
        case '180d':
          days = 180;
          break;
        case '1y':
          days = 365;
          break;
        default:
          days = 30;
      }
      
      // 從API獲取真實數據
      const snapshots = await getAssetSnapshots(days, 'day');
      
      // 轉換數據格式
      const extendedData: ExtendedTrendDataPoint[] = snapshots
        .filter(snapshot => snapshot.timestamp) // 過濾掉沒有時間戳的數據
        .map(snapshot => {
          const timestamp = new Date(snapshot.timestamp!).getTime();
          return {
            date: new Date(snapshot.timestamp!).toISOString().split('T')[0],
            timestamp,
            value: snapshot.total_balance || 0,
            spot: snapshot.spot_balance || 0,
            futures: snapshot.futures_balance || 0,
            funding: snapshot.funding_balance || 0,
          };
        });

      // 處理同一天有多個快照的情況，確保只使用最新的數據
      const latestDataByDate: Record<string, ExtendedTrendDataPoint> = {};
      
      extendedData.forEach(dataPoint => {
        if (
          !latestDataByDate[dataPoint.date] || 
          dataPoint.timestamp > latestDataByDate[dataPoint.date].timestamp
        ) {
          latestDataByDate[dataPoint.date] = dataPoint;
        }
      });

      // 轉換回陣列並按時間戳排序（使用實際快照數據，不填充）
      const finalChartData = Object.values(latestDataByDate).sort((a, b) => a.timestamp - b.timestamp);
      
      setChartData(finalChartData);
      setIsLoading(false);
    } catch (err) {
      console.error('獲取資產趨勢數據失敗:', err);
      setError(`獲取資產數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setChartData([]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAssetSnapshotData();
  }, [timeRange]);

  const displayData = chartData;

  // 自定義工具提示
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload as ExtendedTrendDataPoint;
      
      const displayPayload = [];
      
      if (visibleAssets.has('value')) {
        displayPayload.push({
          value: point.value,
          name: '總額',
          color: chartConfig.value.color,
          dataKey: 'value'
        });
      }
      if (visibleAssets.has('spot')) {
        displayPayload.push({
          value: point.spot,
          name: '現貨',
          color: chartConfig.spot.color,
          dataKey: 'spot'
        });
      }
      if (visibleAssets.has('funding')) {
        displayPayload.push({
          value: point.funding,
          name: '理財',
          color: chartConfig.funding.color,
          dataKey: 'funding'
        });
      }
      if (visibleAssets.has('futures')) {
        displayPayload.push({
          value: point.futures,
          name: '合約',
          color: chartConfig.futures.color,
          dataKey: 'futures'
        });
      }

      return (
        <div className="bg-background/95 backdrop-blur-md border border-border/80 rounded-lg shadow-xl p-3 animate-in fade-in-0 zoom-in-95 duration-200 max-w-xs">
          {label && (
            <p className="font-semibold text-sm text-foreground mb-2 border-b border-border/50 pb-1">
              {label}
            </p>
          )}
          <div className="space-y-1.5">
            {displayPayload.map((entry, index) => (
              <div key={index} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-foreground/90 truncate font-medium">
                    {entry.name}
                  </span>
                </div>
                <span className="text-xs font-bold text-foreground whitespace-nowrap">
                  {`${entry.value.toFixed(2)}${currency ? ` ${currency}` : ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  // 顯示錯誤
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-red-500 text-sm mb-2">{error}</p>
        <button 
          className="px-3 py-1 bg-primary/10 text-primary text-xs rounded hover:bg-primary/20"
          onClick={() => {
            setIsLoading(true);
            setError(null);
            fetchAssetSnapshotData();
          }}
        >
          重新加載
        </button>
      </div>
    );
  }
  
  // 如果沒有數據
  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted-foreground mb-2">暫無資產趨勢數據</p>
        <button 
          className="px-3 py-1 bg-primary/10 text-primary text-xs rounded hover:bg-primary/20"
          onClick={() => {
            setIsLoading(true);
            fetchAssetSnapshotData();
          }}
        >
          重新加載
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {isLoading ? (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-full w-full">
          <ComposedChart 
            data={displayData} 
            margin={CHART_MARGINS.default}
            className="overflow-visible"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              {...CHART_AXIS_CONFIG}
              interval="preserveStartEnd"
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => {
                // 根據數據點數量動態調整顯示格式
                if (displayData.length > 30) {
                  // 超過30個數據點時，只顯示月-日
                  return new Date(value).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' });
                } else {
                  // 少於30個數據點時，顯示完整日期
                  return new Date(value).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
                }
              }}
              minTickGap={30}
            />
            <YAxis 
              {...CHART_Y_AXIS_CONFIG}
              tickFormatter={(value) => `$${value.toFixed(0)}`}
              domain={['auto', 'auto']}
              allowDataOverflow={true}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="top"
              height={20}
              wrapperStyle={{ fontSize: 13, paddingTop: 2, fontWeight: 600 }}
            />
            {visibleAssets.has('value') && (
            <Area 
              type="monotone" 
              dataKey="value" 
              name="總額"
                stroke={chartConfig.value.color}
                fill={chartConfig.value.color}
                fillOpacity={0.1}
                strokeWidth={3}
              dot={false}
                activeDot={{ 
                  r: 6, 
                  fill: chartConfig.value.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                  className: 'drop-shadow-md'
                }}
            />
            )}
            {visibleAssets.has('spot') && (
            <Line 
              type="monotone" 
              dataKey="spot" 
              name="現貨"
                stroke={chartConfig.spot.color}
                strokeWidth={2}
              dot={false}
                activeDot={{ 
                  r: 5, 
                  fill: chartConfig.spot.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                  className: 'drop-shadow-md'
                }}
            />
            )}
            {visibleAssets.has('funding') && (
            <Line 
              type="monotone" 
              dataKey="funding" 
              name="理財"
                stroke={chartConfig.funding.color}
                strokeWidth={2}
              dot={false}
                activeDot={{ 
                  r: 5, 
                  fill: chartConfig.funding.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                  className: 'drop-shadow-md'
                }}
            />
            )}
            {visibleAssets.has('futures') && (
            <Line 
              type="monotone" 
              dataKey="futures" 
              name="合約"
                stroke={chartConfig.futures.color}
                strokeWidth={2}
              dot={false}
                activeDot={{ 
                  r: 5, 
                  fill: chartConfig.futures.color,
                  stroke: '#fff',
                  strokeWidth: 2,
                  className: 'drop-shadow-md'
                }}
            />
            )}
          </ComposedChart>
        </ChartContainer>
      )}
    </div>
  );
}

// 詳細視圖組件
const DetailedTotalAssetTrendChart: React.FC<TotalAssetTrendChartProps> = (props) => {
  return (
    <div className="h-full flex flex-col">      
      {/* 放大的圖表 - 使用 flex-1 確保佔滿剩餘空間 */}
      <div className="flex-1 min-h-0">
        <TotalAssetTrendChart {...props} />
      </div>
    </div>
  );
};

// 總資產趨勢說明組件
export const TotalAssetTrendChartWithTooltip: React.FC<TotalAssetTrendChartProps> = (props) => {
  const [visibleAssets, setVisibleAssets] = useState<Set<AssetType>>(
    new Set(['value', 'spot', 'funding', 'futures'])
  );
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState<boolean>(false);
  const { toast } = useToast();

  // 資產類型配置
  const assetTypes: AssetTypeConfig[] = [
    { key: 'value', label: '總額', color: chartConfig.value.color },
    { key: 'spot', label: '現貨', color: chartConfig.spot.color },
    { key: 'funding', label: '理財', color: chartConfig.funding.color },
    { key: 'futures', label: '合約', color: chartConfig.futures.color },
  ];

  // 切換資產顯示狀態
  const toggleAssetVisibility = (assetType: AssetType) => {
    const newVisibleAssets = new Set(visibleAssets);
    if (newVisibleAssets.has(assetType)) {
      newVisibleAssets.delete(assetType);
    } else {
      newVisibleAssets.add(assetType);
    }
    setVisibleAssets(newVisibleAssets);
  };

  // 創建資產快照的函數
  const createAssetSnapshot = async () => {
    try {
      setIsCreatingSnapshot(true);

      
      const response = await fetch('/api/asset-snapshots/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          source: 'binance',
          refresh: true
        })
      });
      
      if (response.ok) {
        const snapData = await response.json();
        toast({ 
          variant: 'default', 
          description: `資產快照創建成功! 總資產: ${snapData.total_balance.toFixed(2)} USDT` 
        });
      } else {
        let errorMessage = "未知錯誤";
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || "創建快照失敗";
        } catch (e) {
          console.error("解析錯誤回應失敗:", e);
        }
        toast({ 
          variant: 'destructive', 
          description: `創建快照失敗: ${errorMessage}` 
        });
      }
    } catch (error) {
      console.error('創建快照錯誤:', error);
      toast({ 
        variant: 'destructive', 
        description: '創建快照時發生錯誤，請檢查幣安API設定是否正確' 
      });
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const controlButtons = (
    <div className="flex items-center gap-2">
      {/* 資產快照按鈕 */}
      <Button
        variant="outline"
        size="sm"
        onClick={createAssetSnapshot}
        disabled={isCreatingSnapshot}
        className="h-6 px-2 text-xs"
      >
        {isCreatingSnapshot ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Camera className="h-3 w-3" />
        )}
        <span className="ml-1 hidden sm:inline">快照</span>
      </Button>

      {/* 資產顯示設置 */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs">
            <Settings2 className="h-3 w-3" />
            <span className="ml-1 hidden sm:inline">資產</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-2" align="end">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">選擇顯示的資產</div>
            {assetTypes.map((asset) => (
              <div key={asset.key} className="flex items-center space-x-2">
                <Checkbox
                  id={asset.key}
                  checked={visibleAssets.has(asset.key)}
                  onCheckedChange={() => toggleAssetVisibility(asset.key)}
                />
                <label
                  htmlFor={asset.key}
                  className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                >
                  <div 
                    className="w-3 h-0.5 rounded" 
                    style={{ backgroundColor: asset.color }}
                  />
                  {asset.label}
                </label>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <ChartWrapperWithTitle 
      title="總資產趨勢" 
      helpTooltip={controlButtons}
      detailedView={<DetailedTotalAssetTrendChart {...props} visibleAssets={visibleAssets} />}
      className="h-full"
    >
      <TotalAssetTrendChart {...props} visibleAssets={visibleAssets} />
    </ChartWrapperWithTitle>
  );
}; 