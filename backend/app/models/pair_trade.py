from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, PositiveFloat

from app.utils.time_utils import get_utc_now


# 定義 UTC+8 時區 (僅用於向後兼容)
UTC_PLUS_8 = timezone(timedelta(hours=8))


# 獲取 UTC+8 當前時間的函數 - 已移至 time_utils.py
# def get_utc_plus_8_now():
#     """獲取 UTC+8 時區的當前時間"""
#     return datetime.now(UTC_PLUS_8)


class TradeStatus(str, Enum):
    """交易狀態枚舉"""
    PENDING = "pending"  # 等待執行
    ACTIVE = "active"    # 活躍中
    CLOSED = "closed"    # 已平倉
    FAILED = "failed"    # 執行失敗


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


class PairTrade(BaseModel):
    """配對交易模型"""
    id: Optional[str] = None  # 交易ID（用於API響應）
    user_id: str  # 用戶ID
    name: str  # 交易名稱
    status: TradeStatus = TradeStatus.PENDING  # 交易狀態
    max_loss: float  # 最大虧損額度（USDT）
    stop_loss: float  # 止損百分比
    take_profit: float  # 止盈百分比
    # 新增停利相關欄位
    trailing_stop_enabled: bool = False  # 是否啟用停利保護
    trailing_stop_level: float = 0  # 停利水位百分比
    long_position: Optional[TradePosition] = None  # 多單持倉
    short_position: Optional[TradePosition] = None  # 空單持倉
    total_pnl_value: float = 0  # 總盈虧金額
    total_ratio_percent: float = 0  # 總盈虧百分比
    total_fee: float = 0  # 總手續費
    total_entry_fee: float = 0  # 開倉總手續費
    total_exit_fee: float = 0  # 平倉總手續費
    max_ratio: float = 0  # 最高比率（多空價格比）
    min_ratio: float = 0  # 最低比率（多空價格比）
    mae: float = 0  # 最大不利變動 (MAE)
    mfe: float = 0  # 最大有利變動 (MFE)
    net_pnl: float = 0  # 淨盈虧（扣除手續費）
    total_pnl: float = 0  # 總盈虧（未扣除手續費）
    leverage: float = 1  # 槓桿倍數
    long_leverage: float = 1  # 多單槓桿倍數
    short_leverage: float = 1  # 空單槓桿倍數
    risk_reward_ratio: float = 0  # 風險收益比
    net_risk_reward_ratio: float = 0  # 淨風險收益比
    # 使用 UTC 時間
    created_at: datetime = Field(
        default_factory=get_utc_now
    )  # 創建時間
    updated_at: datetime = Field(
        default_factory=get_utc_now
    )  # 更新時間
    closed_at: Optional[datetime] = None  # 平倉時間
    close_reason: Optional[str] = None  # 平倉原因


class PairTradeCreate(BaseModel):
    """創建配對交易的請求模型"""
    name: Optional[str] = ""  # 交易名稱（可選，如果為空則自動生成）
    max_loss: float  # 最大虧損額度（USDT），1R unit
    stop_loss: float  # 止損百分比
    take_profit: float  # 止盈百分比
    long_symbol: str  # 多單交易對符號
    short_symbol: str  # 空單交易對符號
    long_leverage: float = 1  # 多單槓桿倍數
    short_leverage: float = 1  # 空單槓桿倍數
    margin_type: str = "ISOLATED"  # 保證金類型，ISOLATED 或 CROSSED
    test_mode: bool = False  # 測試模式，不執行實際交易


class PairTradeResponse(BaseModel):
    """配對交易響應模型"""
    id: str
    name: str
    status: str
    max_loss: float
    stop_loss: float
    take_profit: float
    # 新增停利相關欄位
    trailing_stop_enabled: bool = False
    trailing_stop_level: float = 0
    long_position: Optional[Dict[str, Any]] = None
    short_position: Optional[Dict[str, Any]] = None
    total_pnl_value: float
    total_ratio_percent: float
    total_fee: float = 0  # 總手續費
    total_entry_fee: float = 0  # 開倉總手續費
    total_exit_fee: float = 0  # 平倉總手續費
    max_ratio: float = 0  # 最高比率（多空價格比）
    min_ratio: float = 0  # 最低比率（多空價格比）
    mae: float = 0  # 最大不利變動 (MAE)
    mfe: float = 0  # 最大有利變動 (MFE)
    net_pnl: float = 0  # 淨盈虧（扣除手續費）
    total_pnl: float = 0  # 總盈虧（未扣除手續費）
    leverage: float = 1  # 槓桿倍數
    risk_reward_ratio: float = 0  # 風險收益比
    net_risk_reward_ratio: float = 0  # 淨風險收益比
    created_at: datetime
    updated_at: datetime
    closed_at: Optional[datetime] = None
    close_reason: Optional[str] = None


class PairTradeSummaryResponse(BaseModel):
    total_active: int
    total_closed: int
    overall_pnl: float
    # 可在此添加更多匯總信息


class PairTradeSettingsUpdate(BaseModel):
    """
    用於更新配對交易止盈/止損設定的模型
    """
    take_profit: Optional[PositiveFloat] = Field(None, description="新的止盈百分比 (例如輸入 5 表示 5%)")
    stop_loss: Optional[PositiveFloat] = Field(None, description="新的止損百分比 (例如輸入 3 表示 3%)")
    # 新增停利相關欄位
    trailing_stop_enabled: Optional[bool] = Field(None, description="是否啟用停利保護")
    trailing_stop_level: Optional[float] = Field(None, ge=0, description="停利水位百分比 (例如輸入 8 表示 8%)")

    class Config:
        extra = "forbid"


class BulkActionRequest(BaseModel):
    trade_ids: List[str]
    action: str  # e.g., "close", "delete"
