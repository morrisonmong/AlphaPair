import asyncio
import logging
import time
import traceback
from typing import Optional

from app.database.mongodb import get_all_user_settings, get_pair_trades
from app.services.pair_trade_service import pair_trade_service

# 設置日誌
logger = logging.getLogger(__name__)


class MonitorService:
    """
    監控服務，用於定期更新配對交易狀態
    """

    def __init__(self, update_interval: int = 1, error_retry_interval: int = 5, shutdown_event: Optional[asyncio.Event] = None):
        """
        初始化監控服務

        Args:
            update_interval: 更新間隔（秒），默認1秒
            error_retry_interval: 錯誤重試間隔（秒），默認5秒
            shutdown_event: 關閉事件
        """
        self.update_interval = update_interval
        self.error_retry_interval = error_retry_interval
        logger.info(f"監控服務初始化，設置更新間隔為 {self.update_interval} 秒，錯誤重試間隔為 {self.error_retry_interval} 秒")
        self.shutdown_event = shutdown_event or asyncio.Event()
        self.running = False
        self.monitor_task = None
        self.health_check_task = None
        self.start_time = None
        self.last_update_time = None
        self.update_count = 0
        self.error_count = 0
        self.max_errors = 10  # 最大錯誤次數，超過後重啟服務
        self.health_check_interval = 300  # 健康檢查間隔（秒）
        self.max_uptime = 3600 * 12  # 最大運行時間（秒），超過後重啟服務
        self.active_symbols = set()  # 活躍的交易對，用於WebSocket訂閱

    async def start(self):
        """
        啟動監控服務
        """
        if self.running:
            logger.warning("監控服務已在運行中")
            return

        self.running = True
        self.start_time = time.time()
        self.last_update_time = None
        self.update_count = 0
        self.error_count = 0

        # 初始化活躍交易對的WebSocket連接
        await self._init_websocket_for_active_trades()

        # 創建監控任務，使用當前事件循環
        loop = asyncio.get_running_loop()
        self.monitor_task = loop.create_task(self._monitor_loop())
        self.monitor_task.add_done_callback(self._on_task_done)

        # 創建健康檢查任務，使用當前事件循環
        self.health_check_task = loop.create_task(self._health_check_loop())
        self.health_check_task.add_done_callback(self._on_task_done)

        logger.info(f"監控服務已啟動 (更新間隔: {self.update_interval} 秒)")

    async def stop(self):
        """
        停止監控服務
        """
        if not self.running:
            logger.warning("監控服務未運行")
            return

        self.running = False
        logger.info("正在停止監控服務...")

        # 取消任務
        if self.monitor_task and not self.monitor_task.done():
            logger.info("正在取消監控任務...")
            self.monitor_task.cancel()
            try:
                await asyncio.shield(self.monitor_task)
            except asyncio.CancelledError:
                logger.info("監控任務被取消")
            except Exception as e:
                logger.error(f"取消監控任務時發生錯誤: {e}")
                logger.error(traceback.format_exc())

        if self.health_check_task and not self.health_check_task.done():
            logger.info("正在取消健康檢查任務...")
            self.health_check_task.cancel()
            try:
                await asyncio.shield(self.health_check_task)
            except asyncio.CancelledError:
                logger.info("健康檢查任務被取消")
            except Exception as e:
                logger.error(f"取消健康檢查任務時發生錯誤: {e}")
                logger.error(traceback.format_exc())
        # 釋放所有WebSocket連接
        await self._release_all_websockets()

    async def restart(self):
        """
        重啟監控服務
        """
        logger.info("正在重啟監控服務...")
        await self.stop()
        await asyncio.sleep(5)  # 等待 5 秒再重啟
        await self.start()
        logger.info("監控服務已重啟")

    async def _monitor_loop(self):
        """
        監控循環，定期更新所有配對交易
        """
        try:
            while self.running and not self.shutdown_event.is_set():
                try:
                    start_time = time.time()
                    logger.info(
                        f"開始更新所有配對交易 (第 {self.update_count + 1} 次更新，間隔: {self.update_interval} 秒)")

                    # 更新所有配對交易
                    await self.update_all_trades()

                    # 更新計數器
                    self.update_count += 1
                    self.last_update_time = time.time()
                    duration = self.last_update_time - start_time
                    logger.info(
                        f"完成更新所有配對交易 (耗時: {duration:.2f} 秒，將在 {self.update_interval} 秒後再次更新)")

                    # 等待下一次更新
                    await asyncio.sleep(self.update_interval)
                except asyncio.CancelledError:
                    logger.info("監控循環被取消")
                    break
                except Exception as e:
                    self.error_count += 1
                    logger.error(f"監控循環中發生錯誤: {e}")
                    logger.error(traceback.format_exc())
                    await asyncio.sleep(self.error_retry_interval)  # 發生錯誤後等待 error_retry_interval 秒再重試
        except asyncio.CancelledError:
            logger.info("監控循環被取消")
        except Exception as e:
            logger.error(f"監控循環中發生嚴重錯誤: {e}")
            logger.error(traceback.format_exc())
            self.running = False
            raise

    async def _health_check_loop(self):
        """
        健康檢查循環，定期檢查服務狀態
        """
        try:
            while self.running and not self.shutdown_event.is_set():
                try:
                    # 檢查運行時間
                    uptime = time.time() - self.start_time
                    if uptime > self.max_uptime:
                        logger.warning(
                            f"服務運行時間過長 ({uptime:.2f} 秒)，準備重啟"
                        )
                        await self.restart()
                        continue

                    # 檢查錯誤次數
                    if self.error_count >= self.max_errors:
                        logger.warning(
                            f"錯誤次數過多 ({self.error_count})，準備重啟"
                        )
                        await self.restart()
                        continue

                    # 檢查最後更新時間
                    if self.last_update_time:
                        last_update_ago = time.time() - self.last_update_time
                        if last_update_ago > self.update_interval * 3:
                            logger.warning(
                                f"最後更新時間過長 ({last_update_ago:.2f} 秒)，準備重啟"
                            )
                            await self.restart()
                            continue

                    # 輸出健康狀態
                    if self.update_count % 10 == 0:
                        logger.info(
                            f"健康檢查: 運行時間={uptime:.2f}秒, "
                            f"更新次數={self.update_count}, "
                            f"錯誤次數={self.error_count}"
                        )

                    # 等待下一次檢查
                    await asyncio.sleep(self.health_check_interval)
                except asyncio.CancelledError:
                    logger.info("健康檢查循環被取消")
                    break
                except Exception as e:
                    logger.error(f"健康檢查循環中發生錯誤: {e}")
                    logger.error(traceback.format_exc())
                    await asyncio.sleep(self.error_retry_interval * 6)  # 發生錯誤後等待更長時間再重試
        except asyncio.CancelledError:
            logger.info("健康檢查循環被取消")
        except Exception as e:
            logger.error(f"健康檢查循環中發生嚴重錯誤: {e}")
            logger.error(traceback.format_exc())
            self.running = False
            raise

    def _on_task_done(self, task):
        """
        任務完成回調
        """
        try:
            # 檢查任務是否有異常
            if task.cancelled():
                logger.info("任務被取消")
            elif task.exception():
                logger.error(f"任務異常結束: {task.exception()}")
                logger.error(traceback.format_exc())
                self.error_count += 1
            else:
                logger.info("任務正常完成")
        except asyncio.CancelledError:
            logger.info("任務被取消")
        except Exception as e:
            logger.error(f"處理任務完成回調時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    async def _init_websocket_for_active_trades(self):
        """為所有活躍交易初始化WebSocket連接"""
        # 收集所有活躍交易的交易對
        self.active_symbols = set()

        # 獲取所有用戶設置
        user_settings_list = await get_all_user_settings()

        for user_settings in user_settings_list:
            user_id = user_settings.get("user_id")
            if not user_id:
                continue

            # 獲取用戶的配對交易
            pair_trades = await get_pair_trades(user_id, status="active")
            if not pair_trades:
                continue

            # 提取交易對
            for trade in pair_trades:
                long_position = trade.get("long_position", {})
                short_position = trade.get("short_position", {})

                if long_position and "symbol" in long_position:
                    self.active_symbols.add(long_position["symbol"])
                if short_position and "symbol" in short_position:
                    self.active_symbols.add(short_position["symbol"])

        if self.active_symbols:
            logger.info(f"為{len(self.active_symbols)}個交易對初始化期貨WebSocket連接")
            # 為每個用戶創建或更新WebSocket連接
            for user_settings in user_settings_list:
                user_id = user_settings.get("user_id")
                if not user_id:
                    continue

                try:
                    # 創建幣安服務實例
                    from app.services.binance_service import BinanceService
                    binance_service = BinanceService.get_instance(user_id)

                    # 確保幣安客戶端已初始化
                    initialized = await binance_service._ensure_initialized()
                    if initialized:
                        # 初始化期貨WebSocket
                        await binance_service.init_futures_websocket(list(self.active_symbols))
                        logger.info(f"用戶 {user_id} 的期貨WebSocket已初始化")
                except Exception as e:
                    logger.error(f"初始化用戶{user_id}的期貨WebSocket失敗: {e}")

    async def _release_all_websockets(self):
        """釋放所有用戶的WebSocket連接"""
        # 獲取所有用戶設置
        user_settings_list = await get_all_user_settings()

        for user_settings in user_settings_list:
            user_id = user_settings.get("user_id")
            if not user_id:
                continue

            try:
                # 創建幣安服務實例
                from app.services.binance_service import BinanceService
                binance_service = BinanceService.get_instance(user_id)

                # 釋放WebSocket連接
                await binance_service.release_futures_websocket()
                logger.info(f"用戶 {user_id} 的期貨WebSocket已釋放")
            except Exception as e:
                logger.error(f"釋放用戶{user_id}的期貨WebSocket失敗: {e}")

    async def update_all_trades(self):
        """
        更新所有用戶的配對交易

        每次檢查都會強制刷新價格緩存（force_refresh=True），
        確保使用最新的市場價格來計算交易的盈虧和判斷是否需要平倉
        """
        try:
            # 每10次更新記錄一次系統運行狀態
            if self.update_count % 10 == 0:
                uptime = time.time() - self.start_time
                logger.info(
                    f"系統監控狀態: 已運行時間={uptime:.2f}秒, "
                    f"更新次數={self.update_count}, "
                    f"錯誤次數={self.error_count}, "
                    f"最後更新時間={self.last_update_time or '無'}"
                )

            # 獲取所有用戶設置
            user_settings_list = await get_all_user_settings()
            logger.info(f"找到 {len(user_settings_list)} 個用戶設置")

            # 更新所有交易中使用的交易對符號列表 (用於WebSocket)
            new_symbols = set()

            # 更新每個用戶的配對交易
            for user_settings in user_settings_list:
                try:
                    # 從用戶設置中獲取用戶ID
                    # 注意：應該使用 user_id 字段，而不是 MongoDB 的 id
                    user_id = user_settings.get("user_id")
                    if not user_id:
                        logger.warning(f"用戶設置缺少 user_id: {user_settings}")
                        continue

                    # 獲取用戶的配對交易
                    pair_trades = await get_pair_trades(user_id, status="active")

                    # 檢查是否成功獲取配對交易
                    if not pair_trades:
                        logger.warning(
                            f"用戶 {user_id} 沒有活躍的配對交易"
                        )
                        continue

                    logger.info(f"用戶 {user_id} 有 {len(pair_trades)} 個活躍的配對交易")

                    # 創建幣安服務實例
                    from app.services.binance_service import BinanceService
                    binance_service = BinanceService.get_instance(user_id)

                    # 確保幣安客戶端已初始化
                    initialized = await binance_service._ensure_initialized()
                    if not initialized:
                        logger.error(
                            f"用戶 {user_id} 的幣安客戶端初始化失敗，可能是API金鑰無效"
                        )
                        continue

                    # 檢查連接
                    connected = await binance_service.is_connected()
                    if not connected:
                        logger.error(
                            f"用戶 {user_id} 無法連接到幣安API，請檢查API金鑰和密碼"
                        )
                        continue

                    # 收集新的交易對
                    current_symbols = set()
                    for trade in pair_trades:
                        long_position = trade.get("long_position", {})
                        short_position = trade.get("short_position", {})

                        if long_position and "symbol" in long_position:
                            symbol = long_position["symbol"]
                            current_symbols.add(symbol)

                        if short_position and "symbol" in short_position:
                            symbol = short_position["symbol"]
                            current_symbols.add(symbol)

                    # 檢查是否有新的交易對需要添加到 WebSocket
                    new_symbols_to_add = current_symbols - self.active_symbols
                    if new_symbols_to_add or not binance_service.futures_ws_connected:
                        try:
                            # 更新 WebSocket 監控
                            await binance_service.init_futures_websocket(list(current_symbols))
                            logger.info(f"用戶 {user_id} 的期貨WebSocket已更新，監控 {len(current_symbols)} 個交易對")

                            # 更新活躍交易對集合
                            self.active_symbols.update(current_symbols)

                            # 連接後短暫等待，讓WebSocket有時間獲取初始數據
                            await asyncio.sleep(0.5)
                        except Exception as ws_error:
                            logger.error(f"更新用戶 {user_id} 的期貨WebSocket失敗: {ws_error}")
                            logger.error(traceback.format_exc())

                    # 批量獲取所有需要的價格
                    prices = {}
                    if current_symbols:
                        try:
                            # 使用 WebSocket 獲取價格
                            ws_prices_count = 0
                            rest_prices_count = 0

                            for symbol in current_symbols:
                                # 先嘗試從WebSocket獲取價格
                                has_ws_price = (
                                    symbol in binance_service.futures_ws_prices and
                                    time.time() - binance_service.futures_ws_last_heartbeat < 5
                                )

                                if has_ws_price:
                                    price = binance_service.futures_ws_prices[symbol]
                                    prices[symbol] = float(price)
                                    ws_prices_count += 1
                                else:
                                    # 如果WebSocket沒有數據，使用API
                                    price = await binance_service.get_futures_price_ws(symbol)
                                    if price is not None:
                                        prices[symbol] = float(price)
                                        rest_prices_count += 1

                            if ws_prices_count > 0:
                                logger.info(f"通過WebSocket緩存獲取 {ws_prices_count} 個期貨價格")
                            if rest_prices_count > 0:
                                logger.info(f"通過API獲取 {rest_prices_count} 個期貨價格")
                        except Exception as price_e:
                            logger.error(f"獲取期貨價格失敗: {price_e}")
                            logger.error(traceback.format_exc())

                    # 更新每個配對交易
                    for pair_trade in pair_trades:
                        try:
                            trade_id = pair_trade.get("id")
                            if not trade_id:
                                logger.warning(f"配對交易缺少 ID: {pair_trade}")
                                continue

                            # 更新配對交易，傳入幣安服務實例和預先獲取的價格
                            result = await pair_trade_service.update_pair_trade(
                                trade_id, user_id, binance_service, prices
                            )

                            # 檢查更新結果
                            if result and result[0]:
                                logger.info(
                                    f"成功更新配對交易 {trade_id}, "
                                    f"需要平倉: {result[1]}, "
                                    f"平倉原因: {result[2]}"
                                )

                                # 如果需要平倉，執行平倉操作
                                if result[1]:  # result[1] 是 should_close
                                    close_reason = result[2]
                                    try:
                                        # 調用平倉函數
                                        closed_trade = await pair_trade_service.close_pair_trade(
                                            trade_id, user_id, binance_service, close_reason
                                        )
                                        if closed_trade:
                                            logger.info(
                                                f"成功平倉配對交易 {trade_id}, 原因: {close_reason}")
                                        else:
                                            logger.warning(
                                                f"平倉配對交易 {trade_id} 失敗")
                                    except Exception as e:
                                        logger.error(
                                            f"平倉配對交易 {trade_id} 時發生錯誤: {e}")
                                        logger.error(traceback.format_exc())
                            else:
                                logger.warning(
                                    f"更新配對交易 {trade_id} 失敗或返回空結果"
                                )
                        except Exception as e:
                            logger.error(
                                f"處理配對交易 {pair_trade.get('id', '未知')} 時發生錯誤: {e}")
                            logger.error(traceback.format_exc())
                except Exception as e:
                    logger.error(f"處理用戶 {user_settings.get('user_id', '未知')} 的配對交易時發生錯誤: {e}")
                    logger.error(traceback.format_exc())

            # 更新活躍交易對列表，如果有新增
            if new_symbols - self.active_symbols:
                logger.info(f"發現{len(new_symbols - self.active_symbols)}個新的交易對")
                self.active_symbols = new_symbols
        except Exception as e:
            self.error_count += 1
            logger.error(f"更新所有交易時發生錯誤: {e}")
            logger.error(traceback.format_exc())
