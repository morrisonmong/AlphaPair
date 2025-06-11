from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from app.utils.time_utils import get_utc_now


class AssetSnapshot(BaseModel):
    """資產快照模型，用於記錄用戶每日資產數據"""
    id: Optional[str] = None  # 記錄ID
    user_id: str  # 用戶ID

    # 時間戳（支持不同的時間精度）
    timestamp: Optional[datetime] = Field(default_factory=get_utc_now)  # UTC時間戳
    date: Optional[datetime] = None  # 日期（日級別精度，UTC+8時區的0點）- 手動快照使用
    hour: Optional[int] = None  # 小時（可選，用於日內多次快照）

    # 總資產數據
    total_balance: float = 0  # 總資產（現貨+理財+合約）
    spot_balance: float = 0  # 現貨資產
    funding_balance: float = 0  # 理財資產
    futures_balance: float = 0  # 合約資產

    # 合約詳細數據
    futures_wallet_balance: float = 0  # 合約錢包餘額
    futures_unrealized_pnl: float = 0  # 合約未實現盈虧
    futures_available_balance: float = 0  # 合約可用餘額
    futures_position_initial_margin: float = 0  # 合約持倉初始保證金
    futures_open_order_initial_margin: float = 0  # 合約掛單初始保證金

    # 現貨詳細數據
    spot_assets: Dict[str, Dict[str, Any]] = {}  # 現貨資產明細

    # 資產變化（相對於前一天的變化）
    daily_change: float = 0  # 日變化金額
    daily_change_percent: float = 0  # 日變化百分比

    # 元數據
    data_source: str = "scheduled"  # 數據來源：scheduled（排程）或 event（事件）
    updated_at: datetime = Field(default_factory=get_utc_now)  # 更新時間

    # 排程快照特有欄位
    created_at: Optional[datetime] = Field(default_factory=get_utc_now)  # 創建時間 - 排程快照使用

    class Config:
        json_schema_extra = {
            "example": {
                "user_id": "user123",
                "timestamp": "2023-01-01T00:00:00Z",
                "date": "2023-01-01T00:00:00+08:00",
                "hour": 8,
                "total_balance": 10000.0,
                "spot_balance": 5000.0,
                "funding_balance": 1000.0,
                "futures_balance": 4000.0,
                "futures_wallet_balance": 3000.0,
                "futures_unrealized_pnl": 1000.0,
                "futures_available_balance": 2500.0,
                "futures_position_initial_margin": 500.0,
                "futures_open_order_initial_margin": 0.0,
                "spot_assets": {
                    "BTC": {
                        "free": 0.1,
                        "locked": 0.0,
                        "price_usd": 30000.0,
                        "value_usd": 3000.0
                    },
                    "ETH": {
                        "free": 1.0,
                        "locked": 0.0,
                        "price_usd": 2000.0,
                        "value_usd": 2000.0
                    }
                },
                "daily_change": 100.0,
                "daily_change_percent": 1.0,
                "data_source": "scheduled"
            }
        }
