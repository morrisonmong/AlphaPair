from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from bson import ObjectId

from app.utils.time_utils import get_utc_plus_8_now


class TradeLog(BaseModel):
    """交易日誌模型"""
    id: Optional[str] = Field(default_factory=lambda: str(ObjectId()))
    user_id: str  # 用戶ID
    trade_id: Optional[str] = None  # 交易ID
    action: str  # 動作類型：open, close, update, error, notification
    status: str  # 狀態：success, failed, warning
    message: str  # 日誌訊息
    details: Optional[Dict[str, Any]] = None  # 詳細資訊，如錯誤堆疊、訂單資訊等
    created_at: datetime = Field(default_factory=get_utc_plus_8_now)

    class Config:
        populate_by_name = True
