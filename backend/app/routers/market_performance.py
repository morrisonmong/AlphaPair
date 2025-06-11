import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.market_performance import MarketPerformance
from app.services.market_performance_service import market_performance_service
from app.auth.auth_bearer import JWTBearer, get_current_user

router = APIRouter(
    prefix="/api/market-performance",
    tags=["market_performance"],
    dependencies=[Depends(JWTBearer())]
)

logger = logging.getLogger(__name__)


@router.get("/", response_model=List[MarketPerformance])
async def get_market_performance(
    market: Optional[str] = Query(None, description="市場/交易對，如果為None則獲取所有市場"),
    current_user: dict = Depends(get_current_user)
):
    """
    獲取用戶的市場表現數據

    Args:
        market: 市場/交易對，如果為None則獲取所有市場
        current_user: 當前用戶

    Returns:
        List[MarketPerformance]: 市場表現列表
    """
    try:
        user_id = current_user["id"]
        performances = await market_performance_service.get_market_performance(
            user_id=user_id,
            market=market
        )
        return performances
    except Exception as e:
        logger.error(f"獲取市場表現數據時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取市場表現數據失敗: {str(e)}")
