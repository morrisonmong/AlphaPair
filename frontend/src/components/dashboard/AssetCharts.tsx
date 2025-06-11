'use client';

import { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sector
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  getBinanceAccount, 
  getBinanceFuturesAccount, 
  getBinanceAccountValue,
  BinanceAccountInfo, 
  BinanceFuturesAccountInfo,
  BinanceAccountValue
} from '@/lib/api/binance';

// 時間範圍選項
const TIME_RANGES = [
  { label: '今日', value: 'today' },
  { label: '7日', value: '7d' },
  { label: '30日', value: '30d' },
  { label: '3個月', value: '3m' },
  { label: '1年', value: '1y' },
  { label: '自訂', value: 'custom' }
];

// 資產數據接口
interface AssetData {
  date: string;
  total: number;
  spot: number;
  futures: number;
}

// 資產分佈接口
interface AssetDistribution {
  name: string;
  value: number;
  percentage: number;
}

// 歷史數據項接口
interface HistoryItem {
  date: string;
  total_value: number;
  spot_value?: number;
  futures_value?: number;
}

export function AssetCharts() {
  // 狀態
  const [timeRange, setTimeRange] = useState('7d');
  const [assetTrendData, setAssetTrendData] = useState<AssetData[]>([]);
  const [assetDistributionData, setAssetDistributionData] = useState<AssetDistribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  
  // 顏色數組
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#FF6B6B'];

  // 獲取資產數據
  useEffect(() => {
    const fetchAssetData = async () => {
      setIsLoading(true);
      try {
        // 獲取賬戶資產數據
        const [spotAccount, futuresAccount, accountValue] = await Promise.all([
          getBinanceAccount(),
          getBinanceFuturesAccount(),
          getBinanceAccountValue()
        ]);
        
        // 生成資產趨勢數據
        const trendData = generateAssetTrendData(accountValue);
        setAssetTrendData(trendData);
        
        // 生成資產分佈數據
        const distributionData = generateAssetDistributionData(spotAccount, futuresAccount);
        setAssetDistributionData(distributionData);
      } catch (error) {
        console.error('獲取資產數據失敗:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAssetData();
  }, [timeRange]);

  // 生成資產趨勢數據
  const generateAssetTrendData = (accountValue: BinanceAccountValue | null): AssetData[] => {
    if (!accountValue || !accountValue.history) return [];
    
    // 根據時間範圍過濾數據
    const filteredHistory = filterHistoryByTimeRange(accountValue.history, timeRange);
    
    // 轉換為圖表數據格式
    return filteredHistory.map(item => ({
      date: format(new Date(item.date), 'MM/dd'),
      total: item.total_value || 0,
      spot: item.spot_value || 0,
      futures: item.futures_value || 0
    }));
  };

  // 根據時間範圍過濾歷史數據
  const filterHistoryByTimeRange = (history: HistoryItem[], range: string): HistoryItem[] => {
    if (!history || history.length === 0) return [];
    
    const today = new Date();
    let startDate: Date;
    
    switch (range) {
      case 'today':
        startDate = new Date(today.setHours(0, 0, 0, 0));
        break;
      case '7d':
        startDate = subDays(today, 7);
        break;
      case '30d':
        startDate = subDays(today, 30);
        break;
      case '3m':
        startDate = subDays(today, 90);
        break;
      case '1y':
        startDate = subDays(today, 365);
        break;
      default:
        startDate = subDays(today, 7);
    }
    
    return history.filter(item => new Date(item.date) >= startDate);
  };

  // 生成資產分佈數據
  const generateAssetDistributionData = (
    spotAccount: BinanceAccountInfo | null, 
    futuresAccount: BinanceFuturesAccountInfo | null
  ): AssetDistribution[] => {
    if (!spotAccount || !futuresAccount) return [];
    
    // 計算總資產價值
    const spotBalances = spotAccount.balances || [];
    const futuresPositions = futuresAccount.positions || [];
    
    // 過濾有價值的資產
    const valuableSpotAssets = spotBalances
      .filter(asset => parseFloat(asset.free.toString()) > 0 || parseFloat(asset.locked.toString()) > 0)
      .map(asset => ({
        name: asset.asset,
        value: asset.total ? parseFloat(asset.total.toString()) : 0,
        type: 'spot'
      }));
    
    // 過濾有持倉的合約
    const valuableFuturesAssets = futuresPositions
      .filter(position => parseFloat(position.positionAmt.toString()) !== 0)
      .map(position => ({
        name: position.symbol,
        value: Math.abs(parseFloat(position.positionAmt.toString()) * parseFloat(position.markPrice.toString())),
        type: 'futures'
      }));
    
    // 合併資產
    const allAssets = [...valuableSpotAssets, ...valuableFuturesAssets];
    
    // 計算總價值
    const totalValue = allAssets.reduce((sum, asset) => sum + asset.value, 0);
    
    // 取前5個最大資產，其餘歸為"其他"
    const sortedAssets = [...allAssets].sort((a, b) => b.value - a.value);
    const topAssets = sortedAssets.slice(0, 5);
    const otherAssets = sortedAssets.slice(5);
    const otherValue = otherAssets.reduce((sum, asset) => sum + asset.value, 0);
    
    // 生成最終數據
    const result = topAssets.map(asset => ({
      name: cleanAssetName(asset.name),
      value: asset.value,
      percentage: totalValue > 0 ? (asset.value / totalValue) * 100 : 0
    }));
    
    // 添加"其他"類別
    if (otherValue > 0) {
      result.push({
        name: '其他',
        value: otherValue,
        percentage: totalValue > 0 ? (otherValue / totalValue) * 100 : 0
      });
    }
    
    return result;
  };

  // 清理資產名稱
  const cleanAssetName = (name: string): string => {
    // 移除常見的後綴
    return name
      .replace(/USDT$|BTC$|ETH$|USD$|BUSD$/, '')
      .replace(/[0-9]/g, '')
      .substring(0, 5);
  };

  // 餅圖活躍形狀渲染
  const renderActiveShape = (props: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    innerRadius?: number;
    outerRadius?: number;
    startAngle?: number;
    endAngle?: number;
    fill?: string;
    payload?: { name: string; [key: string]: unknown };
    percent?: number;
    value?: number;
  }) => {
    const RADIAN = Math.PI / 180;
    const { 
      cx = 0, 
      cy = 0, 
      midAngle = 0, 
      innerRadius = 0, 
      outerRadius = 0, 
      startAngle = 0, 
      endAngle = 0, 
      fill = '#000', 
      payload = { name: '' }, 
      percent = 0, 
      value = 0 
    } = props;
    
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#fff" fontSize={14}>
          {payload.name}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#fff" fontSize={12}>
          {`${value.toFixed(2)} USDT`}
        </text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999" fontSize={12}>
          {`(${(percent * 100).toFixed(2)}%)`}
        </text>
      </g>
    );
  };

  // 餅圖鼠標進入事件
  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="space-y-4">
      {/* 時間範圍選擇 */}
      <div className="flex justify-end mb-4">
        <Tabs defaultValue="7d" value={timeRange} onValueChange={setTimeRange}>
          <TabsList>
            {TIME_RANGES.map(range => (
              <TabsTrigger key={range.value} value={range.value}>
                {range.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      
      {/* 資產圖表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 總資產趨勢圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">總資產趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : assetTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={assetTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="total" 
                      name="總資產" 
                      stroke="#5d6d9e" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#60a5fa' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無資產數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 現貨資產趨勢圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">現貨資產趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : assetTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={assetTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="spot" 
                      name="現貨資產" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#34d399' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無現貨資產數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 合約資產趨勢圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">合約資產趨勢</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : assetTrendData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={assetTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" stroke="#9ca3af" tick={{fontSize: 10}} />
                    <YAxis stroke="#9ca3af" tick={{fontSize: 10}} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#1f2937', 
                        borderColor: '#374151',
                        color: 'white'
                      }} 
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="futures" 
                      name="合約資產" 
                      stroke="#f59e0b" 
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#fbbf24' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無合約資產數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        {/* 資產分佈餅圖 */}
        <Card className="bg-gray-800 border-0 shadow-lg">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-400">資產分佈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {isLoading ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  載入中...
                </div>
              ) : assetDistributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      activeIndex={activeIndex}
                      activeShape={renderActiveShape}
                      data={assetDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                      onMouseEnter={onPieEnter}
                    >
                      {assetDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex justify-center items-center h-full text-gray-400">
                  暫無資產分佈數據
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 