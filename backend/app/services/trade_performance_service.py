import logging
import traceback
import math
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from bson import ObjectId

from app.models.trade_performance import TradePerformance
from app.models.pair_trade import PairTrade
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import get_utc_now, get_utc_plus_8_now, get_start_of_day, ensure_timezone

logger = logging.getLogger(__name__)


class TradePerformanceService:
    """交易表現服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "trade_performance"

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def update_daily_performance(self, user_id: str, trade: PairTrade) -> Optional[TradePerformance]:
        """
        更新用戶的每日交易表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易

        Returns:
            Optional[TradePerformance]: 更新後的交易表現
        """
        return await self._update_performance(user_id, trade, "daily")

    async def update_weekly_performance(self, user_id: str, trade: PairTrade) -> Optional[TradePerformance]:
        """
        更新用戶的每週交易表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易

        Returns:
            Optional[TradePerformance]: 更新後的交易表現
        """
        return await self._update_performance(user_id, trade, "weekly")

    async def update_monthly_performance(self, user_id: str, trade: PairTrade) -> Optional[TradePerformance]:
        """
        更新用戶的每月交易表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易

        Returns:
            Optional[TradePerformance]: 更新後的交易表現
        """
        return await self._update_performance(user_id, trade, "monthly")

    async def _update_performance(self, user_id: str, trade: PairTrade, period: str) -> Optional[TradePerformance]:
        """
        更新用戶的交易表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易
            period: 時間段 (daily, weekly, monthly)

        Returns:
            Optional[TradePerformance]: 更新後的交易表現
        """
        await self._ensure_initialized()

        try:
            # 獲取交易日期（UTC+8）
            trade_date = trade.closed_at.astimezone(
                get_utc_plus_8_now().tzinfo)

            # 根據時間段計算開始和結束日期
            start_date, end_date = self._get_period_dates(trade_date, period)

            # 查詢該時間段的交易表現記錄
            performance = await self.collection.find_one({
                "user_id": user_id,
                "period": period,
                "start_date": start_date,
                "end_date": end_date
            })

            # 計算交易盈虧
            trade_pnl = trade.net_pnl  # 使用淨盈虧（扣除手續費）

            # 計算交易持續時間
            trade_duration = 0
            if trade.created_at and trade.closed_at:
                # 確保兩個時間都有時區信息
                created_at_with_tz = ensure_timezone(trade.created_at)
                closed_at_with_tz = ensure_timezone(trade.closed_at)
                
                trade_duration = int((closed_at_with_tz - created_at_with_tz).total_seconds())

            if performance:
                # 更新交易表現
                total_trades = performance["total_trades"] + 1
                winning_trades = performance["winning_trades"] + \
                    (1 if trade_pnl > 0 else 0)
                losing_trades = performance["losing_trades"] + \
                    (1 if trade_pnl < 0 else 0)

                # 更新盈虧統計
                total_profit = performance["total_profit"] + \
                    (trade_pnl if trade_pnl > 0 else 0)
                total_loss = performance["total_loss"] + \
                    (abs(trade_pnl) if trade_pnl < 0 else 0)
                net_profit = performance["net_profit"] + trade_pnl

                # 更新交易指標
                largest_profit = max(
                    performance["largest_profit"], trade_pnl if trade_pnl > 0 else 0)
                largest_loss = max(performance["largest_loss"], abs(
                    trade_pnl) if trade_pnl < 0 else 0)

                # 計算平均值
                avg_profit = total_profit / winning_trades if winning_trades > 0 else 0
                avg_loss = total_loss / losing_trades if losing_trades > 0 else 0
                avg_trade = net_profit / total_trades if total_trades > 0 else 0

                # 計算獲利因子
                profit_factor = total_profit / \
                    total_loss if total_loss > 0 else float(
                        'inf') if total_profit > 0 else 0

                # 計算勝率
                win_rate = (winning_trades / total_trades) * \
                    100 if total_trades > 0 else 0

                # 更新平均持倉時間
                total_duration = performance["avg_duration"] * \
                    (total_trades - 1) + trade_duration
                avg_duration = int(total_duration / total_trades) if total_trades > 0 else 0

                # 獲取所有交易記錄，用於計算風險指標
                trade_history_collection = await get_collection("trade_history")
                cursor = trade_history_collection.find({
                    "user_id": user_id,
                    "closed_at": {"$gte": start_date, "$lte": end_date}
                })

                # 收集所有交易的盈虧數據
                pnl_values = []
                async for doc in cursor:
                    pnl_values.append(doc["net_pnl"])

                # 添加當前交易的盈虧
                pnl_values.append(trade_pnl)

                # 計算波動率（標準差）
                volatility = 0
                if len(pnl_values) > 1:
                    mean = sum(pnl_values) / len(pnl_values)
                    variance = sum(
                        (x - mean) ** 2 for x in pnl_values) / (len(pnl_values) - 1)
                    volatility = math.sqrt(variance)

                # 計算最大回撤
                max_drawdown, max_drawdown_percent = await self._calculate_max_drawdown(user_id, start_date, end_date)

                # 計算風險指標
                sharpe_ratio, sortino_ratio, calmar_ratio = self._calculate_risk_ratios(
                    pnl_values, net_profit, max_drawdown, volatility
                )

                # 更新交易表現記錄
                await self.collection.update_one(
                    {"_id": ObjectId(performance["_id"])},
                    {"$set": {
                        "total_trades": total_trades,
                        "winning_trades": winning_trades,
                        "losing_trades": losing_trades,
                        "win_rate": win_rate,
                        "total_profit": total_profit,
                        "total_loss": total_loss,
                        "net_profit": net_profit,
                        "profit_factor": profit_factor,
                        "max_drawdown": max_drawdown,
                        "max_drawdown_percent": max_drawdown_percent,
                        "sharpe_ratio": sharpe_ratio,
                        "sortino_ratio": sortino_ratio,
                        "calmar_ratio": calmar_ratio,
                        "avg_profit": avg_profit,
                        "avg_loss": avg_loss,
                        "avg_trade": avg_trade,
                        "largest_profit": largest_profit,
                        "largest_loss": largest_loss,
                        "avg_duration": avg_duration,
                        "volatility": volatility,
                        "recorded_at": get_utc_plus_8_now()
                    }}
                )

                # 獲取更新後的記錄
                updated_record = await self.collection.find_one({"_id": ObjectId(performance["_id"])})
                if updated_record:
                    updated_record["id"] = str(updated_record.pop("_id"))
                    return TradePerformance(**updated_record)
            else:
                # 創建新的交易表現記錄
                new_performance = TradePerformance(
                    user_id=user_id,
                    period=period,
                    start_date=start_date,
                    end_date=end_date,
                    total_trades=1,
                    winning_trades=1 if trade_pnl > 0 else 0,
                    losing_trades=1 if trade_pnl < 0 else 0,
                    win_rate=100 if trade_pnl > 0 else 0,
                    total_profit=trade_pnl if trade_pnl > 0 else 0,
                    total_loss=abs(trade_pnl) if trade_pnl < 0 else 0,
                    net_profit=trade_pnl,
                    profit_factor=float('inf') if trade_pnl > 0 else 0,
                    max_drawdown=0,  # 初始值，後續計算
                    max_drawdown_percent=0,  # 初始值，後續計算
                    sharpe_ratio=0,  # 初始值，後續計算
                    sortino_ratio=0,  # 初始值，後續計算
                    calmar_ratio=0,  # 初始值，後續計算
                    avg_profit=trade_pnl if trade_pnl > 0 else 0,
                    avg_loss=abs(trade_pnl) if trade_pnl < 0 else 0,
                    avg_trade=trade_pnl,
                    largest_profit=trade_pnl if trade_pnl > 0 else 0,
                    largest_loss=abs(trade_pnl) if trade_pnl < 0 else 0,
                    avg_duration=trade_duration,
                    volatility=0  # 初始值，後續計算
                )

                # 保存到數據庫
                result = await self.collection.insert_one(new_performance.dict())
                new_performance.id = str(result.inserted_id)

                return new_performance

        except Exception as e:
            logger.error(f"更新交易表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    def _get_period_dates(self, date: datetime, period: str) -> tuple:
        """
        根據時間段計算開始和結束日期

        Args:
            date: 日期
            period: 時間段 (daily, weekly, monthly)

        Returns:
            tuple: (開始日期, 結束日期)
        """
        date = get_start_of_day(date)

        if period == "daily":
            # 當天的開始和結束
            return date, date.replace(hour=23, minute=59, second=59)
        elif period == "weekly":
            # 當週的開始（週一）和結束（週日）
            start = date - timedelta(days=date.weekday())
            end = start + timedelta(days=6, hours=23, minutes=59, seconds=59)
            return start, end
        elif period == "monthly":
            # 當月的開始和結束
            start = date.replace(day=1)
            # 下個月的第一天減去1秒
            if date.month == 12:
                end = datetime(date.year + 1, 1, 1, 23, 59, 59,
                               tzinfo=date.tzinfo) - timedelta(days=1)
            else:
                end = datetime(date.year, date.month + 1, 1, 23,
                               59, 59, tzinfo=date.tzinfo) - timedelta(days=1)
            return start, end
        else:
            # 默認為當天
            return date, date.replace(hour=23, minute=59, second=59)

    async def _calculate_max_drawdown(self, user_id: str, start_date: datetime, end_date: datetime) -> tuple:
        """
        計算最大回撤

        Args:
            user_id: 用戶ID
            start_date: 開始日期
            end_date: 結束日期

        Returns:
            tuple: (最大回撤, 最大回撤百分比)
        """
        try:
            # 獲取該時間段內的所有交易
            trade_history_collection = await get_collection("trade_history")
            cursor = trade_history_collection.find({
                "user_id": user_id,
                "closed_at": {"$gte": start_date, "$lte": end_date}
            }).sort("closed_at", 1)

            # 計算最大回撤
            max_drawdown = 0
            max_drawdown_percent = 0
            peak = 0
            equity = 0

            async for doc in cursor:
                equity += doc["net_pnl"]
                if equity > peak:
                    peak = equity

                drawdown = peak - equity
                if drawdown > max_drawdown:
                    max_drawdown = drawdown
                    max_drawdown_percent = (
                        drawdown / peak) * 100 if peak > 0 else 0

            return max_drawdown, max_drawdown_percent

        except Exception as e:
            logger.error(f"計算最大回撤時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return 0, 0

    def _calculate_risk_ratios(self, pnl_values: List[float], net_profit: float, max_drawdown: float, volatility: float) -> tuple:
        """
        計算風險指標

        Args:
            pnl_values: 盈虧值列表
            net_profit: 淨盈虧
            max_drawdown: 最大回撤
            volatility: 波動率

        Returns:
            tuple: (夏普比率, 索提諾比率, 卡爾馬比率)
        """
        try:
            # 計算夏普比率 (Sharpe Ratio)
            # 假設無風險利率為0，使用日度數據
            sharpe_ratio = 0
            if volatility > 0 and len(pnl_values) > 0:
                avg_return = net_profit / len(pnl_values)
                sharpe_ratio = avg_return / volatility

            # 計算索提諾比率 (Sortino Ratio)
            # 只考慮負回報的波動率
            sortino_ratio = 0
            if len(pnl_values) > 0:
                avg_return = net_profit / len(pnl_values)
                negative_returns = [r for r in pnl_values if r < 0]
                if negative_returns:
                    downside_deviation = math.sqrt(
                        sum(r ** 2 for r in negative_returns) / len(negative_returns))
                    if downside_deviation > 0:
                        sortino_ratio = avg_return / downside_deviation

            # 計算卡爾馬比率 (Calmar Ratio)
            # 淨盈虧除以最大回撤
            calmar_ratio = 0
            if max_drawdown > 0:
                calmar_ratio = net_profit / max_drawdown

            return sharpe_ratio, sortino_ratio, calmar_ratio

        except Exception as e:
            logger.error(f"計算風險指標時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return 0, 0, 0

    async def get_performance(self, user_id: str, period: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[TradePerformance]:
        """
        獲取用戶的交易表現

        Args:
            user_id: 用戶ID
            period: 時間段 (daily, weekly, monthly)
            start_date: 開始日期
            end_date: 結束日期

        Returns:
            List[TradePerformance]: 交易表現列表
        """
        await self._ensure_initialized()

        try:
            # 構建查詢條件
            query = {
                "user_id": user_id,
                "period": period
            }

            if start_date:
                query["start_date"] = {"$gte": start_date}

            if end_date:
                if "start_date" in query:
                    query["end_date"] = {"$lte": end_date}
                else:
                    query["end_date"] = {"$lte": end_date}

            # 查詢交易表現記錄
            cursor = self.collection.find(query).sort("start_date", 1)
            performances = []

            async for doc in cursor:
                doc["id"] = str(doc.pop("_id"))
                performances.append(TradePerformance(**doc))

            return performances

        except Exception as e:
            logger.error(f"獲取交易表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []


# 創建服務實例
trade_performance_service = TradePerformanceService()
