import apiClient from './client';

// 幣安賬戶資訊接口
export interface BinanceAccountInfo {
  account_type: string;
  can_trade: boolean;
  can_withdraw: boolean;
  can_deposit: boolean;
  balances: BinanceBalance[];
}

// 幣安餘額接口
export interface BinanceBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

// 幣安期貨賬戶資訊接口
export interface BinanceFuturesAccountInfo {
  account_type: string;
  total_wallet_balance: number;
  total_unrealized_profit: number;
  total_margin_balance: number;
  available_balance: number;
  positions: BinanceFuturesPosition[];
}

// 幣安期貨持倉接口
export interface BinanceFuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string;
  notional: string;
  isolatedWallet: string;
  updateTime: number;
  [key: string]: string | number;
}

// 幣安賬戶USDT價值接口
export interface BinanceAccountValue {
  total_value: number;
  spot_assets_value: number;  // 現貨資產價值
  funding_assets_value: number;  // 理財資產價值
  futures_assets_value?: number;  // 合約資產價值
  balances: BinanceBalanceWithValue[];
  change_percentage?: number;  // 變化百分比
  change_value?: number;       // 變化值
  history?: Array<{
    date: string;
    total_value: number;
  }>;
}

// 帶有USDT價值的幣安餘額接口
export interface BinanceBalanceWithValue extends BinanceBalance {
  value_usdt: number;
}

/**
 * 獲取幣安現貨賬戶資訊
 * @returns 幣安現貨賬戶資訊
 */
export const getBinanceAccount = async (): Promise<BinanceAccountInfo> => {
  try {
    const response = await apiClient.get<BinanceAccountInfo>('/binance/account');
    return response.data;
  } catch (error) {
    console.error('獲取幣安賬戶資訊失敗:', error);
    throw error;
  }
};

/**
 * 獲取幣安期貨賬戶資訊
 * @returns 幣安期貨賬戶資訊
 */
export const getBinanceFuturesAccount = async (): Promise<BinanceFuturesAccountInfo> => {
  try {
    const response = await apiClient.get<BinanceFuturesAccountInfo>('/binance/futures/account');
    return response.data;
  } catch (error) {
    console.error('獲取幣安期貨賬戶資訊失敗:', error);
    throw error;
  }
};

/**
 * 獲取幣安賬戶資產的USDT價值
 * @returns 幣安賬戶資產的USDT價值
 */
export const getBinanceAccountValue = async (): Promise<BinanceAccountValue> => {
  try {
    const response = await apiClient.get<BinanceAccountValue>('/binance/account/value');
    return response.data;
  } catch (error) {
    console.error('獲取幣安賬戶資產價值失敗:', error);
    throw error;
  }
};

/**
 * 幣安賬戶資產摘要介面
 */
export interface BinanceAccountSummary {
  total_value: number;
  spot_value: number;
  funding_value: number;
  futures_value: number;
}

/**
 * 獲取幣安賬戶資產摘要（輕量版，不包含詳細資產分布）
 * @returns 幣安賬戶資產摘要
 */
export const getBinanceAccountSummary = async (): Promise<BinanceAccountSummary> => {
  try {
    // 從資產分佈API獲取更完整的資產數據，因為 account/summary API 目前只能返回期貨資產值
    const distribution = await getBinanceAssetsDistribution();
    
    // 從資產分佈數據中提取所需的值
    const spotValue = distribution.spot_assets_value || 0;
    const fundingValue = distribution.funding_assets_value || 0;
    const futuresValue = distribution.futures_assets_value || 0;
    
    // 計算真實的總資產值
    const totalValue = spotValue + fundingValue + futuresValue;
    
    return {
      spot_value: spotValue,
      funding_value: fundingValue,
      futures_value: futuresValue,
      total_value: totalValue
    };
  } catch (error) {
    console.error('獲取幣安賬戶資產摘要失敗:', error);
    // 如果獲取資產分佈失敗，嘗試獲取基本的賬戶摘要
    try {
      const response = await apiClient.get<BinanceAccountSummary>('/binance/account/summary');
      const data = response.data;
      
      // 重新計算總資產價值
      const spotValue = data.spot_value || 0;
      const fundingValue = data.funding_value || 0;
      const futuresValue = data.futures_value || 0;
      const totalValue = spotValue + fundingValue + futuresValue;
      
      return {
        spot_value: spotValue,
        funding_value: fundingValue,
        futures_value: futuresValue,
        total_value: totalValue
      };
    } catch (fallbackError) {
      console.error('備用獲取賬戶摘要也失敗:', fallbackError);
      throw error; // 拋出原始錯誤
    }
  }
};

/**
 * 獲取優化版的幣安賬戶資產分佈數據
 * @returns 優化版的幣安賬戶資產分佈數據
 */
export const getBinanceAssetsDistribution = async (): Promise<BinanceAccountValue> => {
  try {
    const response = await apiClient.get<BinanceAccountValue>('/binance/assets/distribution');
    return response.data;
  } catch (error) {
    console.error('獲取幣安賬戶資產分佈數據失敗:', error);
    throw error;
  }
};

// 獲取期貨可用保證金
export const getFuturesAvailableMargin = async () => {
  const response = await apiClient.get('/binance/futures/available-margin');
  return response.data;
};

// 檢查保證金需求
export const checkMarginRequirement = async (marginData: {
  long_symbol: string;
  short_symbol: string;
  max_loss: number;
  stop_loss: number;
  long_leverage: number;
  short_leverage: number;
}) => {
  const response = await apiClient.post('/binance/futures/check-margin', marginData);
  return response.data;
}; 
