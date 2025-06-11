import apiClient from './client';

// 配對交易創建請求接口
export interface PairTradeCreateRequest {
  name: string;
  max_loss: number;
  stop_loss: number;
  take_profit: number;
  long_symbol: string;
  short_symbol: string;
  leverage?: number;
  long_leverage?: number;
  short_leverage?: number;
  margin_type?: string;
}

// 交易持倉接口
export interface TradePosition {
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  exit_price: number;
  pnl: number;
  pnl_percent: number;
  entry_order_id: string;
  notional_value: number;
  entry_fee: number;
  exit_fee: number;
  exit_order_id: string;
  leverage: number;
}

// 配對交易接口
export interface PairTrade {
  id: string;
  name: string;
  status: string;
  max_loss: number;
  stop_loss: number;
  take_profit: number;
  trailing_stop_enabled: boolean;
  trailing_stop_level: number;
  long_position: TradePosition | null;
  short_position: TradePosition | null;
  total_pnl_value: number;
  total_ratio_percent: number;
  total_fee: number;  // 總手續費
  total_entry_fee: number;  // 開倉總手續費
  total_exit_fee: number;   // 平倉總手續費
  max_ratio: number;  // 最高比率（多空價格比）
  min_ratio: number;  // 最低比率（多空價格比）
  mae: number;  // 最大不利變動 (MAE)
  mfe: number;  // 最大有利變動 (MFE)
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  close_reason: string | null;
}

export interface CreatePairTradeParams {
  name?: string;
  max_loss: number;
  stop_loss: number;
  take_profit: number;
  long_symbol: string;
  short_symbol: string;
  leverage?: number;
  long_leverage?: number;
  short_leverage?: number;
  margin_type?: string;
  test_mode?: boolean;
}

/**
 * 創建配對交易
 * @param params 配對交易參數
 * @returns 創建的配對交易
 */
export const createPairTrade = async (params: CreatePairTradeParams): Promise<PairTrade> => {
  try {
    const response = await apiClient.post<PairTrade>('/pair-trades', params);
    return response.data;
  } catch (error) {
    console.error('創建配對交易失敗:', error);
    throw error;
  }
};

/**
 * 獲取所有配對交易
 * @param status 可選的交易狀態過濾條件
 * @returns 配對交易列表
 */
export const getPairTrades = async (status?: string): Promise<PairTrade[]> => {
  try {
    const url = status ? `/pair-trades?status=${status}` : '/pair-trades';
    const response = await apiClient.get<PairTrade[]>(url);
    return response.data;
  } catch (error) {
    console.error('獲取配對交易列表失敗:', error);
    throw error;
  }
};

/**
 * 獲取指定的配對交易
 * @param id 配對交易ID
 * @returns 配對交易
 */
export const getPairTrade = async (id: string): Promise<PairTrade> => {
  try {
    const response = await apiClient.get<PairTrade>(`/pair-trades/${id}`);
    return response.data;
  } catch (error) {
    console.error('獲取配對交易失敗:', error);
    throw error;
  }
};

/**
 * 更新配對交易
 * @param id 配對交易ID
 * @returns 更新後的配對交易
 */
export const updatePairTrade = async (id: string): Promise<PairTrade> => {
  try {
    const response = await apiClient.put<PairTrade>(`/pair-trades/${id}`);
    return response.data;
  } catch (error) {
    console.error('更新配對交易失敗:', error);
    throw error;
  }
};

/**
 * 平倉配對交易
 * @param id 配對交易ID
 * @returns 平倉後的配對交易
 */
export const closePairTrade = async (id: string): Promise<PairTrade> => {
  try {
    const response = await apiClient.delete<PairTrade>(`/pair-trades/${id}`);
    return response.data;
  } catch (error) {
    console.error('平倉配對交易失敗:', error);
    throw error;
  }
};

// 定義更新交易設定的請求參數接口
export interface UpdatePairTradeSettingsParams {
  take_profit?: number;
  stop_loss?: number;
  trailing_stop_enabled?: boolean;
  trailing_stop_level?: number;
}

/**
 * 更新配對交易的止盈/止損設定
 * @param tradeId 配對交易ID
 * @param settings 包含新的止盈/止損值的物件
 * @returns 更新後的配對交易
 */
export const updatePairTradeSettings = async (
  tradeId: string, 
  settings: UpdatePairTradeSettingsParams
): Promise<PairTrade> => {
  try {
    const response = await apiClient.put<PairTrade>(
      `/pair-trades/${tradeId}/settings`,
      settings
    );
    return response.data;
  } catch (error) {
    console.error(`更新交易 ${tradeId} 設定失敗:`, error);
    throw error;
  }
};