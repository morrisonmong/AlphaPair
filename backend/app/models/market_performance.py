from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field
from bson import ObjectId

from app.utils.time_utils import get_utc_plus_8_now


class MarketPerformance(BaseModel):
    """市場表現模型"""
    id: Optional[str] = Field(default_factory=lambda: str(ObjectId()))
    user_id: str  # 用戶ID
    market: str  # 市場/交易對

    # 基本統計
    total_trades: int = 0  # 總交易次數
    winning_trades: int = 0  # 獲利交易次數
    losing_trades: int = 0  # 虧損交易次數
    win_rate: float = 0  # 勝率

    # 盈虧統計
    total_profit: float = 0  # 總獲利
    total_loss: float = 0  # 總虧損
    net_profit: float = 0  # 淨盈虧
    profit_factor: float = 0  # 獲利因子

    # 風險指標
    max_drawdown: float = 0  # 最大回撤
    max_drawdown_percent: float = 0  # 最大回撤百分比

    # 交易指標
    avg_profit: float = 0  # 平均獲利
    avg_loss: float = 0  # 平均虧損
    avg_trade: float = 0  # 平均交易盈虧
    largest_profit: float = 0  # 最大獲利
    largest_loss: float = 0  # 最大虧損
    avg_duration: int = 0  # 平均持倉時間（秒）

    # 其他指標
    volatility: float = 0  # 波動率

    # 時間信息
    first_trade_date: Optional[datetime] = None  # 第一筆交易日期
    last_trade_date: Optional[datetime] = None  # 最後一筆交易日期

    recorded_at: datetime = Field(default_factory=get_utc_plus_8_now)

    class Config:
        populate_by_name = True
