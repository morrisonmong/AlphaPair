import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user import User
from app.models.trade_performance import TradePerformance
from app.services.trade_performance_service import trade_performance_service
from app.utils.auth import get_current_user
from app.utils.time_utils import parse_date_string

router = APIRouter(prefix="/trade-performance", tags=["trade-performance"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[TradePerformance])
async def get_trade_performance(
    period: str = Query(..., description="時間段 (daily, weekly, monthly)"),
    start_date: Optional[str] = Query(None, description="開始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="結束日期 (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    獲取用戶的交易表現數據

    Args:
        period: 時間段 (daily, weekly, monthly)
        start_date: 開始日期 (YYYY-MM-DD)
        end_date: 結束日期 (YYYY-MM-DD)
        current_user: 當前用戶

    Returns:
        List[TradePerformance]: 交易表現數據列表
    """
    try:
        # 驗證時間段
        if period not in ["daily", "weekly", "monthly"]:
            raise HTTPException(
                status_code=400, detail="無效的時間段，必須是 daily, weekly 或 monthly")

        # 解析日期
        start_datetime = None
        end_datetime = None

        if start_date:
            start_datetime = parse_date_string(start_date)

        if end_date:
            end_datetime = parse_date_string(end_date)
            # 將結束日期設置為當天的23:59:59
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59)

        # 獲取交易表現數據
        performances = await trade_performance_service.get_performance(
            user_id=current_user.id,
            period=period,
            start_date=start_datetime,
            end_date=end_datetime
        )

        return performances

    except Exception as e:
        logger.error(f"獲取交易表現數據時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取交易表現數據時發生錯誤: {str(e)}")
