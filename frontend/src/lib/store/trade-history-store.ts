import { create } from 'zustand';
import { toast } from 'sonner';

import {
  TradeHistoryBackwardCompatible,
  getTradeHistories,
  getTradeHistory,
  GetTradeHistoriesParams
} from '@/lib/api/trade-history';

interface TradeHistoryState {
  histories: TradeHistoryBackwardCompatible[];
  selectedHistory: TradeHistoryBackwardCompatible | null;
  isLoading: boolean;
  error: string | null;
  
  // 操作
  fetchHistories: (startDate?: string, endDate?: string) => Promise<void>;
  fetchHistory: (id: string) => Promise<void>;
  
  // 輔助函數
  clearError: () => void;
  setSelectedHistory: (history: TradeHistoryBackwardCompatible | null) => void;
}

export const useTradeHistoryStore = create<TradeHistoryState>((set) => ({
  histories: [],
  selectedHistory: null,
  isLoading: false,
  error: null,
  
  // 獲取所有交易歷史
  fetchHistories: async (startDate?: string, endDate?: string) => {
    set({ isLoading: true, error: null });
    try {
      // 構建 API 參數
      const params: GetTradeHistoriesParams = {};
      if (startDate) {
        params.start_date = startDate;
      }
      if (endDate) {
        params.end_date = endDate;
      }
      // 可以在這裡添加其他參數，例如排序
      // params.sort_by = 'closed_at';
      // params.sort_order = 'desc';

      const histories = await getTradeHistories(params);
      
      // 確保所有歷史記錄都有必要的屬性，防止渲染錯誤
      const safeHistories = histories.map(history => {
        // 確保必要的屬性都有值
        const validHistory = {
          ...history,
          total_pnl: history.total_pnl || 0,
          total_fee: history.total_fee || 0,
          net_pnl: history.net_pnl || (history.total_pnl ? history.total_pnl - (history.total_fee || 0) : 0),
          mae: history.mae || 0,
          mfe: history.mfe || 0,
          max_ratio: history.max_ratio || 0,
          min_ratio: history.min_ratio || 0,
          total_ratio_percent: history.total_ratio_percent || 0,
          updated_at: history.updated_at || history.created_at || '',
          // 添加嵌套結構支持
          long_position: history.long_position || {
            symbol: history.long_symbol || "",
            side: "BUY",
            quantity: history.long_quantity || 0,
            entry_price: history.long_entry_price || 0,
            current_price: history.long_entry_price || 0,
            exit_price: history.long_exit_price || 0,
            pnl: history.long_pnl || 0,
            pnl_percent: history.long_pnl_percent || 0,
            entry_order_id: "",
            notional_value: (history.long_quantity || 0) * (history.long_entry_price || 0),
            entry_fee: history.long_entry_fee || 0,
            exit_fee: history.long_exit_fee || 0,
            exit_order_id: "",
            leverage: history.leverage || 1
          },
          short_position: history.short_position || {
            symbol: history.short_symbol || "",
            side: "SELL",
            quantity: history.short_quantity || 0,
            entry_price: history.short_entry_price || 0,
            current_price: history.short_entry_price || 0,
            exit_price: history.short_exit_price || 0,
            pnl: history.short_pnl || 0,
            pnl_percent: history.short_pnl_percent || 0,
            entry_order_id: "",
            notional_value: (history.short_quantity || 0) * (history.short_entry_price || 0),
            entry_fee: history.short_entry_fee || 0,
            exit_fee: history.short_exit_fee || 0,
            exit_order_id: "",
            leverage: history.leverage || 1
          }
        };
        
        return validHistory;
      });
      
      set({ histories: safeHistories, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '獲取交易歷史列表失敗';
      set({ error: errorMessage, isLoading: false });
      toast.error(errorMessage);
    }
  },
  
  // 獲取指定的交易歷史
  fetchHistory: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const history = await getTradeHistory(id);
      
      if (!history) {
        throw new Error('找不到交易紀錄');
      }
      
      // 確保必要的屬性都有值
      const safeHistory = {
        ...history,
        total_pnl: history.total_pnl || 0,
        total_fee: history.total_fee || 0,
        net_pnl: history.net_pnl || (history.total_pnl ? history.total_pnl - (history.total_fee || 0) : 0),
        mae: history.mae || 0,
        mfe: history.mfe || 0,
        max_ratio: history.max_ratio || 0,
        min_ratio: history.min_ratio || 0,
        total_ratio_percent: history.total_ratio_percent || 0,
        updated_at: history.updated_at || history.created_at || '',
        // 添加嵌套結構支持
        long_position: history.long_position || {
          symbol: history.long_symbol || "",
          side: "BUY",
          quantity: history.long_quantity || 0,
          entry_price: history.long_entry_price || 0,
          current_price: history.long_entry_price || 0,
          exit_price: history.long_exit_price || 0,
          pnl: history.long_pnl || 0,
          pnl_percent: history.long_pnl_percent || 0,
          entry_order_id: "",
          notional_value: (history.long_quantity || 0) * (history.long_entry_price || 0),
          entry_fee: history.long_entry_fee || 0,
          exit_fee: history.long_exit_fee || 0,
          exit_order_id: "",
          leverage: history.leverage || 1
        },
        short_position: history.short_position || {
          symbol: history.short_symbol || "",
          side: "SELL",
          quantity: history.short_quantity || 0,
          entry_price: history.short_entry_price || 0,
          current_price: history.short_entry_price || 0,
          exit_price: history.short_exit_price || 0,
          pnl: history.short_pnl || 0,
          pnl_percent: history.short_pnl_percent || 0,
          entry_order_id: "",
          notional_value: (history.short_quantity || 0) * (history.short_entry_price || 0),
          entry_fee: history.short_entry_fee || 0,
          exit_fee: history.short_exit_fee || 0,
          exit_order_id: "",
          leverage: history.leverage || 1
        }
      };
      
      set({ selectedHistory: safeHistory, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '獲取交易歷史失敗';
      set({ error: errorMessage, isLoading: false });
      toast.error(errorMessage);
    }
  },
  
  // 清除錯誤
  clearError: () => set({ error: null }),
  
  // 設置選中的交易歷史
  setSelectedHistory: (history: TradeHistoryBackwardCompatible | null) => set({ selectedHistory: history })
})); 