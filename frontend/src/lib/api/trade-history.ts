import apiClient from './client';

// 交易歷史接口
export interface TradeHistory {
  id: string;
  user_id: string;
  trade_id?: string;
  trade_name?: string;
  trade_type?: string;
  
  // 交易對符號和價格
  long_symbol: string;
  short_symbol: string;
  long_entry_price: number;
  short_entry_price: number;
  long_exit_price: number;
  short_exit_price: number;
  long_quantity: number;
  short_quantity: number;
  
  // 盈虧信息
  long_pnl: number;
  short_pnl: number;
  total_pnl: number;  // 對應後端的 total_pnl_value
  long_pnl_percent: number;
  short_pnl_percent: number;
  total_pnl_percent: number;  // 對應後端的 total_ratio_percent
  
  // 手續費信息
  long_fee: number;
  short_fee: number;
  total_fee: number;
  long_entry_fee: number;
  short_entry_fee: number;
  long_exit_fee: number;
  short_exit_fee: number;
  entry_fee: number;
  exit_fee: number;
  net_pnl: number;  // 淨盈虧（扣除手續費）
  
  // 風險收益比
  risk_reward_ratio: number;
  net_risk_reward_ratio: number;
  
  // 時間信息
  created_at: string;
  closed_at: string;
  duration_seconds: number;
  
  // 其他信息
  close_reason: string;
  leverage: number;
  max_loss: number;
  stop_loss: number;
  take_profit: number;
  mae?: number;
  mfe?: number;
}

// 為了向後兼容，保留舊的別名
export interface TradeHistoryBackwardCompatible extends TradeHistory {
  // 別名，用於兼容舊代碼
  entry_time?: string;  // 等同於 created_at
  close_time?: string;  // 等同於 closed_at
  name?: string;        // 等同於 trade_name
  total_pnl_value?: number;  // 等同於 total_pnl
  total_ratio_percent?: number;  // 等同於 total_pnl_percent
  max_ratio?: number;  // 多空價格比最高值
  min_ratio?: number;  // 多空價格比最低值
  updated_at?: string;  // 記錄更新時間
  
  // 添加嵌套結構支持
  long_position?: {
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
  };
  short_position?: {
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
  };
}

// 獲取交易歷史列表的參數
export interface GetTradeHistoriesParams {
  page?: number;
  limit?: number;
  start_date?: string;
  end_date?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// 獲取交易歷史列表
export const getTradeHistories = async (params?: GetTradeHistoriesParams): Promise<TradeHistoryBackwardCompatible[]> => {
  try {
    const response = await apiClient.get('/trade-history', { params });
    return response.data;
  } catch (error) {
    console.error('獲取交易歷史失敗:', error);
    // 返回一個空數組
    return [];
  }
};

// 獲取交易歷史詳情
export const getTradeHistory = async (id: string): Promise<TradeHistoryBackwardCompatible | null> => {
  try {
    const response = await apiClient.get(`/trade-history/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch trade history with id ${id}:`, error);
    return null;
  }
};

// 獲取交易統計數據
export interface TradeStatistics {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_profit: number;
  avg_loss: number;
  profit_factor: number;
  avg_risk_reward_ratio: number;  // 平均風險收益比（總盈虧/最大虧損）
  avg_net_risk_reward_ratio: number;  // 平均淨風險收益比（淨盈虧/最大虧損）
  total_profit: number;
  total_loss: number;
  net_profit: number;
  max_drawdown: number;
  volatility: number;
  total_fees: number;  // 總手續費
  total_r: number;
  total_fee_r: number;
}

// 獲取交易統計數據
export const getTradeStatistics = async (start_date?: string, end_date?: string, include_fees: boolean = true): Promise<TradeStatistics | null> => {
  try {
    // 轉換日期格式，僅使用日期部分 YYYY-MM-DD
    let formattedStartDate = start_date;
    let formattedEndDate = end_date;
    
    if (start_date) {
      const startDateObj = new Date(start_date);
      formattedStartDate = `${startDateObj.getFullYear()}-${String(startDateObj.getMonth() + 1).padStart(2, '0')}-${String(startDateObj.getDate()).padStart(2, '0')}`;
    }
    
    if (end_date) {
      const endDateObj = new Date(end_date);
      formattedEndDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
    }
    
    const response = await apiClient.get('/trade-statistics', {
      params: { 
        start_date: formattedStartDate, 
        end_date: formattedEndDate,
        include_fees: include_fees
      }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch trade statistics:', error);
    return null;
  }
};

// 刪除交易歷史
export const deleteTradeHistory = async (id: string): Promise<boolean> => {
  try {
    await apiClient.delete(`/trade-history/${id}`);
    return true;
  } catch (error) {
    console.error(`Failed to delete trade history with id ${id}:`, error);
    return false;
  }
};

// 批量刪除交易歷史
export const batchDeleteTradeHistory = async (ids: string[]): Promise<{
  success: boolean;
  total_requested: number;
  successful_deletes: number;
  failed_deletes: number;
  details: Array<{
    id: string;
    status: string;
    message: string;
  }>;
}> => {
  try {
    const response = await apiClient.delete('/trade-history/batch/delete', {
      data: ids
    });
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    console.error('Failed to batch delete trade history:', error);
    throw error;
  }
};

// 撤銷導入會話
export const rollbackImportSession = async (importSessionId: string): Promise<{
  success: boolean;
  deleted_count: number;
  message: string;
}> => {
  try {
    const response = await apiClient.delete(`/trade-history/import/rollback?import_session_id=${importSessionId}`);
    return {
      success: true,
      ...response.data
    };
  } catch (error) {
    console.error('Failed to rollback import session:', error);
    throw error;
  }
};

// === 新增：交易歷史導入相關API ===

// 導入結果接口（匹配後端返回格式）
export interface ImportResult {
  success: boolean;
  message: string;
  results: Array<{
    row: number;
    trade_name?: string;
    status: '成功' | '失敗';
    message?: string;
  }>;
}

// 為了向後兼容，提供一個轉換後的接口
export interface ProcessedImportResult {
  success: boolean;
  message: string;
  total_processed: number;
  successful_imports: number;
  failed_imports: number;
  import_session_id?: string;  // 導入會話ID，用於撤銷功能
  errors?: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
  successful_trades?: Array<{
    row: number;
    trade_name: string;
    trade_id: string;
  }>;
}

// 上傳CSV/Excel文件進行交易歷史導入
export const importTradeHistory = async (file: File): Promise<ProcessedImportResult> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post('/trade-history/import-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    // 直接使用後端的新格式
    const result = response.data;
    
    return {
      success: result.success,
      message: result.message,
      total_processed: result.total_processed,
      successful_imports: result.successful_imports,
      failed_imports: result.failed_imports,
      import_session_id: result.import_session_id,
      successful_trades: result.successful_trades || [],
      errors: result.errors || []
    };
  } catch (error: unknown) {
    console.error('導入交易歷史失敗:', error);
    
    // 處理後端返回的錯誤信息
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { detail?: string; message?: string } } };
      if (axiosError.response?.data) {
        throw new Error(axiosError.response.data.detail || axiosError.response.data.message || '導入失敗');
      }
    }
    
    throw new Error('導入文件時發生錯誤，請稍後再試');
  }
};

// 下載交易歷史導入模板
export const downloadImportTemplate = (): void => {
  // 使用公共端點，不需要認證
  window.open('/api/public/trade-history-template', '_blank');
};

// 驗證文件格式
export const validateImportFile = (file: File): { isValid: boolean; error?: string } => {
  // 檢查文件大小 (10MB 限制)
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    return {
      isValid: false,
      error: '文件大小不能超過 10MB'
    };
  }
  
  // 檢查文件類型
  const validTypes = ['.csv', '.xlsx', '.xls'];
  const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  
  if (!validTypes.includes(fileExtension)) {
    return {
      isValid: false,
      error: '僅支援 CSV 或 Excel 格式的文件'
    };
  }
  
  return { isValid: true };
};

// 匯出交易歷史參數
export interface ExportTradeHistoryParams {
  start_date?: string;
  end_date?: string;
  format?: 'csv' | 'excel';
}

// 匯出交易歷史記錄
export const exportTradeHistory = async (params?: ExportTradeHistoryParams): Promise<void> => {
  try {
    const response = await apiClient.get('/trade-history/export', {
      params: {
        start_date: params?.start_date,
        end_date: params?.end_date,
        format: params?.format || 'csv'
      },
      responseType: 'blob' // 重要：設置響應類型為 blob
    });
    
    // 從響應頭獲取檔案名稱
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'trade-history-export.csv';
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    // 創建下載連結
    const blob = new Blob([response.data], {
      type: response.headers['content-type']
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // 觸發下載
    document.body.appendChild(link);
    link.click();
    
    // 清理
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('匯出交易歷史失敗:', error);


    throw error;
  }
}; 