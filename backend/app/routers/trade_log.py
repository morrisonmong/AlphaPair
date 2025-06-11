import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime

from app.models.trade_log import TradeLog
from app.services.trade_log_service import trade_log_service
from app.auth.auth_bearer import JWTBearer, get_current_user
from app.utils.time_utils import parse_date_string

router = APIRouter(
    prefix="/api/trade-logs",
    tags=["trade_logs"],
    dependencies=[Depends(JWTBearer())]
)

logger = logging.getLogger(__name__)


@router.get("/", response_model=List[TradeLog])
async def get_trade_logs(
    trade_id: Optional[str] = Query(None, description="交易ID"),
    action: Optional[str] = Query(
        None, description="動作類型 (open, close, update, error, notification)"),
    status: Optional[str] = Query(
        None, description="狀態 (success, failed, warning)"),
    start_date: Optional[str] = Query(None, description="開始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="結束日期 (YYYY-MM-DD)"),
    limit: int = Query(100, description="限制數量"),
    skip: int = Query(0, description="跳過數量"),
    current_user: dict = Depends(get_current_user)
):
    """
    獲取用戶的交易日誌

    Args:
        trade_id: 交易ID (可選)
        action: 動作類型 (可選)
        status: 狀態 (可選)
        start_date: 開始日期 (可選)
        end_date: 結束日期 (可選)
        limit: 限制數量 (預設100)
        skip: 跳過數量 (預設0)
        current_user: 當前用戶

    Returns:
        List[TradeLog]: 交易日誌列表
    """
    try:
        user_id = current_user["id"]

        # 解析日期
        start_datetime = None
        end_datetime = None

        if start_date:
            start_datetime = parse_date_string(start_date)

        if end_date:
            end_datetime = parse_date_string(end_date)
            # 將結束日期設置為當天的23:59:59
            end_datetime = end_datetime.replace(hour=23, minute=59, second=59)

        logs = await trade_log_service.get_trade_logs(
            user_id=user_id,
            trade_id=trade_id,
            action=action,
            status=status,
            start_date=start_datetime,
            end_date=end_datetime,
            limit=limit,
            skip=skip
        )
        return logs
    except Exception as e:
        logger.error(f"獲取交易日誌時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取交易日誌失敗: {str(e)}")


@router.get("/{trade_id}", response_model=List[TradeLog])
async def get_trade_logs_by_trade_id(
    trade_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    根據交易ID獲取交易日誌

    Args:
        trade_id: 交易ID
        current_user: 當前用戶

    Returns:
        List[TradeLog]: 交易日誌列表
    """
    try:
        logs = await trade_log_service.get_trade_logs_by_trade_id(trade_id)

        # 檢查是否有權限訪問該交易的日誌
        if logs and logs[0].user_id != current_user["id"]:
            raise HTTPException(status_code=403, detail="無權訪問該交易的日誌")

        return logs
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取交易日誌時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"獲取交易日誌失敗: {str(e)}")
