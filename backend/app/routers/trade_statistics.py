import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import timezone

from app.models.user import User
from app.models.trade_statistics import TradeStatistics
from app.services.trade_history_service import trade_history_service
from app.utils.auth import get_current_user
from app.utils.time_utils import parse_date_string

router = APIRouter(prefix="/trade-statistics", tags=["trade-statistics"])
logger = logging.getLogger(__name__)


@router.get("", response_model=TradeStatistics)
async def get_trade_statistics(
    start_date: Optional[str] = Query(None, description="開始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="結束日期 (YYYY-MM-DD)"),
    include_fees: bool = Query(True, description="是否包含手續費"),
    current_user: User = Depends(get_current_user)
):
    """
    獲取用戶的交易統計數據

    Args:
        start_date: 開始日期 (YYYY-MM-DD)
        end_date: 結束日期 (YYYY-MM-DD)
        include_fees: 是否包含手續費
        current_user: 當前用戶

    Returns:
        TradeStatistics: 交易統計數據
    """
    try:
        # 解析日期
        start_datetime = None
        end_datetime = None

        # 記錄收到的日期字符串
        logger.info(f"收到的日期參數: start_date={start_date}, end_date={end_date}")

        if start_date:
            start_datetime = parse_date_string(start_date)
            logger.info(f"解析後的開始日期: {start_datetime}")

        if end_date:
            end_datetime = parse_date_string(end_date)
            # 將結束日期設置為當天的23:59:59
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59)
            logger.info(f"解析後的結束日期: {end_datetime}")

        # 獲取用戶的交易歷史記錄
        trade_histories = await trade_history_service.get_user_trade_history(current_user.id)

        # 記錄交易歷史記錄數量和第一條記錄的時區信息
        if trade_histories:
            logger.info(f"獲取到 {len(trade_histories)} 條交易歷史記錄")
            logger.debug(
                f"第一條交易記錄的時間: {trade_histories[0].closed_at}, 時區信息: {trade_histories[0].closed_at.tzinfo}")

        # 根據日期範圍過濾
        filtered_histories = []
        for th in trade_histories:
            # 確保交易記錄中的日期有時區信息
            closed_at = th.closed_at
            if closed_at.tzinfo is None:
                # 如果沒有時區信息，假設為 UTC 時間
                closed_at = closed_at.replace(tzinfo=timezone.utc)
                logger.debug(f"交易記錄 {th.id} 的時間沒有時區信息，已添加 UTC 時區")

            # 根據開始日期過濾
            if start_datetime and closed_at < start_datetime:
                continue

            # 根據結束日期過濾
            if end_datetime and closed_at > end_datetime:
                continue

            # 通過過濾，添加到結果集
            filtered_histories.append(th)

        # 使用過濾後的交易歷史進行後續處理
        trade_histories = filtered_histories
        logger.info(f"過濾後剩餘 {len(trade_histories)} 條交易歷史記錄")

        # 計算統計數據
        total_trades = len(trade_histories)

        if total_trades == 0:
            # 如果沒有交易記錄，返回空的統計數據
            return TradeStatistics(
                total_trades=0,
                winning_trades=0,
                losing_trades=0,
                win_rate=0,
                avg_profit=0,
                avg_loss=0,
                profit_factor=0,
                avg_risk_reward_ratio=0,
                avg_net_risk_reward_ratio=0,
                total_profit=0,
                total_loss=0,
                net_profit=0,
                max_drawdown=0,
                volatility=0
            )

        # 計算盈虧
        winning_trades = 0
        losing_trades = 0
        total_profit = 0
        total_loss = 0
        total_pnl = 0
        net_profit = 0
        risk_reward_ratios = []
        net_risk_reward_ratios = []

        for trade in trade_histories:
            # 根據是否包含手續費選擇使用的盈虧值
            pnl = trade.net_pnl if include_fees else trade.total_pnl

            if pnl > 0:
                winning_trades += 1
                total_profit += pnl
            else:
                losing_trades += 1
                total_loss += abs(pnl)

            total_pnl += pnl

            # 收集風險收益比數據
            if include_fees:
                if trade.net_risk_reward_ratio != 0:
                    net_risk_reward_ratios.append(trade.net_risk_reward_ratio)
            else:
                if trade.risk_reward_ratio != 0:
                    risk_reward_ratios.append(trade.risk_reward_ratio)

        # 計算淨盈虧
        net_profit = total_pnl

        # 計算勝率
        win_rate = (winning_trades / total_trades) * \
            100 if total_trades > 0 else 0

        # 計算平均盈利和平均虧損
        avg_profit = total_profit / winning_trades if winning_trades > 0 else 0
        avg_loss = total_loss / losing_trades if losing_trades > 0 else 0

        # 計算獲利因子
        profit_factor = total_profit / total_loss if total_loss > 0 else 999999 if total_profit > 0 else 0

        # 計算平均風險收益比
        avg_risk_reward_ratio = sum(
            risk_reward_ratios) / len(risk_reward_ratios) if risk_reward_ratios else 0
        avg_net_risk_reward_ratio = sum(
            net_risk_reward_ratios) / len(net_risk_reward_ratios) if net_risk_reward_ratios else 0

        # 計算最大回撤和波動率
        # 這裡使用簡化的計算方法，實際應用中可能需要更複雜的算法
        max_drawdown = 0
        volatility = 0

        # 按時間排序交易記錄
        sorted_trades = sorted(trade_histories, key=lambda x: x.closed_at)

        # 計算最大回撤
        peak = 0
        for trade in sorted_trades:
            pnl = trade.net_pnl if include_fees else trade.total_pnl
            peak = max(peak, peak + pnl)
            drawdown = peak - (peak + pnl)
            max_drawdown = max(max_drawdown, drawdown)

        # 計算波動率（使用標準差）
        if total_trades > 1:
            pnl_values = [
                trade.net_pnl if include_fees else trade.total_pnl for trade in trade_histories]
            mean = sum(pnl_values) / len(pnl_values)
            variance = sum((x - mean) ** 2 for x in pnl_values) / \
                (len(pnl_values) - 1)
            volatility = variance ** 0.5

        # 創建並返回統計數據
        statistics = TradeStatistics(
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
            win_rate=win_rate,
            avg_profit=avg_profit,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            avg_risk_reward_ratio=avg_risk_reward_ratio,
            avg_net_risk_reward_ratio=avg_net_risk_reward_ratio,
            total_profit=total_profit,
            total_loss=total_loss,
            net_profit=net_profit,
            max_drawdown=max_drawdown,
            volatility=volatility
        )

        return statistics

    except Exception as e:
        logger.error(f"獲取交易統計數據時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取交易統計數據時發生錯誤: {str(e)}")
