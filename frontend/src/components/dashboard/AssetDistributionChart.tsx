'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { getBinanceAssetsDistribution } from '@/lib/api/binance';

// 每5分鐘更新一次資產分佈數據
const REFRESH_INTERVAL = 300000; // 5分鐘

interface AssetDistributionChartProps {
  currency?: string;
  refreshInterval?: number;
}

// 自定義工具提示的 props 類型
interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      name: string;
      value: number;
      percentage: number;
    };
  }>;
}

// 顏色列表，用於圓餅圖的不同部分
const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', 
  '#82CA9D', '#A4DE6C', '#D0ED57', '#FFC658', '#FF5733',
  '#C70039', '#900C3F', '#581845', '#F4D03F', '#52BE80'
];

// 自定義標籤渲染函數
const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
}) => {
  const RADIAN = Math.PI / 180;
  // 計算標籤位置
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // 只顯示大於 3% 的資產標籤
  if (percent < 0.03) return null;

  return (
    <text 
      x={x} 
      y={y} 
      fill="white" 
      textAnchor="middle" 
      dominantBaseline="central"
      fontSize={10}
      fontWeight="bold"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function AssetDistributionChart({ currency = 'USDT', refreshInterval = REFRESH_INTERVAL }: AssetDistributionChartProps) {
  const [chartData, setChartData] = useState<Array<{ name: string; value: number; percentage: number }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAccountData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 獲取幣安賬戶資產價值數據 (使用優化後的API)
      const accountValue = await getBinanceAssetsDistribution();
      
      if (!accountValue || !accountValue.balances || accountValue.balances.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }

      // 過濾出價值大於0的資產
      const nonZeroBalances = accountValue.balances.filter(balance => balance.value_usdt > 0);

      if (nonZeroBalances.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }

      // 按價值排序
      const sortedBalances = [...nonZeroBalances].sort((a, b) => b.value_usdt - a.value_usdt);

      // 取前10個最大的資產，其餘合併為"其他"
      const topAssets = sortedBalances.slice(0, 10);
      const otherAssets = sortedBalances.slice(10);

      // 計算總資產價值
      const totalValue = accountValue.total_value || 
                         sortedBalances.reduce((sum, asset) => sum + asset.value_usdt, 0);

      // 構建圖表數據
      const data = topAssets.map((asset) => ({
        name: formatAssetName(asset.asset),
        value: parseFloat(asset.value_usdt.toFixed(2)),
        percentage: parseFloat(((asset.value_usdt / totalValue) * 100).toFixed(2))
      }));

      // 如果有其他資產，添加到數據中
      const otherValue = otherAssets.reduce((sum, asset) => sum + asset.value_usdt, 0);
      if (otherValue > 0) {
        data.push({
          name: '其他',
          value: parseFloat(otherValue.toFixed(2)),
          percentage: parseFloat(((otherValue / totalValue) * 100).toFixed(2))
        });
      }

      setChartData(data);
      setLastUpdated(new Date());
      setIsLoading(false);
    } catch (err) {
      console.error('處理資產分佈圖表數據失敗:', err);
      setError(`處理資產數據失敗: ${err instanceof Error ? err.message : '未知錯誤'}`);
      setChartData([]);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccountData();
    
    // 設定定時器按指定的間隔更新數據
    if (refreshInterval > 0) {
      const timer = setInterval(() => {
        fetchAccountData();
      }, refreshInterval);
      
      return () => clearInterval(timer);
    }
  }, [refreshInterval]);

  // 格式化資產名稱，去除前綴
  const formatAssetName = (assetName: string): string => {
    // 去除常見的前綴，如 LD (靈活存款)、LDUSDT 等
    return assetName.replace(/^LD/, '');
  };

  // 自定義工具提示
  const CustomTooltip = ({ active, payload }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-background border border-border p-2 rounded shadow-md">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm">{`${data.value.toFixed(2)} ${currency}`}</p>
          <p className="text-xs text-muted-foreground">{`${data.percentage}%`}</p>
        </div>
      );
    }
    return null;
  };

  // 自定義圖例渲染
  const renderColorfulLegendText = (value: string) => {
    const item = chartData.find(d => d.name === value);
    const percent = item?.percentage || 0;
    
    return (
      <span style={{ color: 'inherit', fontSize: '10px' }}>
        {value} ({percent}%)
      </span>
    );
  };

  // 如果正在加載，顯示加載信息
  if (isLoading && !chartData.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
        <span className="ml-2 text-muted-foreground">載入中...</span>
      </div>
    );
  }

  // 如果有錯誤，顯示錯誤信息
  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  // 如果沒有數據，顯示提示信息
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">暫無資產數據</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <ResponsiveContainer width="100%" height="95%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={70}
            fill="#8884d8"
            dataKey="value"
            label={renderCustomizedLabel}
            animationDuration={500}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            formatter={renderColorfulLegendText} 
            layout="vertical" 
            verticalAlign="middle" 
            align="right"
            iconSize={8}
            iconType="circle"
            wrapperStyle={{ fontSize: 10, paddingLeft: 20 }}
          />
        </PieChart>
      </ResponsiveContainer>
      {lastUpdated && (
        <div className="text-center text-xs text-muted-foreground mt-1">
          更新於: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
} 