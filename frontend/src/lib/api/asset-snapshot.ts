import apiClient from './client';

// 資產快照接口
export interface AssetSnapshot {
  id: string;
  user_id: string;
  timestamp?: string; // 手動快照和統一後的時間戳
  date?: string; // 手動快照中的日期
  hour?: number; // 手動快照中的小時
  data_source?: string; // 手動快照中的數據來源
  spot_balance: number;
  futures_balance: number;
  funding_balance?: number; // 手動快照中的資金餘額，設為可選
  total_balance: number;
  created_at?: string; // 排程快照中的創建時間
  // 可選的排程快照特有欄位 (如果需要更詳細處理)
  funding_products?: {
    flexible_savings?: Array<{ asset: string; totalAmount: number; usdt_value: number; [key: string]: unknown }>;
    fixed_savings?: Array<{ asset: string; totalAmount: number; usdt_value: number; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  // 其他排程快照可能有的欄位，根據需要添加
  spot_only_balance?: number;
  funding_in_spot_balance?: number;
  futures_positions?: Array<Record<string, unknown>>;
  spot_assets?: Record<string, Record<string, unknown>>;
}

// 趨勢數據點接口
export interface TrendDataPoint {
  date: string;
  value: number;
}

/**
 * 獲取資產快照數據（帶重試機制）
 * @param days 最近幾天的數據
 * @param interval 時間間隔 ('day' 或 'hour')
 * @param maxRetries 最大重試次數
 * @returns 資產快照列表
 */
export const getAssetSnapshots = async (
  days: number = 30,
  interval: string = 'day',
  maxRetries: number = 3
): Promise<AssetSnapshot[]> => {
  let retries = 0;
  
  while (retries <= maxRetries) {
    try {
      // console.log(`嘗試獲取資產快照數據 (嘗試 ${retries + 1}/${maxRetries + 1})`);
      
      // 使用apiClient獲取數據
      const response = await apiClient.get<AssetSnapshot[]>('/asset-snapshots', {
        params: { days, interval }
      });
      
      // console.log(`成功獲取資產快照數據，共 ${response.data.length} 條記錄`);
      return response.data;
    } catch (error: unknown) {
      retries++;
      
      // 獲取錯誤詳情
      const axiosError = error as { 
        response?: { status?: number }, 
        code?: string,
        isAxiosError?: boolean
      };
      
      // 記錄錯誤信息
      console.error(`獲取資產快照失敗 (嘗試 ${retries}/${maxRetries + 1}):`, 
        axiosError.response?.status || axiosError.code || '未知錯誤');
      
      // 如果已達到最大重試次數，拋出錯誤
      if (retries > maxRetries) {
        console.error('資產快照數據獲取失敗，已達最大重試次數');
        throw error;
      }
      
      // 服務器錯誤、網絡錯誤或重定向錯誤時重試
      const isServerError = axiosError.response?.status && axiosError.response.status >= 500;
      const isNetworkError = axiosError.code === 'ERR_NETWORK';
      const isRedirectError = axiosError.response?.status === 307;
      
      if (!(isServerError || isNetworkError || isRedirectError)) {
        console.error('非服務器/網絡/重定向錯誤，不再重試');
        throw error;
      }
      
      // 計算退避時間（指數退避）
      const backoffTime = Math.min(1000 * Math.pow(2, retries - 1), 10000);
      console.log(`等待 ${backoffTime}ms 後重試...`);
      await new Promise(resolve => setTimeout(resolve, backoffTime));
    }
  }
  
  // 此處不應該被執行，但為了類型安全返回空數組
  return [];
};

/**
 * 將資產快照數據轉換為趨勢圖表數據
 * @param snapshots 資產快照數據列表
 * @param valueKey 使用哪個欄位作為數據值
 * @param dateFormat 日期格式 (short: MM-DD, medium: YYYY-MM, long: YYYY)
 * @returns 轉換後的圖表數據
 */
export const convertSnapshotsToTrendData = (
  snapshots: AssetSnapshot[],
  valueKey: 'total_balance' | 'spot_balance' | 'futures_balance' | 'funding_balance',
  dateFormat: 'short' | 'medium' | 'long' = 'short'
): TrendDataPoint[] => {
  if (!snapshots || snapshots.length === 0) return [];

  // console.log(`轉換快照數據，共 ${snapshots.length} 條記錄`);

  // 將快照按日期排序
  const sortedSnapshots = [...snapshots].sort(
    (a, b) => {
      // 優先使用 timestamp，其次使用 created_at
      const dateA = new Date(a.timestamp || a.created_at || 0).getTime();
      const dateB = new Date(b.timestamp || b.created_at || 0).getTime();
      return dateA - dateB;
    }
  );

  // console.log('排序後的快照時間戳（前5個）:', sortedSnapshots.slice(0, 5).map(s => ({
  //   timestamp: s.timestamp,
  //   created_at: s.created_at,
  //   used: s.timestamp || s.created_at,
  //   total_balance: s.total_balance
  // })));

  // 轉換日期格式
  const trendData = sortedSnapshots.map(snapshot => {
    // 優先使用 timestamp，其次使用 created_at
    const primaryTimestamp = snapshot.timestamp || snapshot.created_at;
    if (!primaryTimestamp) {
      console.warn("快照缺少時間戳:", snapshot);
      return { date: "Invalid Date", value: NaN }; 
    }
    
    const dateObj = new Date(primaryTimestamp);
    if (isNaN(dateObj.getTime())) {
      console.warn("無效的時間戳:", primaryTimestamp, snapshot);
      return { date: "Invalid Date", value: NaN };
    }
    
    let formattedDate: string;

    switch (dateFormat) {
      case 'short':
        // 格式：MM-DD
        formattedDate = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getDate().toString().padStart(2, '0')}`;
        break;
      case 'medium':
        // 格式：YYYY-MM
        formattedDate = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
      case 'long':
        formattedDate = dateObj.getFullYear().toString();
        break;
      default:
        formattedDate = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}-${dateObj.getDate().toString().padStart(2, '0')}`;
    }

    let value = 0;
    if (valueKey === 'funding_balance') {
      // 優先使用頂層的 funding_balance
      if (typeof snapshot.funding_balance === 'number') {
        value = snapshot.funding_balance;
      } else if (snapshot.funding_products && snapshot.funding_products.flexible_savings) {
        // 如果頂層 funding_balance 不存在，嘗試從 funding_products 計算
        value = snapshot.funding_products.flexible_savings.reduce((acc, product) => acc + (product.usdt_value || 0), 0);
        // 如果還有 fixed_savings 等也需要一併計算
        if (snapshot.funding_products.fixed_savings) {
           value += snapshot.funding_products.fixed_savings.reduce((acc, product) => acc + (product.usdt_value || 0), 0);
        }
      } else if (snapshot.funding_in_spot_balance) {
        // 使用排程快照中的 funding_in_spot_balance
        value = snapshot.funding_in_spot_balance;
      }
    } else if (valueKey in snapshot && typeof snapshot[valueKey] === 'number') {
      value = snapshot[valueKey] as number;
    } else {
      console.warn(`數值欄位 "${valueKey}" 在快照中不存在或不是數字:`, snapshot);
    }
    
    return {
      date: formattedDate,
      value: value,
    };
  }).filter(point => point.date !== "Invalid Date" && !isNaN(point.value)); // 過濾掉無效數據點

  // console.log(`轉換完成，有效數據點: ${trendData.length} 個`);
  // console.log('轉換後的數據（前5個）:', trendData.slice(0, 5));

  return trendData;
};

/**
 * 生成模擬資產快照數據
 * @param days 天數
 * @returns 模擬的資產快照數據
 */
export const generateMockSnapshots = (days: number = 30): AssetSnapshot[] => {
  const mockSnapshots: AssetSnapshot[] = [];
  const today = new Date();
  // 模擬初始資產金額 (10000 到 20000 之間)
  const baseAmount = 10000 + Math.random() * 10000;
  
  // 日漲跌幅控制
  const volatilityRange = 0.03; // 3%以內的日波動
  
  // 生成模擬數據
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - i - 1));
    
    // 計算當天的資產金額
    // 使用正態分佈模擬更真實的市場波動
    const dayVolatility = (Math.random() - 0.5) * 2 * volatilityRange;
    const randomFactor = 1 + dayVolatility;
    
    // 如果是第一天，使用基準金額，否則基於前一天的金額計算
    const prevAmount = i === 0 ? baseAmount : mockSnapshots[i - 1].futures_balance;
    const amount = prevAmount * randomFactor;
    
    // 創建模擬快照
    mockSnapshots.push({
      id: `mock-${i}`,
      user_id: 'mock-user',
      timestamp: date.toISOString(),
      date: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
      hour: 0,
      data_source: 'mock',
      spot_balance: 0,
      futures_balance: amount,
      funding_balance: 0,
      total_balance: amount,
    });
  }
  
  return mockSnapshots;
}; 