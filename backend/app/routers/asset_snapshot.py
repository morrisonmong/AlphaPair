import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status, Body

from app.models.asset_snapshot import AssetSnapshot
from app.models.user import User
from app.services.asset_snapshot_service import asset_snapshot_service
from app.utils.auth import get_current_user
from app.utils.time_utils import get_start_of_day, get_utc_plus_8_now

logger = logging.getLogger(__name__)

# 為了解決307重定向問題，啟用了兩個不同路徑的相同API端點
router = APIRouter(
    tags=["asset-snapshots"],
    responses={404: {"description": "Not found"}},
)


@router.get("/asset-snapshots", response_model=List[AssetSnapshot])
@router.get("/api/asset-snapshots", response_model=List[AssetSnapshot])
async def get_asset_snapshots(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    days: Optional[int] = Query(None, description="最近天數"),
    interval: str = Query("day", description="時間間隔，'day' 或 'hour'"),
    current_user: User = Depends(get_current_user)
):
    """
    獲取資產快照列表 - 支持原始路徑/asset-snapshots和新路徑/api/asset-snapshots
    """
    try:
        # 記錄請求資訊
        print(
            f"收到資產快照請求: days={days}, interval={interval}, user_id={current_user.id}")

        # 處理時間範圍
        if days is not None:
            end_date = get_utc_plus_8_now()
            start_date = get_start_of_day(end_date - timedelta(days=days))
        elif start_date is None and end_date is None:
            # 預設獲取最近30天
            end_date = get_utc_plus_8_now()
            start_date = get_start_of_day(end_date - timedelta(days=30))

        # 獲取資產快照
        snapshots = await asset_snapshot_service.get_asset_snapshots(
            user_id=current_user.id,
            start_date=start_date,
            end_date=end_date,
            interval=interval
        )

        print(f"返回{len(snapshots)}筆資產快照記錄")
        return snapshots
    except Exception as e:
        print(f"獲取資產快照失敗: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取資產快照失敗: {str(e)}"
        )


@router.post("/asset-snapshots/create", response_model=AssetSnapshot)
@router.post("/api/asset-snapshots/create", response_model=AssetSnapshot)
async def create_asset_snapshot(
    request: Dict[str, Any] = Body(..., example={"source": "binance", "refresh": True}),
    current_user: User = Depends(get_current_user)
):
    """
    手動創建當前資產快照 - 支持原始路徑和新路徑

    參數:
    - source: 可選，數據來源 "binance" 或 "manual"
    - refresh: 可選，是否強制刷新數據緩存
    """
    try:
        # 獲取請求參數
        source = request.get("source", "manual")
        force_refresh = request.get("refresh", False)

        logger.info(f"使用者 {current_user.id} 請求創建資產快照，來源: {source}，強制刷新: {force_refresh}")

        # 獲取資產數據
        asset_data = await asset_snapshot_service.get_user_asset_data(
            current_user.id,
            force_refresh=force_refresh
        )

        if not asset_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法獲取資產數據，請檢查幣安API設置"
            )

        logger.info(f"成功獲取用戶 {current_user.id} 的資產數據: {asset_data.get('total_balance')} USDT")

        # 創建資產快照
        snapshot = await asset_snapshot_service.create_asset_snapshot(
            user_id=current_user.id,
            snapshot_data=asset_data,
            data_source=source  # 使用請求中指定的來源
        )

        if not snapshot:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="創建資產快照失敗"
            )

        logger.info(f"成功為用戶 {current_user.id} 創建資產快照，ID: {snapshot.id}")
        return snapshot
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"創建資產快照失敗: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"創建資產快照失敗: {str(e)}"
        )
