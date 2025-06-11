import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.user import User
from app.models.equity_curve import EquityCurve
from app.services.equity_curve_service import equity_curve_service
from app.utils.auth import get_current_user
from app.utils.time_utils import parse_date_string

router = APIRouter(prefix="/equity-curve", tags=["equity-curve"])
logger = logging.getLogger(__name__)


@router.get("", response_model=List[EquityCurve])
async def get_equity_curve(
    start_date: Optional[str] = Query(None, description="開始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="結束日期 (YYYY-MM-DD)"),
    current_user: User = Depends(get_current_user)
):
    """
    獲取用戶的資金曲線數據

    Args:
        start_date: 開始日期 (YYYY-MM-DD)
        end_date: 結束日期 (YYYY-MM-DD)
        current_user: 當前用戶

    Returns:
        List[EquityCurve]: 資金曲線數據列表
    """
    try:
        # 解析日期
        start_datetime = None
        end_datetime = None

        if start_date:
            start_datetime = parse_date_string(start_date)

        if end_date:
            end_datetime = parse_date_string(end_date)
            # 將結束日期設置為當天的23:59:59
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59)

        # 獲取資金曲線數據
        equity_curves = await equity_curve_service.get_equity_curve(
            user_id=current_user.id,
            start_date=start_datetime,
            end_date=end_datetime
        )

        return equity_curves

    except Exception as e:
        logger.error(f"獲取資金曲線數據時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取資金曲線數據時發生錯誤: {str(e)}")
