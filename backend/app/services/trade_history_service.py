import logging
import traceback
from typing import List, Optional
from datetime import datetime  # 確保導入 datetime

from bson import ObjectId

from app.models.trade_history import TradeHistory, TradePosition
from app.models.pair_trade import PairTrade
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import ensure_timezone

logger = logging.getLogger(__name__)


class TradeHistoryService:
    """交易歷史記錄服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "trade_history"

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def create_trade_history(self, trade: PairTrade) -> TradeHistory:
        """
        創建交易歷史記錄

        Args:
            trade: 已完成的交易

        Returns:
            TradeHistory: 創建的交易歷史記錄
        """
        await self._ensure_initialized()

        try:
            # 計算交易持續時間
            duration_seconds = 0
            if trade.created_at and trade.closed_at:
                # 確保兩個時間都有時區信息
                created_at_with_tz = ensure_timezone(trade.created_at)
                closed_at_with_tz = ensure_timezone(trade.closed_at)

                duration_seconds = int(
                    (closed_at_with_tz - created_at_with_tz).total_seconds())

            # 計算淨盈虧
            net_pnl = trade.total_pnl_value - trade.total_fee

            # 計算風險收益比（總盈虧/最大虧損）和淨風險收益比（淨盈虧/最大虧損）
            risk_reward_ratio = 0
            net_risk_reward_ratio = 0
            if trade.max_loss and trade.max_loss > 0:
                risk_reward_ratio = trade.total_pnl_value / trade.max_loss
                net_risk_reward_ratio = net_pnl / trade.max_loss
                logger.info(
                    f"計算風險收益比: {trade.total_pnl_value} / {trade.max_loss} = {risk_reward_ratio}")
                logger.info(
                    f"計算淨風險收益比: {net_pnl} / {trade.max_loss} = {net_risk_reward_ratio}")

            # 為活躍交易提供默認值
            closed_at = trade.closed_at if trade.closed_at else trade.updated_at
            close_reason = trade.close_reason if hasattr(trade, 'close_reason') and trade.close_reason else "手動平倉"

            # 創建 long_position 和 short_position
            long_position_data = None
            short_position_data = None

            # 檢查 long_position 是否已存在並是字典或對象
            if trade.long_position:
                if isinstance(trade.long_position, dict):
                    long_position = trade.long_position
                    long_position_data = TradePosition(
                        symbol=long_position.get("symbol", ""),
                        side="BUY",
                        quantity=long_position.get("quantity", 0),
                        entry_price=long_position.get("entry_price", 0),
                        current_price=long_position.get("current_price", 0),
                        exit_price=long_position.get("exit_price", 0),
                        pnl=long_position.get("pnl", 0),
                        pnl_percent=long_position.get("pnl_percent", 0),
                        entry_order_id=long_position.get("entry_order_id", ""),
                        notional_value=long_position.get("notional_value", 0),
                        entry_fee=long_position.get("entry_fee", 0),
                        exit_fee=long_position.get("exit_fee", 0),
                        exit_order_id=long_position.get("exit_order_id", ""),
                        leverage=long_position.get("leverage", 1)
                    )
                else:
                    # 如果是對象，直接轉換為 TradePosition
                    long_position_data = TradePosition(
                        symbol=trade.long_position.symbol,
                        side="BUY",
                        quantity=trade.long_position.quantity,
                        entry_price=trade.long_position.entry_price,
                        current_price=trade.long_position.current_price,
                        exit_price=trade.long_position.exit_price,
                        pnl=trade.long_position.pnl,
                        pnl_percent=trade.long_position.pnl_percent,
                        entry_order_id=trade.long_position.entry_order_id,
                        notional_value=trade.long_position.notional_value,
                        entry_fee=trade.long_position.entry_fee,
                        exit_fee=trade.long_position.exit_fee,
                        exit_order_id=trade.long_position.exit_order_id,
                        leverage=trade.long_position.leverage
                    )

            # 檢查 short_position 是否已存在並是字典或對象
            if trade.short_position:
                if isinstance(trade.short_position, dict):
                    short_position = trade.short_position
                    short_position_data = TradePosition(
                        symbol=short_position.get("symbol", ""),
                        side="SELL",
                        quantity=short_position.get("quantity", 0),
                        entry_price=short_position.get("entry_price", 0),
                        current_price=short_position.get("current_price", 0),
                        exit_price=short_position.get("exit_price", 0),
                        pnl=short_position.get("pnl", 0),
                        pnl_percent=short_position.get("pnl_percent", 0),
                        entry_order_id=short_position.get("entry_order_id", ""),
                        notional_value=short_position.get("notional_value", 0),
                        entry_fee=short_position.get("entry_fee", 0),
                        exit_fee=short_position.get("exit_fee", 0),
                        exit_order_id=short_position.get("exit_order_id", ""),
                        leverage=short_position.get("leverage", 1)
                    )
                else:
                    # 如果是對象，直接轉換為 TradePosition
                    short_position_data = TradePosition(
                        symbol=trade.short_position.symbol,
                        side="SELL",
                        quantity=trade.short_position.quantity,
                        entry_price=trade.short_position.entry_price,
                        current_price=trade.short_position.current_price,
                        exit_price=trade.short_position.exit_price,
                        pnl=trade.short_position.pnl,
                        pnl_percent=trade.short_position.pnl_percent,
                        entry_order_id=trade.short_position.entry_order_id,
                        notional_value=trade.short_position.notional_value,
                        entry_fee=trade.short_position.entry_fee,
                        exit_fee=trade.short_position.exit_fee,
                        exit_order_id=trade.short_position.exit_order_id,
                        leverage=trade.short_position.leverage
                    )

            # 創建交易歷史記錄
            history = TradeHistory(
                user_id=trade.user_id,
                trade_id=trade.id,
                trade_name=trade.name,
                trade_type="pair_trade",
                max_loss=trade.max_loss,
                stop_loss=trade.stop_loss,
                take_profit=trade.take_profit,

                # 交易持倉信息
                long_position=long_position_data,
                short_position=short_position_data,

                # 盈虧信息
                total_pnl=trade.total_pnl_value,
                net_pnl=net_pnl,
                total_ratio_percent=trade.total_ratio_percent,

                # 手續費信息
                total_fee=trade.total_fee,
                total_entry_fee=trade.total_entry_fee,
                total_exit_fee=trade.total_exit_fee,

                # 風險收益比
                risk_reward_ratio=risk_reward_ratio,
                net_risk_reward_ratio=net_risk_reward_ratio,

                # 最大不利變動 (MAE) & 最大有利變動 (MFE)
                max_ratio=trade.max_ratio if hasattr(trade, 'max_ratio') else 0,
                min_ratio=trade.min_ratio if hasattr(trade, 'min_ratio') else 0,
                mae=trade.mae if hasattr(trade, 'mae') else 0,
                mfe=trade.mfe if hasattr(trade, 'mfe') else 0,

                # 時間信息
                created_at=trade.created_at,
                closed_at=closed_at,
                duration_seconds=duration_seconds,

                # 其他信息
                close_reason=close_reason,
                leverage=trade.long_position.leverage if hasattr(trade.long_position, 'leverage') else 1
            )

            # 保存到數據庫
            await self.collection.insert_one(history.dict())
            logger.info(f"交易歷史記錄保存成功，ID: {history.id}")

            return history
        except Exception as e:
            logger.error(f"創建交易歷史記錄失敗: {e}")
            logger.error(traceback.format_exc())
            raise

    async def get_user_trade_history(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[TradeHistory]:
        """
        獲取用戶指定時間範圍內的交易歷史記錄。

        Args:
            user_id: 用戶ID
            start_date: 起始日期 (可選)
            end_date: 結束日期 (可選)

        Returns:
            List[TradeHistory]: 交易歷史記錄列表
        """
        await self._ensure_initialized()

        try:
            query = {"user_id": user_id}
            date_filter = {}
            if start_date:
                start_date_aware = ensure_timezone(start_date)
                date_filter["$gte"] = start_date_aware
            if end_date:
                end_date_aware = ensure_timezone(end_date)
                date_filter["$lte"] = end_date_aware

            if date_filter:
                query["closed_at"] = date_filter

            cursor = self.collection.find(query).sort("closed_at", -1)
            histories = []

            docs = await cursor.to_list(length=None)

            for doc in docs:
                try:
                    if "_id" in doc:
                        doc["id"] = str(doc.pop("_id"))
                    history = TradeHistory(**doc)
                    histories.append(history)
                except Exception as e:
                    logger.error(f"處理交易歷史記錄時發生錯誤: {e}, doc: {doc}")
                    logger.error(traceback.format_exc())

            return histories

        except Exception as e:
            logger.error(f"獲取用戶交易歷史記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []

    async def get_trade_history(self, history_id: str) -> Optional[TradeHistory]:
        """
        獲取指定的交易歷史記錄

        Args:
            history_id: 歷史記錄ID

        Returns:
            Optional[TradeHistory]: 交易歷史記錄，如果不存在則返回None
        """
        await self._ensure_initialized()

        try:
            # 查詢交易歷史
            doc = await self.collection.find_one({"_id": ObjectId(history_id)})

            if doc:
                # 將 _id 轉換為 id
                doc["id"] = str(doc.pop("_id"))
                return TradeHistory(**doc)

            return None
        except Exception as e:
            logger.error(f"獲取交易歷史記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def delete_trade_history(self, history_id: str, user_id: str) -> bool:
        """
        刪除指定的交易歷史記錄

        Args:
            history_id: 歷史記錄ID
            user_id: 用戶ID（用於安全檢查）

        Returns:
            bool: 刪除是否成功
        """
        await self._ensure_initialized()

        try:
            # 確保只刪除屬於該用戶的記錄
            result = await self.collection.delete_one({
                "_id": ObjectId(history_id),
                "user_id": user_id
            })

            if result.deleted_count > 0:
                logger.info(f"成功刪除交易歷史記錄，ID: {history_id}")
                return True
            else:
                logger.warning(
                    f"刪除交易歷史記錄失敗，ID: {history_id}，找不到記錄或該記錄不屬於用戶: {user_id}")
                return False
        except Exception as e:
            logger.error(f"刪除交易歷史記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return False

    async def batch_delete_trade_history(self, history_ids: List[str], user_id: str) -> dict:
        """
        批量刪除交易歷史記錄

        Args:
            history_ids: 歷史記錄ID列表
            user_id: 用戶ID（用於安全檢查）

        Returns:
            dict: 刪除結果統計
        """
        await self._ensure_initialized()

        successful_deletes = 0
        failed_deletes = 0
        details = []

        try:
            for history_id in history_ids:
                try:
                    # 確保只刪除屬於該用戶的記錄
                    result = await self.collection.delete_one({
                        "_id": ObjectId(history_id),
                        "user_id": user_id
                    })

                    if result.deleted_count > 0:
                        successful_deletes += 1
                        details.append({
                            "id": history_id,
                            "status": "成功",
                            "message": "記錄已刪除"
                        })
                        logger.info(f"成功刪除交易歷史記錄，ID: {history_id}")
                    else:
                        failed_deletes += 1
                        details.append({
                            "id": history_id,
                            "status": "失敗",
                            "message": "記錄不存在或不屬於當前用戶"
                        })
                        logger.warning(f"刪除交易歷史記錄失敗，ID: {history_id}")

                except Exception as e:
                    failed_deletes += 1
                    details.append({
                        "id": history_id,
                        "status": "失敗",
                        "message": str(e)
                    })
                    logger.error(f"刪除交易歷史記錄時發生錯誤，ID: {history_id}, 錯誤: {e}")

            return {
                "successful_deletes": successful_deletes,
                "failed_deletes": failed_deletes,
                "details": details
            }

        except Exception as e:
            logger.error(f"批量刪除交易歷史記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            raise

    async def rollback_import_session(self, import_session_id: str, user_id: str) -> dict:
        """
        撤銷指定導入會話的所有記錄

        Args:
            import_session_id: 導入會話ID
            user_id: 用戶ID（用於安全檢查）

        Returns:
            dict: 撤銷結果
        """
        await self._ensure_initialized()

        try:
            # 刪除該導入會話的所有記錄
            result = await self.collection.delete_many({
                "user_id": user_id,
                "import_session_id": import_session_id
            })

            logger.info(f"成功撤銷導入會話 {import_session_id}，刪除了 {result.deleted_count} 筆記錄")

            return {
                "deleted_count": result.deleted_count
            }

        except Exception as e:
            logger.error(f"撤銷導入會話時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            raise

    async def import_trade_history(self, record: dict) -> bool:
        """
        匯入單一交易歷史記錄

        Args:
            record: 處理過的交易記錄數據

        Returns:
            bool: 是否匯入成功
        """
        await self._ensure_initialized()

        try:
            from datetime import datetime
            import uuid

            # 生成唯一的trade_id
            timestamp = int(datetime.now().timestamp())
            trade_id = f"IMPORT_{timestamp}_{str(uuid.uuid4())[:8]}"

            # 創建持倉信息（從匯入的完整資料創建）
            long_position = None
            short_position = None

            if record.get('long_symbol'):
                long_position = TradePosition(
                    symbol=record.get('long_symbol'),
                    side="BUY",
                    quantity=record.get('long_quantity', 0),
                    entry_price=record.get('long_entry_price', 0),
                    current_price=record.get('long_current_price', 0),
                    exit_price=record.get('long_exit_price', 0),
                    pnl=record.get('long_pnl', 0),
                    pnl_percent=record.get('long_pnl_percent', 0),
                    entry_order_id=record.get('long_entry_order_id', ""),
                    exit_order_id=record.get('long_exit_order_id', ""),
                    notional_value=record.get('long_notional_value', 0),
                    entry_fee=record.get('long_entry_fee', 0),
                    exit_fee=record.get('long_exit_fee', 0),
                    leverage=record.get('long_leverage', 1)
                )

            if record.get('short_symbol'):
                short_position = TradePosition(
                    symbol=record.get('short_symbol'),
                    side="SELL",
                    quantity=record.get('short_quantity', 0),
                    entry_price=record.get('short_entry_price', 0),
                    current_price=record.get('short_current_price', 0),
                    exit_price=record.get('short_exit_price', 0),
                    pnl=record.get('short_pnl', 0),
                    pnl_percent=record.get('short_pnl_percent', 0),
                    entry_order_id=record.get('short_entry_order_id', ""),
                    exit_order_id=record.get('short_exit_order_id', ""),
                    notional_value=record.get('short_notional_value', 0),
                    entry_fee=record.get('short_entry_fee', 0),
                    exit_fee=record.get('short_exit_fee', 0),
                    leverage=record.get('short_leverage', 1)
                )

            # 創建TradeHistory對象
            history = TradeHistory(
                user_id=record['user_id'],
                trade_id=trade_id,
                trade_name=record['trade_name'],
                trade_type=record.get('trade_type', 'pair_trade'),

                # 必填欄位
                max_loss=record['max_loss'],
                total_pnl=record['total_pnl'],
                total_fee=record['total_fee'],
                close_reason=record['close_reason'],
                created_at=record['created_at'],
                closed_at=record['closed_at'],

                # 自動計算或匯入的欄位（優先使用匯入值）
                net_pnl=record.get('net_pnl'),
                duration_seconds=record.get('duration_seconds'),
                risk_reward_ratio=record.get('risk_reward_ratio'),
                net_risk_reward_ratio=record.get('net_risk_reward_ratio'),

                # 手續費詳細資訊
                total_entry_fee=record.get('total_entry_fee'),
                total_exit_fee=record.get('total_exit_fee'),

                # 選填欄位
                stop_loss=record.get('stop_loss'),
                take_profit=record.get('take_profit'),
                total_ratio_percent=record.get('total_ratio_percent', 0),
                mae=record.get('mae'),
                mfe=record.get('mfe'),
                max_ratio=record.get('max_ratio', 0),
                min_ratio=record.get('min_ratio', 0),
                leverage=record.get('leverage', 1),

                # 導入會話ID（用於撤銷功能）
                import_session_id=record.get('import_session_id'),

                # 記錄時間
                recorded_at=datetime.utcnow(),

                # 持倉信息（從匯入資料創建）
                long_position=long_position,
                short_position=short_position
            )

            # 保存到數據庫
            result = await self.collection.insert_one(history.dict())
            logger.info(f"成功匯入交易歷史記錄，ID: {result.inserted_id}")
            return True

        except Exception as e:
            logger.error(f"匯入交易歷史記錄失敗: {e}")
            logger.error(traceback.format_exc())
            raise


# 創建服務實例
trade_history_service = TradeHistoryService()
