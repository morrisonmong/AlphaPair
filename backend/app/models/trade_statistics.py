from pydantic import BaseModel, Field


class TradeStatistics(BaseModel):
    """交易統計數據模型"""
    total_trades: int = Field(0, description="總交易次數")
    winning_trades: int = Field(0, description="獲利交易次數")
    losing_trades: int = Field(0, description="虧損交易次數")
    win_rate: float = Field(0, description="勝率 (%)")

    avg_profit: float = Field(0, description="平均獲利 (USDT)")
    avg_loss: float = Field(0, description="平均虧損 (USDT)")
    profit_factor: float = Field(0, description="獲利因子 (總獲利/總虧損)")

    avg_risk_reward_ratio: float = Field(0, description="平均風險收益比 (總盈虧/最大虧損)")
    avg_net_risk_reward_ratio: float = Field(
        0, description="平均淨風險收益比 (淨盈虧/最大虧損)")

    total_profit: float = Field(0, description="總獲利 (USDT)")
    total_loss: float = Field(0, description="總虧損 (USDT)")
    net_profit: float = Field(0, description="淨盈虧 (USDT)")

    max_drawdown: float = Field(0, description="最大回撤 (USDT)")
    volatility: float = Field(0, description="波動率 (標準差)")

    class Config:
        populate_by_name = True
