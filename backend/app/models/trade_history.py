from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.utils.time_utils import get_utc_now


class TradePosition(BaseModel):
    """交易持倉信息"""
    symbol: str  # 交易對符號，例如 BTCUSDT
    side: str    # 方向，BUY 或 SELL
    quantity: float  # 數量
    entry_price: float  # 入場價格
    current_price: float = 0  # 當前價格
    exit_price: float = 0  # 平倉價格
    pnl: float = 0  # 盈虧金額
    pnl_percent: float = 0  # 盈虧百分比
    entry_order_id: str  # 開倉訂單ID
    notional_value: float  # 名義價值（數量 * 價格）
    entry_fee: float = 0  # 開倉手續費
    exit_fee: float = 0  # 平倉手續費
    exit_order_id: str = ""  # 平倉訂單ID
    leverage: float = 1  # 槓桿倍數


class TradeHistory(BaseModel):
    """交易歷史記錄模型"""
    id: Optional[str] = None  # 記錄ID（用於API響應）
    user_id: str  # 用戶ID
    trade_id: str  # 原始交易ID（存儲原始交易的_id字符串）
    trade_name: str  # 交易名稱
    trade_type: str = "pair_trade"  # 交易類型，默認為配對交易
    max_loss: float  # 最大虧損額度
    stop_loss: float  # 止損百分比
    take_profit: float  # 止盈百分比
    long_position: Optional[TradePosition] = None  # 多單持倉
    short_position: Optional[TradePosition] = None  # 空單持倉

    # 盈虧信息
    total_pnl: float  # 總盈虧
    net_pnl: float  # 淨盈虧（扣除手續費）
    total_ratio_percent: float  # 總盈虧百分比

    # 手續費信息
    total_fee: float  # 總手續費
    total_entry_fee: float = 0  # 開倉總手續費
    total_exit_fee: float = 0  # 平倉總手續費

    # 風險收益比
    risk_reward_ratio: float = 0  # 風險收益比（總盈虧/最大虧損）
    net_risk_reward_ratio: float = 0  # 淨風險收益比（淨盈虧/最大虧損）

    # 最大不利變動 (MAE) & 最大有利變動 (MFE)
    max_ratio: float = 0  # 最高比率（多空價格比）
    min_ratio: float = 0  # 最低比率（多空價格比）
    mae: Optional[float] = 0  # 最大不利變動 (MAE)
    mfe: Optional[float] = 0  # 最大有利變動 (MFE)

    # 時間信息
    created_at: datetime  # 開倉時間
    closed_at: datetime  # 平倉時間
    duration_seconds: int  # 交易持續時間（秒）

    # 其他信息
    close_reason: str  # 平倉原因
    leverage: float = 1  # 槓桿倍數

    # 記錄時間
    recorded_at: datetime = Field(default_factory=get_utc_now)

    # 導入會話ID（用於批量撤銷導入的記錄）
    import_session_id: Optional[str] = None

    class Config:
        populate_by_name = True
