import logging
import traceback
import math
from typing import List, Optional, Dict, Any
from datetime import datetime

from bson import ObjectId

from app.models.market_performance import MarketPerformance
from app.models.pair_trade import PairTrade
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import get_utc_now, get_utc_plus_8_now, ensure_timezone

logger = logging.getLogger(__name__)


class MarketPerformanceService:
    """市場表現服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "market_performance"

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def update_market_performance(self, user_id: str, trade: PairTrade) -> Optional[List[MarketPerformance]]:
        """
        更新用戶的市場表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易

        Returns:
            Optional[List[MarketPerformance]]: 更新後的市場表現列表
        """
        await self._ensure_initialized()

        try:
            # 獲取交易的市場/交易對
            markets = []

            # 添加多單市場
            if hasattr(trade.long_position, 'symbol'):
                long_symbol = trade.long_position.symbol
            else:
                long_symbol = trade.long_position["symbol"] if isinstance(
                    trade.long_position, dict) else None

            if long_symbol:
                markets.append(long_symbol)

            # 添加空單市場
            if hasattr(trade.short_position, 'symbol'):
                short_symbol = trade.short_position.symbol
            else:
                short_symbol = trade.short_position["symbol"] if isinstance(
                    trade.short_position, dict) else None

            if short_symbol:
                markets.append(short_symbol)

            # 添加配對市場（例如：BTC/ETH）
            if long_symbol and short_symbol:
                pair_market = f"{long_symbol}/{short_symbol}"
                markets.append(pair_market)

            # 更新每個市場的表現
            updated_performances = []
            for market in markets:
                performance = await self._update_single_market_performance(user_id, trade, market)
                if performance:
                    updated_performances.append(performance)

            return updated_performances

        except Exception as e:
            logger.error(f"更新市場表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _update_single_market_performance(self, user_id: str, trade: PairTrade, market: str) -> Optional[MarketPerformance]:
        """
        更新單個市場的表現

        Args:
            user_id: 用戶ID
            trade: 已完成的交易
            market: 市場/交易對

        Returns:
            Optional[MarketPerformance]: 更新後的市場表現
        """
        try:
            # 查詢該市場的表現記錄
            performance = await self.collection.find_one({
                "user_id": user_id,
                "market": market
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
                # 更新市場表現
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

                # 更新時間信息
                first_trade_date = performance["first_trade_date"]
                last_trade_date = trade.closed_at

                # 獲取所有交易記錄，用於計算風險指標
                trade_history_collection = await get_collection("trade_history")
                cursor = trade_history_collection.find({
                    "user_id": user_id,
                    "$or": [
                        {"long_symbol": market},
                        {"short_symbol": market}
                    ]
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
                max_drawdown, max_drawdown_percent = await self._calculate_max_drawdown(user_id, market)

                # 更新市場表現記錄
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
                        "avg_profit": avg_profit,
                        "avg_loss": avg_loss,
                        "avg_trade": avg_trade,
                        "largest_profit": largest_profit,
                        "largest_loss": largest_loss,
                        "avg_duration": avg_duration,
                        "volatility": volatility,
                        "first_trade_date": first_trade_date,
                        "last_trade_date": last_trade_date,
                        "recorded_at": get_utc_plus_8_now()
                    }}
                )

                # 獲取更新後的記錄
                updated_record = await self.collection.find_one({"_id": ObjectId(performance["_id"])})
                if updated_record:
                    updated_record["id"] = str(updated_record.pop("_id"))
                    return MarketPerformance(**updated_record)
            else:
                # 創建新的市場表現記錄
                new_performance = MarketPerformance(
                    user_id=user_id,
                    market=market,
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
                    avg_profit=trade_pnl if trade_pnl > 0 else 0,
                    avg_loss=abs(trade_pnl) if trade_pnl < 0 else 0,
                    avg_trade=trade_pnl,
                    largest_profit=trade_pnl if trade_pnl > 0 else 0,
                    largest_loss=abs(trade_pnl) if trade_pnl < 0 else 0,
                    avg_duration=trade_duration,
                    volatility=0,  # 初始值，後續計算
                    first_trade_date=trade.closed_at,
                    last_trade_date=trade.closed_at
                )

                # 保存到數據庫
                result = await self.collection.insert_one(new_performance.dict())
                new_performance.id = str(result.inserted_id)

                return new_performance

        except Exception as e:
            logger.error(f"更新單個市場表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _calculate_max_drawdown(self, user_id: str, market: str) -> tuple:
        """
        計算最大回撤

        Args:
            user_id: 用戶ID
            market: 市場/交易對

        Returns:
            tuple: (最大回撤, 最大回撤百分比)
        """
        try:
            # 獲取該市場的所有交易
            trade_history_collection = await get_collection("trade_history")
            cursor = trade_history_collection.find({
                "user_id": user_id,
                "$or": [
                    {"long_symbol": market},
                    {"short_symbol": market}
                ]
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

    async def get_market_performance(self, user_id: str, market: Optional[str] = None) -> List[MarketPerformance]:
        """
        獲取用戶的市場表現

        Args:
            user_id: 用戶ID
            market: 市場/交易對，如果為None則獲取所有市場

        Returns:
            List[MarketPerformance]: 市場表現列表
        """
        await self._ensure_initialized()

        try:
            # 構建查詢條件
            query = {"user_id": user_id}

            if market:
                query["market"] = market

            # 查詢市場表現記錄
            cursor = self.collection.find(query).sort("net_profit", -1)
            performances = []

            async for doc in cursor:
                doc["id"] = str(doc.pop("_id"))
                performances.append(MarketPerformance(**doc))

            return performances

        except Exception as e:
            logger.error(f"獲取市場表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []


# 創建服務實例
market_performance_service = MarketPerformanceService()
