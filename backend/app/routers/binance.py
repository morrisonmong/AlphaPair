from fastapi import APIRouter, Depends, HTTPException, status
from ..models.user import User
from ..utils.auth import get_current_user
from app.services.binance_service import BinanceService
from app.services.user_settings_service import UserSettingsService
import logging
import traceback

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/binance",
    tags=["binance"],
    responses={404: {"description": "Not found"}},
)

# 實例化服務
user_settings_service = UserSettingsService()


@router.get("/account")
async def get_binance_account(current_user: User = Depends(get_current_user)):
    """
    獲取幣安賬戶資訊
    """
    try:
        # 使用用戶ID初始化幣安服務
        binance_service = BinanceService(user_id=current_user.id)

        # 確保客戶端已初始化
        if not await binance_service._ensure_initialized():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API或API配置無效，請先在設定頁面配置"
            )

        # 檢查連接
        if not await binance_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 獲取賬戶資訊
        account_info = await binance_service.get_account_info()

        # 處理餘額資訊，只返回有餘額的資產
        balances = account_info.get("balances", [])
        non_zero_balances = [
            {
                "asset": balance["asset"],
                "free": float(balance["free"]),
                "locked": float(balance["locked"]),
                "total": float(balance["free"]) + float(balance["locked"])
            }
            for balance in balances
            if float(balance["free"]) > 0 or float(balance["locked"]) > 0
        ]

        # 按總餘額排序
        non_zero_balances.sort(key=lambda x: x["total"], reverse=True)

        # 返回處理後的賬戶資訊
        return {
            "account_type": "spot",  # 現貨賬戶
            "can_trade": account_info.get("canTrade", False),
            "can_withdraw": account_info.get("canWithdraw", False),
            "can_deposit": account_info.get("canDeposit", False),
            "balances": non_zero_balances
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取幣安賬戶資訊失敗: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取幣安賬戶資訊失敗: {str(e)}"
        )


@router.get("/futures/account")
async def get_binance_futures_account(current_user: User = Depends(get_current_user)):
    """
    獲取幣安期貨賬戶資訊
    """
    try:
        # 使用用戶ID初始化幣安服務
        binance_service = BinanceService(user_id=current_user.id)

        # 確保客戶端已初始化
        if not await binance_service._ensure_initialized():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API或API配置無效，請先在設定頁面配置"
            )

        # 檢查連接
        if not await binance_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 獲取期貨賬戶資訊
        futures_account = await binance_service.get_futures_account_info()

        # 獲取持倉資訊
        positions = await binance_service.get_futures_positions()

        # 返回處理後的期貨賬戶資訊
        return {
            "account_type": "futures",  # 期貨賬戶
            "total_wallet_balance": float(futures_account.get("totalWalletBalance", 0)),
            "total_unrealized_profit": float(futures_account.get("totalUnrealizedProfit", 0)),
            "total_margin_balance": float(futures_account.get("totalMarginBalance", 0)),
            "available_balance": float(futures_account.get("availableBalance", 0)),
            "positions": positions
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取幣安期貨賬戶資訊失敗: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取幣安期貨賬戶資訊失敗: {str(e)}"
        )


@router.get("/account/value")
async def get_account_value(current_user: User = Depends(get_current_user)):
    """
    獲取用戶的幣安賬戶資產總價值（USDT）
    """
    try:
        # 初始化Binance服務
        binance_service = BinanceService(user_id=current_user.id)

        # 確保客戶端已初始化
        if not await binance_service._ensure_initialized():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API或API配置無效，請先在設定頁面配置"
            )

        # 檢查連接
        if not await binance_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 獲取現貨賬戶資產價值
        spot_value = await binance_service.get_account_balance_in_usdt()

        # 獲取期貨賬戶
        futures_account = await binance_service.get_futures_account_info()

        # 計算理財資產價值（從spot_value中過濾LD開頭的資產）
        funding_assets = [
            asset for asset in spot_value.get("balances", [])
            if asset.get("asset", "").startswith("LD")
        ]

        funding_value = sum(asset.get("value_usdt", 0)
                            for asset in funding_assets)

        # 計算非理財的現貨資產價值
        spot_assets = [
            asset for asset in spot_value.get("balances", [])
            if not asset.get("asset", "").startswith("LD")
        ]

        spot_assets_value = sum(asset.get("value_usdt", 0)
                                for asset in spot_assets)

        # 計算期貨賬戶總價值
        futures_value = 0
        if futures_account:
            futures_value = float(futures_account.get("totalWalletBalance", 0)) + \
                float(futures_account.get("totalUnrealizedProfit", 0))

        # 計算總資產價值
        total_value = spot_assets_value + funding_value + futures_value

        # 格式化資產分佈數據
        balances = spot_value.get("balances", [])

        # 返回結果
        return {
            "total_value": total_value,
            "spot_assets_value": spot_assets_value,
            "funding_assets_value": funding_value,
            "futures_assets_value": futures_value,
            "balances": balances
        }
    except Exception as e:
        logger.error(f"獲取賬戶總價值失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取賬戶總價值失敗: {str(e)}"
        )


@router.get("/account/summary")
async def get_account_summary(current_user: User = Depends(get_current_user)):
    """
    獲取幣安賬戶摘要信息，包括總資產價值、現貨價值、理財價值和期貨價值
    """
    try:
        # 使用用戶ID初始化幣安服務
        binance_service = BinanceService(user_id=current_user.id)

        # 確保客戶端已初始化
        if not await binance_service._ensure_initialized():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API或API配置無效，請先在設定頁面配置"
            )

        # 使用新的get_user_asset_data函數獲取資產數據
        user_asset_data = await binance_service.get_user_asset_data(force_refresh=False)

        if not user_asset_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="獲取資產數據失敗"
            )

        # 提取所需的價值數據
        spot_value = user_asset_data["spot_only_balance"]
        funding_value = user_asset_data["funding_in_spot_balance"]
        futures_value = user_asset_data["futures_balance"]
        total_value = user_asset_data["total_balance"]

        # 返回賬戶摘要
        return {
            "spot_value": spot_value,
            "funding_value": funding_value,
            "futures_value": futures_value,
            "total_value": total_value
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取賬戶摘要失敗: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取賬戶摘要失敗: {str(e)}"
        )


@router.get("/symbols")
async def get_symbols(current_user: User = Depends(get_current_user)):
    binance_service = BinanceService()
    symbols = await binance_service.get_symbols()
    return {"symbols": symbols}


@router.get("/price/{symbol}")
async def get_price(symbol: str, current_user: User = Depends(get_current_user)):
    binance_service = BinanceService()
    price = await binance_service.get_current_price(symbol)
    return {"symbol": symbol, "price": price}


@router.get("/assets/distribution")
async def get_assets_distribution(current_user: User = Depends(get_current_user)):
    """
    獲取用戶的資產分佈
    """
    try:
        # 使用用戶ID初始化幣安服務
        binance_service = BinanceService(user_id=current_user.id)

        # 確保客戶端已初始化
        if not await binance_service._ensure_initialized():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API或API配置無效，請先在設定頁面配置"
            )

        # 使用新的get_user_asset_data函數獲取完整的用戶資產數據
        user_asset_data = await binance_service.get_user_asset_data(force_refresh=False)

        # 檢查是否成功獲取數據
        if not user_asset_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="獲取資產數據失敗"
            )

        # 準備返回格式
        spot_assets = []

        # 轉換現貨資產格式
        for asset, data in user_asset_data["spot_assets"].items():
            if data["usdt_value"] >= 1.0:  # 過濾掉價值小於1 USDT的資產
                spot_assets.append({
                    "asset": asset,
                    "free": data["free"],
                    "locked": data["locked"],
                    "total": data["total"],
                    "value_usdt": data["usdt_value"]
                })

        # 轉換理財資產格式
        flexible_assets = []
        for product in user_asset_data["funding_products"]["flexible_savings"]:
            if product["usdt_value"] >= 1.0:  # 過濾掉價值小於1 USDT的資產
                flexible_assets.append({
                    "asset": product["asset"],
                    "free": product["totalAmount"],
                    "locked": 0,
                    "total": product["totalAmount"],
                    "value_usdt": product["usdt_value"]
                })

        # 如果期貨資產大於0，將期貨資產作為一個整體添加到現貨資產列表
        futures_value = user_asset_data["futures_balance"]
        if futures_value > 1.0:
            spot_assets.append({
                "asset": "FUTURES",
                "free": futures_value,
                "locked": 0,
                "total": futures_value,
                "value_usdt": futures_value
            })

        # 合併所有資產
        all_assets = flexible_assets + spot_assets

        # 過濾掉價值過小的資產並按價值排序
        filtered_assets = [asset for asset in all_assets if asset["value_usdt"] >= 1.0]
        filtered_assets.sort(key=lambda x: x["value_usdt"], reverse=True)

        # 計算總價值
        total_spot_value = user_asset_data["spot_only_balance"]
        total_flexible_value = user_asset_data["funding_in_spot_balance"]
        futures_value = user_asset_data["futures_balance"]
        total_value = user_asset_data["total_balance"]

        return {
            "total_value": total_value,
            "spot_assets_value": total_spot_value,
            "funding_assets_value": total_flexible_value,
            "futures_assets_value": futures_value,
            "balances": filtered_assets
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"獲取資產分佈失敗: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取資產分佈失敗: {str(e)}"
        )


@router.get("/futures/available-margin")
async def get_futures_available_margin(
    current_user: User = Depends(get_current_user)
):
    """
    獲取期貨可用保證金
    """
    try:
        # 獲取用戶的幣安API設定
        settings = await user_settings_service.get_user_settings(current_user.id)

        if not settings.binance_api_key or not settings.binance_api_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API，請先在設定頁面配置"
            )

        # 初始化幣安服務
        binance_service = BinanceService(
            api_key=settings.binance_api_key,
            api_secret=settings.binance_api_secret
        )

        # 檢查連接
        if not await binance_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法連接到幣安API，請檢查API密鑰"
            )

        # 獲取可用保證金
        available_margin = await binance_service.get_futures_available_margin()

        return {
            "available_margin": available_margin,
            "currency": "USDT"
        }

    except Exception as e:
        logger.error(f"獲取期貨可用保證金失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取期貨可用保證金失敗: {str(e)}"
        )


@router.post("/futures/check-margin")
async def check_margin_requirement(
    margin_data: dict,
    current_user: User = Depends(get_current_user)
):
    """
    檢查配對交易保證金需求

    Body:
    {
        "long_symbol": "BTCUSDT",
        "short_symbol": "ETHUSDT", 
        "max_loss": 100,
        "stop_loss": 5,
        "long_leverage": 10,
        "short_leverage": 10
    }
    """
    try:
        # 驗證請求數據
        required_fields = ["long_symbol", "short_symbol", "max_loss", "stop_loss",
                           "long_leverage", "short_leverage"]
        for field in required_fields:
            if field not in margin_data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"缺少必需欄位: {field}"
                )

        # 獲取用戶的幣安API設定
        settings = await user_settings_service.get_user_settings(current_user.id)

        if not settings.binance_api_key or not settings.binance_api_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="未配置幣安API，請先在設定頁面配置"
            )

        # 初始化幣安服務
        binance_service = BinanceService(
            api_key=settings.binance_api_key,
            api_secret=settings.binance_api_secret
        )

        # 檢查連接
        if not await binance_service.is_connected():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法連接到幣安API，請檢查API密鑰"
            )

        # 計算交易數量（與後端邏輯保持一致）
        max_loss = float(margin_data["max_loss"])
        stop_loss = float(margin_data["stop_loss"])
        max_position_size = max_loss / (stop_loss / 100)

        # 獲取當前價格
        long_price = await binance_service.get_futures_price(margin_data["long_symbol"])
        short_price = await binance_service.get_futures_price(margin_data["short_symbol"])

        if not long_price or not short_price:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法獲取交易對價格"
            )

        long_price = float(long_price)
        short_price = float(short_price)

        # 計算交易數量
        long_quantity = max_position_size / long_price
        short_quantity = max_position_size / short_price

        # 檢查保證金
        margin_check = await binance_service.check_margin_sufficient(
            long_symbol=margin_data["long_symbol"],
            long_quantity=long_quantity,
            long_leverage=int(margin_data["long_leverage"]),
            short_symbol=margin_data["short_symbol"],
            short_quantity=short_quantity,
            short_leverage=int(margin_data["short_leverage"])
        )

        # 添加計算的數量信息到返回結果
        margin_check["long_quantity"] = long_quantity
        margin_check["short_quantity"] = short_quantity
        margin_check["max_position_size"] = max_position_size

        return margin_check

    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"數據格式錯誤: {str(ve)}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"檢查保證金需求失敗: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"檢查保證金需求失敗: {str(e)}"
        )
