from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user_settings import UserSettingsUpdate
from app.services.user_settings_service import user_settings_service
from app.utils.auth import get_current_user
from app.utils.safe_logging import filter_sensitive_data
from app.models.user import User
from pydantic import BaseModel
from typing import Dict, Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/user",
    tags=["user_settings"],
    responses={404: {"description": "Not found"}},
)


class SettingsStatusResponse(BaseModel):
    """設定狀態響應模型"""
    binance_api_key: bool
    binance_api_secret: bool
    notification_settings: Dict[str, bool]
    timezone: str


@router.get("/settings")
async def get_user_settings(current_user: User = Depends(get_current_user)):
    """
    獲取當前用戶的設定（包含敏感資訊，僅用於內部使用）
    """
    try:
        settings = await user_settings_service.get_user_settings(current_user.id)
        return settings
    except Exception as e:
        logger.error(f"獲取用戶設定時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="獲取用戶設定時出錯"
        )


@router.get("/settings/status")
async def get_user_settings_status(current_user: User = Depends(get_current_user)):
    """
    獲取當前用戶的設定狀態（不包含敏感資訊，僅返回是否已配置）
    """
    try:
        settings = await user_settings_service.get_user_settings(current_user.id)

        # 安全地記錄用戶設定狀態（過濾敏感資料）
        safe_settings = filter_sensitive_data(settings.dict() if hasattr(settings, 'dict') else settings)
        logger.info(f"獲取用戶設定狀態: {safe_settings}")

        # 創建通知設置狀態
        notification_status = {}
        if settings.notification_settings:
            for key, value in settings.notification_settings.items():
                notification_status[key] = value is not None and value != ""

        # 創建狀態響應
        status_response = SettingsStatusResponse(
            binance_api_key=settings.binance_api_key is not None and settings.binance_api_key != "",
            binance_api_secret=settings.binance_api_secret is not None and settings.binance_api_secret != "",
            notification_settings=notification_status,
            timezone=settings.timezone
        )

        # 安全地記錄返回的狀態響應
        safe_response = filter_sensitive_data(status_response.dict())
        logger.info(f"返回用戶設定狀態: {safe_response}")
        return status_response
    except Exception as e:
        logger.error(f"獲取用戶設定狀態時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="獲取用戶設定狀態時出錯"
        )


@router.post("/settings")
async def update_user_settings(
    settings_update: UserSettingsUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    更新用戶設定
    """
    try:
        updated_settings = await user_settings_service.update_user_settings(
            current_user.id,
            settings_update
        )

        # 創建通知設置狀態
        notification_status = {}
        if updated_settings.notification_settings:
            for key, value in updated_settings.notification_settings.items():
                notification_status[key] = value is not None and value != ""

        # 創建狀態響應，不返回敏感資訊
        status_response = SettingsStatusResponse(
            binance_api_key=updated_settings.binance_api_key is not None and updated_settings.binance_api_key != "",
            binance_api_secret=updated_settings.binance_api_secret is not None and updated_settings.binance_api_secret != "",
            notification_settings=notification_status,
            timezone=updated_settings.timezone
        )

        # 安全地記錄返回的狀態響應
        safe_response = filter_sensitive_data(status_response.dict())
        logger.info(f"返回更新後的設定狀態: {safe_response}")
        return status_response
    except Exception as e:
        logger.error(f"更新用戶設定時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新用戶設定時出錯"
        )


@router.delete("/settings")
async def delete_user_settings(current_user: User = Depends(get_current_user)):
    """
    刪除用戶設定
    """
    try:
        result = await user_settings_service.delete_user_settings(current_user.id)
        return {"success": result}
    except Exception as e:
        logger.error(f"刪除用戶設定時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="刪除用戶設定時出錯"
        )


@router.delete("/settings/all")
async def clear_all_settings(current_user: User = Depends(get_current_user)):
    """
    清除所有用戶設定（僅用於測試）
    """
    try:
        # 檢查用戶是否有權限
        if current_user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="只有管理員可以執行此操作"
            )

        # 使用 user_settings_service 來清除所有用戶設置
        deleted_count = await user_settings_service.clear_all_settings()

        return {"success": True, "deleted_count": deleted_count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"清除所有用戶設定時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"清除所有用戶設定時出錯: {str(e)}"
        )


@router.post("/reset-api-keys")
async def reset_api_keys(
    current_user: User = Depends(get_current_user)
):
    """
    臨時路由：重置用戶的 API 金鑰設置
    """
    try:
        # 創建一個只包含 API 金鑰字段的更新對象
        settings_update = UserSettingsUpdate(
            binance_api_key="",
            binance_api_secret=""
        )

        # 更新用戶設置
        await user_settings_service.update_user_settings(current_user.id, settings_update)

        logger.info(f"已重置用戶 {current_user.id} 的 API 金鑰設置")

        return {"status": "success", "message": "API 金鑰已重置"}
    except Exception as e:
        logger.error(f"重置 API 金鑰時發生錯誤: {e}")
        raise HTTPException(status_code=500, detail=f"重置 API 金鑰失敗: {str(e)}")


@router.get("/timezones")
async def get_available_timezones():
    """
    獲取可用的時區列表
    """
    try:
        # 常用時區列表
        common_timezones = [
            "Asia/Taipei",      # 台北 (UTC+8)
            "Asia/Shanghai",    # 上海 (UTC+8)
            "Asia/Hong_Kong",   # 香港 (UTC+8)
            "Asia/Tokyo",       # 東京 (UTC+9)
            "Asia/Seoul",       # 首爾 (UTC+9)
            "Asia/Singapore",   # 新加坡 (UTC+8)
            "Australia/Sydney",  # 悉尼 (UTC+10/+11)
            "Europe/London",    # 倫敦 (UTC+0/+1)
            "Europe/Paris",     # 巴黎 (UTC+1/+2)
            "America/New_York",  # 紐約 (UTC-5/-4)
            "America/Chicago",  # 芝加哥 (UTC-6/-5)
            "America/Los_Angeles",  # 洛杉磯 (UTC-8/-7)
            "UTC"               # 協調世界時
        ]

        return {"timezones": common_timezones}
    except Exception as e:
        logger.error(f"獲取時區列表時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="獲取時區列表時出錯"
        )


class TimeConversionRequest(BaseModel):
    """時間轉換請求模型"""
    datetime_str: str  # 時間字符串
    source_timezone: Optional[str] = "UTC"  # 源時區
    target_timezone: Optional[str] = "Asia/Taipei"  # 目標時區


@router.post("/convert_time")
async def convert_time(request: TimeConversionRequest):
    """
    時間轉換工具
    """
    try:
        from datetime import datetime
        import pytz

        # 解析時間字符串
        dt = datetime.fromisoformat(request.datetime_str.replace('Z', '+00:00'))

        # 設置源時區
        source_tz = pytz.timezone(request.source_timezone)
        if dt.tzinfo is None:
            dt = source_tz.localize(dt)
        else:
            dt = dt.astimezone(source_tz)

        # 轉換到目標時區
        target_tz = pytz.timezone(request.target_timezone)
        converted_dt = dt.astimezone(target_tz)

        return {
            "original": {
                "datetime": dt.isoformat(),
                "timezone": request.source_timezone
            },
            "converted": {
                "datetime": converted_dt.isoformat(),
                "timezone": request.target_timezone
            }
        }
    except Exception as e:
        logger.error(f"時間轉換時出錯: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"時間轉換失敗: {str(e)}"
        )
