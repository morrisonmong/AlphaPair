import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';

import {
  PairTrade,
  createPairTrade,
  getPairTrades,
  getPairTrade,
  updatePairTrade,
  closePairTrade,
  CreatePairTradeParams
} from '@/lib/api/pair-trade';

interface PairTradeState {
  trades: PairTrade[];
  selectedTrade: PairTrade | null;
  isLoading: boolean;
  error: string | null;
  
  // 操作
  fetchTrades: () => Promise<void>;
  fetchTradesSilently: () => Promise<void>;
  fetchTrade: (id: string) => Promise<void>;
  createTrade: (data: CreatePairTradeParams) => Promise<PairTrade | null>;
  updateTrade: (id: string) => Promise<void>;
  closeTrade: (id: string) => Promise<void>;
  setUpdatedTradeInList: (trade: PairTrade) => void;
  
  // 輔助函數
  clearError: () => void;
  setSelectedTrade: (trade: PairTrade | null) => void;
}

export const usePairTradeStore = create<PairTradeState>()(
  persist(
    (set) => ({
      trades: [],
      selectedTrade: null,
      isLoading: false,
      error: null,
      
      // 獲取所有配對交易
      fetchTrades: async () => {
        set({ isLoading: true, error: null });
        try {
          // 不指定 status 參數，獲取所有狀態的交易
          const trades = await getPairTrades();
          set({ trades, isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '獲取配對交易列表失敗';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },
      
      // 靜默獲取所有配對交易（不設置載入狀態）
      fetchTradesSilently: async () => {
        try {
          // 只獲取活躍的交易，減少不必要的數據傳輸
          const activeTrades = await getPairTrades('active');
          
          // 只更新數據，不改變其他狀態
          set(state => {
            // 創建一個新的交易列表，保留非活躍交易
            const nonActiveTrades = state.trades.filter(trade => trade.status !== 'active');
            
            // 將新的活躍交易添加到列表頂部
            const updatedTrades = [...activeTrades, ...nonActiveTrades];
            

            
            return { 
              ...state,
              trades: updatedTrades,
              // 不更新 isLoading 狀態
            };
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '獲取配對交易列表失敗';
          set(state => ({ 
            ...state,
            error: errorMessage 
            // 不更新 isLoading 狀態
          }));
          // 不顯示錯誤提示，靜默失敗
          console.error('靜默刷新失敗:', errorMessage);
        }
      },
      
      // 獲取指定的配對交易
      fetchTrade: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const trade = await getPairTrade(id);
          set({ selectedTrade: trade, isLoading: false });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '獲取配對交易失敗';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },
      
      // 創建配對交易
      createTrade: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const newTrade = await createPairTrade(data);
          set((state) => ({
            trades: [newTrade, ...state.trades],
            selectedTrade: newTrade,
            isLoading: false,
          }));
          toast.success('配對交易創建成功');
          return newTrade;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知錯誤';
          set({ error: errorMessage, isLoading: false });
          toast.error(`創建交易失敗: ${errorMessage}`);
          return null;
        }
      },
      
      // 更新配對交易
      updateTrade: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const trade = await updatePairTrade(id);
          set(state => ({
            trades: state.trades.map(t => t.id === id ? trade : t),
            selectedTrade: state.selectedTrade?.id === id ? trade : state.selectedTrade,
            isLoading: false
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '更新配對交易失敗';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },
      
      // 平倉配對交易
      closeTrade: async (id: string) => {
        set({ isLoading: true, error: null });
        try {
          const trade = await closePairTrade(id);
          set(state => ({
            trades: state.trades.map(t => t.id === id ? trade : t),
            selectedTrade: state.selectedTrade?.id === id ? trade : state.selectedTrade,
            isLoading: false
          }));
          toast.success('配對交易已平倉');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '平倉配對交易失敗';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },
      
      // 清除錯誤
      clearError: () => set({ error: null }),
      
      // 設置選中的交易
      setSelectedTrade: (trade: PairTrade | null) => set({ selectedTrade: trade }),

      // 新增：直接使用更新後的交易對象來更新列表中的特定交易
      setUpdatedTradeInList: (updatedTrade: PairTrade) => {
        set(state => ({
          trades: state.trades.map(t => t.id === updatedTrade.id ? updatedTrade : t),
          selectedTrade: state.selectedTrade?.id === updatedTrade.id ? updatedTrade : state.selectedTrade,
        }));
      },
    }),
    {
      name: 'pair-trade-store',
      partialize: (state) => ({ trades: state.trades }),
    }
  )
); 