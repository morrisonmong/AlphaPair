import logging
import traceback
from typing import List, Optional
from datetime import datetime, timedelta

from bson import ObjectId

from app.models.equity_curve import EquityCurve
from app.models.pair_trade import PairTrade
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import get_utc_now, get_utc_plus_8_now, get_start_of_day

logger = logging.getLogger(__name__)


class EquityCurveService:
    """資金曲線服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "equity_curve"

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def update_equity_curve(self, user_id: str, trade: PairTrade) -> Optional[EquityCurve]:
        """
        更新用戶的資金曲線

        Args:
            user_id: 用戶ID
            trade: 已完成的交易

        Returns:
            Optional[EquityCurve]: 更新後的資金曲線
        """
        await self._ensure_initialized()

        try:
            # 獲取當前日期（UTC+8）
            today = get_start_of_day(get_utc_plus_8_now())

            # 查詢今日的資金曲線記錄
            equity_curve = await self.collection.find_one({
                "user_id": user_id,
                "date": {"$gte": today, "$lt": today + timedelta(days=1)}
            })

            # 獲取昨日的資金曲線記錄，用於計算今日的起始資金
            yesterday = today - timedelta(days=1)
            yesterday_equity = await self.collection.find_one({
                "user_id": user_id,
                "date": {"$gte": yesterday, "$lt": yesterday + timedelta(days=1)}
            })

            # 獲取歷史最高資金
            peak_equity_record = await self.collection.find_one(
                {"user_id": user_id},
                sort=[("equity", -1)]
            )

            # 計算交易盈虧
            trade_pnl = trade.net_pnl  # 使用淨盈虧（扣除手續費）

            if equity_curve:
                # 更新今日資金曲線
                current_equity = equity_curve["equity"] + trade_pnl
                daily_pnl = equity_curve["daily_pnl"] + trade_pnl
                trades_count = equity_curve["trades_count"] + 1
                winning_trades = equity_curve["winning_trades"] + \
                    (1 if trade_pnl > 0 else 0)
                losing_trades = equity_curve["losing_trades"] + \
                    (1 if trade_pnl < 0 else 0)

                # 計算歷史最高資金
                peak_equity = max(
                    equity_curve["peak_equity"],
                    current_equity
                )

                # 計算回撤
                drawdown = peak_equity - current_equity
                drawdown_percent = (drawdown / peak_equity) * \
                    100 if peak_equity > 0 else 0

                # 計算日盈虧百分比
                start_equity = equity_curve["equity"] - \
                    equity_curve["daily_pnl"]
                daily_pnl_percent = (daily_pnl / start_equity) * \
                    100 if start_equity > 0 else 0

                # 更新資金曲線記錄
                await self.collection.update_one(
                    {"_id": ObjectId(equity_curve["_id"])},
                    {"$set": {
                        "equity": current_equity,
                        "daily_pnl": daily_pnl,
                        "daily_pnl_percent": daily_pnl_percent,
                        "drawdown": drawdown,
                        "drawdown_percent": drawdown_percent,
                        "peak_equity": peak_equity,
                        "trades_count": trades_count,
                        "winning_trades": winning_trades,
                        "losing_trades": losing_trades,
                        "recorded_at": get_utc_plus_8_now()
                    }}
                )

                # 獲取更新後的記錄
                updated_record = await self.collection.find_one({"_id": ObjectId(equity_curve["_id"])})
                if updated_record:
                    updated_record["id"] = str(updated_record.pop("_id"))
                    return EquityCurve(**updated_record)
            else:
                # 創建今日資金曲線
                start_equity = yesterday_equity["equity"] if yesterday_equity else 0
                current_equity = start_equity + trade_pnl

                # 計算歷史最高資金
                peak_equity = max(
                    peak_equity_record["equity"] if peak_equity_record else 0,
                    current_equity
                )

                # 計算回撤
                drawdown = peak_equity - current_equity
                drawdown_percent = (drawdown / peak_equity) * \
                    100 if peak_equity > 0 else 0

                # 計算日盈虧百分比
                daily_pnl_percent = (trade_pnl / start_equity) * \
                    100 if start_equity > 0 else 0

                # 創建新的資金曲線記錄
                new_equity_curve = EquityCurve(
                    user_id=user_id,
                    date=today,
                    equity=current_equity,
                    daily_pnl=trade_pnl,
                    daily_pnl_percent=daily_pnl_percent,
                    drawdown=drawdown,
                    drawdown_percent=drawdown_percent,
                    peak_equity=peak_equity,
                    trades_count=1,
                    winning_trades=1 if trade_pnl > 0 else 0,
                    losing_trades=1 if trade_pnl < 0 else 0
                )

                # 保存到數據庫
                result = await self.collection.insert_one(new_equity_curve.dict())
                new_equity_curve.id = str(result.inserted_id)

                return new_equity_curve

        except Exception as e:
            logger.error(f"更新資金曲線時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def get_equity_curve(self, user_id: str, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[EquityCurve]:
        """
        獲取用戶的資金曲線

        Args:
            user_id: 用戶ID
            start_date: 開始日期
            end_date: 結束日期

        Returns:
            List[EquityCurve]: 資金曲線列表
        """
        await self._ensure_initialized()

        try:
            # 構建查詢條件
            query = {"user_id": user_id}

            if start_date:
                query["date"] = {"$gte": start_date}

            if end_date:
                if "date" in query:
                    query["date"]["$lte"] = end_date
                else:
                    query["date"] = {"$lte": end_date}

            # 查詢資金曲線記錄
            cursor = self.collection.find(query).sort("date", 1)
            equity_curves = []

            async for doc in cursor:
                doc["id"] = str(doc.pop("_id"))
                equity_curves.append(EquityCurve(**doc))

            return equity_curves

        except Exception as e:
            logger.error(f"獲取資金曲線時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []


# 創建服務實例
equity_curve_service = EquityCurveService()
