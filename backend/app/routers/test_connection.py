from fastapi import APIRouter, Depends, HTTPException, status, Body
from ..models.user import User
from app.utils.auth import get_current_user
from ..services.user_settings_service import UserSettingsService
import logging
from typing import Dict, Any
import requests
from ..services.binance_service import BinanceService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/test-connection",
    tags=["測試連接"],
    responses={404: {"description": "找不到"}},
)


@router.post("/binance")
async def test_binance_connection(
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    測試與Binance的連接
    """
    api_key = data.get("api_key")
    api_secret = data.get("api_secret")
    use_saved = data.get("use_saved", False)

    # 使用安全的方式記錄敏感數據
    masked_data = {
        "api_key": "••••••••••••••••" if api_key else None,
        "api_secret": "••••••••••••••••" if api_secret else None,
        "use_saved": use_saved
    }
    logger.info(f"Binance測試請求數據: {masked_data}")

    # 如果需要使用已保存的設定或傳入的是遮罩值
    if use_saved or (api_key and "•" in api_key) or (api_secret and "•" in api_secret):
        try:
            user_settings_service = UserSettingsService()
            user_settings = await user_settings_service.get_user_settings(current_user.id)
            api_key = user_settings.binance_api_key
            api_secret = user_settings.binance_api_secret
            logger.info("使用已保存的Binance API設定進行測試")
        except Exception as e:
            logger.error(f"獲取已保存的Binance設定失敗: {e}")
            return {
                "success": False,
                "message": "無法獲取已保存的API設定，請重新輸入"
            }

    if not api_key or not api_secret:
        return {
            "success": False,
            "message": "需要提供API密鑰和密碼"
        }

    try:
        # 使用我們的 BinanceService 類
        binance_service = BinanceService(api_key=api_key, api_secret=api_secret)

        # 檢查客戶端是否成功初始化
        if not await binance_service._ensure_initialized():
            logger.error("Binance客戶端初始化失敗")
            return {
                "success": False,
                "message": "Binance API 客戶端初始化失敗，請檢查API密鑰和密碼"
            }

        # 測試API連接（獲取賬戶信息）
        logger.info("測試Binance API連接")
        _ = await binance_service.get_account_info()  # 我們只關心是否能成功調用，不需要使用返回值
        logger.info("Binance API連接成功")

        return {
            "success": True,
            "message": "Binance API 連接成功"
        }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Binance連接測試失敗: {error_msg}")
        return {
            "success": False,
            "message": f"Binance API錯誤: {error_msg}"
        }


@router.post("/line")
async def test_line_notification(
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    測試Line Notify通知
    """
    token = data.get("token")

    # 使用安全的方式記錄敏感數據
    masked_data = {k: "••••••••••••••••" if k == "token" else v for k, v in data.items()}
    logger.info(f"Line測試請求數據: {masked_data}")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="需要提供Line Notify令牌"
        )

    try:
        # 發送測試消息到Line Notify
        url = "https://notify-api.line.me/api/notify"
        # 處理可能的編碼問題
        token_ascii = token.encode('utf-8').decode('ascii', 'ignore')
        headers = {
            "Authorization": f"Bearer {token_ascii}"
        }
        # 使用純ASCII字符的消息，避免編碼問題
        payload = {
            "message": " This is a test notification from AlphaPair"
        }

        logger.info(f"測試Line通知: {url}")

        # 使用 json 參數而不是 data 參數，讓 requests 處理編碼
        response = requests.post(url, headers=headers, data=payload)

        # 安全地獲取響應文本
        try:
            response_text = response.text
        except Exception as e:
            response_text = f"無法讀取響應文本: {str(e)}"

        logger.info(f"Line通知響應: {response.status_code} - {response_text}")

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Line Notify 連接成功"
            }
        else:
            # 安全地解析JSON響應
            try:
                error_data = response.json()
                error_msg = error_data.get("message", "未知錯誤")
            except Exception:
                error_msg = f"HTTP錯誤 {response.status_code}"

            logger.error(f"Line通知發送失敗: {error_msg}")
            return {
                "success": False,
                "message": f"Line通知發送失敗: {error_msg}"
            }
    except Exception as e:
        logger.error(f"Line通知測試失敗: {str(e)}")
        return {
            "success": False,
            "message": f"發送通知失敗: {str(e)}"
        }


@router.post("/discord")
async def test_discord_webhook(
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    測試Discord Webhook通知
    """
    webhook_url = data.get("webhook_url")
    use_saved = data.get("use_saved", False)

    # 使用安全的方式記錄敏感數據
    masked_data = {
        "webhook_url": "••••••••••••••••" if webhook_url else None,
        "use_saved": use_saved
    }
    logger.info(f"Discord測試請求數據: {masked_data}")

    # 如果需要使用已保存的設定或傳入的是遮罩值
    if use_saved or (webhook_url and "•" in webhook_url):
        try:
            user_settings_service = UserSettingsService()
            user_settings = await user_settings_service.get_user_settings(current_user.id)
            webhook_url = user_settings.notification_settings.get("discord_webhook") if user_settings.notification_settings else None
            logger.info("使用已保存的Discord Webhook設定進行測試")
        except Exception as e:
            logger.error(f"獲取已保存的Discord設定失敗: {e}")
            return {
                "success": False,
                "message": "無法獲取已保存的Webhook設定，請重新輸入"
            }

    if not webhook_url:
        return {
            "success": False,
            "message": "需要提供Discord Webhook URL"
        }

    try:
        # 發送測試消息到Discord，使用純ASCII字符
        payload = {
            "content": "🤖 This is a test notification from AlphaPair",
            "username": "AlphaPair Bot"
        }

        logger.info("測試Discord通知")
        response = requests.post(webhook_url, json=payload)

        logger.info(f"Discord通知響應: {response.status_code}")

        if response.status_code == 204:  # Discord成功返回204
            return {
                "success": True,
                "message": "Discord Webhook 連接成功"
            }
        else:
            # 安全地獲取響應文本
            try:
                response_text = response.text
                error_msg = f"HTTP {response.status_code}: {response_text}"
            except Exception:
                error_msg = f"Discord通知發送失敗: HTTP {response.status_code}"

            logger.error(error_msg)
            return {
                "success": False,
                "message": error_msg
            }
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Discord通知測試失敗: {error_msg}")
        return {
            "success": False,
            "message": f"發送通知失敗: {error_msg}"
        }


@router.post("/telegram")
async def test_telegram_notification(
    data: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user)
):
    """
    測試Telegram Bot通知
    """
    bot_token = data.get("bot_token")
    chat_id = data.get("chat_id")
    use_saved = data.get("use_saved", False)

    # 使用安全的方式記錄敏感數據
    masked_data = {
        "bot_token": "••••••••••••••••" if bot_token else None,
        "chat_id": "••••••••••••••••" if chat_id else None,
        "use_saved": use_saved
    }
    logger.info(f"Telegram測試請求數據: {masked_data}")

    # 如果需要使用已保存的設定或傳入的是遮罩值
    if use_saved or (bot_token and "•" in bot_token) or (chat_id and "•" in chat_id):
        try:
            user_settings_service = UserSettingsService()
            user_settings = await user_settings_service.get_user_settings(current_user.id)
            if user_settings.notification_settings:
                bot_token = user_settings.notification_settings.get("telegram_token")
                chat_id = user_settings.notification_settings.get("telegram_chat_id")
            logger.info("使用已保存的Telegram設定進行測試")
        except Exception as e:
            logger.error(f"獲取已保存的Telegram設定失敗: {e}")
            return {
                "success": False,
                "message": "無法獲取已保存的Telegram設定，請重新輸入"
            }

    if not bot_token:
        return {
            "success": False,
            "message": "需要提供Telegram Bot令牌"
        }

    if not chat_id:
        return {
            "success": False,
            "message": "需要提供Telegram Chat ID"
        }

    try:
        # 首先獲取bot信息以驗證token
        response = requests.get(f"https://api.telegram.org/bot{bot_token}/getMe")

        if response.status_code != 200:
            return {
                "success": False,
                "message": "Telegram Bot令牌無效"
            }

        # 發送測試消息
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": "🤖 這是來自AlphaPair的測試通知",
            "parse_mode": "HTML"
        }

        response = requests.post(url, json=payload)

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Telegram Bot 通知發送成功"
            }
        else:
            error_msg = f"HTTP錯誤 {response.status_code}"
            try:
                error_data = response.json()
                if "description" in error_data:
                    error_msg = error_data["description"]
            except Exception:
                pass

            return {
                "success": False,
                "message": f"Telegram通知發送失敗: {error_msg}"
            }
    except Exception as e:
        logger.error(f"Telegram通知測試失敗: {str(e)}")
        return {
            "success": False,
            "message": f"驗證失敗: {str(e)}"
        }


@router.get("/binance")
async def test_binance_connection_get(current_user: User = Depends(get_current_user)):
    """
    測試當前用戶的Binance API連接
    """
    # 使用用戶ID初始化BinanceService
    binance_service = BinanceService(user_id=current_user.id)

    # 確保客戶端已初始化
    initialized = await binance_service._ensure_initialized()
    if not initialized:
        return {"status": "failed", "message": "無法初始化Binance客戶端，請檢查API設定"}

    # 測試連接
    is_connected = await binance_service.test_connection()
    return {"status": "success" if is_connected else "failed"}
