import asyncio
import logging
import traceback
import json
import os
from datetime import datetime
from typing import Dict, Any, Optional

from app.services.trade_log_service import trade_log_service
from app.database.mongodb import get_database, get_collection
from app.utils.time_utils import get_utc_plus_8_now, format_datetime

logger = logging.getLogger(__name__)

# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/trade_events.log"),
        logging.StreamHandler()
    ]
)


class TradeEventLogger:
    """交易事件日誌記錄器"""

    def __init__(self):
        self.db = None
        self.pair_trades_collection = None
        self.trade_history_collection = None
        self._initialized = False
        self.log_file_path = os.path.join("logs", "trade_events.log")

        # 確保日誌目錄存在
        os.makedirs(os.path.dirname(self.log_file_path), exist_ok=True)

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.pair_trades_collection = await get_collection("pair_trades")
            self.trade_history_collection = await get_collection("trade_history")
            self._initialized = True

    async def log_trade_event(
        self,
        user_id: str,
        action: str,
        status: str,
        message: str,
        trade_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        """
        記錄交易事件

        Args:
            user_id: 用戶ID
            action: 動作類型 (open, close, update, error, notification)
            status: 狀態 (success, failed, warning)
            message: 日誌訊息
            trade_id: 交易ID (可選)
            details: 詳細資訊 (可選)
        """
        try:
            await trade_log_service.log_trade_action(
                user_id=user_id,
                trade_id=trade_id,
                action=action,
                status=status,
                message=message,
                details=details
            )
            logger.info(f"已記錄交易事件: {action} - {message}")
        except Exception as e:
            logger.error(f"記錄交易事件時發生錯誤: {e}")
            logger.error(traceback.format_exc())

            # 嘗試直接寫入檔案
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

    async def monitor_trade_events(self):
        """監控交易事件"""
        await self._ensure_initialized()

        logger.info("開始監控交易事件...")

        # 監控配對交易集合的變更
        try:
            async with self.pair_trades_collection.watch() as change_stream:
                async for change in change_stream:
                    try:
                        # 處理變更事件
                        operation_type = change.get("operationType")

                        if operation_type == "insert":
                            # 新增交易
                            document = change.get("fullDocument", {})
                            user_id = document.get("user_id")
                            trade_id = str(document.get("_id"))
                            trade_name = document.get("name")

                            await self.log_trade_event(
                                user_id=user_id,
                                trade_id=trade_id,
                                action="open",
                                status="success",
                                message=f"新增配對交易: {trade_name}",
                                details={
                                    "document": document
                                }
                            )

                        elif operation_type == "update":
                            # 更新交易
                            document_key = change.get("documentKey", {})
                            trade_id = str(document_key.get("_id"))
                            update_description = change.get(
                                "updateDescription", {})
                            updated_fields = update_description.get(
                                "updatedFields", {})

                            # 獲取完整的交易文檔
                            trade = await self.pair_trades_collection.find_one({"_id": document_key.get("_id")})

                            if trade:
                                user_id = trade.get("user_id")
                                trade_name = trade.get("name")
                                status = trade.get("status")

                                if status == "CLOSED" and "status" in updated_fields:
                                    # 平倉交易
                                    await self.log_trade_event(
                                        user_id=user_id,
                                        trade_id=trade_id,
                                        action="close",
                                        status="success",
                                        message=f"平倉配對交易: {trade_name}",
                                        details={
                                            "close_reason": trade.get("close_reason"),
                                            "total_pnl": trade.get("total_pnl"),
                                            "total_pnl_percent": trade.get("total_pnl_percent"),
                                            "net_pnl": trade.get("net_pnl"),
                                            "total_fee": trade.get("total_fee"),
                                            "updated_fields": updated_fields
                                        }
                                    )
                                else:
                                    # 一般更新
                                    await self.log_trade_event(
                                        user_id=user_id,
                                        trade_id=trade_id,
                                        action="update",
                                        status="success",
                                        message=f"更新配對交易: {trade_name}",
                                        details={
                                            "updated_fields": updated_fields
                                        }
                                    )

                        elif operation_type == "delete":
                            # 刪除交易
                            document_key = change.get("documentKey", {})
                            trade_id = str(document_key.get("_id"))

                            await self.log_trade_event(
                                user_id="unknown",  # 刪除操作無法獲取用戶ID
                                trade_id=trade_id,
                                action="delete",
                                status="success",
                                message=f"刪除配對交易: {trade_id}",
                                details={
                                    "document_key": document_key
                                }
                            )

                    except Exception as e:
                        logger.error(f"處理變更事件時發生錯誤: {e}")
                        logger.error(traceback.format_exc())

        except Exception as e:
            logger.error(f"監控交易事件時發生錯誤: {e}")
            logger.error(traceback.format_exc())


async def main():
    """主函數"""
    logger.info("啟動交易事件日誌記錄器...")

    event_logger = TradeEventLogger()
    await event_logger.monitor_trade_events()


if __name__ == "__main__":
    asyncio.run(main())
