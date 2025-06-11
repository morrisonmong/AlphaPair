import logging
from typing import Dict, List, Optional, Any, Tuple
from bson import ObjectId
import asyncio
import uuid
import traceback
import time
from datetime import datetime

from app.models.pair_trade import PairTrade, PairTradeCreate, TradeStatus, TradePosition, PairTradeSettingsUpdate
from app.services.binance_service import BinanceService
from app.services.notification_service import notification_service
from app.services.user_settings_service import user_settings_service
from app.services.trade_history_service import trade_history_service
from app.services.equity_curve_service import equity_curve_service
from app.services.market_performance_service import market_performance_service
from app.services.trade_performance_service import trade_performance_service
from app.services.trade_log_service import trade_log_service
from app.database.mongodb import get_database, get_pair_trades_collection
from app.utils.time_utils import get_utc_now, ensure_timezone

# 設置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PairTradeService:
    """配對交易服務"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self._symbol_precision_map = {}  # 添加精度映射緩存

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_pair_trades_collection()
            self._initialized = True

    async def _get_symbol_precision_map(self, binance_service: BinanceService) -> Dict[str, int]:
        """
        獲取交易對的精度映射

        Args:
            binance_service: 幣安服務實例

        Returns:
            Dict[str, int]: 交易對精度映射，格式為 {symbol: precision}
        """
        # 如果已經有緩存，直接返回
        if self._symbol_precision_map:
            return self._symbol_precision_map

        try:
            # 獲取期貨交易所信息
            exchange_info = await binance_service.get_futures_exchange_info()

            # 創建精度映射
            precision_map = {}

            for symbol_info in exchange_info.get('symbols', []):
                symbol = symbol_info.get('symbol', '')
                base_asset = symbol_info.get(
                    'baseAsset', '')  # 基礎資產，如 BTC, ETH 等

                # 獲取數量精度
                quantity_precision = 0
                for filter_info in symbol_info.get('filters', []):
                    if filter_info.get('filterType') == 'LOT_SIZE':
                        # 從 stepSize 計算精度
                        step_size = float(filter_info.get('stepSize', '1'))
                        if step_size < 1:
                            # 計算小數點後的位數
                            step_size_str = str(step_size).rstrip('0')
                            if '.' in step_size_str:
                                quantity_precision = len(
                                    step_size_str.split('.')[-1])
                        break

                # 保存到映射中
                precision_map[symbol] = quantity_precision
                # 同時保存基礎資產的精度，方便後續使用
                if base_asset:
                    precision_map[base_asset] = quantity_precision

            logger.info(f"獲取到 {len(precision_map)} 個交易對的精度信息")

            # 更新緩存
            self._symbol_precision_map = precision_map
            return precision_map
        except Exception as e:
            logger.error(f"獲取交易對精度映射失敗: {e}")
            # 返回默認映射
            default_map = {
                'BTC': 3,    # BTC 通常是 3 位小數
                'ETH': 2,    # ETH 通常是 2 位小數
                'BNB': 2,    # BNB 通常是 2 位小數
                'LTC': 1,    # LTC 通常是 1 位小數
                'XRP': 1,    # XRP 通常是 1 位小數
                'ADA': 0,    # ADA 需要整數
                'DOT': 1,    # DOT 通常是 1 位小數
                'AVAX': 1,   # AVAX 通常是 1 位小數
                'SOL': 1,    # SOL 通常是 1 位小數
                'DOGE': 0,   # DOGE 需要整數
                'SHIB': 0,   # SHIB 需要整數
                'MATIC': 0,  # MATIC 需要整數
                'LINK': 1,   # LINK 通常是 1 位小數
                'UNI': 1,    # UNI 通常是 1 位小數
                'USDT': 2,   # USDT 通常是 2 位小數
            }
            self._symbol_precision_map = default_map
            return default_map

    async def create_pair_trade(self, user_id: str, trade_data: PairTradeCreate, binance_service: BinanceService) -> Optional[PairTrade]:
        """
        創建配對交易

        Args:
            user_id: 用戶ID
            trade_data: 交易數據
            binance_service: 幣安服務實例

        Returns:
            Optional[PairTrade]: 創建的配對交易對象，如果失敗則返回 None
        """
        await self._ensure_initialized()

        # 檢查是否為測試模式
        if trade_data.test_mode:
            logger.info(f"以測試模式創建配對交易: {trade_data.name}")
            # 創建模擬交易數據而不實際下單
            return await self._create_test_trade(user_id, trade_data, binance_service)

        # 1. 驗證交易參數
        if not await self._validate_trade_parameters(user_id, trade_data, binance_service):
            logger.error("交易參數驗證失敗")
            return None

        # 2. 計算交易數量和槓桿
        trade_quantities = await self._calculate_trade_quantities(trade_data, binance_service)
        if not trade_quantities:
            logger.error("計算交易數量失敗")
            await self._log_trade_error(
                user_id=user_id,
                action="create",
                message="計算交易數量失敗"
            )
            return None

        # 3. 執行開倉操作
        open_result = await self._execute_open_trade(user_id, trade_data, trade_quantities, binance_service)
        if not open_result:
            logger.error("執行開倉操作失敗")
            return None

        # 4. 創建交易記錄
        pair_trade = await self._create_trade_record(user_id, trade_data, open_result)
        if not pair_trade:
            logger.error("創建交易記錄失敗")
            return None

        # 5. 處理創建後的操作（通知、日誌等）
        await self._handle_post_trade_creation(user_id, pair_trade, open_result)

        logger.info(f"成功創建配對交易: {pair_trade.id}")
        return pair_trade

    async def _create_test_trade(self, user_id: str, trade_data: PairTradeCreate, binance_service: BinanceService) -> Optional[PairTrade]:
        """
        創建測試模式的配對交易（不實際下單）

        Args:
            user_id: 用戶ID
            trade_data: 交易數據
            binance_service: 幣安服務實例

        Returns:
            Optional[PairTrade]: 創建的測試配對交易對象
        """
        try:
            # 驗證並確保交易對符號格式正確（添加USDT後綴如果需要）
            # 這個步驟很重要，因為即使是測試模式也需要有效的交易對符號來獲取價格
            if not await self._validate_trade_parameters(user_id, trade_data, binance_service):
                logger.error("測試模式: 交易參數驗證失敗")
                return None

            # 獲取市場價格信息
            long_price = await binance_service.get_latest_price(trade_data.long_symbol)
            short_price = await binance_service.get_latest_price(trade_data.short_symbol)

            # 確保價格是浮點數
            try:
                long_price = float(long_price)
                short_price = float(short_price)
            except (TypeError, ValueError) as e:
                logger.error(
                    f"價格格式轉換錯誤: {e}, long_price={long_price}, short_price={short_price}")
                return None

            if long_price <= 0 or short_price <= 0:
                logger.error(
                    f"獲取價格失敗: {trade_data.long_symbol}={long_price}, {trade_data.short_symbol}={short_price}")
                return None

            # 計算模擬交易數量
            trade_quantities = await self._calculate_trade_quantities(trade_data, binance_service)
            if not trade_quantities:
                logger.error("測試模式: 計算交易數量失敗")
                return None

            # 生成唯一的測試交易ID
            trade_id = str(uuid.uuid4())

            # 設置測試訂單ID
            long_order_id = f"test_long_{trade_id[:8]}"
            short_order_id = f"test_short_{trade_id[:8]}"

            # 模擬訂單執行結果
            long_quantity = trade_quantities["long_quantity"]
            short_quantity = trade_quantities["short_quantity"]
            long_leverage = trade_quantities["long_leverage"]
            short_leverage = trade_quantities["short_leverage"]

            # 計算模擬手續費 (假設費率為 0.04%)
            fee_rate = 0.0004
            long_fee = long_price * long_quantity * fee_rate
            short_fee = short_price * short_quantity * fee_rate
            total_fee = long_fee + short_fee

            # 創建持倉信息
            long_position = TradePosition(
                symbol=trade_data.long_symbol,
                quantity=long_quantity,
                entry_price=long_price,
                current_price=long_price,
                pnl=0,  # 初始盈虧為0
                pnl_percent=0,  # 初始盈虧百分比為0
                entry_order_id=long_order_id,  # 修復：使用 entry_order_id 而不是 order_id
                notional_value=long_quantity * long_price,
                leverage=long_leverage,
                entry_fee=long_fee,  # 修復：使用 entry_fee 而不是 fee
                side="BUY",  # 添加 side 欄位
            )

            short_position = TradePosition(
                symbol=trade_data.short_symbol,
                quantity=short_quantity,
                entry_price=short_price,
                current_price=short_price,
                pnl=0,  # 初始盈虧為0
                pnl_percent=0,  # 初始盈虧百分比為0
                entry_order_id=short_order_id,  # 修復：使用 entry_order_id 而不是 order_id
                notional_value=short_quantity * short_price,
                leverage=short_leverage,
                entry_fee=short_fee,  # 修復：使用 entry_fee 而不是 fee
                side="SELL",  # 添加 side 欄位
            )

            # 創建配對交易記錄
            pair_trade = PairTrade(
                id=trade_id,
                user_id=user_id,
                name=f"TEST_{trade_data.name or f'{trade_data.long_symbol}/{trade_data.short_symbol}'}",
                status=TradeStatus.ACTIVE,
                max_loss=trade_data.max_loss,
                stop_loss=trade_data.stop_loss,
                take_profit=trade_data.take_profit,
                long_position=long_position,
                short_position=short_position,
                total_pnl=0,
                total_pnl_percent=0,
                total_fee=total_fee,
                entry_fee=total_fee,
                exit_fee=0,
                net_pnl=-total_fee,
                leverage=max(long_leverage, short_leverage),
                long_leverage=long_leverage,
                short_leverage=short_leverage,
                created_at=get_utc_now(),
                updated_at=get_utc_now()
            )

            # 保存到數據庫
            clean_data = self._clean_unserializable_objects(pair_trade.dict(exclude={"id"}))
            result = await self.collection.insert_one(clean_data)

            # 設置 id 字段用於返回給前端（但不存儲到數據庫）
            pair_trade.id = str(result.inserted_id)

            logger.info(f"成功創建測試配對交易: {pair_trade.id}")

            # 記錄測試模式日誌
            await self._log_trade_error(
                user_id=user_id,
                action="test_create",
                message=f"測試模式: 成功創建配對交易 {pair_trade.id}",
                trade_id=pair_trade.id,
                details={
                    "long_symbol": trade_data.long_symbol,
                    "short_symbol": trade_data.short_symbol,
                    "long_price": long_price,
                    "short_price": short_price,
                    "long_quantity": long_quantity,
                    "short_quantity": short_quantity
                }
            )

            # 處理開倉後的操作（通知、日誌等），與正常模式一致
            await self._handle_post_trade_creation(user_id, pair_trade, {
                "long_price": long_price,
                "short_price": short_price,
                "long_quantity": long_quantity,
                "short_quantity": short_quantity,
                "long_entry_fee": long_fee,
                "short_entry_fee": short_fee,
                "total_entry_fee": total_fee
            })

            return pair_trade
        except Exception as e:
            logger.error(f"測試模式: 創建配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=user_id,
                action="test_create",
                message=f"測試模式: 創建配對交易時發生錯誤: {str(e)}"
            )
            return None

    async def _validate_trade_parameters(self, user_id: str, trade_data: PairTradeCreate, binance_service: BinanceService) -> bool:
        """
        驗證交易參數

        Args:
            user_id: 用戶ID
            trade_data: 交易數據
            binance_service: 幣安服務實例

        Returns:
            bool: 驗證是否通過
        """
        try:
            # 檢查交易對是否相同
            if trade_data.long_symbol == trade_data.short_symbol:
                await self._log_trade_error(
                    user_id=user_id,
                    action="open",
                    message=f"無法創建配對交易: 多單和空單的交易對不能相同 ({trade_data.long_symbol})"
                )
                return False

            # 自動添加 USDT 後綴（如果需要）
            long_symbol = trade_data.long_symbol
            short_symbol = trade_data.short_symbol

            # 如果不是以 USDT 結尾，則添加 USDT 後綴
            if not long_symbol.endswith("USDT"):
                long_symbol = f"{long_symbol}USDT"
                logger.info(
                    f"自動添加 USDT 後綴到多單交易對: {trade_data.long_symbol} -> {long_symbol}")

            if not short_symbol.endswith("USDT"):
                short_symbol = f"{short_symbol}USDT"
            logger.info(
                f"自動添加 USDT 後綴到空單交易對: {trade_data.short_symbol} -> {short_symbol}")

            # 更新交易數據中的交易對
            trade_data.long_symbol = long_symbol
            trade_data.short_symbol = short_symbol

            # 檢查交易對是否存在
            exchange_info = await binance_service.get_futures_exchange_info()
            symbols = [symbol["symbol"] for symbol in exchange_info["symbols"]]

            if trade_data.long_symbol not in symbols:
                await self._log_trade_error(
                    user_id=user_id,
                    action="open",
                    message=f"無法創建配對交易: 多單交易對 {trade_data.long_symbol} 不存在"
                )
                return False

            if trade_data.short_symbol not in symbols:
                await self._log_trade_error(
                    user_id=user_id,
                    action="open",
                    message=f"無法創建配對交易: 空單交易對 {trade_data.short_symbol} 不存在"
                )
                return False

            return True
        except Exception as e:
            logger.error(f"驗證交易參數時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=user_id,
                action="open",
                message=f"驗證交易參數時發生錯誤: {str(e)}"
            )
            return False

    async def _calculate_trade_quantities(self, trade_data: PairTradeCreate, binance_service: BinanceService) -> Optional[Dict[str, Any]]:
        """
        計算交易數量和槓桿

        Args:
            trade_data: 交易數據
            binance_service: 幣安服務實例

        Returns:
            Optional[Dict[str, Any]]: 計算結果，包含數量和槓桿，如果失敗則返回 None
        """
        try:
            # 獲取交易對精度映射
            precision_map = await self._get_symbol_precision_map(binance_service)

            # 應用精度
            long_precision = precision_map.get(trade_data.long_symbol, 3)
            short_precision = precision_map.get(trade_data.short_symbol, 3)

            # 獲取最新期貨價格
            long_price = await binance_service.get_futures_price(trade_data.long_symbol)
            short_price = await binance_service.get_futures_price(trade_data.short_symbol)

            # 確保價格是浮點數
            try:
                long_price = float(long_price)
                short_price = float(short_price)
            except (TypeError, ValueError) as e:
                logger.error(
                    f"價格格式轉換錯誤: {e}, long_price={long_price}, short_price={short_price}")
                return None

            if long_price <= 0 or short_price <= 0:
                logger.error(
                    f"獲取價格失敗: {trade_data.long_symbol}={long_price}, {trade_data.short_symbol}={short_price}")
                return None

            # 計算在止損百分比下的最大倉位大小
            max_position_size = trade_data.max_loss / \
                (trade_data.stop_loss / 100)

            # 計算數量
            long_quantity = max_position_size / long_price
            short_quantity = max_position_size / short_price

            long_quantity = round(long_quantity, long_precision)
            short_quantity = round(short_quantity, short_precision)

            return {
                "long_price": long_price,
                "short_price": short_price,
                "long_quantity": long_quantity,
                "short_quantity": short_quantity,
                "long_leverage": trade_data.long_leverage or 1,
                "short_leverage": trade_data.short_leverage or 1
            }
        except Exception as e:
            logger.error(f"計算交易數量和槓桿時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _execute_open_trade(self, user_id: str, trade_data: PairTradeCreate, trade_quantities: Dict[str, Any], binance_service: BinanceService) -> Optional[Dict[str, Any]]:
        """
        執行開倉操作

        Args:
            user_id: 用戶ID
            trade_data: 交易數據
            trade_quantities: 計算的交易數量和槓桿
            binance_service: 幣安服務實例

        Returns:
            Optional[Dict[str, Any]]: 開倉結果，如果失敗則返回 None
        """
        try:
            # 步驟1: 保證金預檢查
            logger.info("開始執行保證金預檢查...")
            margin_check = await binance_service.check_margin_sufficient(
                long_symbol=trade_data.long_symbol,
                long_quantity=trade_quantities["long_quantity"],
                long_leverage=trade_quantities["long_leverage"],
                short_symbol=trade_data.short_symbol,
                short_quantity=trade_quantities["short_quantity"],
                short_leverage=trade_quantities["short_leverage"]
            )

            if not margin_check.get("sufficient", False):
                error_msg = f"保證金不足，無法執行配對交易"
                if "error" in margin_check:
                    error_msg += f": {margin_check['error']}"
                else:
                    available = margin_check.get("available_margin", 0)
                    required = margin_check.get("required_margin", 0)
                    deficit = margin_check.get("deficit", 0)
                    long_required = margin_check.get("long_required", 0)
                    short_required = margin_check.get("short_required", 0)

                    error_msg += f"。可用保證金: {available:.2f} USDT，需要保證金: {required:.2f} USDT"
                    error_msg += f"（多單需要: {long_required:.2f} USDT，空單需要: {short_required:.2f} USDT）"
                    error_msg += f"，不足: {deficit:.2f} USDT"

                logger.error(error_msg)

                # 記錄錯誤日誌
                await self._log_trade_error(
                    user_id=user_id,
                    action="margin_check",
                    message=error_msg
                )

                # 拋出特定的保證金不足異常，帶有詳細信息
                from binance.exceptions import BinanceAPIException
                raise BinanceAPIException(
                    response=None,
                    status_code=-2019,
                    error_code=-2019,
                    error_msg=error_msg
                )

            logger.info(f"保證金檢查通過: 可用={margin_check.get('available_margin', 0):.2f} USDT, "
                        f"需要={margin_check.get('required_margin', 0):.2f} USDT")

            # 步驟2: 設置槓桿
            if trade_quantities["long_leverage"] > 1:
                leverage_result = await binance_service.set_leverage(
                    symbol=trade_data.long_symbol,
                    leverage=trade_quantities["long_leverage"]
                )
                logger.info(f"設置多單槓桿結果: {leverage_result}")

            if trade_quantities["short_leverage"] > 1:
                leverage_result = await binance_service.set_leverage(
                    symbol=trade_data.short_symbol,
                    leverage=trade_quantities["short_leverage"]
                )
                logger.info(f"設置空單槓桿結果: {leverage_result}")

            # 步驟3: 執行開倉
            open_result = await binance_service.open_pair_trade(
                long_symbol=trade_data.long_symbol,
                short_symbol=trade_data.short_symbol,
                long_quantity=trade_quantities["long_quantity"],
                short_quantity=trade_quantities["short_quantity"],
                long_leverage=trade_quantities["long_leverage"],
                short_leverage=trade_quantities["short_leverage"]
            )

            if not open_result:
                await self._log_trade_error(
                    user_id=user_id,
                    action="open",
                    message="執行開倉操作失敗: 無法獲取開倉結果"
                )
                return None

            # 記錄原始訂單數據
            logger.info(f"多單訂單結果: {open_result.get('long_order', {})}")
            logger.info(f"空單訂單結果: {open_result.get('short_order', {})}")

            # 從訂單中獲取實際成交數量
            long_executed_qty = float(open_result.get("long_order", {}).get("executedQty", 0))
            short_executed_qty = float(open_result.get("short_order", {}).get("executedQty", 0))

            # 從訂單中獲取實際成交價格
            long_avg_price = float(open_result.get("long_order", {}).get("avgPrice", 0))
            short_avg_price = float(open_result.get("short_order", {}).get("avgPrice", 0))

            # 檢查成交數量和價格
            if long_executed_qty <= 0 or short_executed_qty <= 0:
                logger.warning("無法獲取實際成交數量，使用計算數量")
                long_executed_qty = trade_quantities["long_quantity"]
                short_executed_qty = trade_quantities["short_quantity"]

            if long_avg_price <= 0 or short_avg_price <= 0:
                logger.warning("無法獲取實際成交價格，使用計算價格")
                long_avg_price = trade_quantities["long_price"]
                short_avg_price = trade_quantities["short_price"]

            # 更新開倉結果
            open_result.update({
                "long_quantity": long_executed_qty,
                "short_quantity": short_executed_qty,
                "long_price": long_avg_price,
                "short_price": short_avg_price
            })

            # 獲取手續費
            try:
                # 獲取多單手續費
                long_order_id = open_result.get("long_order", {}).get("orderId")
                if long_order_id:
                    long_fee = await binance_service.get_trade_fee(trade_data.long_symbol, str(long_order_id))
                    open_result["long_entry_fee"] = float(long_fee) if long_fee is not None else 0
                else:
                    # 估算手續費
                    open_result["long_entry_fee"] = long_executed_qty * long_avg_price * 0.0004  # 0.04% 預設費率

                # 獲取空單手續費
                short_order_id = open_result.get("short_order", {}).get("orderId")
                if short_order_id:
                    short_fee = await binance_service.get_trade_fee(trade_data.short_symbol, str(short_order_id))
                    open_result["short_entry_fee"] = float(short_fee) if short_fee is not None else 0
                else:
                    # 估算手續費
                    open_result["short_entry_fee"] = short_executed_qty * short_avg_price * 0.0004

                # 計算總手續費
                open_result["total_entry_fee"] = open_result["long_entry_fee"] + open_result["short_entry_fee"]

            except Exception as fee_error:
                logger.error(f"獲取手續費時發生錯誤: {fee_error}")
                # 使用估算的手續費
                open_result["long_entry_fee"] = long_executed_qty * long_avg_price * 0.0004
                open_result["short_entry_fee"] = short_executed_qty * short_avg_price * 0.0004
                open_result["total_entry_fee"] = open_result["long_entry_fee"] + open_result["short_entry_fee"]

            # 記錄最終的開倉結果
            logger.info(f"最終開倉結果: {open_result}")

            return open_result

        except Exception as e:
            logger.error(f"執行開倉操作時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=user_id,
                action="open",
                message=f"執行開倉操作時發生錯誤: {str(e)}"
            )
            # 重新拋出異常，讓路由層處理
            raise

    async def _create_trade_record(self, user_id: str, trade_data: PairTradeCreate, open_result: Dict[str, Any]) -> Optional[PairTrade]:
        """
        創建交易記錄

        Args:
            user_id: 用戶ID
            trade_data: 交易數據
            open_result: 開倉結果

        Returns:
            Optional[PairTrade]: 創建的交易記錄，如果失敗則返回 None
        """
        try:
            # 獲取開倉訂單ID
            long_order_id = str(open_result.get(
                "long_order", {}).get("orderId", ""))
            short_order_id = str(open_result.get(
                "short_order", {}).get("orderId", ""))

            # 獲取手續費
            long_entry_fee = open_result.get("long_entry_fee", 0)
            short_entry_fee = open_result.get("short_entry_fee", 0)
            total_entry_fee = open_result.get(
                "total_entry_fee", long_entry_fee + short_entry_fee)

            # 創建交易記錄
            pair_trade = PairTrade(
                user_id=user_id,
                name=trade_data.name,
                status=TradeStatus.ACTIVE,
                long_position=TradePosition(
                    symbol=trade_data.long_symbol,
                    quantity=open_result.get("long_quantity", 0),
                    entry_price=open_result.get("long_price", 0),
                    leverage=trade_data.long_leverage or 1,
                    entry_order_id=long_order_id,
                    entry_fee=long_entry_fee,
                    side="BUY",
                    notional_value=open_result.get(
                        "long_quantity", 0) * open_result.get("long_price", 0),
                    created_at=open_result.get(
                        "long_order_time", get_utc_now()),
                ),
                short_position=TradePosition(
                    symbol=trade_data.short_symbol,
                    quantity=open_result.get("short_quantity", 0),
                    entry_price=open_result.get("short_price", 0),
                    leverage=trade_data.short_leverage or 1,
                    entry_order_id=short_order_id,
                    entry_fee=short_entry_fee,
                    side="SELL",
                    notional_value=open_result.get(
                        "short_quantity", 0) * open_result.get("short_price", 0),
                    created_at=open_result.get(
                        "short_order_time", get_utc_now()),
                ),
                total_entry_fee=total_entry_fee,
                total_exit_fee=0,
                total_fee=total_entry_fee,
                take_profit=trade_data.take_profit,
                stop_loss=trade_data.stop_loss,
                max_loss=trade_data.max_loss,
                created_at=get_utc_now(),
                updated_at=get_utc_now()
            )

            # 保存到數據庫
            clean_data = self._clean_unserializable_objects(pair_trade.dict(by_alias=True))
            result = await self.collection.insert_one(clean_data)

            # 設置 id 字段用於返回給前端（但不存儲到數據庫）
            pair_trade.id = str(result.inserted_id)

            logger.info(f"成功創建配對交易: {pair_trade.name}, ID: {pair_trade.id}")
            return pair_trade
        except Exception as e:
            logger.error(f"創建交易記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=user_id,
                action="open",
                message=f"創建交易記錄時發生錯誤: {str(e)}"
            )
            return None

    async def _handle_post_trade_creation(self, user_id: str, pair_trade: PairTrade, open_result: Dict[str, Any]):
        """
        處理交易創建後的操作

        Args:
            user_id: 用戶ID
            pair_trade: 配對交易對象
            open_result: 開倉結果
        """
        try:
            # 獲取用戶設置
            user_settings = await user_settings_service.get_user_settings(user_id)

            # 發送通知
            try:
                # 檢查是否啟用通知
                is_notification_enabled = user_settings.notification_settings.get("enabled", True)
                is_trade_open_enabled = user_settings.notification_settings.get("trade_open", True)

                logger.info(f"通知設置: enabled={is_notification_enabled}, trade_open={is_trade_open_enabled}")

                if is_notification_enabled and is_trade_open_enabled:
                    await self._send_trade_notification(user_id, pair_trade, is_open=True)
                else:
                    logger.info(f"未發送開倉通知: 通知功能已禁用或未啟用開倉通知，用戶 {user_id}")
            except Exception as e:
                logger.error(f"發送開倉通知時發生錯誤: {e}")
                logger.error(traceback.format_exc())

            # 記錄交易日誌
            try:
                # 從 open_result 獲取實際成交數據
                log_details = {
                    "long_symbol": pair_trade.long_position.symbol,
                    "short_symbol": pair_trade.short_position.symbol,
                    "long_quantity": open_result.get("long_quantity", pair_trade.long_position.quantity),
                    "short_quantity": open_result.get("short_quantity", pair_trade.short_position.quantity),
                    "long_entry_price": open_result.get("long_price", pair_trade.long_position.entry_price),
                    "short_entry_price": open_result.get("short_price", pair_trade.short_position.entry_price),
                    "long_leverage": pair_trade.long_position.leverage,
                    "short_leverage": pair_trade.short_position.leverage,
                    "total_fee": open_result.get("total_entry_fee", pair_trade.total_entry_fee)
                }

                # 添加日誌以檢查數據
                logger.info(f"開倉結果數據: {open_result}")
                logger.info(f"交易對象數據: {pair_trade.dict()}")
                logger.info(f"日誌詳情: {log_details}")

                await trade_log_service.log_trade_action(
                    user_id=user_id,
                    trade_id=pair_trade.id,
                    action="open",
                    status="success",
                    message=f"成功開倉配對交易: {pair_trade.name}",
                    details=log_details
                )
            except Exception as log_error:
                logger.error(f"記錄交易日誌時發生錯誤: {log_error}")
                logger.error(traceback.format_exc())

        except Exception as e:
            logger.error(f"處理交易創建後操作時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def get_pair_trade(self, trade_id: str, user_id: str) -> Optional[PairTrade]:
        """
        獲取配對交易

        Args:
            trade_id: 交易ID
            user_id: 用戶ID

        Returns:
            Optional[PairTrade]: 配對交易，如果不存在則返回None
        """
        await self._ensure_initialized()

        try:
            # 獲取當前事件循環 ID
            loop = asyncio.get_running_loop()
            current_loop_id = id(loop)
            logger.debug(f"獲取配對交易 (ID: {trade_id}, 事件循環ID: {current_loop_id})")

            # 使用 _id 字段查詢
            trade = await self.collection.find_one({"_id": ObjectId(trade_id), "user_id": user_id})

            if trade:
                # 處理 _id 字段
                trade_id = str(trade.pop("_id"))
                pair_trade = PairTrade(**trade)
                # 動態設置 id 字段用於 API 響應
                pair_trade.id = trade_id
                return pair_trade

            logger.warning(f"未找到交易: {trade_id}, 用戶: {user_id}")
            return None
        except Exception as e:
            logger.error(f"獲取配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def get_user_pair_trades(self, user_id: str, status: str = "active") -> List[PairTrade]:
        """
        獲取用戶的所有配對交易

        Args:
            user_id: 用戶ID
            status: 交易狀態，可選，如果提供則只返回指定狀態的交易

        Returns:
            List[PairTrade]: 配對交易列表
        """
        await self._ensure_initialized()

        try:
            # 獲取當前事件循環
            loop = asyncio.get_running_loop()
            current_loop_id = id(loop)
            logger.debug(
                f"獲取用戶配對交易 (用戶: {user_id}, 狀態: {status}, 事件循環ID: {current_loop_id})")

            # 構建查詢條件
            query = {"user_id": user_id}
            if status:
                query["status"] = status

            # 查詢用戶的交易
            cursor = self.collection.find(query)
            trades = []

            # 使用 to_list 方法一次性獲取所有文檔，避免使用游標迭代
            docs = await cursor.to_list(length=100)

            for doc in docs:
                try:
                    # 將 _id 轉換為 id
                    if "_id" in doc:
                        doc["id"] = str(doc.pop("_id"))

                    # 創建 PairTrade 對象
                    trade = PairTrade(**doc)
                    trades.append(trade)
                except Exception as e:
                    logger.error(f"處理配對交易時發生錯誤: {e}")
                    logger.error(traceback.format_exc())

            return trades
        except Exception as e:
            logger.error(f"獲取用戶配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []

    async def get_pair_trades(self, user_id: str, status: str = "active") -> List[PairTrade]:
        """獲取配對交易列表

        Args:
            user_id: 用戶ID
            status: 交易狀態，可選值: active, closed, all

        Returns:
            配對交易列表
        """
        await self._ensure_initialized()

        try:
            # 設置查詢條件
            query = {"user_id": user_id}

            if status != "all":
                status_value = "closed" if status == "closed" else {"$ne": "closed"}
                query["status"] = status_value

            # 查詢交易信息
            result = await self.collection.find(query).to_list(100)

            # 如果沒有數據，直接返回空列表
            if not result:
                return []

            logger.info(f"從數據庫獲取到用戶 {user_id} 的 {len(result)} 個交易")

            # 轉換為PairTrade對象列表
            trades = []
            for trade_doc in result:
                # 處理 _id 字段
                if "_id" in trade_doc:
                    trade_id = str(trade_doc.pop("_id"))
                else:
                    trade_id = None

                # 轉換為PairTrade對象
                trade = PairTrade(**trade_doc)

                # 動態設置 id 字段用於 API 響應
                if trade_id:
                    trade.id = trade_id

                trades.append(trade)

            return trades
        except Exception as e:
            logger.error(f"獲取交易列表時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []

    async def update_pair_trade(
        self,
        trade_id: str,
        user_id: str,
        binance_service: BinanceService,
        pre_fetched_prices: Dict[str, float] = None
    ) -> Tuple[Optional[PairTrade], bool, Optional[str]]:
        """
        更新配對交易的狀態，計算當前盈虧，並檢查是否需要平倉

        Args:
            trade_id: 配對交易ID
            user_id: 用戶ID
            binance_service: 幣安服務實例
            pre_fetched_prices: 預先獲取的價格字典

        Returns:
            Tuple[Optional[PairTrade], bool, Optional[str]]:
                - 更新後的配對交易對象
                - 是否需要平倉
                - 平倉原因
        """
        # 獲取配對交易
        pair_trade = await self.get_pair_trade(trade_id, user_id)
        if not pair_trade:
            logger.error(f"未找到配對交易 {trade_id}")
            return None, False, None

        # 檢查交易是否已關閉
        if pair_trade.status != TradeStatus.ACTIVE:
            logger.info(f"配對交易 {trade_id} 已關閉，不需要更新")
            return pair_trade, False, None

        # 解析持倉信息
        try:
            # 檢查交易是否有持倉信息
            if not pair_trade.long_position or not pair_trade.short_position:
                logger.warning(f"交易 {trade_id} 缺少持倉信息")
                return pair_trade, False, None

            # 從配對交易中提取交易對
            long_symbol = pair_trade.long_position.symbol
            short_symbol = pair_trade.short_position.symbol

            # 優先使用預先獲取的價格 (由monitor批量獲取)
            long_current_price = None
            short_current_price = None

            if pre_fetched_prices:
                long_current_price = pre_fetched_prices.get(long_symbol)
                short_current_price = pre_fetched_prices.get(short_symbol)

                # 記錄是否使用了預先獲取的價格
                logger.debug(
                    f"交易 {trade_id} 使用預先獲取的價格: "
                    f"{long_symbol}={long_current_price}, "
                    f"{short_symbol}={short_current_price}"
                )

            # 如果預先獲取的價格不可用，使用WebSocket或API獲取
            if long_current_price is None:
                try:
                    # 使用 get_futures_price 方法獲取價格
                    long_current_price = await binance_service.get_futures_price(long_symbol)
                    if long_current_price:
                        long_current_price = float(long_current_price)
                except Exception as e:
                    logger.error(f"獲取 {long_symbol} 價格失敗: {e}")
                    return pair_trade, False, None

            if short_current_price is None:
                try:
                    # 使用 get_futures_price 方法獲取價格
                    short_current_price = await binance_service.get_futures_price(short_symbol)
                    if short_current_price:
                        short_current_price = float(short_current_price)
                except Exception as e:
                    logger.error(f"獲取 {short_symbol} 價格失敗: {e}")
                    return pair_trade, False, None

            # 檢查獲取到的價格是否有效
            if not long_current_price or not short_current_price:
                logger.warning(
                    f"獲取價格失敗: {long_symbol}={long_current_price}, {short_symbol}={short_current_price}")
                return pair_trade, False, None

            # 計算當前多空比率 (現有比率)
            current_ratio = long_current_price / short_current_price
            # 計算基準多空比率 (開倉時的比率)
            entry_ratio = pair_trade.long_position.entry_price / pair_trade.short_position.entry_price
            # 計算比率變化百分比
            ratio_percent = (current_ratio / entry_ratio - 1) * 100

            # 檢查是否需要平倉
            should_close = False
            close_reason = None

            # 新的停利邏輯
            if pair_trade.trailing_stop_enabled:
                # 停利模式：檢查是否跌破停利水位
                # 添加詳細的精度日誌
                logger.debug(f"停利檢查: ratio_percent={ratio_percent:.8f}%, "
                             f"trailing_stop_level={pair_trade.trailing_stop_level:.8f}%")

                if ratio_percent <= pair_trade.trailing_stop_level:
                    should_close = True
                    close_reason = "trailing_stop"
                    logger.info(f"觸發停利: {ratio_percent:.8f}% <= "
                                f"{pair_trade.trailing_stop_level:.8f}%")
            else:
                # 傳統止損模式
                if ratio_percent <= -pair_trade.stop_loss:
                    should_close = True
                    close_reason = "stop_loss"
                    logger.info(f"觸發止損: {ratio_percent:.2f}% <= -{pair_trade.stop_loss}%")

            # 止盈檢查（兩種模式都適用）
            if ratio_percent >= pair_trade.take_profit:
                should_close = True
                close_reason = "take_profit"
                logger.info(f"觸發止盈: {ratio_percent:.2f}% >= {pair_trade.take_profit}%")

            # 計算多單盈虧
            long_pnl = (long_current_price - pair_trade.long_position.entry_price) * pair_trade.long_position.quantity
            long_pnl_percent = (long_current_price / pair_trade.long_position.entry_price - 1) * 100 * pair_trade.long_position.leverage

            # 計算空單盈虧
            short_pnl = (pair_trade.short_position.entry_price - short_current_price) * pair_trade.short_position.quantity
            short_pnl_percent = (pair_trade.short_position.entry_price / short_current_price - 1) * 100 * pair_trade.short_position.leverage

            # 計算總盈虧
            total_pnl = long_pnl + short_pnl

            # 更新持倉信息
            pair_trade.long_position.current_price = long_current_price
            pair_trade.long_position.pnl = long_pnl
            pair_trade.long_position.pnl_percent = long_pnl_percent

            pair_trade.short_position.current_price = short_current_price
            pair_trade.short_position.pnl = short_pnl
            pair_trade.short_position.pnl_percent = short_pnl_percent

            # 更新總盈虧
            pair_trade.total_pnl_value = total_pnl
            pair_trade.total_ratio_percent = ratio_percent

            # 計算當前比率
            current_ratio = long_current_price / short_current_price
            entry_ratio = pair_trade.long_position.entry_price / pair_trade.short_position.entry_price

            # 更新最高/最低比率
            pair_trade.max_ratio = max(pair_trade.max_ratio or entry_ratio, current_ratio)
            pair_trade.min_ratio = min(pair_trade.min_ratio or entry_ratio, current_ratio)

            # 計算 MAE 和 MFE （百分比變動）
            # MAE：最大不利變動（當前比率 < 入場比率的最大虧損程度）
            if pair_trade.min_ratio < entry_ratio:
                pair_trade.mae = abs(pair_trade.min_ratio / entry_ratio - 1) * 100
            else:
                pair_trade.mae = 0  # 如果沒有低於 entry_ratio，則無不利變動

            # MFE：最大有利變動（當前比率 > 入場比率的最大獲利程度）
            if pair_trade.max_ratio > entry_ratio:
                pair_trade.mfe = abs(pair_trade.max_ratio / entry_ratio - 1) * 100
            else:
                pair_trade.mfe = 0  # 如果沒有高於 entry_ratio，則無有利變動

            # 使用不同顏色標記不同類型的信息
            # 將標題行的格式統一，使用一種分隔線樣式
            # logger.info(f"{'='*20} 交易 {pair_trade.name} ({pair_trade.id}) 詳細資訊 {'='*20}")

            # # 綠色表示正數，紅色表示負數
            # GREEN_COLOR = "\033[32m"
            # ORANGE_COLOR = "\033[33m"
            # RED_COLOR = "\033[31m"
            # RESET_COLOR = "\033[33m"
            # TITLE_COLOR = "\033[33m"

            # profit_color = GREEN_COLOR if pair_trade.total_ratio_percent > 0 else RED_COLOR

            # # 日誌輸出使用顏色
            # logger.info(f"總體表現: {profit_color}{self._format_number(pair_trade.total_ratio_percent, 2)}%{RESET_COLOR}")
            # logger.info(f"  盈虧金額:   {profit_color}{self._format_number(pair_trade.total_pnl_value, 2)}{RESET_COLOR}")
            # logger.info(f"  價格比變動: {ORANGE_COLOR}{self._format_number(entry_ratio, 6)} → {self._format_number(current_ratio, 6)}{RESET_COLOR}")

            # # 多空頭詳情使用表格樣式 - 完全改進表格對齊
            # logger.info("多空頭詳情:")
            # logger.info(f"  {'類型':<6}  {'盈虧':<10}  {'盈虧比例':<10}  {'入場價':<12}  {'當前價':<12}  {'數量':<8}")

            # # 為多頭設置顏色 - 改進格式化確保完美對齊
            # long_color = GREEN_COLOR if pair_trade.long_position.pnl_percent > 0 else RED_COLOR
            # logger.info(f"  {'多頭':<6}  {long_color}{self._format_number(pair_trade.long_position.pnl, 2)}{RESET_COLOR}  {long_color}{self._format_number(pair_trade.long_position.pnl_percent, 2)}%{RESET_COLOR}  {pair_trade.long_position.entry_price:<12.6f}  {long_current_price:<12.6f}  {pair_trade.long_position.quantity:<8.4f}")

            # # 為空頭設置顏色 - 改進格式化確保完美對齊
            # short_color = GREEN_COLOR if pair_trade.short_position.pnl_percent > 0 else RED_COLOR
            # logger.info(f"  {'空頭':<6}  {short_color}{self._format_number(pair_trade.short_position.pnl, 2)}{RESET_COLOR}  {short_color}{self._format_number(pair_trade.short_position.pnl_percent, 2)}%{RESET_COLOR}  {pair_trade.short_position.entry_price:<12.6f}  {short_current_price:<12.6f}  {pair_trade.short_position.quantity:<8.4f}")

            # # 風險指標使用不同顏色
            # logger.info("風險指標:")
            # logger.info(f"  最大不利變動 (MAE): {RED_COLOR}{self._format_number(pair_trade.mae, 2)}%{RESET_COLOR}")
            # logger.info(f"  最大有利變動 (MFE): {GREEN_COLOR}{self._format_number(pair_trade.mfe, 2)}%{RESET_COLOR}")
            # # 繼續使用底部分隔線
            # logger.info(f"{'='*70}")

            """記錄配對交易的詳細資訊"""
            # 定義顏色
            RESET_COLOR = "\033[0m"
            # GREEN_COLOR = "\033[32m"  # 未使用
            BRIGHT_BLACK = "\033[90m"
            BRIGHT_GREEN = "\033[92m"
            ORANGE_COLOR = "\033[33m"
            # RED_COLOR = "\033[31m"  # 未使用
            BRIGHT_RED = "\033[91m"
            # BLUE_COLOR = "\033[34m"  # 未使用
            BRIGHT_BLUE = "\033[94m"
            BLUE_BACKGROUND = "\033[104m"

            # 標題
            logger.info(f"{BLUE_BACKGROUND}{BRIGHT_BLUE}{'='*20} 交易 {pair_trade.name} ({trade_id}) 詳細資訊 {'='*20}{RESET_COLOR}")

            # 總體表現
            profit_color = BRIGHT_GREEN if pair_trade.total_ratio_percent > 0 else BRIGHT_RED
            logger.info(f"{BRIGHT_BLUE}總體表現:{RESET_COLOR} {profit_color}{self._format_number(pair_trade.total_ratio_percent, 2)}%{RESET_COLOR}")
            logger.info(f"{BRIGHT_BLUE}  盈虧金額:{RESET_COLOR}   {profit_color}{self._format_number(pair_trade.total_pnl_value, 2)}{RESET_COLOR}")
            logger.info(f"{BRIGHT_BLUE}  價格比變動:{RESET_COLOR} {ORANGE_COLOR}{self._format_number(entry_ratio, 6)} → {self._format_number(current_ratio, 6)}{RESET_COLOR}")

            # 新增保護模式顯示
            protection_mode = "停利保護" if pair_trade.trailing_stop_enabled else "傳統止損"
            protection_level = pair_trade.trailing_stop_level if pair_trade.trailing_stop_enabled else pair_trade.stop_loss
            protection_symbol = "🛡️" if pair_trade.trailing_stop_enabled else "⚠️"
            logger.info(f"{BRIGHT_BLUE}  保護模式:{RESET_COLOR} {protection_symbol} {protection_mode} ({protection_level}%)")

            # 多空頭詳情
            logger.info(f"{BRIGHT_BLUE}多空頭詳情:{RESET_COLOR}")
            logger.info(f"{BRIGHT_BLACK}  {'類型':<6}  {'盈虧':<10}  {'盈虧比例':<10}  {'入場價':<12}  {'當前價':<12}  {'數量':<8}{RESET_COLOR}")

            # 多頭
            long_color = BRIGHT_GREEN if pair_trade.long_position.pnl_percent > 0 else BRIGHT_RED
            logger.info(f"{BRIGHT_BLACK}  {'多頭':<6}  {long_color}{self._format_number(pair_trade.long_position.pnl, 2):<10}{RESET_COLOR}  " +
                        f"{long_color}{self._format_number(pair_trade.long_position.pnl_percent, 2):<10}%{RESET_COLOR}  " +
                        f"{self._format_number(pair_trade.long_position.entry_price, 6):<12}  " +
                        f"{self._format_number(long_current_price, 6):<12}  " +
                        f"{self._format_number(pair_trade.long_position.quantity, 4):<8}")

            # 空頭
            short_color = BRIGHT_GREEN if pair_trade.short_position.pnl_percent > 0 else BRIGHT_RED
            logger.info(f"{BRIGHT_BLACK}  {'空頭':<6}  {short_color}{self._format_number(pair_trade.short_position.pnl, 2):<10}{RESET_COLOR}  " +
                        f"{short_color}{self._format_number(pair_trade.short_position.pnl_percent, 2):<10}%{RESET_COLOR}  " +
                        f"{self._format_number(pair_trade.short_position.entry_price, 6):<12}  " +
                        f"{self._format_number(short_current_price, 6):<12}  " +
                        f"{self._format_number(pair_trade.short_position.quantity, 4):<8}")

            # 風險指標
            logger.info(f"{BRIGHT_BLUE}風險指標:{RESET_COLOR}")
            logger.info(f"{BRIGHT_BLACK}  最大不利變動 (MAE): {BRIGHT_RED}{self._format_number(pair_trade.mae, 2)}%{RESET_COLOR}")
            logger.info(f"{BRIGHT_BLACK}  最大有利變動 (MFE): {BRIGHT_GREEN}{self._format_number(pair_trade.mfe, 2)}%{RESET_COLOR}")
            logger.info(f"{BLUE_BACKGROUND}{BRIGHT_BLUE}{'='*70}{RESET_COLOR}")

            # 更新最後更新時間
            pair_trade.updated_at = get_utc_now()

            # 儲存更新後的交易記錄
            update_data = {
                "status": pair_trade.status,
                "total_pnl_value": pair_trade.total_pnl_value,
                "total_ratio_percent": pair_trade.total_ratio_percent,
                "long_position": self._clean_unserializable_objects(pair_trade.long_position.dict()) if pair_trade.long_position else None,
                "short_position": self._clean_unserializable_objects(pair_trade.short_position.dict()) if pair_trade.short_position else None,
                "max_ratio": pair_trade.max_ratio,
                "min_ratio": pair_trade.min_ratio,
                "mae": pair_trade.mae,
                "mfe": pair_trade.mfe
            }

            # 更新交易記錄
            try:
                update_result = await self._update_trade_data_async(trade_id, user_id, update_data)
                if update_result and update_result.matched_count > 0:
                    logger.debug(f"成功更新交易 {trade_id} 記錄")
                else:
                    logger.error(f"更新交易記錄 {trade_id} 失敗")
            except Exception as update_error:
                logger.error(f"更新交易記錄 {trade_id} 時發生錯誤: {update_error}")
                logger.error(traceback.format_exc())
                # 即使更新數據庫失敗，我們也繼續後續流程，不要中斷

            # 返回更新結果
            return pair_trade, should_close, close_reason

        except Exception as e:
            logger.error(f"更新配對交易 {trade_id} 時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return pair_trade, False, None

    def _format_number(self, value, max_decimals=8):
        """格式化數字，移除不必要的尾隨零，但保留必要的精度"""
        if value is None:
            return "0"

        if isinstance(value, str):
            try:
                value = float(value)
            except ValueError:
                return value

        # 將數字格式化為字符串，保留最大小數位數
        formatted = f"{value:.{max_decimals}f}"

        # 如果有小數點，移除尾隨零和可能的小數點
        if '.' in formatted:
            formatted = formatted.rstrip('0').rstrip('.') if '.' in formatted else formatted

        return formatted

    def _clean_unserializable_objects(self, data):
        """
        清理不可序列化的物件 (如 BinanceService)

        Args:
            data: 需要清理的資料結構

        Returns:
            清理後的資料結構
        """
        if not isinstance(data, dict):
            return data

        result = {}
        for k, v in data.items():
            # 跳過 BinanceService 物件
            if hasattr(v, "__class__") and v.__class__.__name__ == "BinanceService":
                continue
            # 遞歸處理嵌套的字典
            elif isinstance(v, dict):
                result[k] = self._clean_unserializable_objects(v)
            # 遞歸處理列表
            elif isinstance(v, list):
                result[k] = [self._clean_unserializable_objects(item) if isinstance(item, dict) else item for item in v]
            else:
                result[k] = v
        return result

    async def _get_and_check_trade(self, trade_id: str, user_id: str, binance_service: BinanceService) -> Optional[PairTrade]:
        """
        獲取交易並檢查其狀態

        Args:
            trade_id: 交易ID
            user_id: 用戶ID
            binance_service: 幣安服務實例

        Returns:
            Optional[PairTrade]: 交易對象，如果不存在或發生錯誤則返回None
        """
        # 先確保服務已初始化
        await self._ensure_initialized()

        # 獲取交易
        try:
            # 先從數據庫獲取交易
            trade = await self.get_pair_trade(trade_id, user_id)

            if not trade:
                logger.warning(f"未找到交易 {trade_id}")
                return None

            # 如果交易已關閉，直接返回，不需要再更新
            if trade.status == "closed":
                logger.info(f"交易 {trade_id} 已關閉，不需更新")
                return trade

            # 返回交易對象
            return trade

        except Exception as e:
            logger.error(f"獲取交易信息時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _get_prices_and_calculate_pnl(self, trade: PairTrade, binance_service: BinanceService) -> Optional[Dict[str, Any]]:
        """
        獲取最新價格並計算盈虧

        Args:
            trade: 交易對象
            binance_service: 幣安服務實例

        Returns:
            Optional[Dict[str, Any]]: 價格和盈虧數據，如果失敗則返回None
        """
        try:
            # 1. 獲取最新價格
            long_price = await binance_service.get_futures_price(trade.long_position.symbol)
            short_price = await binance_service.get_futures_price(trade.short_position.symbol)

            # 檢查價格
            try:
                long_current_price = float(long_price)
                short_current_price = float(short_price)
            except (TypeError, ValueError) as e:
                logger.error(f"價格格式轉換錯誤: {e}, long_current_price={long_price}, short_current_price={short_price}")
                return None

            # 檢查價格有效性
            if not long_current_price or not short_current_price or long_current_price <= 0 or short_current_price <= 0:
                logger.warning(
                    f"無法獲取價格信息: {trade.long_position.symbol}={long_current_price}, {trade.short_position.symbol}={short_current_price}")
                return None

            # 獲取各種參數
            long_entry_price = trade.long_position.entry_price
            short_entry_price = trade.short_position.entry_price
            long_quantity = trade.long_position.quantity
            short_quantity = trade.short_position.quantity

            # 計算入場比率和當前比率
            entry_ratio = long_entry_price / short_entry_price
            current_ratio = long_current_price / short_current_price

            # 計算盈虧
            ratio_pnl = (current_ratio - entry_ratio) / entry_ratio
            long_pnl_value = (long_current_price - long_entry_price) * long_quantity
            short_pnl_value = (short_entry_price - short_current_price) * short_quantity
            total_pnl_value = long_pnl_value + short_pnl_value

            # 計算盈虧百分比
            long_pnl_percent = (long_current_price - long_entry_price) / long_entry_price * 100
            short_pnl_percent = (short_entry_price - short_current_price) / short_entry_price * 100
            total_ratio_percent = ratio_pnl * 100

            # 更新最大和最小比率
            max_ratio = max(entry_ratio, current_ratio)
            min_ratio = min(entry_ratio, current_ratio)

            # 計算 MAE 和 MFE
            ratio_mae = abs((entry_ratio - min_ratio) / entry_ratio) * 100
            ratio_mfe = abs((max_ratio - entry_ratio) / entry_ratio) * 100

            # 使用不同顏色標記不同類型的信息
            # 將標題行的格式統一，使用一種分隔線樣式
            logger.info(f"{'='*20} 交易 {trade.name} ({trade.id}) 詳細資訊 {'='*20}")

            # 綠色表示正數，紅色表示負數
            GREEN_COLOR = "\033[32m"
            RED_COLOR = "\033[31m"
            RESET_COLOR = "\033[0m"

            profit_color = GREEN_COLOR if total_ratio_percent > 0 else RED_COLOR

            # 日誌輸出使用顏色
            logger.info(f"總體表現: {profit_color}{total_ratio_percent:+.2f}%{RESET_COLOR}")
            logger.info(f"  盈虧金額:   {profit_color}{total_pnl_value:+.2f}{RESET_COLOR}")
            logger.info(f"  價格比變動: {entry_ratio:.6f} → {current_ratio:.6f}")

            # 多空頭詳情使用表格樣式 - 完全改進表格對齊
            logger.info("多空頭詳情:")
            logger.info(f"  {'類型':<6}  {'盈虧':<10}  {'盈虧比例':<10}  {'入場價':<12}  {'當前價':<12}  {'數量':<8}")

            # 為多頭設置顏色 - 改進格式化確保完美對齊
            long_color = GREEN_COLOR if long_pnl_percent > 0 else RED_COLOR
            logger.info(f"  {'多頭':<6}  {long_color}{long_pnl_value:+9.2f}{RESET_COLOR}  {long_color}{long_pnl_percent:+7.2f}%{RESET_COLOR}  {long_entry_price:<12.6f}  {long_current_price:<12.6f}  {long_quantity:<8.4f}")

            # 為空頭設置顏色 - 改進格式化確保完美對齊
            short_color = GREEN_COLOR if short_pnl_percent > 0 else RED_COLOR
            logger.info(f"  {'空頭':<6}  {short_color}{short_pnl_value:+9.2f}{RESET_COLOR}  {short_color}{short_pnl_percent:+7.2f}%{RESET_COLOR}  {short_entry_price:<12.6f}  {short_current_price:<12.6f}  {short_quantity:<8.4f}")

            # 風險指標使用不同顏色
            logger.info("風險指標:")
            logger.info(f"  最大不利變動 (MAE): {RED_COLOR}{ratio_mae:.2f}%{RESET_COLOR}")
            logger.info(f"  最大有利變動 (MFE): {GREEN_COLOR}{ratio_mfe:.2f}%{RESET_COLOR}")
            # 繼續使用底部分隔線
            logger.info(f"{'='*70}")

            return {
                "long_position.current_price": long_current_price,
                "short_position.current_price": short_current_price,
                "long_position.pnl": long_pnl_value,
                "short_position.pnl": short_pnl_value,
                "total_pnl_value": total_pnl_value,
                "long_position.pnl_percent": long_pnl_percent,
                "short_position.pnl_percent": short_pnl_percent,
                "total_ratio_percent": total_ratio_percent,
                "max_ratio": max_ratio,
                "min_ratio": min_ratio,
                "mae": ratio_mae,
                "mfe": ratio_mfe,
            }
        except Exception as e:
            logger.error(f"計算盈虧時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    def _check_close_conditions(self, trade: PairTrade, total_pnl_percent: float, total_pnl_value: float) -> Tuple[bool, Optional[str]]:
        """檢查是否需要平倉"""
        should_close = False
        close_reason = None

        # 檢查止盈條件
        if trade.take_profit > 0 and total_pnl_percent >= trade.take_profit:
            should_close = True
            close_reason = f"止盈: {total_pnl_percent:.2f}% >= {trade.take_profit}%"
            logger.info(
                f"交易 {trade.name} ({trade.id}) 達到止盈條件: {total_pnl_percent:.2f}% >= {trade.take_profit}%")

        # 檢查止損條件
        elif trade.stop_loss > 0 and total_pnl_percent <= -trade.stop_loss:
            should_close = True
            close_reason = f"止損: {total_pnl_percent:.2f}% <= -{trade.stop_loss}%"
            logger.info(
                f"交易 {trade.name} ({trade.id}) 達到止損條件: {total_pnl_percent:.2f}% <= -{trade.stop_loss}%")

        # 檢查最大虧損
        elif trade.max_loss > 0 and total_pnl_value <= -trade.max_loss:
            should_close = True
            close_reason = f"最大虧損: {total_pnl_value:.2f} USDT <= -{trade.max_loss} USDT"
            logger.info(
                f"交易 {trade.name} ({trade.id}) 達到最大虧損條件: {total_pnl_value:.2f} USDT <= -{trade.max_loss} USDT")

        return should_close, close_reason

    async def _handle_close_trade(self, trade: PairTrade, user_id: str, close_reason: str,
                                  binance_service: BinanceService, update_data: Dict[str, Any]) -> Tuple[PairTrade, bool, str]:
        """處理平倉操作"""
        try:
            # 執行平倉操作
            close_result = await self._execute_close_trade_immediately(trade, binance_service)
            if close_result:
                # 更新交易狀態為已關閉
                trade.status = TradeStatus.CLOSED
                trade.close_reason = close_reason
                trade.closed_at = get_utc_now()

                # 優先更新數據庫中的交易狀態
                status_update_result = await self.collection.update_one(
                    {"id": trade.id, "user_id": user_id},
                    {"$set": {
                        "status": trade.status,
                        "close_reason": trade.close_reason,
                        "closed_at": trade.closed_at,
                        "long_position.exit_price": close_result["long_position.exit_price"],
                        "short_position.exit_price": close_result["short_position.exit_price"],
                        "long_position.exit_fee": close_result["long_position.exit_fee"],
                        "short_position.exit_fee": close_result["short_position.exit_fee"],
                        "long_position.exit_order_id": str(close_result["long_order"]["orderId"]),
                        "short_position.exit_order_id": str(close_result["short_order"]["orderId"]),
                    }}
                )

                if status_update_result.modified_count > 0:
                    logger.info(f"已更新交易狀態為已關閉: {trade.name} ({trade.id})")
                else:
                    logger.warning(f"更新交易狀態失敗: {trade.name} ({trade.id})")

                # 啟動背景任務處理後續操作
                asyncio.create_task(self._process_closed_trade(
                    user_id, trade, close_result, close_reason))

                # 使用背景任務更新其他交易數據
                asyncio.create_task(self._update_trade_data_async(
                    trade.id, user_id, update_data))

                return trade, False, close_reason
            else:
                logger.error(f"立即執行平倉操作失敗: {trade.name} ({trade.id})")
                # 平倉失敗，仍然更新數據庫
                asyncio.create_task(self._update_trade_data_async(
                    trade.id, user_id, update_data))
                return trade, True, close_reason
        except Exception as e:
            logger.error(f"處理平倉操作時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return trade, False, str(e)

    async def _execute_close_trade_immediately(self, trade: PairTrade, binance_service: BinanceService) -> Optional[Dict[str, Any]]:
        """
        立即關閉配對交易

        Args:
            trade: 交易對象
            binance_service: 幣安服務實例

        Returns:
            Optional[Dict[str, Any]]: 關閉結果
        """
        try:
            # 檢查交易是否已關閉
            if trade.status == "closed":
                logger.warning(f"交易 {trade.id} 已經關閉，不能再次關閉")
                return None

            # 如果是測試模式，使用模擬數據
            # 檢查交易名稱開頭是否為 "TEST_" 來判斷是否為測試交易
            if trade.name and trade.name.startswith("TEST_"):
                logger.info(f"測試模式下關閉交易 {trade.id}")
                # 獲取最新期貨價格
                long_price = await binance_service.get_futures_price(trade.long_position.symbol)
                short_price = await binance_service.get_futures_price(trade.short_position.symbol)

                # 創建模擬平倉結果
                close_result = {
                    "long_position.exit_price": float(long_price) if long_price else trade.long_position.entry_price,
                    "short_position.exit_price": float(short_price) if short_price else trade.short_position.entry_price,
                    "long_position.exit_fee": 0,
                    "short_position.exit_fee": 0,
                    "long_order": {"orderId": "test_" + str(int(time.time()))},
                    "short_order": {"orderId": "test_" + str(int(time.time()) + 1)}
                }
                return close_result

            # 實際執行平倉
            # 1. 獲取持倉信息
            long_symbol = trade.long_position.symbol
            short_symbol = trade.short_position.symbol
            long_quantity = trade.long_position.quantity
            short_quantity = trade.short_position.quantity

            # 2. 執行平倉操作
            logger.info(
                f"關閉配對交易 {trade.id}: 多頭={long_symbol}, 數量={long_quantity}; 空頭={short_symbol}, 數量={short_quantity}")

            try:
                # 確保 binance_service 是正確的實例
                from app.services.binance_service import BinanceService
                if not isinstance(binance_service, BinanceService):
                    logger.error(f"binance_service 不是有效的 BinanceService 實例: {type(binance_service)}")
                    # 重新創建 BinanceService 實例並初始化
                    binance_service = BinanceService(user_id=trade.user_id)
                    await binance_service._ensure_initialized()  # 使用正確的初始化方法

                # 執行平倉操作
                close_orders = await binance_service.close_pair_position(
                    long_symbol=long_symbol,
                    long_quantity=long_quantity,
                    short_symbol=short_symbol,
                    short_quantity=short_quantity
                )
                logger.info(f"平倉成功: {close_orders}")

                # 3. 獲取平倉價格
                long_order = close_orders.get("long_order", {})
                short_order = close_orders.get("short_order", {})

                # 獲取實際平倉價格
                long_exit_price = float(long_order.get("avgPrice", 0))
                short_exit_price = float(short_order.get("avgPrice", 0))

                # 如果沒有獲取到實際平倉價格，嘗試從訂單詳情獲取
                if long_exit_price <= 0 or short_exit_price <= 0:
                    try:
                        # 獲取多單平倉訂單詳情
                        if long_exit_price <= 0 and "orderId" in long_order:
                            long_order_details = await binance_service.get_futures_order(
                                symbol=long_symbol,
                                order_id=long_order["orderId"]
                            )
                            long_exit_price = float(
                                long_order_details.get('avgPrice', 0))

                        # 獲取空單平倉訂單詳情
                        if short_exit_price <= 0 and "orderId" in short_order:
                            short_order_details = await binance_service.get_futures_order(
                                symbol=short_symbol,
                                order_id=short_order["orderId"]
                            )
                            short_exit_price = float(
                                short_order_details.get('avgPrice', 0))

                        logger.info(
                            f"從訂單詳情獲取到實際平倉價格: 多單={long_exit_price}, 空單={short_exit_price}")
                    except Exception as e:
                        logger.error(f"獲取訂單詳情時發生錯誤: {e}")

                # 如果仍然無法獲取實際平倉價格，使用市場價格
                if long_exit_price <= 0:
                    logger.warning(f"無法獲取多單 {long_symbol} 的實際平倉價格，使用市場價格")
                    try:
                        market_price = await binance_service.get_futures_price(long_symbol)
                        long_exit_price = float(market_price)
                    except Exception as e:
                        logger.error(f"獲取多單市場價格失敗: {e}")
                        long_exit_price = trade.long_position.entry_price

                if short_exit_price <= 0:
                    logger.warning(f"無法獲取空單 {short_symbol} 的實際平倉價格，使用市場價格")
                    try:
                        market_price = await binance_service.get_futures_price(short_symbol)
                        short_exit_price = float(market_price)
                    except Exception as e:
                        logger.error(f"獲取空單市場價格失敗: {e}")
                        short_exit_price = trade.short_position.entry_price

                # 4. 獲取平倉手續費
                long_exit_fee = 0
                short_exit_fee = 0

                try:
                    if "orderId" in long_order:
                        long_fee = await binance_service.get_trade_fee(long_symbol, long_order["orderId"])
                        long_exit_fee = float(long_fee) if long_fee is not None else 0
                    if "orderId" in short_order:
                        short_fee = await binance_service.get_trade_fee(short_symbol, short_order["orderId"])
                        short_exit_fee = float(short_fee) if short_fee is not None else 0
                except Exception as e:
                    logger.error(f"獲取平倉手續費失敗: {e}")

                # 5. 創建平倉結果
                close_result = {
                    "long_position.exit_price": long_exit_price,
                    "short_position.exit_price": short_exit_price,
                    "long_position.exit_fee": long_exit_fee,
                    "short_position.exit_fee": short_exit_fee,
                    "long_order": long_order,
                    "short_order": short_order
                }
                return close_result
            except Exception as e:
                logger.error(f"執行平倉操作失敗: {e}")
                logger.error(traceback.format_exc())

                # --- 添加緊急通知 ---
                try:
                    error_message = str(e)
                    title = f"【緊急】配對交易自動平倉失敗！({trade.name})"
                    message = (
                        f"交易ID: {trade.id}\n"
                        f"名稱: {trade.name}\n"
                        f"多頭: {trade.long_position.symbol}, 應平數量: {long_quantity}\n"
                        f"空頭: {trade.short_position.symbol}, 應平數量: {short_quantity}\n"
                        f"原因: 自動平倉操作遇到錯誤。\n"
                        f"錯誤詳情: {error_message[:100]}{'...' if len(error_message) > 100 else ''}\n\n"
                        f"‼️ 請立即登入交易所手動檢查並平倉此交易對的倉位 (多單賣出 {long_quantity} {trade.long_position.symbol}, 空單買入 {short_quantity} {trade.short_position.symbol})，以避免造成額外損失！"
                    )
                    # 嘗試發送通知
                    await notification_service.send_notification(
                        user_id=trade.user_id,
                        title=title,
                        message=message,
                        # 可以考慮添加更多數據，例如 trade 對象本身
                        data=trade.dict()
                    )
                    logger.info(f"已為交易 {trade.id} 發送自動平倉失敗通知。")
                except Exception as notify_err:
                    logger.error(f"發送自動平倉失敗通知時也發生錯誤: {notify_err}")
                # --- 通知結束 ---

                return None
        except Exception as e:
            logger.error(f"關閉配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _update_trade_after_closing(self, trade: PairTrade, close_result: Dict[str, Any], close_reason: str) -> Optional[PairTrade]:
        """
        更新交易記錄（平倉後）

        Args:
            trade: 交易對象
            close_result: 平倉結果
            close_reason: 平倉原因

        Returns:
            Optional[PairTrade]: 更新後的交易對象，如果失敗則返回None
        """
        try:
            # 獲取退出訂單ID
            long_exit_order_id = str(close_result.get(
                "long_order", {}).get("orderId", ""))
            short_exit_order_id = str(close_result.get(
                "short_order", {}).get("orderId", ""))

            # 獲取退出價格
            # 多單退出價格邏輯
            if "long_order" in close_result and "avgPrice" in close_result["long_order"]:
                long_exit_price = float(
                    close_result["long_order"]["avgPrice"])
                logger.info(f"使用多單實際成交價格: {long_exit_price}")
            elif "long_price" in close_result:
                long_exit_price = close_result["long_price"]
                logger.warning(f"無法獲取多單實際成交價，使用預估價格: {long_exit_price}")
            else:
                # 若無法獲取任何價格，使用當前價格
                try:
                    long_exit_price = trade.long_position.current_price
                    logger.warning(f"無法獲取多單平倉價格，使用當前價格: {long_exit_price}")
                except Exception as e:
                    logger.error(f"獲取多單當前價格失敗: {e}")
                    long_exit_price = trade.long_position.entry_price
                    logger.warning(f"使用多單入場價格作為平倉價格: {long_exit_price}")

            # 空單退出價格邏輯
            if "short_order" in close_result and "avgPrice" in close_result["short_order"]:
                short_exit_price = float(
                    close_result["short_order"]["avgPrice"])
                logger.info(f"使用空單實際成交價格: {short_exit_price}")
            elif "short_price" in close_result:
                short_exit_price = close_result["short_price"]
                logger.warning(f"無法獲取空單實際成交價，使用預估價格: {short_exit_price}")
            else:
                # 若無法獲取任何價格，使用當前價格
                try:
                    short_exit_price = trade.short_position.current_price
                    logger.warning(f"無法獲取空單平倉價格，使用當前價格: {short_exit_price}")
                except Exception as e:
                    logger.error(f"獲取空單當前價格失敗: {e}")
                    short_exit_price = trade.short_position.entry_price
                    logger.warning(f"使用空單入場價格作為平倉價格: {short_exit_price}")

            # 獲取平倉手續費
            try:
                # 多單平倉手續費
                long_exit_fee = close_result.get("long_exit_fee", 0)
                if long_exit_fee == 0:
                    # 估算手續費
                    fee_rate = 0.0005  # 基本費率 0.05%
                    long_exit_fee = long_exit_price * trade.long_position.quantity * fee_rate

                # 空單平倉手續費
                short_exit_fee = close_result.get("short_exit_fee", 0)
                if short_exit_fee == 0:
                    # 估算手續費
                    fee_rate = 0.0005  # 基本費率 0.05%
                    short_exit_fee = short_exit_price * trade.short_position.quantity * fee_rate
            except Exception as fee_error:
                logger.error(f"獲取平倉手續費失敗: {fee_error}")
                long_exit_fee = 0
                short_exit_fee = 0

            # 計算總手續費
            total_exit_fee = long_exit_fee + short_exit_fee
            total_fee = (trade.total_entry_fee + total_exit_fee)

            # 計算PnL
            long_pnl = (long_exit_price - trade.long_position.entry_price) * trade.long_position.quantity
            short_pnl = (trade.short_position.entry_price - short_exit_price) * trade.short_position.quantity
            total_pnl = long_pnl + short_pnl  # 未扣除手續費的總盈虧
            net_pnl = total_pnl - total_fee  # 扣除手續費後的淨盈虧

            # 計算入場比率和當前比率
            entry_ratio = trade.long_position.entry_price / trade.short_position.entry_price
            current_ratio = long_exit_price / short_exit_price
            total_ratio_percent = ((current_ratio - entry_ratio) / entry_ratio) * 100

            # 計算最終的 MAE 和 MFE
            max_ratio = trade.max_ratio
            min_ratio = trade.min_ratio

            max_ratio = max(max_ratio, current_ratio)
            min_ratio = min(min_ratio, current_ratio)

            # 計算 MAE 和 MFE
            ratio_mae = abs((entry_ratio - min_ratio) / entry_ratio) * 100
            ratio_mfe = abs((max_ratio - entry_ratio) / entry_ratio) * 100

            # 保存 MAE 和 MFE 到交易對象
            trade.max_ratio = max_ratio
            trade.min_ratio = min_ratio
            trade.mae = ratio_mae
            trade.mfe = ratio_mfe

            # 更新交易記錄
            trade.status = TradeStatus.CLOSED
            trade.close_reason = close_reason
            trade.closed_at = close_result.get("closed_at", get_utc_now())

            # 更新多單信息
            trade.long_position.exit_price = long_exit_price
            trade.long_position.exit_fee = long_exit_fee
            trade.long_position.exit_order_id = long_exit_order_id
            trade.long_position.pnl = long_pnl
            trade.long_position.pnl_percent = ((long_exit_price / trade.long_position.entry_price) - 1) * 100

            # 更新空單信息
            trade.short_position.exit_price = short_exit_price
            trade.short_position.exit_fee = short_exit_fee
            trade.short_position.exit_order_id = short_exit_order_id
            trade.short_position.pnl = short_pnl
            trade.short_position.pnl_percent = ((trade.short_position.entry_price / short_exit_price) - 1) * 100

            # 更新PnL信息
            trade.total_pnl = total_pnl  # 未扣除手續費的總盈虧
            trade.net_pnl = net_pnl  # 扣除手續費後的淨盈虧
            trade.total_pnl_value = total_pnl  # 保持向後兼容
            trade.total_ratio_percent = total_ratio_percent
            trade.total_fee = total_fee
            trade.total_exit_fee = total_exit_fee

            # 計算風險收益比
            if trade.max_loss > 0:
                trade.risk_reward_ratio = total_pnl / trade.max_loss  # 未扣除手續費
                trade.net_risk_reward_ratio = net_pnl / trade.max_loss  # 扣除手續費後

                # 保存更新
            update_data = trade.dict(exclude={"id"})
            update_data = self._clean_unserializable_objects(update_data)

            # 使用 _id 字段查詢
            update_result = await self.collection.update_one(
                {"_id": ObjectId(trade.id), "user_id": trade.user_id},
                {"$set": update_data}
            )

            if update_result.matched_count == 0:
                logger.error(f"更新交易記錄失敗，未找到匹配的文檔: {trade.id}")
                return None
            logger.info(
                f"成功更新交易記錄: {trade.name} ({trade.id}), 總盈虧: {total_pnl:.2f}, 淨盈虧: {net_pnl:.2f}, 比率變化: {total_ratio_percent:.2f}%")
            return trade
        except Exception as e:
            logger.error(f"更新交易記錄時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _handle_trade_history_and_stats(self, user_id: str, trade: PairTrade, close_result: Dict[str, Any]):
        """
        處理交易歷史和統計數據

        Args:
            user_id: 用戶ID
            trade: 交易對象
            close_result: 平倉結果
        """
        try:
            # 1. 創建交易歷史記錄
            try:
                trade_history = await trade_history_service.create_trade_history(
                    trade=trade,
                )
                logger.info(f"已創建交易歷史記錄，ID: {trade_history.id}")

                # 從 pair_trades 集合中刪除已關閉的交易
                # 如果是測試模式交易，不刪除原始交易記錄，以便前端能夠正確取得平倉結果
                if not trade.name.startswith("TEST_"):
                    try:
                        # 使用 _id 字段刪除
                        delete_result = await self.collection.delete_one({"_id": ObjectId(trade.id), "user_id": trade.user_id})

                        if delete_result.deleted_count > 0:
                            logger.info(f"已刪除交易記錄: {trade.id}")
                        else:
                            logger.warning(f"刪除交易記錄失敗，未找到匹配的文檔: {trade.id}")
                    except Exception as e:
                        logger.error(f"刪除交易 {trade.id} 時發生錯誤: {e}")
                        logger.error(traceback.format_exc())
            except Exception as e:
                logger.error(f"創建交易歷史記錄時發生錯誤: {e}")
                logger.error(traceback.format_exc())

            # 2. 更新各種統計數據（並行處理）
            try:
                tasks = [
                    self._update_equity_curve(user_id, trade),
                    self._update_market_performance(user_id, trade),
                    self._update_trade_performance(user_id, trade)
                ]
                await asyncio.gather(*tasks)
            except Exception as e:
                logger.error(f"更新統計數據時發生錯誤: {e}")
                logger.error(traceback.format_exc())
        except Exception as e:
            logger.error(f"處理交易歷史和統計數據時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _update_equity_curve(self, user_id: str, trade: PairTrade):
        """
        更新資金曲線

        Args:
            user_id: 用戶ID
            trade: 交易對象
        """
        try:
            equity_curve = await equity_curve_service.update_equity_curve(
                user_id=user_id,
                trade=trade
            )
            if equity_curve:
                logger.info(f"已更新資金曲線，ID: {equity_curve.id}")
            else:
                logger.warning("更新資金曲線失敗")
        except Exception as e:
            logger.error(f"更新資金曲線時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _update_market_performance(self, user_id: str, trade: PairTrade):
        """
        更新市場表現

        Args:
            user_id: 用戶ID
            trade: 交易對象
        """
        try:
            market_performances = await market_performance_service.update_market_performance(
                user_id=user_id,
                trade=trade
            )
            if market_performances:
                logger.info(f"已更新市場表現，數量: {len(market_performances)}")
            else:
                logger.warning("更新市場表現失敗")
        except Exception as e:
            logger.error(f"更新市場表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _update_trade_performance(self, user_id: str, trade: PairTrade):
        """
        更新交易表現

        Args:
            user_id: 用戶ID
            trade: 交易對象
        """
        try:
            # 更新每日交易表現
            daily_performance = await trade_performance_service.update_daily_performance(
                user_id=user_id,
                trade=trade
            )
            if daily_performance:
                logger.info(f"已更新每日交易表現，ID: {daily_performance.id}")
            else:
                logger.warning("更新每日交易表現失敗")

            # 更新每週交易表現
            weekly_performance = await trade_performance_service.update_weekly_performance(
                user_id=user_id,
                trade=trade
            )
            if weekly_performance:
                logger.info(f"已更新每週交易表現，ID: {weekly_performance.id}")
            else:
                logger.warning("更新每週交易表現失敗")

            # 更新每月交易表現
            monthly_performance = await trade_performance_service.update_monthly_performance(
                user_id=user_id,
                trade=trade
            )
            if monthly_performance:
                logger.info(f"已更新每月交易表現，ID: {monthly_performance.id}")
            else:
                logger.warning("更新每月交易表現失敗")
        except Exception as e:
            logger.error(f"更新交易表現時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _handle_post_trade_closing(self, user_id: str, trade: PairTrade, close_result: Dict[str, Any], close_reason: str):
        """
        處理交易關閉後的操作

        Args:
            user_id: 用戶ID
            trade: 交易對象
            close_result: 平倉結果
            close_reason: 平倉原因
        """
        try:
            # 更新用戶的交易統計
            await self._handle_trade_history_and_stats(user_id, trade, close_result)

            # 更新股權曲線
            await self._update_equity_curve(user_id, trade)

            # 更新市場表現
            await self._update_market_performance(user_id, trade)

            # 更新交易表現
            await self._update_trade_performance(user_id, trade)

            # 記錄交易日誌
            try:
                log_details = {
                    "long_symbol": trade.long_position.symbol,
                    "short_symbol": trade.short_position.symbol,
                    "long_exit_price": trade.long_position.exit_price if hasattr(trade.long_position, 'exit_price') else 0,
                    "short_exit_price": trade.short_position.exit_price if hasattr(trade.short_position, 'exit_price') else 0,
                    "total_pnl": trade.total_pnl,
                    "total_pnl_percent": trade.total_ratio_percent,
                    "net_pnl": trade.net_pnl,
                    "entry_fee": trade.total_entry_fee if hasattr(trade, 'total_entry_fee') else 0,
                    "exit_fee": trade.total_exit_fee if hasattr(trade, 'total_exit_fee') else 0,
                    "total_fee": trade.total_fee,
                    "close_reason": close_reason,
                    "trade_duration": int((ensure_timezone(trade.closed_at) - ensure_timezone(trade.created_at)).total_seconds()) if trade.created_at and trade.closed_at else 0
                }

                await trade_log_service.log_trade_action(
                    user_id=user_id,
                    trade_id=trade.id,
                    action="close",
                    status="success",
                    message=f"成功平倉配對交易: {trade.name}, 原因: {close_reason}, 盈虧: {trade.total_pnl:.2f} USDT ({trade.total_ratio_percent:.2f}%)",
                    details=log_details
                )
            except Exception as e:
                logger.error(f"記錄交易日誌時發生錯誤: {e}")
                logger.error(traceback.format_exc())

            # 在處理完所有統計後發送平倉通知
            await self._send_trade_notification(user_id, trade, is_open=False)

        except Exception as e:
            logger.error(f"處理交易關閉後的操作時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _log_trade_error(self, user_id: str, action: str, message: str, trade_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
        """
        記錄交易錯誤

        Args:
            user_id: 用戶ID
            action: 動作類型 (open, close, update)
            message: 錯誤訊息
            trade_id: 交易ID (可選)
            details: 詳細資訊 (可選)
        """
        try:
            await trade_log_service.log_trade_action(
                user_id=user_id,
                trade_id=trade_id,
                action=action,
                status="failed",
                message=message,
                details=details
            )
        except Exception as e:
            logger.error(f"記錄交易錯誤時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _process_closed_trade(self, user_id: str, trade: PairTrade, close_result: Dict[str, Any], close_reason: str):
        """
        處理已平倉的交易（更新記錄、統計、通知等）

        Args:
            user_id: 用戶ID
            trade: 交易對象
            close_result: 平倉結果
            close_reason: 平倉原因
        """
        try:
            # 更新交易記錄
            updated_trade = await self._update_trade_after_closing(trade, close_result, close_reason)
            if not updated_trade:
                logger.error(f"更新交易記錄失敗: {trade.id}")
                return

            # 處理關閉後的操作 (已包含了創建交易歷史記錄)
            await self._handle_post_trade_closing(user_id, updated_trade, close_result, close_reason)

            logger.info(f"成功處理已平倉交易: {updated_trade.id}, 原因: {close_reason}")
        except Exception as e:
            logger.error(f"處理已平倉交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _close_test_trade(self, trade: PairTrade, close_reason: str) -> Optional[PairTrade]:
        """
        平倉測試模式的配對交易

        Args:
            trade: 交易對象
            close_reason: 平倉原因

        Returns:
            Optional[PairTrade]: 平倉後的交易對象
        """
        try:
            # 獲取當前價格（由於是測試，我們可以模擬一個合理的價格波動）
            import random
            price_change_percent = random.uniform(-2, 2)  # 價格隨機上下浮動2%

            # 模擬多單平倉價格
            long_entry_price = trade.long_position.entry_price
            long_exit_price = long_entry_price * \
                (1 + price_change_percent / 100)

            # 模擬空單平倉價格（空單價格變動與多單相反）
            short_entry_price = trade.short_position.entry_price
            short_exit_price = short_entry_price * \
                (1 - price_change_percent / 100)

            # 計算盈虧
            long_pnl = (long_exit_price - long_entry_price) * \
                trade.long_position.quantity
            long_pnl_percent = (long_exit_price / long_entry_price - 1) * 100

            short_pnl = (short_entry_price - short_exit_price) * \
                trade.short_position.quantity
            short_pnl_percent = (short_entry_price /
                                 short_exit_price - 1) * 100

            # 計算平倉手續費
            fee_rate = 0.0004  # 假設費率為 0.04%
            long_exit_fee = long_exit_price * trade.long_position.quantity * fee_rate
            short_exit_fee = short_exit_price * trade.short_position.quantity * fee_rate
            total_exit_fee = long_exit_fee + short_exit_fee

            # 更新持倉信息
            trade.long_position.exit_price = long_exit_price
            trade.long_position.current_price = long_exit_price
            trade.long_position.pnl = long_pnl
            trade.long_position.pnl_percent = long_pnl_percent
            trade.long_position.exit_fee = long_exit_fee
            trade.long_position.exit_order_id = f"test_exit_long_{trade.id[:8]}"

            trade.short_position.exit_price = short_exit_price
            trade.short_position.current_price = short_exit_price
            trade.short_position.pnl = short_pnl
            trade.short_position.pnl_percent = short_pnl_percent
            trade.short_position.exit_fee = short_exit_fee
            trade.short_position.exit_order_id = f"test_exit_short_{trade.id[:8]}"

            # 更新交易信息
            total_pnl_value = long_pnl + short_pnl
            total_fee = trade.total_entry_fee + total_exit_fee
            net_pnl = total_pnl_value - total_fee

            trade.total_pnl_value = total_pnl_value
            trade.total_ratio_percent = (
                long_pnl_percent + short_pnl_percent) / 2  # 簡單平均兩邊的盈虧百分比
            trade.long_pnl_percent = long_pnl_percent
            trade.short_pnl_percent = short_pnl_percent
            trade.exit_fee = total_exit_fee
            trade.total_fee = total_fee
            trade.net_pnl = net_pnl

            # 計算風險收益比
            trade.risk_reward_ratio = total_pnl_value / \
                trade.max_loss if trade.max_loss != 0 else 0
            trade.net_risk_reward_ratio = net_pnl / \
                trade.max_loss if trade.max_loss != 0 else 0

            # 更新交易狀態
            from app.utils.time_utils import get_utc_now
            trade.status = TradeStatus.CLOSED
            trade.close_reason = close_reason
            trade.closed_at = get_utc_now()
            trade.updated_at = get_utc_now()

            # 確保時間格式一致
            if isinstance(trade.created_at, str):
                trade.created_at = datetime.fromisoformat(trade.created_at.replace('Z', '+00:00'))
            if isinstance(trade.closed_at, str):
                trade.closed_at = datetime.fromisoformat(trade.closed_at.replace('Z', '+00:00'))
            if isinstance(trade.updated_at, str):
                trade.updated_at = datetime.fromisoformat(trade.updated_at.replace('Z', '+00:00'))

            # 保存到數據庫
            update_data = trade.dict(exclude={"id"})
            update_data = self._clean_unserializable_objects(update_data)

            # 使用 _id 字段查詢
            update_result = await self.collection.update_one(
                {"_id": ObjectId(trade.id), "user_id": trade.user_id},
                {"$set": update_data}
            )

            if update_result.matched_count == 0:
                logger.error(f"測試模式: 更新交易記錄失敗，未找到匹配的文檔: {trade.id}")
                return None

            logger.info(f"測試模式: 成功平倉配對交易: {trade.id}, 原因: {close_reason}")

            # 記錄測試模式日誌
            await self._log_trade_error(
                user_id=trade.user_id,
                action="test_close",
                message=f"測試模式: 成功平倉配對交易 {trade.id}, 原因: {close_reason}",
                trade_id=trade.id,
                details={
                    "long_exit_price": long_exit_price,
                    "short_exit_price": short_exit_price,
                    "long_pnl": long_pnl,
                    "short_pnl": short_pnl,
                    "total_pnl": total_pnl_value,
                    "net_pnl": net_pnl
                }
            )

            # 處理交易歷史記錄
            await self._handle_trade_history_and_stats(trade.user_id, trade, {
                "long_price": long_exit_price,
                "short_price": short_exit_price,
                "long_fee": long_exit_fee,
                "short_fee": short_exit_fee
            })

            # 可以在測試模式平倉成功後添加以下代碼
            await self._handle_post_trade_closing(
                user_id=trade.user_id,
                trade=trade,
                close_result={
                    "long_price": long_exit_price,
                    "short_price": short_exit_price,
                    "long_fee": long_exit_fee,
                    "short_fee": short_exit_fee
                },
                close_reason=close_reason
            )

            return trade
        except Exception as e:
            logger.error(f"測試模式: 平倉配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=trade.user_id,
                action="test_close",
                message=f"測試模式: 平倉配對交易時發生錯誤: {str(e)}",
                trade_id=trade.id
            )
            return None

    async def create_from_order_ids(self, user_id: str, long_order_id: str, short_order_id: str, max_loss: float) -> Optional[PairTrade]:
        """
        根據多單和空單的訂單ID創建配對交易記錄

        Args:
            user_id: 用戶ID
            long_order_id: 多單訂單ID
            short_order_id: 空單訂單ID
            max_loss: 最大虧損額度 (USDT)

        Returns:
            Optional[PairTrade]: 創建的交易記錄，如果失敗則返回None
        """
        try:
            # 初始化幣安服務
            binance_service = BinanceService()
            await binance_service.init(user_id)

            # 獲取多單訂單信息
            try:
                long_order = await asyncio.to_thread(
                    binance_service._api_request_with_retry,
                    binance_service.client.futures_get_order,
                    orderId=long_order_id
                )
                logger.info(f"獲取到多單訂單信息: {long_order}")
            except Exception as e:
                logger.error(f"獲取多單訂單信息失敗: {e}")
                return None

            # 獲取空單訂單信息
            try:
                short_order = await asyncio.to_thread(
                    binance_service._api_request_with_retry,
                    binance_service.client.futures_get_order,
                    orderId=short_order_id
                )
                logger.info(f"獲取到空單訂單信息: {short_order}")
            except Exception as e:
                logger.error(f"獲取空單訂單信息失敗: {e}")
                return None

            # 提取必要信息
            long_symbol = long_order.get('symbol', '')
            short_symbol = short_order.get('symbol', '')
            long_side = long_order.get('side', '')
            short_side = short_order.get('side', '')

            # 確認交易方向
            if long_side != 'BUY' or short_side != 'SELL':
                logger.error(f"訂單方向不符合配對交易要求: 多單={long_side}, 空單={short_side}")
                return None

            # 獲取當前價格和倉位狀態
            long_current_price = await binance_service.get_current_price(long_symbol)
            short_current_price = await binance_service.get_current_price(short_symbol)

            # 獲取槓桿設置
            try:
                long_leverage_info = await asyncio.to_thread(
                    binance_service._api_request_with_retry,
                    binance_service.client.futures_get_leverage_bracket,
                    symbol=long_symbol
                )
                short_leverage_info = await asyncio.to_thread(
                    binance_service._api_request_with_retry,
                    binance_service.client.futures_get_leverage_bracket,
                    symbol=short_symbol
                )
                long_leverage = int(long_leverage_info[0].get(
                    'brackets', [{}])[0].get('initialLeverage', 1))
                short_leverage = int(short_leverage_info[0].get(
                    'brackets', [{}])[0].get('initialLeverage', 1))
            except Exception as e:
                logger.warning(f"獲取槓桿信息失敗，使用默認值: {e}")
                long_leverage = 1
                short_leverage = 1

            # 計算手續費（使用估算）
            long_qty = float(long_order.get('executedQty', 0))
            short_qty = float(short_order.get('executedQty', 0))
            long_price = float(long_order.get('avgPrice', 0))
            short_price = float(short_order.get('avgPrice', 0))

            fee_rate = 0.0005  # 默認費率為0.05%
            long_fee = long_qty * long_price * fee_rate
            short_fee = short_qty * short_price * fee_rate
            total_fee = long_fee + short_fee

            # 檢查是否已平倉（通過查詢當前持倉）
            try:
                positions = await asyncio.to_thread(
                    binance_service._api_request_with_retry,
                    binance_service.client.futures_position_information
                )

                # 檢查多單和空單是否還在持倉中
                long_active = False
                short_active = False

                for pos in positions:
                    if pos.get('symbol') == long_symbol and float(pos.get('positionAmt', 0)) > 0:
                        long_active = True
                    if pos.get('symbol') == short_symbol and float(pos.get('positionAmt', 0)) < 0:
                        short_active = True

                # 確定交易狀態
                if long_active and short_active:
                    status = TradeStatus.ACTIVE
                else:
                    status = TradeStatus.CLOSED

                logger.info(
                    f"交易狀態判斷: 多單活躍={long_active}, 空單活躍={short_active}, 狀態={status}")
            except Exception as e:
                logger.error(f"獲取持倉信息失敗: {e}")
                # 如果無法確定，默認為活躍狀態
                status = TradeStatus.ACTIVE

            # 創建交易記錄
            now = get_utc_now()
            trade_name = f"{long_symbol}/{short_symbol} {now.strftime('%m-%d %H:%M')}"

            # 創建多單和空單持倉信息
            long_position = TradePosition(
                symbol=long_symbol,
                side="BUY",
                quantity=long_qty,
                entry_price=long_price,
                current_price=long_current_price,
                order_id=long_order_id,
                notional_value=long_qty * long_price,
                fee=long_fee,
                leverage=long_leverage
            )

            short_position = TradePosition(
                symbol=short_symbol,
                side="SELL",
                quantity=short_qty,
                entry_price=short_price,
                current_price=short_current_price,
                order_id=short_order_id,
                notional_value=short_qty * short_price,
                fee=short_fee,
                leverage=short_leverage
            )

            # 如果已平倉但沒有平倉訂單ID，設置為空字符串
            if status == TradeStatus.CLOSED:
                long_position.exit_order_id = ""
                short_position.exit_order_id = ""
                # 可以通過查詢歷史訂單來嘗試找到平倉訂單，但此處略過該步驟

            # 計算其他字段
            stop_loss = 10.0  # 默認止損10%
            take_profit = 20.0  # 默認止盈20%

            # 計算初始比率
            entry_ratio = long_position.entry_price / short_position.entry_price

            # 創建配對交易對象
            pair_trade = PairTrade(
                id=str(ObjectId()),
                user_id=user_id,
                name=trade_name,
                status=status,
                max_loss=max_loss,
                stop_loss=stop_loss,
                take_profit=take_profit,
                long_position=long_position,
                short_position=short_position,
                total_fee=total_fee,
                entry_fee=total_fee,
                long_leverage=long_leverage,
                short_leverage=short_leverage,
                long_current_price=long_current_price,
                short_current_price=short_current_price,
                created_at=now,
                updated_at=now,
                closed_at=now if status == TradeStatus.CLOSED else None,
                close_reason="手動匯入" if status == TradeStatus.CLOSED else None,
                max_ratio=entry_ratio,  # 初始值設為入場比率
                min_ratio=entry_ratio,  # 初始值設為入場比率
                mae=0,  # 初始MAE為0
                mfe=0   # 初始MFE為0
            )

            # 保存到數據庫
            clean_data = self._clean_unserializable_objects(pair_trade.dict(by_alias=True))
            result = await self.collection.insert_one(clean_data)

            # 設置 id 字段用於返回給前端（但不存儲到數據庫）
            pair_trade.id = str(result.inserted_id)

            logger.info(f"從訂單ID成功創建配對交易: {pair_trade.id}")
            return pair_trade

        except Exception as e:
            logger.error(f"從訂單ID創建配對交易失敗: {e}")
            logger.error(traceback.format_exc())
            return None

    async def _update_trade_data_async(self, trade_id: str, user_id: str, update_data: Dict[str, Any]):
        """更新交易數據"""
        try:
            # 使用 _id 字段查詢
            result = await self.collection.update_one(
                {"_id": ObjectId(trade_id), "user_id": user_id},
                {"$set": update_data}
            )

            # 檢查更新結果
            if result.matched_count == 0:
                logger.warning(f"更新交易記錄 {trade_id} 失敗，未找到匹配的文檔")
            elif result.modified_count == 0:
                logger.debug(f"交易記錄 {trade_id} 未發生變化")
            else:
                logger.debug(f"更新交易記錄 {trade_id} 成功")

            return result
        except Exception as e:
            logger.error(f"更新交易數據失敗: {str(e)}")
            logger.error(traceback.format_exc())
            # 返回None而不是拋出異常，避免中斷主流程
            return None

    async def _update_trade_status_async(self, trade_id: str, user_id: str, status: str):
        """更新交易狀態"""
        try:
            # 使用 _id 字段查詢
            result = await self.collection.update_one(
                {"_id": ObjectId(trade_id), "user_id": user_id},
                {"$set": {"status": status}}
            )

            # 檢查更新結果
            if result.matched_count == 0:
                logger.warning(f"更新交易狀態 {trade_id} 失敗，未找到匹配的文檔")
            elif result.modified_count == 0:
                logger.debug(f"交易狀態 {trade_id} 未發生變化")
            else:
                logger.debug(f"更新交易狀態 {trade_id} 成功，狀態: {status}")

            return result
        except Exception as e:
            logger.error(f"更新交易狀態失敗: {str(e)}")
            logger.error(traceback.format_exc())
            # 返回None而不是拋出異常，避免中斷主流程
            return None

    async def close_pair_trade(self, trade_id: str, user_id: str, binance_service: BinanceService, close_reason: str) -> Optional[PairTrade]:
        """
        關閉配對交易

        Args:
            trade_id: 交易ID
            user_id: 用戶ID
            binance_service: 幣安服務實例
            close_reason: 關閉原因

        Returns:
            Optional[PairTrade]: 關閉後的交易對象，如果失敗則返回None
        """
        try:
            # 獲取交易
            trade = await self.get_pair_trade(trade_id, user_id)
            if not trade:
                logger.error(f"未找到交易: {trade_id}")
                return None

            # 檢查交易是否已關閉
            if trade.status != TradeStatus.ACTIVE:
                logger.warning(f"交易 {trade_id} 已關閉，不能再次關閉")
                return trade

            # 如果是測試模式交易，使用測試模式的平倉邏輯
            if trade.name.startswith("TEST_"):
                return await self._close_test_trade(trade, close_reason)

            # 執行平倉操作
            close_result = await self._execute_close_trade_immediately(trade, binance_service)
            if not close_result:
                logger.error(f"執行平倉操作失敗: {trade_id}")
                return None

            # 更新交易記錄
            updated_trade = await self._update_trade_after_closing(trade, close_result, close_reason)
            if not updated_trade:
                logger.error(f"更新交易記錄失敗: {trade_id}")
                return None

            # 處理平倉後的操作（使用背景任務）
            asyncio.create_task(self._process_closed_trade(
                user_id, updated_trade, close_result, close_reason))

            logger.info(f"成功關閉配對交易: {trade_id}, 原因: {close_reason}")
            return updated_trade

        except Exception as e:
            logger.error(f"關閉配對交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            await self._log_trade_error(
                user_id=user_id,
                action="close",
                message=f"關閉配對交易失敗: {e}",
                trade_id=trade_id
            )
            return None

    async def _send_trade_notification(self, user_id: str, pair_trade: PairTrade, is_open: bool = True):
        """
        發送交易通知

        Args:
            user_id: 用戶ID
            pair_trade: 配對交易對象
            is_open: 是否為開倉通知
        """
        try:
            # 檢查用戶設置
            user_settings = await user_settings_service.get_user_settings(user_id)

            # 安全地記錄通知設置（過濾敏感資訊）
            from app.utils.safe_logging import filter_sensitive_data
            safe_settings = filter_sensitive_data(user_settings.notification_settings)
            logger.info(f"準備發送{'開倉' if is_open else '平倉'}通知，用戶設置: {safe_settings}")

            # 檢查通知是否啟用
            if not user_settings.notification_settings.get("enabled", True):
                logger.warning(f"用戶 {user_id} 未啟用通知功能")
                return

            # 檢查特定通知類型是否啟用
            notification_type = "trade_open" if is_open else "trade_close"
            if not user_settings.notification_settings.get(notification_type, True):
                logger.warning(f"用戶 {user_id} 未啟用 {notification_type} 通知")
                return

            # 檢查通知渠道設置
            line_token = user_settings.notification_settings.get("line_token")
            discord_webhook = user_settings.notification_settings.get("discord_webhook")
            telegram_token = user_settings.notification_settings.get("telegram_token")
            telegram_chat_id = user_settings.notification_settings.get("telegram_chat_id")

            if not (line_token or discord_webhook or (telegram_token and telegram_chat_id)):
                logger.warning(f"用戶 {user_id} 未設置任何通知渠道")
                return

            # 格式化通知消息
            pair_trade_dict = pair_trade.dict()

            # 清理不可序列化的物件
            clean_pair_trade_dict = self._clean_unserializable_objects(pair_trade_dict)

            message = await notification_service.format_pair_trade_message(clean_pair_trade_dict, is_open)
            logger.debug(f"格式化的通知消息: {message[:100]}...")

            # 發送通知
            title = "配對交易開倉通知" if is_open else "配對交易平倉通知"
            notification_result = await notification_service.send_notification(
                user_id=user_id,
                title=title,
                message=message,
                data=clean_pair_trade_dict
            )

            if notification_result:
                logger.info(f"成功發送{'開倉' if is_open else '平倉'}通知給用戶 {user_id}")
            else:
                logger.warning(f"{'開倉' if is_open else '平倉'}通知發送失敗，用戶 {user_id}")
        except Exception as e:
            logger.error(f"發送交易通知失敗: {e}")
            logger.error(traceback.format_exc())

    async def update_trade_settings(self, trade_id: str, user_id: str, settings: PairTradeSettingsUpdate) -> Optional[PairTrade]:
        """
        更新配對交易的止盈/止損設定

        Args:
            trade_id: 交易ID
            user_id: 用戶ID
            settings: 包含新的止盈/止損值的物件

        Returns:
            Optional[PairTrade]: 更新後的配對交易對象，如果失敗則返回 None
        """
        await self._ensure_initialized()

        # 定義查詢條件
        query = {"_id": ObjectId(trade_id), "user_id": user_id}

        # 使用 _id 字段查詢
        trade_doc = await self.collection.find_one(query)

        if not trade_doc:
            logger.warning(f"用戶 {user_id} 嘗試更新不存在或不屬於自己的交易 {trade_id}")
            return None

        # 檢查交易狀態
        if trade_doc.get("status") != TradeStatus.ACTIVE.value:
            logger.warning(f"嘗試更新已非活躍狀態的交易 {trade_id} (狀態: {trade_doc.get('status')})")
            return None

        update_fields = {}
        if settings.take_profit is not None:
            if settings.take_profit <= 0:
                logger.warning(f"交易 {trade_id} 的止盈值必須大於 0，收到: {settings.take_profit}")
                return None
            update_fields["take_profit"] = settings.take_profit
            logger.info(f"交易 {trade_id}: 止盈更新為 {settings.take_profit}%")

        if settings.stop_loss is not None:
            if settings.stop_loss <= 0:
                logger.warning(f"交易 {trade_id} 的止損值必須大於 0，收到: {settings.stop_loss}")
                return None
            update_fields["stop_loss"] = settings.stop_loss
            logger.info(f"交易 {trade_id}: 止損更新為 {settings.stop_loss}%")

        # 新增停利設定支援
        if settings.trailing_stop_enabled is not None:
            update_fields["trailing_stop_enabled"] = settings.trailing_stop_enabled
            logger.info(f"交易 {trade_id}: 停利保護{'啟用' if settings.trailing_stop_enabled else '停用'}")

        if settings.trailing_stop_level is not None:
            # 只有當停利模式啟用時，才驗證停利水位必須 >= 0
            # 檢查當前或即將設定的 trailing_stop_enabled 狀態
            is_trailing_enabled = settings.trailing_stop_enabled
            if is_trailing_enabled is None:
                # 如果本次請求沒有設定 trailing_stop_enabled，則使用資料庫中的值
                is_trailing_enabled = trade_doc.get("trailing_stop_enabled", False)

            if is_trailing_enabled and settings.trailing_stop_level < 0:
                logger.warning(f"交易 {trade_id} 在停利模式下，停利水位必須 >= 0，收到: {settings.trailing_stop_level}")
                return None

            update_fields["trailing_stop_level"] = settings.trailing_stop_level
            logger.info(f"交易 {trade_id}: 停利水位更新為 {settings.trailing_stop_level}%")

        if not update_fields:
            logger.info(f"交易 {trade_id}: 未提供任何有效的設定值進行更新")
            # 確保返回的數據有正確的 id 字段
            if "_id" in trade_doc:
                trade_doc["id"] = str(trade_doc["_id"])
                trade_doc.pop("_id", None)
            return PairTrade(**trade_doc)

        # 使用相同的查詢條件更新數據庫
        result = await self.collection.update_one(query, {"$set": update_fields})

        if result.modified_count == 1:
            updated_trade_doc = await self.collection.find_one(query)
            if updated_trade_doc:
                logger.info(f"成功更新交易 {trade_id} 的止盈/止損設定")

                # 記錄交易日誌
                log_message = "更新交易設定: "
                if "take_profit" in update_fields:
                    log_message += f"止盈設為 {update_fields['take_profit']}%"
                if "stop_loss" in update_fields:
                    if "take_profit" in update_fields:
                        log_message += ", "
                    log_message += f"止損設為 {update_fields['stop_loss']}%"

                await trade_log_service.log_trade_action(
                    user_id=user_id,
                    trade_id=trade_id,
                    action="settings_update",
                    status="success",
                    message=log_message,
                    details=update_fields
                )

                # 確保返回的數據有正確的 id 字段
                if "_id" in updated_trade_doc:
                    updated_trade_doc["id"] = str(updated_trade_doc["_id"])
                    updated_trade_doc.pop("_id", None)

                return PairTrade(**updated_trade_doc)
            else:
                logger.error(f"更新交易 {trade_id} 設定後無法重新獲取文檔")
                return None
        else:
            logger.warning(f"更新交易 {trade_id} 設定失敗，數據庫未修改")
            return None


# 創建服務實例
pair_trade_service = PairTradeService()
