from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
import logging
import traceback  # 導入 traceback
from pydantic import BaseModel
# 導入 BinanceAPIException
from binance.exceptions import BinanceAPIException

from app.models.pair_trade import PairTradeCreate, PairTradeResponse, PairTradeSettingsUpdate
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.binance_service import BinanceService
from app.services.pair_trade_service import pair_trade_service
from app.services.user_settings_service import user_settings_service
from app.auth.dependencies import get_current_user_id

# 設置日誌
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/pair-trades",
    tags=["pair-trades"],
    responses={404: {"description": "Not found"}},
)

# 定義匯入交易的請求模型


class ImportTradeRequest(BaseModel):
    long_order_id: str
    short_order_id: str
    max_loss: float


@router.post("", response_model=PairTradeResponse)
async def create_pair_trade(
    trade_data: PairTradeCreate,
    current_user: User = Depends(get_current_user)
):
    """
    創建新的配對交易
    """
    try:
        # 獲取用戶的幣安API設定
        settings = await user_settings_service.get_user_settings(current_user.id)

        # 檢查是否已配置幣安API
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
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 創建配對交易
        pair_trade = await pair_trade_service.create_pair_trade(
            user_id=current_user.id,
            trade_data=trade_data,
            binance_service=binance_service
        )

        # 檢查創建是否成功
        if not pair_trade:
            # 如果返回None，可能是保證金不足或其他原因
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="配對交易創建失敗，請檢查您的保證金是否足夠或調整交易參數"
            )

        # 轉換為響應模型
        response = PairTradeResponse(
            id=pair_trade.id,
            name=pair_trade.name,
            status=pair_trade.status.value,
            max_loss=pair_trade.max_loss,
            stop_loss=pair_trade.stop_loss,
            take_profit=pair_trade.take_profit,
            trailing_stop_enabled=pair_trade.trailing_stop_enabled,
            trailing_stop_level=pair_trade.trailing_stop_level,
            long_position=pair_trade.long_position.dict() if pair_trade.long_position else None,
            short_position=pair_trade.short_position.dict() if pair_trade.short_position else None,
            total_pnl_value=pair_trade.total_pnl_value,
            total_ratio_percent=pair_trade.total_ratio_percent,
            total_fee=pair_trade.total_fee,
            total_entry_fee=pair_trade.total_entry_fee,
            total_exit_fee=pair_trade.total_exit_fee,
            max_ratio=pair_trade.max_ratio,
            min_ratio=pair_trade.min_ratio,
            mae=pair_trade.mae,
            mfe=pair_trade.mfe,
            created_at=pair_trade.created_at,
            updated_at=pair_trade.updated_at,
            closed_at=pair_trade.closed_at,
            close_reason=pair_trade.close_reason
        )

        return response

    except BinanceAPIException as binance_error:
        logger.error(f"幣安API錯誤: {binance_error}")

        # 專門處理保證金不足錯誤
        if binance_error.code == -2019:  # 保證金不足
            error_detail = f"保證金不足: {str(binance_error)}"
            status_code = status.HTTP_400_BAD_REQUEST
        elif binance_error.code == -4028:  # 無效槓桿
            error_detail = f"槓桿設置無效: {str(binance_error)}"
            status_code = status.HTTP_400_BAD_REQUEST
        elif binance_error.code == -1121:  # 無效交易對
            error_detail = f"無效的交易對: {str(binance_error)}"
            status_code = status.HTTP_400_BAD_REQUEST
        elif binance_error.code in [-2010, -2011]:  # 餘額不足 或 下單數量問題
            error_detail = f"訂單錯誤(餘額/數量): {str(binance_error)}"
            status_code = status.HTTP_400_BAD_REQUEST
        else:
            # 其他幣安 API 錯誤
            error_detail = f"幣安交互錯誤: {str(binance_error)}"
            status_code = status.HTTP_502_BAD_GATEWAY

        raise HTTPException(
            status_code=status_code,
            detail=error_detail
        )
    except HTTPException as http_error:
        # 重新拋出已知的HTTP異常
        raise http_error
    except Exception as e:
        logger.error(f"創建配對交易時發生未知錯誤: {e}")
        logger.error(traceback.format_exc())

        # 檢查錯誤消息中是否包含保證金不足相關信息
        error_msg = str(e)
        if "Margin is insufficient" in error_msg or "保證金不足" in error_msg or "-2019" in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="保證金不足: 您的帳戶保證金不足以執行此配對交易，請減少最大虧損金額或增加槓桿倍數"
            )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"創建配對交易失敗: {str(e)}"
        )


@router.get("", response_model=List[PairTradeResponse])
async def get_pair_trades(
    trade_status: Optional[str] = None,
    current_user: User = Depends(get_current_user)
):
    """
    獲取用戶的所有配對交易

    Args:
        trade_status: 可選的交易狀態過濾條件，如果不提供則獲取所有狀態的交易
    """
    try:
        # 獲取配對交易列表
        pair_trades = await pair_trade_service.get_pair_trades(current_user.id, trade_status)

        # 轉換為響應模型
        responses = []
        for trade in pair_trades:
            responses.append(PairTradeResponse(
                id=trade.id,
                name=trade.name,
                status=trade.status.value,
                max_loss=trade.max_loss,
                stop_loss=trade.stop_loss,
                take_profit=trade.take_profit,
                trailing_stop_enabled=trade.trailing_stop_enabled,
                trailing_stop_level=trade.trailing_stop_level,
                long_position=trade.long_position.dict() if trade.long_position else None,
                short_position=trade.short_position.dict() if trade.short_position else None,
                total_pnl_value=trade.total_pnl_value,
                total_ratio_percent=trade.total_ratio_percent,
                total_fee=trade.total_fee,
                total_entry_fee=trade.total_entry_fee,
                total_exit_fee=trade.total_exit_fee,
                max_ratio=trade.max_ratio,
                min_ratio=trade.min_ratio,
                mae=trade.mae,
                mfe=trade.mfe,
                created_at=trade.created_at,
                updated_at=trade.updated_at,
                closed_at=trade.closed_at,
                close_reason=trade.close_reason
            ))

        return responses

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取配對交易列表失敗: {str(e)}"
        )


@router.get("/{trade_id}", response_model=PairTradeResponse)
async def get_pair_trade(
    trade_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    獲取指定的配對交易
    """
    try:
        # 獲取配對交易
        pair_trade = await pair_trade_service.get_pair_trade(trade_id, current_user.id)

        if not pair_trade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="配對交易不存在"
            )

        # 轉換為響應模型
        response = PairTradeResponse(
            id=pair_trade.id,
            name=pair_trade.name,
            status=pair_trade.status.value,
            max_loss=pair_trade.max_loss,
            stop_loss=pair_trade.stop_loss,
            take_profit=pair_trade.take_profit,
            trailing_stop_enabled=pair_trade.trailing_stop_enabled,
            trailing_stop_level=pair_trade.trailing_stop_level,
            long_position=pair_trade.long_position.dict() if pair_trade.long_position else None,
            short_position=pair_trade.short_position.dict() if pair_trade.short_position else None,
            total_pnl_value=pair_trade.total_pnl_value,
            total_ratio_percent=pair_trade.total_ratio_percent,
            total_fee=pair_trade.total_fee,
            total_entry_fee=pair_trade.total_entry_fee,
            total_exit_fee=pair_trade.total_exit_fee,
            max_ratio=pair_trade.max_ratio,
            min_ratio=pair_trade.min_ratio,
            mae=pair_trade.mae,
            mfe=pair_trade.mfe,
            created_at=pair_trade.created_at,
            updated_at=pair_trade.updated_at,
            closed_at=pair_trade.closed_at,
            close_reason=pair_trade.close_reason
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"獲取配對交易失敗: {str(e)}"
        )


@router.put("/{trade_id}/settings", response_model=PairTradeResponse)
async def update_pair_trade_settings_endpoint(
    trade_id: str,
    settings_update: PairTradeSettingsUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    更新指定配對交易的止盈/止損設定
    """
    try:
        updated_trade = await pair_trade_service.update_trade_settings(
            trade_id=trade_id,
            user_id=current_user.id,
            settings=settings_update
        )

        if not updated_trade:
            # 服務層返回 None 的情況：
            # 1. 交易不存在或不屬於用戶
            # 2. 交易非活躍狀態
            # 3. 提供的止盈/止損值無效 (例如 <=0)
            # 這裡可以根據服務層的具體實現來決定更精確的錯誤碼和訊息
            # 暫時統一返回 400，因為多數情況是用戶輸入或狀態問題
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="無法更新交易設定，請檢查交易狀態或輸入值是否正確"
            )

        # 轉換為響應模型 (假設 PairTradeService 返回的是 PairTrade 模型實例)
        response = PairTradeResponse(**updated_trade.dict())
        return response

    except HTTPException as http_err:  # 重新拋出已知的HTTP異常
        raise http_err
    except Exception as e:
        logger.error(f"更新交易 {trade_id} 設定時發生未知錯誤: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新交易設定失敗: {str(e)}"
        )


@router.put("/{trade_id}", response_model=PairTradeResponse)
async def update_pair_trade(
    trade_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    更新配對交易的狀態和盈虧信息
    """
    try:
        # 獲取用戶的幣安API設定
        settings = await user_settings_service.get_user_settings(current_user.id)

        # 檢查是否已配置幣安API
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
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 更新配對交易
        pair_trade, should_close, close_reason = await pair_trade_service.update_pair_trade(
            trade_id=trade_id,
            user_id=current_user.id,
            binance_service=binance_service
        )

        if not pair_trade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="配對交易不存在或已關閉"
            )

        # 如果需要平倉，則自動平倉
        if should_close and close_reason:
            logger.info(f"自動平倉交易 {trade_id}，原因: {close_reason}")
            pair_trade = await pair_trade_service.close_pair_trade(
                trade_id=trade_id,
                user_id=current_user.id,
                close_reason=close_reason,
                binance_service=binance_service
            )

            if not pair_trade:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"自動平倉失敗，原因: {close_reason}"
                )

        # 轉換為響應模型
        response = PairTradeResponse(
            id=pair_trade.id,
            name=pair_trade.name,
            status=pair_trade.status.value,
            max_loss=pair_trade.max_loss,
            stop_loss=pair_trade.stop_loss,
            take_profit=pair_trade.take_profit,
            trailing_stop_enabled=pair_trade.trailing_stop_enabled,
            trailing_stop_level=pair_trade.trailing_stop_level,
            long_position=pair_trade.long_position.dict() if pair_trade.long_position else None,
            short_position=pair_trade.short_position.dict() if pair_trade.short_position else None,
            total_pnl_value=pair_trade.total_pnl_value,
            total_ratio_percent=pair_trade.total_ratio_percent,
            total_fee=pair_trade.total_fee,
            total_entry_fee=pair_trade.total_entry_fee,
            total_exit_fee=pair_trade.total_exit_fee,
            max_ratio=pair_trade.max_ratio,
            min_ratio=pair_trade.min_ratio,
            mae=pair_trade.mae,
            mfe=pair_trade.mfe,
            created_at=pair_trade.created_at,
            updated_at=pair_trade.updated_at,
            closed_at=pair_trade.closed_at,
            close_reason=pair_trade.close_reason
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新配對交易失敗: {str(e)}"
        )


@router.delete("/{trade_id}", response_model=PairTradeResponse)
async def close_pair_trade(
    trade_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    平倉配對交易
    """
    try:
        # 獲取用戶的幣安API設定
        settings = await user_settings_service.get_user_settings(current_user.id)

        # 檢查是否已配置幣安API
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
                detail="無法連接到幣安API，請檢查API密鑰和密碼"
            )

        # 平倉配對交易
        pair_trade = await pair_trade_service.close_pair_trade(
            trade_id=trade_id,
            user_id=current_user.id,
            close_reason="手動平倉",
            binance_service=binance_service
        )

        if not pair_trade:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="配對交易不存在或已關閉"
            )

        # 轉換為響應模型
        response = PairTradeResponse(
            id=pair_trade.id,
            name=pair_trade.name,
            status=pair_trade.status.value,
            max_loss=pair_trade.max_loss,
            stop_loss=pair_trade.stop_loss,
            take_profit=pair_trade.take_profit,
            trailing_stop_enabled=pair_trade.trailing_stop_enabled,
            trailing_stop_level=pair_trade.trailing_stop_level,
            long_position=pair_trade.long_position.dict() if pair_trade.long_position else None,
            short_position=pair_trade.short_position.dict() if pair_trade.short_position else None,
            total_pnl_value=pair_trade.total_pnl_value,
            total_ratio_percent=pair_trade.total_ratio_percent,
            total_fee=pair_trade.total_fee,
            total_entry_fee=pair_trade.total_entry_fee,
            total_exit_fee=pair_trade.total_exit_fee,
            max_ratio=pair_trade.max_ratio,
            min_ratio=pair_trade.min_ratio,
            mae=pair_trade.mae,
            mfe=pair_trade.mfe,
            created_at=pair_trade.created_at,
            updated_at=pair_trade.updated_at,
            closed_at=pair_trade.closed_at,
            close_reason=pair_trade.close_reason
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"平倉配對交易失敗: {str(e)}"
        )


@router.post("/import", response_model=PairTradeResponse)
async def import_trade(
    import_data: ImportTradeRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    根據訂單ID匯入歷史交易
    """
    trade = await pair_trade_service.create_from_order_ids(
        user_id=user_id,
        long_order_id=import_data.long_order_id,
        short_order_id=import_data.short_order_id,
        max_loss=import_data.max_loss
    )

    if not trade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="無法從提供的訂單ID創建交易記錄"
        )

    # 轉換為響應模型
    return PairTradeResponse(
        id=trade.id,
        name=trade.name,
        status=trade.status.value,
        max_loss=trade.max_loss,
        stop_loss=trade.stop_loss,
        take_profit=trade.take_profit,
        trailing_stop_enabled=trade.trailing_stop_enabled,
        trailing_stop_level=trade.trailing_stop_level,
        long_position=trade.long_position.dict() if trade.long_position else None,
        short_position=trade.short_position.dict() if trade.short_position else None,
        total_pnl=trade.total_pnl_value,
        total_pnl_percent=trade.total_ratio_percent,
        total_fee=trade.total_fee,
        total_entry_fee=trade.total_entry_fee,
        total_exit_fee=trade.total_exit_fee,
        max_ratio=trade.max_ratio,
        min_ratio=trade.min_ratio,
        mae=trade.mae,
        mfe=trade.mfe,
        created_at=trade.created_at,
        updated_at=trade.updated_at,
        closed_at=trade.closed_at,
        close_reason=trade.close_reason
    )
