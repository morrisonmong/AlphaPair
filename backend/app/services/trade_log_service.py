import logging
import traceback
import json
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

from bson import ObjectId

from app.models.trade_log import TradeLog
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import get_utc_now, get_utc_plus_8_now, format_datetime

logger = logging.getLogger(__name__)


class TradeLogService:
    """交易日誌服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "trade_logs"
        self.log_file_path = os.path.join("logs", "trade_logs.log")

        # 確保日誌目錄存在
        os.makedirs(os.path.dirname(self.log_file_path), exist_ok=True)

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def log_trade_action(
        self,
        user_id: str,
        action: str,
        status: str,
        message: str,
        trade_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        write_to_file: bool = True
    ) -> Optional[TradeLog]:
        """
        記錄交易動作

        Args:
            user_id: 用戶ID
            action: 動作類型 (open, close, update, error, notification)
            status: 狀態 (success, failed, warning)
            message: 日誌訊息
            trade_id: 交易ID (可選)
            details: 詳細資訊 (可選)
            write_to_file: 是否同時寫入檔案 (預設為True)

        Returns:
            Optional[TradeLog]: 創建的交易日誌
        """
        await self._ensure_initialized()

        try:
            # 創建交易日誌
            trade_log = TradeLog(
                user_id=user_id,
                trade_id=trade_id,
                action=action,
                status=status,
                message=message,
                details=details
            )

            # 保存到資料庫
            result = await self.collection.insert_one(trade_log.dict())
            trade_log.id = str(result.inserted_id)

            # 同時寫入檔案
            if write_to_file:
                self._write_to_file(trade_log)

            return trade_log

        except Exception as e:
            logger.error(f"記錄交易動作時發生錯誤: {e}")
            logger.error(traceback.format_exc())

            # 嘗試寫入檔案，即使資料庫操作失敗
            if write_to_file:
                try:
                    log_entry = {
                        "user_id": user_id,
                        "trade_id": trade_id,
                        "action": action,
                        "status": status,
                        "message": message,
                        "details": details,
                        "created_at": format_datetime(get_utc_plus_8_now()),
                        "error": str(e)
                    }
                    with open(self.log_file_path, "a", encoding="utf-8") as f:
                        f.write(
                            f"{json.dumps(log_entry, ensure_ascii=False, default=str)}\n")
                except Exception as file_error:
                    logger.error(f"寫入日誌檔案時發生錯誤: {file_error}")

            return None

    def _write_to_file(self, trade_log: TradeLog):
        """
        將交易日誌寫入檔案

        Args:
            trade_log: 交易日誌
        """
        try:
            log_entry = trade_log.dict()
            with open(self.log_file_path, "a", encoding="utf-8") as f:
                f.write(
                    f"{json.dumps(log_entry, ensure_ascii=False, default=str)}\n")
        except Exception as e:
            logger.error(f"寫入日誌檔案時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def get_trade_logs(
        self,
        user_id: str,
        trade_id: Optional[str] = None,
        action: Optional[str] = None,
        status: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
        skip: int = 0
    ) -> List[TradeLog]:
        """
        獲取交易日誌

        Args:
            user_id: 用戶ID
            trade_id: 交易ID (可選)
            action: 動作類型 (可選)
            status: 狀態 (可選)
            start_date: 開始日期 (可選)
            end_date: 結束日期 (可選)
            limit: 限制數量 (預設100)
            skip: 跳過數量 (預設0)

        Returns:
            List[TradeLog]: 交易日誌列表
        """
        await self._ensure_initialized()

        try:
            # 構建查詢條件
            query = {"user_id": user_id}

            if trade_id:
                query["trade_id"] = trade_id

            if action:
                query["action"] = action

            if status:
                query["status"] = status

            if start_date or end_date:
                query["created_at"] = {}
                if start_date:
                    query["created_at"]["$gte"] = start_date
                if end_date:
                    query["created_at"]["$lte"] = end_date

            # 查詢交易日誌
            cursor = self.collection.find(query).sort(
                "created_at", -1).skip(skip).limit(limit)
            logs = []

            async for doc in cursor:
                doc["id"] = str(doc.pop("_id"))
                logs.append(TradeLog(**doc))

            return logs

        except Exception as e:
            logger.error(f"獲取交易日誌時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []

    async def get_trade_logs_by_trade_id(self, trade_id: str) -> List[TradeLog]:
        """
        根據交易ID獲取交易日誌

        Args:
            trade_id: 交易ID

        Returns:
            List[TradeLog]: 交易日誌列表
        """
        await self._ensure_initialized()

        try:
            # 查詢交易日誌
            cursor = self.collection.find(
                {"trade_id": trade_id}).sort("created_at", 1)
            logs = []

            async for doc in cursor:
                doc["id"] = str(doc.pop("_id"))
                logs.append(TradeLog(**doc))

            return logs

        except Exception as e:
            logger.error(f"獲取交易日誌時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []


# 創建服務實例
trade_log_service = TradeLogService()
