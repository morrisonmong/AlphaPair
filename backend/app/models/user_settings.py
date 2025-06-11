from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from bson import ObjectId

from app.utils.time_utils import get_utc_now


# 定義 UTC+8 時區
UTC_PLUS_8 = timezone(timedelta(hours=8))


# 獲取 UTC+8 當前時間的函數
def get_utc_plus_8_now():
    """獲取 UTC+8 時區的當前時間"""
    return datetime.now(UTC_PLUS_8)


class UserSettings(BaseModel):
    """用戶設置模型"""
    id: Optional[str] = Field(default_factory=lambda: str(ObjectId()))
    user_id: str  # 用戶ID
    binance_api_key: Optional[str] = None  # 幣安API密鑰
    binance_api_secret: Optional[str] = None  # 幣安API密鑰
    notification_settings: Dict[str, Any] = Field(
        default_factory=lambda: {
            "enabled": True,  # 是否啟用通知
            "trade_open": True,  # 開倉通知
            "trade_close": True,  # 平倉通知
            "trade_update": False,  # 交易更新通知
            "line_token": None,  # Line Notify令牌
            "discord_webhook": None,  # Discord Webhook URL
            "telegram_token": None,  # Telegram Bot令牌
            "telegram_chat_id": None  # Telegram聊天ID
        }
    )  # 通知設置
    timezone: str = "Asia/Taipei"  # 用戶時區，默認為台北時區 (UTC+8)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Config:
        """模型配置"""
        arbitrary_types_allowed = True
        json_encoders = {
            ObjectId: str
        }


class UserSettingsUpdate(BaseModel):
    """用戶設置更新模型"""
    binance_api_key: Optional[str] = None
    binance_api_secret: Optional[str] = None
    notification_settings: Optional[Dict[str, Any]] = None
    timezone: Optional[str] = None  # 用戶時區設置

    class Config:
        populate_by_name = True
        json_schema_extra = {
            "example": {
                "binance_api_key": "your_encrypted_api_key",
                "binance_api_secret": "your_encrypted_api_secret",
                "notification_settings": {
                    "line_token": "your_encrypted_line_token",
                    "discord_webhook": "your_encrypted_discord_webhook",
                    "telegram_token": "your_encrypted_telegram_token"
                },
                "timezone": "Asia/Taipei"
            }
        }
