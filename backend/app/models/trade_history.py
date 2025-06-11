from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from app.utils.time_utils import get_utc_now


class TradePosition(BaseModel):
    """交易持倉信息"""
    symbol: Optional[str] = None  # 交易對符號（選填交易對符號），例如 BTCUSDT
    side: str    # 方向，BUY 或 SELL
    quantity: Optional[float] = None  # 數量
    entry_price: Optional[float] = None  # 入場價格
    current_price: Optional[float] = None  # 當前價格
    exit_price: Optional[float] = None  # 平倉價格
    pnl: Optional[float] = None  # 盈虧金額
    pnl_percent: Optional[float] = None  # 盈虧百分比
    entry_order_id: Optional[str] = None  # 開倉訂單ID
    notional_value: Optional[float] = None  # 名義價值（數量 * 價格）
    entry_fee: Optional[float] = None  # 開倉手續費
    exit_fee: Optional[float] = None  # 平倉手續費
    exit_order_id: Optional[str] = None  # 平倉訂單ID
    leverage: Optional[float] = 1  # 槓桿倍數


class TradeHistory(BaseModel):
    """交易歷史記錄模型"""
    id: Optional[str] = None  # 記錄ID（用於API響應）
    user_id: str  # 用戶ID
    trade_id: str  # 原始交易ID（存儲原始交易的_id字符串）

    # === 必填欄位 (7個) ===
    trade_name: str  # 交易名稱
    created_at: datetime  # 開倉時間
    closed_at: datetime  # 平倉時間
    total_pnl: float  # 總盈虧
    close_reason: str  # 平倉原因
    max_loss: float  # 最大虧損額度 (1R金額)
    total_fee: float  # 總手續費

    # === 選填欄位 ===
    # 基本選填欄位
    stop_loss: Optional[float] = None  # 止損百分比（選填）
    take_profit: Optional[float] = None  # 止盈百分比（選填）
    total_ratio_percent: Optional[float] = None  # 總盈虧百分比（選填）

    mae: Optional[float] = None  # 最大不利變動 (MAE)（選填）
    mfe: Optional[float] = None  # 最大有利變動 (MFE)（選填）

    # 交易持倉詳細資訊

    # 風險指標
    max_ratio: Optional[float] = None  # 最高比率（多空價格比）（選填）
    min_ratio: Optional[float] = None  # 最低比率（多空價格比）（選填）

    # 交易類型
    trade_type: Optional[str] = "pair_trade"  # 交易類型，默認為配對交易（選填）

    # 詳細手續費資訊
    total_entry_fee: Optional[float] = None  # 開倉總手續費（選填）
    total_exit_fee: Optional[float] = None  # 平倉總手續費（選填）

    # 時間和其他計算資訊
    net_pnl: Optional[float] = None  # 淨盈虧（扣除手續費）（選填）
    risk_reward_ratio: Optional[float] = None  # 風險收益比（總盈虧/最大虧損）（選填）
    net_risk_reward_ratio: Optional[float] = None  # 淨風險收益比（淨盈虧/最大虧損）（選填）
    duration_seconds: Optional[int] = None  # 交易持續時間（秒）（選填）
    leverage: Optional[float] = 1  # 槓桿倍數（選填）

    # 持倉信息（從匯入資料創建，選填）
    long_position: Optional[TradePosition] = None  # 多單持倉
    short_position: Optional[TradePosition] = None  # 空單持倉

    # 記錄時間
    recorded_at: datetime = Field(default_factory=get_utc_now)

    # 導入會話ID（用於批量撤銷導入的記錄）
    import_session_id: Optional[str] = None

    class Config:
        populate_by_name = True
