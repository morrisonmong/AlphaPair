import { getToken } from '../utils/auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface PairTradeCreateParams {
  name?: string;
  longSymbol: string;
  shortSymbol: string;
  maxLoss: number;
  stopLoss: number;
  takeProfit: number;
  longLeverage?: number;
  shortLeverage?: number;
  marginType?: string;
}

export interface PairTrade {
  id: string;
  name: string;
  status: string;
  maxLoss: number;
  stopLoss: number;
  takeProfit: number;
  longPosition: TradePosition;
  shortPosition: TradePosition;
  totalPnl: number;
  totalPnlPercent: number;
  leverage: number;
  longLeverage: number;
  shortLeverage: number;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  closeReason?: string;
}

export interface TradePosition {
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  orderId: string;
  notionalValue: number;
  leverage: number;
}

export const createPairTrade = async (params: PairTradeCreateParams): Promise<PairTrade> => {
  const response = await fetch(`${API_BASE_URL}/pair-trades`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({
      name: params.name,
      longSymbol: params.longSymbol,
      shortSymbol: params.shortSymbol,
      maxLoss: params.maxLoss,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      longLeverage: params.longLeverage || 1,
      shortLeverage: params.shortLeverage || 1,
      marginType: params.marginType || 'ISOLATED'
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create pair trade');
  }

  return response.json();
};

export const getPairTrades = async (): Promise<PairTrade[]> => {
  const response = await fetch(`${API_BASE_URL}/pair-trades`, {
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to fetch pair trades');
  }

  return response.json();
};

export const closePairTrade = async (id: string, reason: string): Promise<PairTrade> => {
  const response = await fetch(`${API_BASE_URL}/pair-trades/${id}/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`
    },
    body: JSON.stringify({ reason })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to close pair trade');
  }

  return response.json();
}; 