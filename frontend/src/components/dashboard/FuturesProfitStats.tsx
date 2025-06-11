'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { TradeHistoryBackwardCompatible, TradeStatistics } from '@/lib/api/trade-history';
import { formatDateToYYYYMMDD, getStartDateByTimeRange } from '@/lib/utils/date';

interface FuturesProfitStatsProps {
  tradeHistories: TradeHistoryBackwardCompatible[];
  timeRange: string;
  customDateRange: {
    start?: Date;
    end?: Date;
  };
  isLoading: boolean;
}

// 計算交易統計數據
const calculateTradeStats = (histories: TradeHistoryBackwardCompatible[], includeFees: boolean): TradeStatistics => {
  const stats = histories.reduce(
    (acc, history) => {
      if (history.closed_at) {
        acc.total_trades += 1;
        
        // 計算總手續費
        const totalFee = history.total_fee || 0;
        acc.total_fees += totalFee;
        
        // 根據是否考慮手續費選擇使用總盈虧或淨盈虧
        const pnl = includeFees 
          ? (history.net_pnl || history.total_pnl - totalFee) 
          : (history.total_pnl || 0);
        
        // 計算 R 值
        const rValue = history.max_loss && history.max_loss !== 0 
          ? pnl / Math.abs(history.max_loss)
          : 0;
        
        // 計算手續費的 R 值
        const feeR = history.max_loss && history.max_loss !== 0
          ? totalFee / Math.abs(history.max_loss)
          : 0;
        
        acc.total_fee_r += feeR;
        
        if (pnl > 0) {
          acc.winning_trades += 1;
          acc.total_profit += pnl;
          acc.total_win_r += rValue;
        } else if (pnl < 0) {
          acc.losing_trades += 1;
          acc.total_loss += pnl;
          acc.total_loss_r += rValue;
        }
      }
      return acc;
    },
    { 
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      total_profit: 0,
      total_loss: 0,
      total_win_r: 0,
      total_loss_r: 0,
      total_fees: 0,
      total_fee_r: 0
    }
  );

  // 計算其他統計數據
  const win_rate = stats.total_trades > 0 ? (stats.winning_trades / stats.total_trades) * 100 : 0;
  const avg_profit = stats.winning_trades > 0 ? stats.total_profit / stats.winning_trades : 0;
  const avg_loss = stats.losing_trades > 0 ? Math.abs(stats.total_loss / stats.losing_trades) : 0;
  const profit_factor = Math.abs(stats.total_loss) > 0 ? stats.total_profit / Math.abs(stats.total_loss) : (stats.total_profit > 0 ? Infinity : 0);
  
  // 計算 R 值的平均值
  const avg_win_r = stats.winning_trades > 0 ? stats.total_win_r / stats.winning_trades : 0;
  const avg_loss_r = stats.losing_trades > 0 ? Math.abs(stats.total_loss_r / stats.losing_trades) : 0;
  const total_r = stats.total_win_r + stats.total_loss_r;
  
  // 計算最大回撤和波動率
  const max_drawdown = Math.abs(stats.total_loss);
  const volatility = Math.sqrt(
    histories.reduce((sum, history) => {
      const pnl = includeFees 
        ? (history.net_pnl || history.total_pnl - (history.total_fee || 0)) 
        : (history.total_pnl || 0);
      return sum + Math.pow(pnl, 2);
    }, 0) / (stats.total_trades || 1)
  );

  return {
    total_trades: stats.total_trades,
    winning_trades: stats.winning_trades,
    losing_trades: stats.losing_trades,
    win_rate,
    avg_profit,
    avg_loss,
    profit_factor,
    avg_risk_reward_ratio: avg_win_r,
    avg_net_risk_reward_ratio: avg_loss_r,
    total_profit: stats.total_profit,
    total_loss: stats.total_loss,
    net_profit: stats.total_profit + stats.total_loss,
    max_drawdown,
    volatility,
    total_fees: stats.total_fees,
    total_r,
    total_fee_r: stats.total_fee_r
  };
};

export function FuturesProfitStats({ 
  tradeHistories,
  timeRange,
  customDateRange,
  isLoading
}: FuturesProfitStatsProps) {
  const [includeFees, setIncludeFees] = useState(true);
  const [showOnlyR, setShowOnlyR] = useState(false);
  const [stats, setStats] = useState<TradeStatistics | null>(null);

  useEffect(() => {
    if (!isLoading && tradeHistories.length > 0) {
      const startDateValue = 
        timeRange === 'custom' && customDateRange.start 
          ? customDateRange.start 
          : getStartDateByTimeRange(new Date(), timeRange);

      const formattedStartDate: string | undefined = startDateValue 
        ? formatDateToYYYYMMDD(startDateValue) 
        : undefined;

      const formattedEndDate = formatDateToYYYYMMDD(customDateRange.end || new Date());
      
              // 數據過濾邏輯已在 API 層面實現
      // console.log('FuturesProfitStats: 需要處理日期過濾', formattedStartDate, formattedEndDate);
      
      const filteredHistories = tradeHistories.filter(history => {
        const targetDate = history.closed_at || history.close_time;
        if (!targetDate) return false;

        const date = new Date(targetDate);
        // 如果 formattedStartDate 未定義，則認為開始日期條件滿足
        const isAfterStartDate = formattedStartDate ? date >= new Date(formattedStartDate) : true;
        const isBeforeEndDate = date <= new Date(formattedEndDate);

        return isAfterStartDate && isBeforeEndDate;
      });
      
      const newStats = calculateTradeStats(filteredHistories, includeFees);
      setStats(newStats);
    }
  }, [tradeHistories, timeRange, customDateRange, includeFees, isLoading]);

  if (isLoading || !stats) {
    return (
      <Card className="bg-gray-800 border-0 shadow-lg">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>合約收益統計</CardTitle>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Switch
                id="include-fees"
                checked={includeFees}
                onCheckedChange={setIncludeFees}
              />
              <Label htmlFor="include-fees" className="text-sm">
                包含手續費
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="show-only-r"
                checked={showOnlyR}
                onCheckedChange={setShowOnlyR}
              />
              <Label htmlFor="show-only-r" className="text-sm">
                只顯示R
              </Label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center h-40">
            <p className="text-gray-400">載入中...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-800 border-0 shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>合約收益統計</CardTitle>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="include-fees"
              checked={includeFees}
              onCheckedChange={setIncludeFees}
            />
            <Label htmlFor="include-fees" className="text-sm">
              包含手續費
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-only-r"
              checked={showOnlyR}
              onCheckedChange={setShowOnlyR}
            />
            <Label htmlFor="show-only-r" className="text-sm">
              只顯示R
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4">
          {/* 勝率 */}
          <div>
            <p className="text-sm text-gray-400">勝率</p>
            <p className="text-xl font-bold text-green-500">
              {stats.win_rate.toFixed(2)}%
            </p>
            <p className="text-sm text-gray-400">
              {stats.winning_trades}/{stats.total_trades}
            </p>
          </div>

          {/* 總盈虧 */}
          <div>
            <p className="text-sm text-gray-400">總盈虧</p>
            <p className={`text-xl font-bold ${stats.net_profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {showOnlyR ? (
                `${stats.total_r.toFixed(2)} R`
              ) : (
                `${stats.net_profit.toFixed(2)} U`
              )}
            </p>
            {!showOnlyR && (
              <p className="text-sm text-gray-400">
                {stats.total_r.toFixed(2)} R
              </p>
            )}
          </div>

          {/* 平均盈虧比 */}
          <div>
            <p className="text-sm text-gray-400">平均盈虧比</p>
            <p className={`text-xl font-bold ${stats.avg_profit / Math.abs(stats.avg_loss) >= 1 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.avg_loss === 0 ? '∞' : (stats.avg_profit / Math.abs(stats.avg_loss)).toFixed(2)}
            </p>
          </div>

          {/* 獲利因子 */}
          <div>
            <p className="text-sm text-gray-400">獲利因子</p>
            <p className={`text-xl font-bold ${stats.profit_factor >= 1 ? 'text-green-500' : 'text-red-500'}`}>
              {stats.profit_factor === Infinity ? '∞' : stats.profit_factor.toFixed(2)}
            </p>
          </div>         

          {/* 總手續費 */}
          {/* <div>
            <p className="text-sm text-gray-400">總手續費</p>
            <p className="text-xl font-bold text-yellow-500">
              {showOnlyR ? (
                `${stats.total_fee_r.toFixed(2)} R`
              ) : (
                `${stats.total_fees.toFixed(2)} U`
              )}
            </p>
            {!showOnlyR && (
              <p className="text-sm text-gray-400">
                {stats.total_fee_r.toFixed(2)} R
              </p>
            )}
          </div> */}
        </div>
      </CardContent>
    </Card>
  );
} 