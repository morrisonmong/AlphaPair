from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId

from app.utils.time_utils import get_utc_plus_8_now


class EquityCurve(BaseModel):
    """資金曲線模型"""
    id: Optional[str] = Field(default_factory=lambda: str(ObjectId()))
    user_id: str  # 用戶ID
    date: datetime  # 日期
    equity: float  # 資金總額
    daily_pnl: float  # 當日盈虧
    daily_pnl_percent: float  # 當日盈虧百分比
    drawdown: float  # 當前回撤
    drawdown_percent: float  # 當前回撤百分比
    peak_equity: float  # 歷史最高資金
    trades_count: int = 0  # 當日交易次數
    winning_trades: int = 0  # 當日獲利交易次數
    losing_trades: int = 0  # 當日虧損交易次數
    recorded_at: datetime = Field(default_factory=get_utc_plus_8_now)

    class Config:
        populate_by_name = True
