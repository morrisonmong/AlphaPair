import logging
import time
import traceback
import asyncio
import random
from typing import Dict, List, Optional, Tuple, Union, Any
from binance.client import Client
from binance.exceptions import BinanceAPIException
import aiohttp
from dotenv import load_dotenv
from app.services.user_settings_service import user_settings_service
import requests
import hmac
import hashlib
import json


# 設置日誌
logger = logging.getLogger(__name__)


# 載入環境變數
load_dotenv()

# 實例緩存，實現單例模式
_instances: Dict[str, 'BinanceService'] = {}


class BinanceService:

    @classmethod
    def get_instance(cls, user_id: str) -> 'BinanceService':
        """
        獲取用戶對應的BinanceService實例，確保同一用戶只有一個實例

        Args:
            user_id: 用戶ID

        Returns:
            BinanceService: 該用戶的BinanceService實例
        """
        if user_id not in _instances:
            logger.info(f"為用戶 {user_id} 創建新的BinanceService實例")
            _instances[user_id] = cls(user_id=user_id)
        else:
            logger.debug(f"重用用戶 {user_id} 的現有BinanceService實例")
        return _instances[user_id]

    def __init__(self, api_key: Optional[str] = None, api_secret: Optional[str] = None, user_id: Optional[str] = None):
        """
        初始化幣安服務

        Args:
            api_key: 幣安API密鑰
            api_secret: 幣安API密鑰
            user_id: 用戶ID，如果提供，將從用戶設定中獲取API金鑰和密鑰
        """
        self.api_key = api_key
        self.api_secret = api_secret
        self.client = None
        self.time_offset = 0  # 時間偏移量
        self.user_id = user_id
        self.initialized = False
        self.is_test_mode = False
        self._last_init_time = 0

        # API權限標記
        self.simple_earn_api_disabled = False  # 標記Simple Earn API是否可用

        # 添加價格緩存
        self._price_cache = {}  # 格式: {symbol: {'price': price, 'timestamp': timestamp}}
        self._price_cache_ttl = 15 * 60  # 緩存有效期15分鐘（秒）

        # 期貨WebSocket相關屬性
        self.futures_ws_client = None
        self.futures_ws_connected = False
        self.futures_ws_prices = {}  # 存儲期貨WebSocket獲取的即時價格
        self.futures_ws_symbols = set()  # 要監控的期貨交易對
        self.futures_ws_task = None
        self.futures_ws_last_heartbeat = 0
        self.futures_ws_user_count = 0  # 追蹤使用期貨WebSocket的用戶數

        # 現貨WebSocket相關屬性
        self.spot_ws_client = None
        self.spot_ws_connected = False
        self.spot_ws_prices = {}  # 存儲現貨WebSocket獲取的即時價格
        self.spot_ws_symbols = set()  # 要監控的現貨交易對
        self.spot_ws_task = None
        self.spot_ws_last_heartbeat = 0
        self.spot_ws_user_count = 0  # 追蹤使用現貨WebSocket的用戶數

        # 為了向後兼容，保留舊的WebSocket屬性，指向期貨WebSocket
        self.ws_client = self.futures_ws_client
        self.ws_connected = self.futures_ws_connected
        self.ws_prices = self.futures_ws_prices
        self.ws_symbols = self.futures_ws_symbols
        self.ws_task = self.futures_ws_task
        self.ws_last_heartbeat = self.futures_ws_last_heartbeat
        self.ws_user_count = self.futures_ws_user_count

        # 特殊代幣映射表
        self.special_tokens = {
            "1MBABYDOGE": "1MBABYDOGEUSDT",
            "1MBBDOGE": "1MBABYDOGEUSDT",
            "LD1MBABYDOGE": "1MBABYDOGEUSDT",
            "LD1MBBDOGE": "1MBABYDOGEUSDT",
            "LDBAKET": "BAKEUSDT",
            "LDSHIB2": "SHIBUSDT",
            "LD1MBABY": "1MBABYDOGEUSDT",
            "LDSHIB": "SHIBUSDT",
            "USDT": "BUSDUSDT",  # USDT 本身不是交易對，使用 BUSD/USDT 作為參考
            "LDUSDT": "BUSDUSDT"  # LD前缀的USDT同樣使用 BUSD/USDT
        }

        # 如果提供了用戶ID，嘗試從用戶設定中獲取API金鑰和密鑰
        if user_id:
            self._init_from_user_settings()
        else:
            self._init_client()

    async def _get_user_credentials(self) -> Tuple[Optional[str], Optional[str]]:
        """
        從用戶設定中獲取API金鑰和密鑰

        Returns:
            Tuple[Optional[str], Optional[str]]: API金鑰和密鑰
        """
        if not self.user_id:
            logger.warning("未提供用戶ID，無法從用戶設定中獲取API金鑰和密鑰")
            return None, None

        try:
            settings = await user_settings_service.get_user_settings(self.user_id)
            if not settings:
                logger.warning(f"未找到用戶 {self.user_id} 的設定")
                return None, None

            api_key = settings.binance_api_key
            api_secret = settings.binance_api_secret

            # 簡單清理可能的空白字符和引號
            if api_key:
                api_key = api_key.strip().strip('"\'')
            if api_secret:
                api_secret = api_secret.strip().strip('"\'')
            return api_key, api_secret
        except Exception as e:
            logger.error(f"從用戶設定中獲取API金鑰和密鑰時發生錯誤: {e}")
            return None, None

    def _init_from_user_settings(self):
        """從用戶設定中初始化API金鑰和密鑰，並創建客戶端"""
        # 這裡我們需要使用同步方式獲取用戶設定
        # 因為 __init__ 方法不能是異步的
        # 我們將在實際使用時再異步獲取用戶設定
        logger.info(f"從用戶 {self.user_id} 的設定中初始化API金鑰和密鑰")
        # 初始化時不立即創建客戶端，而是在需要時再創建
        # 客戶端將在第一次使用時通過 _ensure_initialized 方法創建

    def _init_client(self):
        """初始化幣安客戶端"""
        if not self.api_key or not self.api_secret:
            logger.error("未提供API密鑰和密鑰，無法初始化幣安客戶端")
            return

        # 基本的API密鑰格式驗證（不自動修改）
        if not self.api_key.strip() or not self.api_secret.strip():
            logger.error("API密鑰或密鑰為空")
            return

        try:
            # 同步時間
            self._sync_time()

            # 創建客戶端並設置時間偏移
            self.client = Client(
                api_key=self.api_key.strip(),
                api_secret=self.api_secret.strip()
            )

            # 確保時間偏移正確設置
            self.client.timestamp_offset = self.time_offset

            # 測試連接
            self.client.ping()

            # 檢查客戶端版本
            try:
                client_version = getattr(self.client, '__version__', None)
                if client_version:
                    logger.info(f"幣安客戶端版本: {client_version}")
                    # 檢查版本是否過低
                    if client_version < "1.0.28":
                        logger.warning(
                            f"幣安客戶端版本過低: {client_version}，"
                            f"建議升級到 1.0.28 或更高版本"
                        )
                else:
                    logger.info("無法獲取幣安客戶端版本")
            except Exception as e:
                logger.warning(f"檢查幣安客戶端版本時發生錯誤: {e}")

            logger.info("幣安客戶端初始化成功")
        except Exception as e:
            logger.error(f"幣安客戶端初始化失敗: {e}")
            self.client = None

    async def _ensure_initialized(self) -> bool:
        """
        確保客戶端已初始化，如果未初始化則嘗試初始化

        Returns:
            bool: 是否成功初始化
        """
        # --- DEBUG MODIFICATION START ---
        # Force credential check even if client exists to ensure key validity
        # force_recheck = True  # 設置為 True 以強制每次檢查憑證 (恢復為 False 或移除)
        force_recheck = False  # 改回 False
        # --- DEBUG MODIFICATION END ---

        # 如果客戶端已經初始化，並且不是強制重新檢查，直接返回
        if self.client and not force_recheck:
            return True

        logger.debug(
            f"用戶 {self.user_id} - _ensure_initialized: 正在檢查/重新檢查憑證並初始化客戶端 (self.client is {'not None' if self.client else 'None'}) (force_recheck={force_recheck})")

        # 如果客戶端已存在但我們強制重新檢查，記錄舊金鑰以供比較
        old_api_key = self.api_key if self.client else None

        # 如果提供了用戶ID，嘗試從用戶設定中獲取API金鑰和密鑰
        if self.user_id:
            api_key, api_secret = await self._get_user_credentials()  # 這裡會觸發我們之前添加的詳細日誌
            if api_key and api_secret:
                # 如果金鑰與內存中的舊值不同，發出警告
                if old_api_key is not None and old_api_key != api_key:
                    logger.warning(f"用戶 {self.user_id} - API Key從DB更新，與內存中舊值不同。")
                self.api_key = api_key
                self.api_secret = api_secret
            else:
                logger.error(f"用戶 {self.user_id} - 無法從用戶設定中獲取有效的API金鑰和密鑰。")
                # 如果獲取失敗，決定是保留舊客戶端還是強制失敗
                # 在強制重新檢查或首次初始化時，我們應該強制失敗
                if force_recheck or not self.client:
                    logger.error(f"用戶 {self.user_id} - 因無法獲取憑證，初始化/重新檢查失敗。")
                    # 確保客戶端無效
                    self.client = None
                    return False
                else:
                    # 理論上不應執行到這裡，因為 force_recheck=True
                    logger.warning(f"用戶 {self.user_id} - 無法獲取新憑證，但保留現有客戶端（此路徑不應發生）。")
                    # return True  # 或者 return False? 設為 False 更安全
                    # 在這種情況下，返回 False 更安全，因為憑證獲取失敗
                    self.client = None
                    return False

        # 在初始化之前檢查金鑰是否有效
        if not self.api_key or not self.api_secret:
            logger.error(f"用戶 {self.user_id} - API金鑰或密鑰為空，無法初始化客戶端。")
            self.client = None  # 確保客戶端是 None
            return False

        # 初始化客戶端 (這裡會使用最新的 self.api_key/secret)
        # _init_client 方法包含了我們之前添加的 regex 檢查和清理日誌
        self._init_client()
        return self.client is not None

    def _sync_time(self):
        """同步本地時間和幣安服務器時間"""
        try:
            # 不使用client的get_server_time()，直接使用requests
            response = requests.get("https://api.binance.com/api/v3/time")
            server_time = response.json()['serverTime']
            local_time = int(time.time() * 1000)
            self.time_offset = server_time - local_time

            # 記錄時間偏移量
            logger.info(f"時間同步成功，偏移量: {self.time_offset}ms")

            # 如果時間偏移超過1000毫秒，發出警告
            if abs(self.time_offset) > 1000:
                logger.warning(f"時間偏移量較大: {self.time_offset}ms，可能會影響API請求")
                # 針對大偏移量，主動調整所有後續請求的時間戳
                logger.info(f"已調整時間偏移，所有後續請求將使用偏移量: {self.time_offset}ms")

            # 保存同步狀態和時間
            self.time_synced = True
            self.last_time_sync = time.time()

            # 更新客戶端的時間偏移設置
            if hasattr(self, 'client') and self.client:
                self.client.timestamp_offset = self.time_offset

            return True
        except Exception as e:
            logger.error(f"時間同步失敗: {e}")
            traceback.print_exc()
            self.time_synced = False
            return False

    def _ensure_time_sync(self):
        """確保時間已同步"""
        current_time = time.time()
        # 如果從未同步過時間，或者最後同步時間超過30秒，則重新同步
        if not self.time_synced or (current_time - self.last_time_sync) > 30:
            logger.info("時間同步已過期，重新同步")
            return self._sync_time()
        return True

    def _get_timestamp(self):
        """獲取帶偏移量的時間戳"""
        # 確保每次獲取時間戳時都有最新的偏移量
        self._ensure_time_sync()
        return int(time.time() * 1000) + self.time_offset

    def _api_request_with_retry(self, func, *args, **kwargs):
        """
        使用指數退避策略進行API調用重試，適用於同步函數

        Args:
            func: 要調用的函數
            *args: 位置參數
            **kwargs: 關鍵字參數

        Returns:
            API 響應
        """
        retry = 0
        max_retries = 3
        base_delay = 1.0
        last_exception = None

        while retry <= max_retries:
            try:
                # 確保時間同步
                self._ensure_time_sync()

                # 調用函數
                return func(*args, **kwargs)

            except BinanceAPIException as e:
                last_exception = e

                # 判斷錯誤類型
                if e.code == -1021:  # 時間同步錯誤
                    logger.warning(f"時間同步錯誤，將重試: {e}")
                    self._sync_time()
                    retry += 1
                    continue

                elif e.code == -1003:  # 權重限制
                    logger.warning(f"API權重限制，將重試: {e}")
                    retry += 1
                    # 權重限制需要更長的等待時間
                    if retry < max_retries:
                        wait_time = base_delay * (2 ** retry) * (0.8 + 0.4 * random.random())
                        logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                        time.sleep(wait_time)
                        continue

                else:
                    # 其他錯誤
                    if retry < max_retries:
                        logger.warning(f"API錯誤 (代碼 {e.code})，將重試: {e}")
                        retry += 1
                        wait_time = base_delay * (2 ** (retry - 1)) * (0.8 + 0.4 * random.random())
                        logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"達到最大重試次數，放棄: {e}")
                raise

            except Exception as e:
                last_exception = e
                if retry < max_retries:
                    logger.warning(f"非API錯誤，將重試: {e}")
                    retry += 1
                    wait_time = base_delay * (2 ** (retry - 1)) * (0.8 + 0.4 * random.random())
                    logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                    time.sleep(wait_time)
                    continue
                else:
                    logger.error(f"達到最大重試次數，放棄: {e}")
                    raise

        # 如果所有重試都失敗了
        assert last_exception is not None
        raise last_exception

    async def _api_request_with_exponential_backoff(self, method_or_func, *args, max_retries=3, base_delay=1.0, **kwargs):
        """
        使用指數退避策略進行API調用重試，支持異步操作和HTTP方法字符串

        Args:
            method_or_func: 要調用的函數或HTTP方法字符串 (如 "GET", "POST" 等)
            *args: 位置參數
            max_retries: 最大重試次數
            base_delay: 基礎延遲時間(秒)
            **kwargs: 關鍵字參數

        Returns:
            API 響應
        """
        retry = 0
        last_exception = None

        # 檢查是否為Simple Earn API調用，如果已禁用則直接返回空結果
        if self.simple_earn_api_disabled:
            if isinstance(method_or_func, str):
                url = args[0] if args else kwargs.get("url", "")
                if "simple-earn" in url:
                    logger.info("Simple Earn API已被標記為禁用，跳過API調用")
                    return [] if "position" in url else {}
            elif callable(method_or_func):
                func_name = method_or_func.__name__
                if "simple_earn" in func_name:
                    logger.info(f"Simple Earn API函數 {func_name} 已被標記為禁用，跳過API調用")
                    return [] if "position" in func_name else {}

        while retry <= max_retries:
            try:
                # 確保時間同步
                self._ensure_time_sync()

                # 執行HTTP方法或函數調用
                if isinstance(method_or_func, str) and method_or_func in ["GET", "POST", "PUT", "DELETE"]:
                    # HTTP方法調用
                    url = args[0] if args else kwargs.get("url")
                    if not url:
                        raise ValueError("HTTP請求需要提供URL")

                    params = kwargs.get("params", {})
                    headers = kwargs.get("headers", {})
                    data = kwargs.get("data", None)

                    # 建立HTTP會話並發送請求
                    async with aiohttp.ClientSession() as session:
                        http_method = getattr(session, method_or_func.lower())
                        async with http_method(url, params=params, headers=headers, json=data) as response:
                            if response.status != 200:
                                error_text = await response.text()
                                logger.error(f"API請求失敗，狀態碼: {response.status}, 錯誤: {error_text}")

                                # 檢查是否為權限錯誤
                                if '"code":-1002' in error_text and 'not authorized' in error_text.lower():
                                    logger.warning(f"檢測到API權限不足，停止重試: {error_text}")
                                    # 標記Simple Earn API為禁用
                                    if "simple-earn" in url:
                                        logger.warning("檢測到Simple Earn API權限不足，將設置全局標記不再嘗試此類API")
                                        self.simple_earn_api_disabled = True

                                    try:
                                        error_json = json.loads(error_text)
                                        raise BinanceAPIException(
                                            status_code=response.status,
                                            response=error_text,
                                            code=error_json.get('code', -1002)
                                        )
                                    except json.JSONDecodeError:
                                        raise BinanceAPIException(
                                            status_code=response.status,
                                            response=error_text,
                                            code=-1002
                                        )

                                raise Exception(f"API請求失敗: {error_text}")
                            return await response.json()
                else:
                    # 函數調用
                    return method_or_func(*args, **kwargs)

            except BinanceAPIException as e:
                last_exception = e

                # 判斷錯誤類型
                if e.code == -1021:  # 時間同步錯誤
                    logger.warning(f"時間同步錯誤，將重試: {e}")
                    self._sync_time()
                    retry += 1
                    continue

                elif e.code == -1003:  # 權重限制
                    logger.warning(f"API權重限制，將重試: {e}")
                    retry += 1
                    # 權重限制需要更長的等待時間
                    if retry < max_retries:
                        wait_time = base_delay * (2 ** retry) * (0.8 + 0.4 * random.random())
                        logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                        await asyncio.sleep(wait_time)
                    continue

                elif e.code == -1002:  # 授權錯誤，不重試
                    logger.error(f"授權錯誤，無法訪問此API，不再重試: {e}")

                    # 檢查是否為Simple Earn API
                    if isinstance(method_or_func, str):
                        url = args[0] if args else kwargs.get("url", "")
                        if "simple-earn" in url:
                            logger.warning("檢測到Simple Earn API權限不足，將設置全局標記不再嘗試此類API")
                            self.simple_earn_api_disabled = True
                    elif callable(method_or_func) and "simple_earn" in method_or_func.__name__:
                        logger.warning(f"檢測到Simple Earn API函數 {method_or_func.__name__} 權限不足，將設置全局標記不再嘗試此類API")
                        self.simple_earn_api_disabled = True

                    raise

                elif e.code in (-2010, -2011):  # 餘額不足或下單數量太小
                    logger.error(f"訂單參數錯誤，不再重試: {e}")
                    raise

                else:
                    # 其他錯誤
                    if retry < max_retries:
                        logger.warning(f"API錯誤 (代碼 {e.code})，將重試: {e}")
                        retry += 1
                        wait_time = base_delay * (2 ** (retry - 1)) * (0.8 + 0.4 * random.random())
                        logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                        await asyncio.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"達到最大重試次數，放棄: {e}")
                        raise

            except Exception as e:
                last_exception = e

                # 檢查是否為授權錯誤字符串
                error_str = str(e)
                if "-1002" in error_str and "not authorized" in error_str.lower():
                    logger.error(f"檢測到API權限不足，不再重試: {e}")
                    # 檢查是否為Simple Earn API
                    if isinstance(method_or_func, str):
                        url = args[0] if args else kwargs.get("url", "")
                        if "simple-earn" in url:
                            logger.warning("檢測到Simple Earn API權限不足，將設置全局標記不再嘗試此類API")
                            self.simple_earn_api_disabled = True

                    # 將字符串錯誤轉換為BinanceAPIException以便統一處理
                    if "__init__() got an unexpected keyword argument 'code'" in error_str:
                        raise Exception(f"API授權錯誤: {error_str}")
                    else:
                        raise BinanceAPIException(status_code=401, response=error_str, code=-1002)

                # 一般錯誤進行重試
                if retry < max_retries:
                    logger.warning(f"非API錯誤，將重試: {e}")
                    retry += 1
                    wait_time = base_delay * (2 ** (retry - 1)) * (0.8 + 0.4 * random.random())
                    logger.info(f"等待 {wait_time:.2f} 秒後重試...")
                    await asyncio.sleep(wait_time)
                    continue
                else:
                    logger.error(f"達到最大重試次數，放棄: {e}")
                    raise

        # 如果所有重試都失敗了
        assert last_exception is not None
        raise last_exception

    async def is_connected(self) -> bool:
        """檢查是否成功連接到幣安API"""

        if not self.client:
            return False

        try:
            # 嘗試獲取服務器時間來測試連接
            async with aiohttp.ClientSession() as session:
                async with session.get("https://api.binance.com/api/v3/time") as response:
                    if response.status == 200:
                        return True
                    return False
        except Exception as e:
            logger.error(f"幣安API連接測試失敗: {e}")
            return False

    async def get_account_info(self) -> Dict:
        """獲取帳戶信息"""
        # 確保客戶端已初始化
        if not await self._ensure_initialized():
            raise ValueError("幣安客戶端初始化失敗")

        try:
            # 使用重試機制
            return self._api_request_with_retry(self.client.get_account)
        except BinanceAPIException as e:
            logger.error(f"獲取帳戶信息失敗: {e}")
            raise

    async def get_futures_account_info(self) -> Dict:
        """獲取期貨帳戶信息"""
        # 確保客戶端已初始化
        if not await self._ensure_initialized():
            raise ValueError("幣安客戶端初始化失敗")

        try:
            # 使用重試機制
            return self._api_request_with_retry(self.client.futures_account)
        except BinanceAPIException as e:
            logger.error(f"獲取期貨帳戶信息失敗: {e}")
            raise

    async def get_futures_positions(self) -> List[Dict]:
        """
        獲取期貨持倉信息

        Returns:
            List[Dict]: 持倉信息列表
        """
        # 確保客戶端已初始化
        if not await self._ensure_initialized():
            raise ValueError("幣安客戶端初始化失敗")

        try:
            # 使用重試機制
            positions = self._api_request_with_retry(
                self.client.futures_position_information)

            # 過濾掉沒有持倉的幣種
            active_positions = [p for p in positions if float(
                p.get('positionAmt', 0)) != 0]

            return active_positions
        except BinanceAPIException as e:
            logger.error(f"獲取期貨持倉信息失敗: {e}")
            raise

    def get_futures_position_by_symbol(self, symbol: str) -> Optional[Dict]:
        """
        獲取指定交易對的期貨持倉信息

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'

        Returns:
            Optional[Dict]: 持倉信息，如果不存在則返回None
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 使用重試機制
            positions = self._api_request_with_retry(
                self.client.futures_position_information,
                symbol=symbol
            )

            # 找到有持倉的記錄
            for position in positions:
                if float(position.get('positionAmt', 0)) != 0:
                    logger.info(
                        f"獲取到{symbol}持倉信息: 數量={position.get('positionAmt')}, 入場價={position.get('entryPrice')}, 未實現盈虧={position.get('unRealizedProfit')}")
                    return position

            logger.info(f"未找到{symbol}的活躍持倉")
            return None
        except BinanceAPIException as e:
            logger.error(f"獲取{symbol}持倉信息失敗: {e}")
            raise

    def get_futures_order(self, symbol: str, order_id: str) -> Optional[Dict]:
        """
        獲取期貨訂單詳情

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'
            order_id: 訂單ID

        Returns:
            Optional[Dict]: 訂單詳情，如果不存在則返回None
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 使用重試機制
            order = self._api_request_with_retry(
                self.client.futures_get_order,
                symbol=symbol,
                orderId=order_id
            )

            logger.info(f"獲取到訂單詳情: {order}")
            return order
        except BinanceAPIException as e:
            if e.code == -2013:  # 訂單不存在
                logger.warning(f"訂單不存在: {symbol} {order_id}")
                return None
            logger.error(f"獲取訂單詳情失敗: {e}")
            raise

    async def get_realtime_price(self, symbol: str) -> float:
        """
        獲取實時價格

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'

        Returns:
            float: 實時價格
        """
        try:
            # 同步時間（非阻塞方式）
            self._sync_time()

            base_url = 'https://fapi.binance.com'
            url = f'{base_url}/fapi/v1/ticker/price'
            params = {'symbol': symbol}

            # 添加時間戳和時間偏移
            timestamp = self._get_timestamp()
            params['timestamp'] = timestamp

            # 最多重試3次
            max_retries = 3
            retry_delay = 1  # 秒

            for attempt in range(max_retries):
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(url, params=params, timeout=10) as response:
                            if response.status != 200:
                                error_text = await response.text()
                                logger.error(
                                    f"獲取{symbol}實時價格失敗，狀態碼: {response.status}, 錯誤: {error_text}")

                                # 檢查是否是時間同步錯誤
                                if "Timestamp for this request" in error_text and attempt < max_retries - 1:
                                    logger.warning(
                                        f"時間同步錯誤，重試 ({attempt+1}/{max_retries})")
                                    # 重新同步時間
                                    self._sync_time()
                                    # 更新時間戳
                                    timestamp = self._get_timestamp()
                                    params['timestamp'] = timestamp
                                    # 等待後重試
                                    await asyncio.sleep(retry_delay)
                                    continue

                                raise ValueError(f"獲取價格失敗: {error_text}")

                            data = await response.json()
                            return float(data['price'])
                except aiohttp.ClientError as e:
                    if attempt < max_retries - 1:
                        logger.warning(
                            f"網絡錯誤，重試 ({attempt+1}/{max_retries}): {e}")
                        await asyncio.sleep(retry_delay)
                        continue
                    logger.error(f"獲取{symbol}實時價格失敗: {e}")
                    raise
        except Exception as e:
            logger.error(f"獲取{symbol}實時價格失敗: {e}")
            raise

    async def get_futures_price(self, symbol: str, force_refresh: bool = False) -> Optional[Union[str, float]]:
        """
        獲取期貨價格 - 直接從期貨API獲取最新價格，不使用緩存

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'
            force_refresh: 參數保留但不使用，每次都獲取最新價格

        Returns:
            Optional[Union[str, float]]: 期貨價格，如果失敗則返回None
        """
        try:
            # 直接使用 get_realtime_price 獲取期貨價格
            try:
                price = await self.get_realtime_price(symbol)
                if price:
                    logger.info(f"獲取期貨 {symbol} 價格: {price}")
                    return str(price)
            except Exception as e:
                logger.warning(f"通過期貨API獲取 {symbol} 價格失敗: {e}")

                # 嘗試通過客戶端獲取期貨價格
                if self.client:
                    try:
                        ticker = self.client.futures_symbol_ticker(symbol=symbol)
                        if ticker and 'price' in ticker:
                            price = ticker['price']
                            logger.info(f"通過客戶端獲取期貨 {symbol} 價格: {price}")
                            return price
                    except Exception as client_error:
                        logger.warning(f"客戶端獲取期貨價格失敗: {client_error}")

            # 所有方法都失敗
            logger.warning(f"所有獲取期貨 {symbol} 價格的方法都失敗")
            return None

        except Exception as e:
            logger.warning(f"獲取期貨 {symbol} 價格時發生錯誤: {e}")
            traceback.print_exc()
            return None

    async def get_latest_price(self, symbol: str, force_refresh: bool = False, use_futures: bool = False) -> Optional[Union[str, float]]:
        """
        取得Binance最新價格，優先使用緩存，然後是客戶端，最後是REST API

        Args:
            symbol: 交易對符號，例如"BTCUSDT"
            force_refresh: 強制刷新緩存，設為True時將跳過緩存直接獲取最新價格
            use_futures: 是否使用期貨價格，設為True時將獲取期貨價格而非現貨價格

        Returns:
            Optional[Union[str, float]]: 最新價格，如果失敗則返回None
        """
        # 如果需要期貨價格，直接調用專門的期貨價格函數
        if use_futures:
            return await self.get_futures_price(symbol, force_refresh)

        # 以下是原有的現貨價格獲取邏輯
        try:
            # 特殊處理 USDT 和 LDUSDT，直接返回 1.0
            if symbol == "USDT" or symbol == "LDUSDT" or symbol == "USDTUSDT" or symbol == "LDUSDTUSDT":
                logger.info(f"特殊處理 {symbol}，直接返回價格: 1.0")
                return "1.0"

            # 特殊處理某些特殊格式的代幣
            symbol_to_use = symbol

            # 檢查是否為特殊代幣前缀
            for prefix, replacement in self.special_tokens.items():
                if symbol.startswith(prefix):
                    symbol_to_use = replacement
                    logger.info(f"使用特殊代幣映射: {symbol} -> {symbol_to_use}")
                    break

            # 如果是LD開頭但不在特殊映射表中，嘗試移除LD前缀
            if symbol.startswith("LD") and symbol_to_use == symbol:
                base_symbol = symbol[2:]
                if base_symbol:
                    symbol_to_use = f"{base_symbol}USDT" if not base_symbol.endswith(
                        "USDT") else base_symbol
                    logger.info(f"移除LD前缀: {symbol} -> {symbol_to_use}")

            # 1. 檢查緩存中是否有有效的價格數據（僅當不強制刷新時）
            current_time = time.time()
            cache_key = symbol_to_use

            if not force_refresh and cache_key in self._price_cache:
                cache_data = self._price_cache[cache_key]
                # 檢查緩存是否仍然有效
                if current_time - cache_data['timestamp'] < self._price_cache_ttl:
                    logger.info(f"使用緩存獲取 {symbol} 價格: {cache_data['price']}")
                    return cache_data['price']
                else:
                    logger.info(f"{symbol} 價格緩存已過期，重新獲取")
            elif force_refresh:
                logger.info(f"強制刷新 {symbol} 價格，跳過緩存")

            # 2. 優先使用客戶端獲取價格
            if self.client:
                try:
                    # 直接使用client而不是await client
                    ticker = self.client.get_symbol_ticker(
                        symbol=symbol_to_use)
                    if ticker and 'price' in ticker:
                        price = ticker['price']
                        logger.info(
                            f"通過客戶端成功獲取 {symbol} 價格 (使用 {symbol_to_use}): {price}")

                        # 更新緩存
                        self._price_cache[cache_key] = {
                            'price': price,
                            'timestamp': current_time
                        }

                        return price
                    else:
                        logger.warning(
                            f"客戶端獲取 {symbol_to_use} 價格返回的數據不包含price字段")
                except Exception as e:
                    logger.warning(
                        f"客戶端獲取 {symbol_to_use} 價格出錯: {e}，嘗試REST API")

            # 3. 如果客戶端失敗，使用REST API
            try:
                url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol_to_use}"
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            price = data.get("price")
                            if price:
                                logger.info(
                                    f"通過REST API成功獲取 {symbol} 價格 (使用 {symbol_to_use}): {price}")

                                # 更新緩存
                                self._price_cache[cache_key] = {
                                    'price': price,
                                    'timestamp': current_time
                                }

                                return price
                        else:
                            logger.warning(
                                f"REST API獲取 {symbol_to_use} 價格失敗: {response.status}")
            except Exception as rest_error:
                logger.warning(
                    f"REST API獲取 {symbol_to_use} 價格出錯: {rest_error}")

            # 4. 如果主要方法都失敗，嘗試備用方法

            # 嘗試使用原始符號（如果與轉換後的不同）
            if symbol != symbol_to_use and self.client:
                try:
                    # 直接使用client而不是await client
                    ticker = self.client.get_symbol_ticker(symbol=symbol)
                    if ticker and 'price' in ticker:
                        price = ticker['price']
                        logger.info(f"使用原始符號成功獲取 {symbol} 價格: {price}")

                        # 更新緩存
                        self._price_cache[cache_key] = {
                            'price': price,
                            'timestamp': current_time
                        }

                        return price
                except Exception as orig_error:
                    logger.warning(f"使用原始符號 {symbol} 獲取價格失敗: {orig_error}")

                    # 如果客戶端失敗，嘗試REST API與原始符號
                    try:
                        url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}"
                        async with aiohttp.ClientSession() as session:
                            async with session.get(url) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    price = data.get("price")
                                    if price:
                                        logger.info(
                                            f"使用REST API和原始符號成功獲取 {symbol} 價格: {price}")

                                        # 更新緩存
                                        self._price_cache[cache_key] = {
                                            'price': price,
                                            'timestamp': current_time
                                        }

                                        return price
                    except Exception as orig_rest_error:
                        logger.warning(
                            f"使用REST API和原始符號 {symbol} 獲取價格也失敗: {orig_rest_error}")

            # 嘗試與BUSD的交易對
            try:
                base_symbol = symbol.replace("USDT", "").replace("LD", "")
                # 移除數字前缀
                if base_symbol and any(c.isdigit() for c in base_symbol[:2]):
                    base_symbol = ''.join(
                        c for c in base_symbol if not c.isdigit())

                busd_symbol = f"{base_symbol}BUSD"

                # 先嘗試客戶端
                if self.client:
                    try:
                        ticker = self.client.get_symbol_ticker(
                            symbol=busd_symbol)
                        if ticker and 'price' in ticker:
                            price = ticker['price']
                            logger.info(
                                f"成功通過客戶端和BUSD交易對獲取 {symbol} 價格: {price}")

                            # 更新緩存
                            self._price_cache[cache_key] = {
                                'price': price,
                                'timestamp': current_time
                            }

                            return price
                    except Exception as busd_client_error:
                        logger.warning(
                            f"客戶端獲取BUSD交易對價格失敗: {busd_client_error}")

                # 再嘗試REST API
                url = f"https://api.binance.com/api/v3/ticker/price?symbol={busd_symbol}"
                async with aiohttp.ClientSession() as session:
                    async with session.get(url) as response:
                        if response.status == 200:
                            data = await response.json()
                            price = data.get("price")
                            if price:
                                logger.info(
                                    f"成功通過REST API和BUSD交易對獲取 {symbol} 價格: {price}")

                                # 更新緩存
                                self._price_cache[cache_key] = {
                                    'price': price,
                                    'timestamp': current_time
                                }

                                return price
                        else:
                            logger.warning(
                                f"REST API獲取 {symbol_to_use} 價格失敗: {response.status}")
            except Exception as busd_error:
                logger.warning(f"BUSD嘗試也失敗: {busd_error}")

            # 所有方法都失敗
            logger.warning(f"所有獲取 {symbol} 價格的方法都失敗")
            return None

        except Exception as e:
            logger.warning(f"獲取 {symbol} 價格時發生錯誤: {e}")
            traceback.print_exc()
            return None

    async def get_current_price(self, symbol: str) -> float:
        """
        獲取當前價格（get_latest_price 的別名）

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'

        Returns:
            float: 當前價格
        """
        return await self.get_latest_price(symbol)

    async def get_futures_exchange_info(self) -> Dict:
        """
        獲取期貨交易所信息，包括交易對的精度要求

        Returns:
            Dict: 期貨交易所信息
        """
        try:
            # 確保客戶端已初始化
            if not await self._ensure_initialized():
                raise ValueError("幣安客戶端初始化失敗")

            # 同步時間
            self._sync_time()
            if self.client:
                self.client.timestamp_offset = self.time_offset

            # 獲取期貨交易所信息
            exchange_info = self._api_request_with_retry(
                self.client.futures_exchange_info
            )

            logger.info(
                f"獲取期貨交易所信息成功，共 {len(exchange_info.get('symbols', []))} 個交易對")
            return exchange_info
        except Exception as e:
            logger.error(f"獲取期貨交易所信息失敗: {e}")
            raise

    async def get_futures_account_summary(self, separate_funding: bool = False) -> dict:
        """
        獲取合約賬戶摘要，包括總資產價值但不包含詳細的代幣價格

        Args:
            separate_funding: 是否將理財資產價值從總值中分離出來

        Returns:
            dict: 包含合約賬戶總價值的字典
        """
        try:
            await self._ensure_initialized()

            if not self.client:
                logger.error("獲取合約賬戶摘要失敗: 客戶端未初始化")
                return 0

            futures_account = await self.get_futures_account_info()

            if not futures_account:
                logger.warning("未獲取到合約賬戶資訊")
                return 0

            wallet_balance = float(
                futures_account.get("totalWalletBalance", 0))
            unrealized_profit = float(
                futures_account.get("totalUnrealizedProfit", 0))

            # 合約賬戶總價值 = 錢包餘額 + 未實現盈虧
            return wallet_balance + unrealized_profit

        except Exception as e:
            logger.error(f"獲取合約賬戶摘要失敗: {e}")
            return 0

    async def get_futures_account_value(self) -> float:
        """
        獲取合約賬戶總價值

        Returns:
            float: 合約賬戶總價值
        """
        try:
            # 確保客戶端已初始化
            await self._ensure_initialized()

            if not self.client:
                logger.error("獲取合約賬戶價值失敗: 客戶端未初始化")
                return 0

            # 獲取期貨賬戶信息
            futures_account = await self.get_futures_account_info()

            if not futures_account:
                logger.warning("未獲取到合約賬戶資訊")
                return 0

            # 計算期貨賬戶總價值 = 錢包餘額 + 未實現盈虧
            wallet_balance = float(
                futures_account.get("totalWalletBalance", 0))
            unrealized_profit = float(
                futures_account.get("totalUnrealizedProfit", 0))

            futures_value = wallet_balance + unrealized_profit
            logger.info(f"合約賬戶總價值: {futures_value} USDT")

            return futures_value
        except Exception as e:
            logger.error(f"獲取合約賬戶價值失敗: {e}")
            return 0

    async def get_symbols(self) -> List[str]:
        """
        獲取所有可用的交易對

        Returns:
            List[str]: 交易對列表
        """
        try:
            # 同步時間
            self._sync_time()
            if self.client:
                self.client.timestamp_offset = self.time_offset

            # 獲取交易所信息
            exchange_info = self.client.get_exchange_info()

            # 提取交易對
            symbols = [symbol['symbol'] for symbol in exchange_info['symbols']]

            return symbols
        except Exception as e:
            logger.error(f"獲取交易對列表失敗: {e}")
            raise

    def get_all_tickers(self) -> Dict[str, float]:
        """
        獲取所有交易對的價格

        Returns:
            Dict[str, float]: 交易對價格字典，格式為 {symbol: price}
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 重新同步時間
            self._sync_time()
            self.client.timestamp_offset = self.time_offset

            # 獲取所有交易對價格
            tickers = self.client.get_all_tickers()

            # 轉換為字典格式
            price_dict = {}
            for ticker in tickers:
                symbol = ticker['symbol']
                price = float(ticker['price'])
                price_dict[symbol] = price

            return price_dict
        except Exception as e:
            logger.error(f"獲取所有交易對價格失敗: {e}")
            raise

    async def get_account_balance_in_usdt(self, force_refresh: bool = False, min_value: float = 1.0) -> Dict:
        """
        獲取賬戶資產的USDT價值，並過濾掉過小的資產

        Args:
            force_refresh: 是否強制刷新價格緩存
            min_value: 最小資產價值閾值，低於此值的資產將被過濾掉（默認為1.0 USDT）

        Returns:
            Dict: 包含總資產價值和各資產價值的字典
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 重新同步時間
            self._sync_time()
            self.client.timestamp_offset = self.time_offset

            # 獲取賬戶資訊
            account_info = self.client.get_account()

            # 獲取所有交易對價格
            all_prices = self.get_all_tickers()

            # 計算每個資產的USDT價值
            balances = []
            total_value = 0.0

            # 預先獲取所有非零資產的列表，避免處理零餘額資產
            non_zero_balances = [
                balance for balance in account_info['balances']
                if float(balance['free']) + float(balance['locked']) > 0
            ]

            # 對於每個非零餘額資產，創建異步任務獲取價格
            async def process_asset(balance):
                asset = balance['asset']
                free = float(balance['free'])
                locked = float(balance['locked'])
                total = free + locked

                # 處理資產價值
                value = 0

                # 特殊代幣處理
                if asset == 'USDT':
                    # USDT本身價值就是數量
                    value = total
                    return {
                        'asset': asset,
                        'free': free,
                        'locked': locked,
                        'total': total,
                        'value': value,
                        'value_usdt': value
                    }

                # 嘗試獲取價格
                try:
                    # 優先使用統一的get_latest_price方法
                    price = await self.get_latest_price(asset + 'USDT', force_refresh=force_refresh)
                    if price:
                        value = total * float(price)
                        logger.debug(
                            f"通過get_latest_price獲取 {asset} 價格: {price}")
                    else:
                        # 處理特殊代幣
                        symbol_to_use = asset

                        # 移除LD前綴以獲取正確的交易對
                        price_asset = asset
                        if asset.startswith('LD'):
                            # 檢查是否為特殊代幣
                            if asset in self.special_tokens:
                                symbol_to_use = self.special_tokens[asset]
                            else:
                                # 普通LD代幣
                                price_asset = asset[2:]  # 移除LD前綴
                                symbol_to_use = f"{price_asset}USDT" if not price_asset.endswith(
                                    "USDT") else price_asset

                        price = await self.get_latest_price(symbol_to_use, force_refresh=force_refresh)
                        if price:
                            value = total * float(price)
                            logger.debug(
                                f"通過特殊映射獲取 {asset} 價格 (使用 {symbol_to_use}): {price}")
                        else:
                            # 嘗試通過all_prices獲取
                            symbol = f"{price_asset}USDT"
                            if symbol in all_prices:
                                price = all_prices[symbol]
                                value = total * price
                                logger.debug(
                                    f"通過all_prices獲取 {asset} 價格: {price}")
                            else:
                                # 嘗試通過BTC轉換
                                symbol_btc = f"{price_asset}BTC"
                                if symbol_btc in all_prices and "BTCUSDT" in all_prices:
                                    price_in_btc = all_prices[symbol_btc]
                                    btc_price = all_prices["BTCUSDT"]
                                    value = total * price_in_btc * btc_price
                                    logger.debug(
                                        f"通過BTC轉換獲取 {asset} 價格: {price_in_btc} * {btc_price}")
                except Exception as e:
                    logger.warning(f"獲取 {asset} 價格失敗: {e}")

                # 僅返回有價值的資產，並且價值超過最小閾值
                if value >= min_value:
                    return {
                        'asset': asset,
                        'free': free,
                        'locked': locked,
                        'total': total,
                        'value': value,
                        'value_usdt': value
                    }
                return None

            # 異步處理所有資產
            asset_tasks = [process_asset(balance)
                           for balance in non_zero_balances]
            asset_results = await asyncio.gather(*asset_tasks, return_exceptions=True)

            # 過濾有效結果並計算總價值
            for result in asset_results:
                if isinstance(result, dict) and result is not None:
                    balances.append(result)
                    total_value += result['value']
                elif not isinstance(result, Exception):
                    continue
                else:
                    logger.warning(f"處理資產時發生錯誤: {result}")

            # 排序資產列表（按價值降序）
            balances.sort(key=lambda x: x['value'], reverse=True)

            return {
                'total_value': total_value,
                'balances': balances
            }
        except Exception as e:
            logger.error(f"獲取賬戶USDT餘額失敗: {e}")
            traceback.print_exc()
            raise

    def place_futures_market_order(self, symbol: str, side: str, quantity: float, reduce_only: bool = False) -> Dict:
        """
        下期貨市場單

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'
            side: 交易方向，'BUY' 或 'SELL'
            quantity: 交易數量
            reduce_only: 是否只減倉，默認為False

        Returns:
            Dict: 訂單信息
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 同步時間
            self._sync_time()

            # 下市場單
            order = self._api_request_with_retry(
                self.client.futures_create_order,
                symbol=symbol,
                side=side,
                type='MARKET',
                quantity=quantity,
                reduceOnly=reduce_only
            )

            logger.info(f"下單成功: {symbol} {side} {quantity}")
            order_id = order['orderId']

            # 立即獲取訂單詳情，包含實際成交價格
            try:
                # 等待較長時間，確保訂單已經完全處理完成
                time.sleep(2.0)  # 增加到2秒

                # 首次嘗試獲取訂單詳情
                order_details = self._api_request_with_exponential_backoff(
                    self.client.futures_get_order,
                    symbol=symbol,
                    orderId=order_id
                )

                # 獲取實際成交價格
                avg_price = float(order_details.get('avgPrice', 0))
                executed_qty = float(order_details.get('executedQty', 0))

                # 如果未能獲取到實際成交價格，再嘗試一次
                if avg_price <= 0:
                    logger.info(f"第一次未獲取到實際成交價格，等待後重試: {order_id}")
                    time.sleep(1.0)

                    order_details = self._api_request_with_exponential_backoff(
                        self.client.futures_get_order,
                        symbol=symbol,
                        orderId=order_id
                    )

                    avg_price = float(order_details.get('avgPrice', 0))
                    executed_qty = float(order_details.get('executedQty', 0))

                # 如果成功獲取到實際成交價格，更新訂單信息
                if avg_price > 0:
                    order['avgPrice'] = avg_price
                    order['executedQty'] = executed_qty
                    logger.info(f"獲取到實際成交價格: {avg_price}")
                else:
                    logger.warning(f"無法獲取實際成交價格，訂單ID: {order_id}")
            except Exception as e:
                logger.warning(f"獲取訂單詳情失敗: {e}")
                # 失敗時不影響原始訂單返回

            return order
        except BinanceAPIException as e:
            logger.error(f"下單失敗: {e}")
            raise

    async def place_futures_market_order_async(self, symbol: str, side: str, quantity: float, reduce_only: bool = False) -> Dict:
        """
        異步下期貨市場單

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'
            side: 交易方向，'BUY' 或 'SELL'
            quantity: 交易數量
            reduce_only: 是否只減倉，默認為False

        Returns:
            Dict: 訂單信息
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 確保初始化
            await self._ensure_initialized()

            # 下市場單（通過異步包裝同步函數）
            order = await asyncio.to_thread(
                self._api_request_with_retry,
                self.client.futures_create_order,
                symbol=symbol,
                side=side,
                type='MARKET',
                quantity=quantity,
                reduceOnly=reduce_only
            )

            logger.info(f"下單成功: {symbol} {side} {quantity}")
            order_id = order['orderId']

            # 立即獲取訂單詳情，包含實際成交價格
            try:
                # 等待較長時間，確保訂單已經完全處理完成
                await asyncio.sleep(2.0)  # 異步等待2秒

                # 首次嘗試獲取訂單詳情
                order_details = await asyncio.to_thread(
                    self._api_request_with_retry,
                    self.client.futures_get_order,
                    symbol=symbol,
                    orderId=order_id
                )

                # 獲取實際成交價格
                avg_price = float(order_details.get('avgPrice', 0))
                executed_qty = float(order_details.get('executedQty', 0))

                # 如果未能獲取到實際成交價格，再嘗試一次
                if avg_price <= 0:
                    logger.info(f"第一次未獲取到實際成交價格，等待後重試: {order_id}")
                    await asyncio.sleep(1.0)

                    order_details = await asyncio.to_thread(
                        self._api_request_with_retry,
                        self.client.futures_get_order,
                        symbol=symbol,
                        orderId=order_id
                    )

                    avg_price = float(order_details.get('avgPrice', 0))
                    executed_qty = float(order_details.get('executedQty', 0))

                # 如果成功獲取到實際成交價格，更新訂單信息
                if avg_price > 0:
                    order['avgPrice'] = avg_price
                    order['executedQty'] = executed_qty
                    logger.info(f"獲取到實際成交價格: {avg_price}")
                else:
                    logger.warning(f"無法獲取實際成交價格，訂單ID: {order_id}")
            except Exception as e:
                logger.warning(f"獲取訂單詳情失敗: {e}")
                # 失敗時不影響原始訂單返回

            return order
        except Exception as e:
            logger.error(f"下單失敗: {e}")
            raise

    async def close_pair_position(self, long_symbol: str, long_quantity: float, short_symbol: str, short_quantity: float) -> Dict[str, Any]:
        """
        平倉配對交易

        Args:
            long_symbol: 做多的交易對符號，例如 'BTCUSDT'
            long_quantity: 做多的數量
            short_symbol: 做空的交易對符號，例如 'ETHUSDT'
            short_quantity: 做空的數量

        Returns:
            Dict[str, Any]: 包含兩個訂單的信息
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 確保初始化
            await self._ensure_initialized()

            # 平倉做多倉位（賣出）
            long_order = await self.place_futures_market_order_async(
                symbol=long_symbol,
                side='SELL',
                quantity=long_quantity,
                reduce_only=True
            )

            # 平倉做空倉位（買入）
            short_order = await self.place_futures_market_order_async(
                symbol=short_symbol,
                side='BUY',
                quantity=short_quantity,
                reduce_only=True
            )

            # 記錄實際成交價格和手續費
            long_avg_price = float(long_order.get('avgPrice', 0))
            short_avg_price = float(short_order.get('avgPrice', 0))
            long_fee = float(long_order.get('fee', 0))
            short_fee = float(short_order.get('fee', 0))

            logger.info(f"平倉實際成交價格: 多單={long_avg_price}, 空單={short_avg_price}")
            logger.info(
                f"平倉手續費: 多單={long_fee}, 空單={short_fee}, 總計={long_fee + short_fee}")

            return {
                "long_order": long_order,
                "short_order": short_order,
                "long_avg_price": long_avg_price,
                "short_avg_price": short_avg_price,
                "long_fee": long_fee,
                "short_fee": short_fee,
                "total_fee": long_fee + short_fee
            }
        except Exception as e:
            logger.error(f"平倉配對交易失敗: {e}")
            raise

    async def get_order_fee(self, symbol: str, order_id: str) -> float:
        """
        獲取期貨訂單手續費 (已修正為使用期貨API)

        Args:
            symbol: 交易對符號
            order_id: 訂單ID

        Returns:
            float: 手續費 (以USDT計價)
        """
        try:
            # 確保客戶端已初始化
            await self._ensure_initialized()

            if not self.client:
                logger.warning(f"無法獲取訂單 {order_id} 手續費：客戶端未初始化")
                return 0.0

            # 使用重試機制獲取期貨交易記錄，修正方法名稱
            trades = await asyncio.to_thread(
                self._api_request_with_retry,
                self.client.futures_account_trades,  # 修正為正確的方法名稱
                symbol=symbol,
                orderId=order_id
            )

            # 計算總手續費
            total_fee = 0.0
            for trade in trades:
                if 'commission' in trade and 'commissionAsset' in trade:
                    commission = float(trade['commission'])
                    commission_asset = trade['commissionAsset']

                    # 期貨手續費通常以USDT, BUSD或BNB計價
                    if commission_asset == 'USDT':
                        total_fee += commission
                    elif commission_asset == 'BUSD':
                        # 假設 BUSD 對 USDT 價格為 1:1
                        total_fee += commission
                    elif commission_asset == 'BNB':
                        # 獲取 BNB 對 USDT 的價格進行轉換
                        try:
                            price_data = await asyncio.to_thread(
                                self._api_request_with_retry,
                                self.client.get_symbol_ticker,  # 獲取價格可以使用現貨Ticker
                                symbol="BNBUSDT"
                            )
                            price = float(price_data['price'])
                            total_fee += commission * price
                            logger.debug(f"BNB 手續費 {commission} 轉換為 USDT: {commission * price}")
                        except Exception as e:
                            logger.warning(f"無法獲取 BNB 對 USDT 的價格進行手續費轉換: {e}，將忽略此筆手續費")
                    else:
                        # 對於其他幣種的手續費，記錄警告，暫不處理
                        logger.warning(f"訂單 {order_id} 遇到未知的手續費幣種: {commission_asset} ({commission})")

            logger.info(f"獲取到期貨訂單 {order_id} 實際的手續費: {total_fee} USDT")
            return total_fee
        except BinanceAPIException as e:
            # 如果訂單不存在或查詢失敗
            if e.code == -2013:  # Order does not exist.
                logger.warning(f"查詢訂單 {order_id} 手續費失敗：訂單不存在。")
            elif e.code == -1121 and "Invalid symbol" in str(e):
                logger.error(f"查詢訂單 {order_id} 手續費時符號 {symbol} 無效 (請確認是否為合約交易對)。")
            else:
                logger.error(f"獲取期貨訂單 {order_id} 手續費失敗: {e}")
            return 0.0  # 失敗時返回 0
        except Exception as e:
            logger.error(f"獲取期貨訂單 {order_id} 手續費時發生未知錯誤: {e}")
            return 0.0  # 失敗時返回 0

    async def set_leverage(self, symbol: str, leverage: int) -> Dict:
        """
        設置交易對的槓桿倍數

        Args:
            symbol: 交易對符號，例如 'BTCUSDT'
            leverage: 槓桿倍數，1-125

        Returns:
            Dict: API響應
        """
        # 檢查客戶端是否初始化，如果未初始化則不執行
        if not await self._ensure_initialized() or not self.client:
            logger.error(f"無法設置槓桿 {symbol} {leverage}x: 客戶端未初始化")
            # 或者可以拋出異常
            # raise ValueError("幣安客戶端未初始化")
            return {"error": "Client not initialized"}

        try:
            # 確保 leverage 是整數
            leverage_int = int(leverage)

            # 使用重試機制，但需要在協程中運行同步程式碼
            response = await asyncio.to_thread(
                self._api_request_with_retry,
                self.client.futures_change_leverage,
                symbol=symbol,
                leverage=leverage_int
            )
            logger.info(f"成功設置槓桿: {symbol}, {leverage_int}x")
            return response
        except Exception as e:
            logger.error(f"設置槓桿失敗: {symbol} {leverage}x - {e}")
            raise  # 將異常拋出，讓上層處理

    def set_margin_type(self, symbol: str, margin_type: str) -> Dict:
        """
        設置保證金類型（ISOLATED或CROSSED）

        Args:
            symbol: 交易對符號
            margin_type: 保證金類型，'ISOLATED'或'CROSSED'

        Returns:
            Dict: API響應
        """
        if not self.client:
            raise ValueError("幣安客戶端未初始化")

        try:
            # 使用重試機制
            response = self._api_request_with_retry(
                self.client.futures_change_margin_type,
                symbol=symbol,
                marginType=margin_type
            )

            logger.info(f"設置保證金類型成功: {symbol} {margin_type}")
            return response
        except BinanceAPIException as e:
            # 如果已經是該保證金類型，忽略錯誤
            if e.code == -4046:  # "No need to change margin type."
                logger.info(f"{symbol} 已經是 {margin_type} 保證金類型")
                return {"msg": "Already in this margin type"}
            logger.error(f"設置保證金類型失敗: {e}")
            raise

    async def get_trade_fee(self, symbol: str, order_id: str) -> float:
        """
        獲取交易手續費 (調用已修正的 get_order_fee)

        Args:
            symbol: 交易對符號
            order_id: 訂單ID

        Returns:
            float: 交易手續費
        """
        try:
            # 確保客戶端已初始化
            await self._ensure_initialized()

            # 直接調用已修正的 get_order_fee
            actual_fee = await self.get_order_fee(symbol, order_id)

            # 只有在實際費用 > 0 時才返回，否則嘗試估算
            if actual_fee > 0:
                # logger.info(f"獲取到訂單 {order_id} 的實際手續費: {actual_fee} USDT")
                return actual_fee
            else:
                # 如果獲取實際手續費失敗(返回0或負數)，則使用估算方法
                logger.warning(f"無法獲取訂單 {order_id} 的實際手續費 (得到 {actual_fee})，將使用估算方法")

                # 獲取訂單信息 (需要確保客戶端已初始化)
                if not self.client:
                    logger.error(f"無法估算訂單 {order_id} 手續費：客戶端未初始化")
                    return 0.0

                order = await asyncio.to_thread(
                    self._api_request_with_retry,
                    self.client.futures_get_order,  # 確保這裡也是用 futures_get_order
                    symbol=symbol,
                    orderId=order_id
                )

                # 記錄訂單詳情，用於調試
                logger.debug(f"訂單 {order_id} 詳情 (用於估算手續費): {order}")

                # 獲取交易手續費率 (這裡仍是估算)
                fee_rate = 0.0005  # 默認費率為0.05%

                # 計算手續費
                executed_qty = float(order.get('executedQty', 0))
                avg_price = float(order.get('avgPrice', 0))

                if executed_qty <= 0 or avg_price <= 0:
                    logger.warning(f"訂單 {order_id} 的執行數量或平均價格為零，無法估算手續費")
                    return 0.0

                estimated_fee = executed_qty * avg_price * fee_rate
                logger.info(
                    f"估算訂單 {order_id} 的手續費: {estimated_fee} USDT (數量: {executed_qty}, 價格: {avg_price}, 費率: {fee_rate})")

                return estimated_fee

        except Exception as e:
            logger.error(f"獲取訂單 {order_id} 的手續費時發生錯誤: {e}")
            return 0.0  # 最終失敗返回 0

    # 添加清除緩存的方法
    def clear_price_cache(self, symbol: Optional[str] = None):
        """
        清除價格緩存

        Args:
            symbol: 特定代幣符號，如果不指定則清除所有緩存
        """
        if symbol:
            if symbol in self._price_cache:
                del self._price_cache[symbol]
                logger.info(f"已清除 {symbol} 價格緩存")
        else:
            self._price_cache.clear()
            logger.info("已清除所有價格緩存")

    async def get_fixed_savings_products(self) -> List[Dict[str, Any]]:
        """
        獲取用戶的固定期限存款產品列表

        NOTE: 這個方法已被移除，不再使用
        """
        # 此方法已被移除，返回空列表
        logger.info("已停用固定期限存款產品獲取功能")
        return []

    async def get_spot_account_summary(self, separate_funding: bool = False) -> Union[float, Dict[str, float]]:
        """
        獲取現貨賬戶總價值的簡化方法，使用 Binance API 直接提供的總價值
        不需要獲取每個代幣的價格，減少 API 調用

        優化後的版本會正確處理LD開頭的理財資產

        Args:
            separate_funding: 是否分離理財資產，若為True則返回字典含有現貨和理財資產的值

        Returns:
            Union[float, Dict[str, float]]: 現貨賬戶總價值（USDT）或包含現貨和理財資產的字典
        """
        try:
            await self._ensure_initialized()

            # 嘗試獲取現貨賬戶信息
            spot_account = self.client.get_account()
            if not spot_account or 'balances' not in spot_account:
                logger.warning("無法從現貨帳戶獲取餘額信息")
                if separate_funding:
                    return {'spot_value': 0, 'funding_value': 0, 'total_value': 0}
                else:
                    return 0

            # 獲取所有資產的價格
            all_tickers = {}
            try:
                tickers = self.client.get_all_tickers()
                for ticker in tickers:
                    all_tickers[ticker['symbol']] = float(ticker['price'])
            except Exception as e:
                logger.error(f"獲取全部價格信息失敗: {e}")

            # 計算總資產價值
            spot_value = 0
            funding_value = 0

            for balance in spot_account['balances']:
                asset = balance['asset']
                free = float(balance['free'])
                locked = float(balance['locked'])
                total = free + locked

                # 過濾掉數量極小的資產
                if total < 0.00001:
                    continue

                # 識別資產類型（理財還是現貨）
                is_funding = asset.startswith('LD')

                # 計算USDT價值
                usdt_value = 0

                if asset == 'USDT':
                    usdt_value = total
                else:
                    try:
                        # 對於LD資產，去掉LD前綴
                        price_asset = asset[2:] if is_funding else asset
                        symbol = f"{price_asset}USDT"

                        if symbol in all_tickers:
                            price = all_tickers[symbol]
                            usdt_value = total * price
                        else:
                            # 嘗試使用特殊映射
                            if price_asset in self.special_tokens:
                                symbol_to_use = self.special_tokens[price_asset]
                                if symbol_to_use in all_tickers:
                                    price = all_tickers[symbol_to_use]
                                    usdt_value = total * price
                    except Exception as e:
                        logger.warning(f"計算資產 {asset} 的USDT價值失敗: {e}")

                # 根據資產類型累加到對應的總價值中
                if is_funding:
                    funding_value += usdt_value
                else:
                    spot_value += usdt_value

            total_value = spot_value + funding_value

            if separate_funding:
                logger.info(
                    f"計算賬戶總價值: 現貨 {spot_value:.2f} USDT + 理財 {funding_value:.2f} USDT = {total_value:.2f} USDT（簡化方法）")
                return {
                    'spot_value': spot_value,
                    'funding_value': funding_value,
                    'total_value': total_value
                }
            else:
                logger.info(f"計算現貨賬戶總價值: {total_value} USDT（簡化方法）")
                return total_value

        except Exception as e:
            logger.error(f"獲取現貨賬戶總價值失敗: {e}")
            # 如果失敗，返回0或空字典，保持應用穩定性
            if separate_funding:
                return {'spot_value': 0, 'funding_value': 0, 'total_value': 0}
            else:
                return 0

    async def get_user_asset_data(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        完整獲取用戶的所有資產數據，包括現貨、期貨和理財產品

        已優化的流程:
        1. 使用spot_account_summary獲取現貨總額(已包含理財產品)
        2. 使用futures_account獲取合約總額
        3. 額外獲取理財產品詳情用於顯示，但不參與總資產計算

        Args:
            force_refresh: 是否強制刷新價格緩存

        Returns:
            Dict[str, Any]: 用戶資產數據
        """
        await self._ensure_initialized()
        asset_data = {}

        # 1. 獲取現貨賬戶總價值(包含理財產品)
        try:
            # 使用簡化方法獲取現貨+理財總額
            spot_summary = await self.get_spot_account_summary(separate_funding=True)
            asset_data["spot_balance"] = spot_summary["total_value"]
            asset_data["spot_only_balance"] = spot_summary["spot_value"]
            asset_data["funding_in_spot_balance"] = spot_summary["funding_value"]

            logger.info(f"獲取現貨總價值: {asset_data['spot_balance']} USDT (含理財產品 {asset_data['funding_in_spot_balance']} USDT)")
        except Exception as e:
            logger.error(f"獲取現貨賬戶總價值失敗: {e}")
            asset_data["spot_balance"] = 0
            asset_data["spot_only_balance"] = 0
            asset_data["funding_in_spot_balance"] = 0

        # 2. 獲取現貨賬戶詳細資訊(用於UI顯示)
        try:
            spot_account = self.client.get_account()
            asset_data["spot_account"] = spot_account

            # 處理現貨資產，創建spot_assets字典
            asset_data["spot_assets"] = {}

            # 獲取所有資產的價格
            all_tickers = {}
            try:
                tickers = self.client.get_all_tickers()
                for ticker in tickers:
                    all_tickers[ticker['symbol']] = float(ticker['price'])
            except Exception as e:
                logger.error(f"獲取全部價格信息失敗: {e}")

            # 處理非零餘額的資產
            if spot_account and 'balances' in spot_account:
                for balance in spot_account['balances']:
                    asset = balance['asset']
                    free = float(balance['free'])
                    locked = float(balance['locked'])
                    total = free + locked

                    # 只處理有餘額的資產
                    if total > 0:
                        # 計算USDT價值
                        usdt_value = 0
                        if asset == 'USDT':
                            usdt_value = total
                        else:
                            try:
                                # 對於LD資產，去掉LD前綴
                                price_symbol = asset
                                if asset.startswith('LD'):
                                    price_symbol = asset[2:]

                                symbol = f"{price_symbol}USDT"
                                if symbol in all_tickers:
                                    price = all_tickers[symbol]
                                    usdt_value = total * price
                                else:
                                    # 嘗試使用特殊映射
                                    if price_symbol in self.special_tokens:
                                        symbol_to_use = self.special_tokens[price_symbol]
                                        if symbol_to_use in all_tickers:
                                            price = all_tickers[symbol_to_use]
                                            usdt_value = total * price
                            except Exception as e:
                                logger.warning(f"計算資產 {asset} 的USDT價值失敗: {e}")

                        # 添加到spot_assets字典
                        asset_data["spot_assets"][asset] = {
                            "free": free,
                            "locked": locked,
                            "total": total,
                            "usdt_value": usdt_value
                        }

        except Exception as e:
            logger.error(f"獲取現貨賬戶資訊失敗: {e}")
            asset_data["spot_account"] = None
            asset_data["spot_assets"] = {}

        # 3. 獲取期貨賬戶資訊
        try:
            futures_account = self.client.futures_account()
            asset_data["futures_account"] = futures_account

            # 處理期貨資產
            futures_balance = float(futures_account.get("totalWalletBalance", 0))
            futures_unrealized_pnl = float(futures_account.get("totalUnrealizedProfit", 0))
            asset_data["futures_wallet_balance"] = futures_balance
            asset_data["futures_unrealized_pnl"] = futures_unrealized_pnl
            asset_data["futures_balance"] = futures_balance + futures_unrealized_pnl
            asset_data["futures_available_balance"] = float(futures_account.get("availableBalance", 0))

            logger.info(f"獲取期貨總價值: {asset_data['futures_balance']} USDT (錢包餘額: {futures_balance}，未實現盈虧: {futures_unrealized_pnl})")
        except Exception as e:
            logger.error(f"獲取期貨賬戶資訊失敗: {e}")
            asset_data["futures_account"] = None
            asset_data["futures_balance"] = 0

        # 4. 獲取理財產品資訊(僅供顯示，不參與總資產計算)
        asset_data["funding_products"] = {}

        # 4.1 獲取靈活存款產品
        try:
            flexible_savings = await self.get_flexible_savings_products()
            asset_data["funding_products"]["flexible_savings"] = flexible_savings

            # 計算靈活存款總額
            flexible_total_usdt = sum(float(product.get("usdt_value", 0)) for product in flexible_savings)
            asset_data["flexible_savings_balance"] = flexible_total_usdt

            logger.info(f"顯示用途: 獲取靈活存款產品，總額(USDT價值): {flexible_total_usdt} USDT")
        except Exception as e:
            logger.error(f"獲取靈活存款產品失敗: {e}")
            asset_data["funding_products"]["flexible_savings"] = []
            asset_data["flexible_savings_balance"] = 0

        # 4.2 獲取固定期限存款產品
        try:
            fixed_savings = await self.get_fixed_savings_products()
            asset_data["funding_products"]["fixed_savings"] = fixed_savings

            # 計算固定存款總額
            fixed_total_usdt = sum(float(product.get("usdt_value", 0)) for product in fixed_savings)
            asset_data["fixed_savings_balance"] = fixed_total_usdt

            logger.info(f"顯示用途: 獲取固定期限存款產品，總額(USDT價值): {fixed_total_usdt} USDT")
        except Exception as e:
            logger.error(f"獲取固定期限存款產品失敗: {e}")
            asset_data["funding_products"]["fixed_savings"] = []
            asset_data["fixed_savings_balance"] = 0

        # 5. 計算總資產
        # 總資產 = 現貨資產(含理財) + 期貨資產
        asset_data["total_balance"] = asset_data["spot_balance"] + asset_data.get("futures_balance", 0)
        logger.info(
            f"計算總資產: 現貨(不含理財) {asset_data['spot_only_balance']} + 理財 {asset_data['funding_in_spot_balance']} + 期貨 {asset_data.get('futures_balance', 0)} = {asset_data['total_balance']} USDT")

        return asset_data

    async def get_flexible_savings_products(self) -> List[Dict[str, Any]]:
        """
        獲取用戶的靈活存款產品列表

        由於API權限問題，已簡化此函數，直接從現貨帳戶中獲取LD開頭的資產

        Returns:
            List[Dict[str, Any]]: 靈活存款產品列表
        """
        await self._ensure_initialized()

        # 檢查是否已知API無權限
        if hasattr(self, 'simple_earn_api_disabled') and self.simple_earn_api_disabled:
            logger.info("Simple Earn API已被標記為禁用，使用替代方法")
            return await self._get_flexible_products_from_spot_account()

        try:
            # 簡化版本：直接從現貨帳戶獲取LD資產作為靈活存款產品
            return await self._get_flexible_products_from_spot_account()

        except Exception as e:
            logger.error(f"獲取靈活存款產品失敗: {e}")
            traceback.print_exc()
            return []

    async def _get_flexible_products_from_spot_account(self) -> List[Dict[str, Any]]:
        """
        從現貨帳戶獲取靈活存款產品（LD開頭的資產）

        Returns:
            List[Dict[str, Any]]: 靈活存款產品列表
        """
        try:
            # 獲取現貨帳戶資訊
            spot_account = self.client.get_account()
            if not spot_account or 'balances' not in spot_account:
                logger.warning("無法從現貨帳戶獲取餘額信息")
                return []

            # 獲取所有資產的價格
            all_tickers = {}
            try:
                tickers = self.client.get_all_tickers()
                for ticker in tickers:
                    all_tickers[ticker['symbol']] = float(ticker['price'])
            except Exception as e:
                logger.error(f"獲取全部價格信息失敗: {e}")

            # 處理LD開頭的資產
            flexible_savings = []

            for balance in spot_account['balances']:
                asset = balance['asset']
                free = float(balance['free'])
                locked = float(balance['locked'])
                total = free + locked

                # 只處理有餘額且是LD開頭的資產
                if total > 0 and asset.startswith('LD'):
                    # 移除LD前綴獲取原始資產名稱
                    original_asset = asset[2:] if asset.startswith('LD') else asset

                    # 計算USDT價值
                    usdt_value = 0
                    if original_asset == 'USDT':
                        usdt_value = total
                    else:
                        try:
                            symbol = f"{original_asset}USDT"
                            if symbol in all_tickers:
                                price = all_tickers[symbol]
                                usdt_value = total * price
                            else:
                                # 嘗試使用特殊映射
                                if original_asset in self.special_tokens:
                                    symbol_to_use = self.special_tokens[original_asset]
                                    if symbol_to_use in all_tickers:
                                        price = all_tickers[symbol_to_use]
                                        usdt_value = total * price
                        except Exception as e:
                            logger.warning(f"計算資產 {asset} 的USDT價值失敗: {e}")

                    # 創建靈活存款產品記錄
                    product = {
                        "asset": original_asset,
                        "totalAmount": total,
                        "free": free,
                        "locked": locked,
                        "productId": f"LD{original_asset}",
                        "productName": f"{original_asset} Flexible Savings",
                        "dailyInterestRate": 0.0001,  # 預設值，因為無法從帳戶直接獲取
                        "annualInterestRate": 0.0365,  # 預設值，因為無法從帳戶直接獲取
                        "usdt_value": usdt_value
                    }
                    flexible_savings.append(product)

            logger.info(f"從現貨帳戶成功識別 {len(flexible_savings)} 個靈活存款產品 (LD資產)")
            return flexible_savings

        except Exception as e:
            logger.error(f"從現貨帳戶獲取靈活存款產品失敗: {e}")
            return []

    def _process_simple_earn_flexible(self, response: Dict[str, Any], product_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        處理 simple-earn/flexible/position API 回傳的資料

        Args:
            response: API 回傳的原始資料
            product_details: 產品詳情資料，用於補充回傳資料的資訊

        Returns:
            List[Dict[str, Any]]: 處理後的產品列表
        """
        processed_products = []

        try:
            # 檢查回傳格式
            positions = []
            if isinstance(response, dict):
                if 'data' in response:
                    positions = response.get('data', [])
                elif 'code' in response and response.get('code') == -1002:
                    # 這是權限錯誤，直接返回空列表
                    logger.warning(f"API返回權限錯誤: {response}")
                    return []
                else:
                    # 某些情況下API直接返回的是dict但無data字段，嘗試直接處理
                    positions = [response] if response else []
            elif isinstance(response, list):
                positions = response
            else:
                logger.warning(f"無法識別的回傳格式: {type(response)}")
                return []

            # 檢查是否有內容需要處理
            if not positions:
                logger.warning("位置列表為空，沒有產品可處理")
                return []

            logger.info(f"處理 {len(positions)} 個產品位置")

            for position in positions:
                try:
                    # 檢查是否為空記錄
                    if not position or (isinstance(position, dict) and not position):
                        continue

                    asset = position.get('asset', '')
                    # 安全地轉換金額，確保默認值為0
                    try:
                        total_amount = float(position.get('amount', 0))
                    except (ValueError, TypeError):
                        logger.warning(f"無效的金額值: {position.get('amount')}")
                        total_amount = 0

                    product_id = position.get('productId', '')

                    # 跳過數量為0的記錄
                    if total_amount <= 0:
                        logger.debug(f"跳過總金額為0的產品: {asset}")
                        continue

                    # 創建標準化的產品資訊
                    product_info = {
                        "asset": asset,
                        "totalAmount": total_amount,
                        "productId": product_id,
                        "type": "FLEXIBLE",  # 這是靈活存款產品
                        "status": position.get('status', 'HOLDING'),
                        "interestRate": position.get('annualInterestRate', position.get('apr', 0)),
                        "purchaseTime": position.get('createTime', position.get('purchaseTime', '')),
                        "usdt_value": 0,  # 初始化 USDT 價值，後續會計算
                    }

                    # 從產品詳情補充資訊
                    if product_id in product_details:
                        details = product_details[product_id]
                        if 'interestRate' not in product_info or not product_info['interestRate']:
                            product_info['interestRate'] = details.get('interestRate', details.get('annualInterestRate', 0))

                    processed_products.append(product_info)
                    logger.debug(f"成功處理產品: {asset}, 金額: {total_amount}")
                except Exception as e:
                    logger.warning(f"處理產品時發生錯誤: {e}")
                    continue

            logger.info(f"成功處理 {len(processed_products)} 個靈活存款產品")
            return processed_products
        except Exception as e:
            logger.error(f"處理 simple-earn/flexible/position 回傳資料時發生錯誤: {e}")
            return []

    def _process_simple_earn_account_flexible(self, response: Dict[str, Any], product_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        處理 simple-earn/account API 回傳的資料中的靈活存款產品

        Args:
            response: API 回傳的原始資料
            product_details: 產品詳情資料，用於補充回傳資料的資訊

        Returns:
            List[Dict[str, Any]]: 處理後的產品列表
        """
        processed_products = []

        try:
            # 檢查並提取產品資料
            if not isinstance(response, dict):
                logger.warning(f"回傳格式不是字典: {type(response)}")
                return []

            # 從 simple-earn/account 回傳中提取靈活存款產品
            flexible_positions = []

            # 檢查不同可能的資料結構
            if 'data' in response:
                data = response.get('data', {})
                if 'positionAmountVos' in data:
                    for position in data.get('positionAmountVos', []):
                        if position.get('productId') and float(position.get('amount', 0)) > 0 and position.get('productType', '') == 'FLEXIBLE':
                            flexible_positions.append(position)
                elif 'totalFlexibleAmount' in data and float(data.get('totalFlexibleAmount', 0)) > 0:
                    # 找出所有靈活存款位置
                    flexible_products = data.get('flexibleAssets', [])
                    for flexible_asset in flexible_products:
                        positions = flexible_asset.get('positions', [])
                        for position in positions:
                            flexible_positions.append(position)

            logger.info(f"從 simple-earn/account 找到 {len(flexible_positions)} 個靈活存款產品位置")

            # 處理靈活存款產品
            for position in flexible_positions:
                try:
                    asset = position.get('asset', '')
                    total_amount = float(position.get('amount', 0))
                    product_id = position.get('productId', '')

                    # 創建標準化的產品資訊
                    product_info = {
                        "asset": asset,
                        "totalAmount": total_amount,
                        "productId": product_id,
                        "type": "FLEXIBLE",
                        "status": position.get('status', 'HOLDING'),
                        "interestRate": position.get('apy', position.get('apr', 0)),
                        "purchaseTime": position.get('createTime', position.get('purchaseTime', '')),
                        "usdt_value": 0,  # 初始化 USDT 價值，後續會計算
                    }

                    # 從產品詳情補充資訊
                    if product_id in product_details:
                        details = product_details[product_id]
                        if 'interestRate' not in product_info or not product_info['interestRate']:
                            product_info['interestRate'] = details.get('interestRate', 0)

                    processed_products.append(product_info)
                except Exception as e:
                    logger.warning(f"處理靈活存款產品時發生錯誤: {e}")
                    continue

            return processed_products
        except Exception as e:
            logger.error(f"處理 simple-earn/account 回傳資料時發生錯誤: {e}")
            return []

    async def get_spot_price(self, symbol: str) -> float:
        """
        獲取現貨交易對的實時價格

        Args:
            symbol: 交易對符號，例如 "BTCUSDT"

        Returns:
            float: 實時價格

        Raises:
            ValueError: 如果價格獲取失敗
        """
        try:
            # 確保symbol格式正確
            symbol = symbol.upper()

            # 處理特殊代幣映射
            if symbol in self.special_tokens:
                symbol = self.special_tokens[symbol]

            # 使用現貨API獲取價格
            url = "https://api.binance.com/api/v3/ticker/price"
            params = {"symbol": symbol}
            data = await self._api_request_with_exponential_backoff("GET", url, params=params)

            if "price" in data:
                price = float(data["price"])
                logger.debug(f"獲取現貨 {symbol} 價格: {price}")
                return price
            else:
                raise ValueError(f"無法獲取現貨 {symbol} 的價格")
        except Exception as e:
            logger.error(f"獲取現貨 {symbol} 價格時發生錯誤: {e}")
            raise ValueError(f"獲取現貨 {symbol} 價格失敗: {str(e)}")

    def _process_simple_earn_locked(self, response: Dict[str, Any], product_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        處理 simple-earn/locked/position API 回傳的資料

        Args:
            response: API 回傳的原始資料
            product_details: 產品詳情資料，用於補充回傳資料的資訊

        Returns:
            List[Dict[str, Any]]: 處理後的產品列表
        """
        processed_products = []

        try:
            # 檢查回傳格式
            positions = []
            if isinstance(response, dict) and 'data' in response:
                positions = response.get('data', [])
            elif isinstance(response, list):
                positions = response
            else:
                logger.warning(f"無法識別的回傳格式: {type(response)}")
                return []

            logger.info(f"處理 {len(positions)} 個產品位置")

            for position in positions:
                try:
                    asset = position.get('asset', '')
                    total_amount = float(position.get('amount', 0))
                    product_id = position.get('productId', '')

                    # 創建標準化的產品資訊
                    product_info = {
                        "asset": asset,
                        "totalAmount": total_amount,
                        "productId": product_id,
                        "type": "LOCKED",  # 假設這是鎖定產品
                        "status": position.get('status', 'HOLDING'),
                        "interestRate": position.get('apr', 0),
                        "redeemDate": position.get('endTime', position.get('redeemDate', '')),
                        "purchaseTime": position.get('createTime', position.get('purchaseTime', '')),
                        "usdt_value": 0,  # 初始化 USDT 價值，後續會計算
                    }

                    # 從產品詳情補充資訊
                    if product_id in product_details:
                        details = product_details[product_id]
                        if 'interestRate' not in product_info or not product_info['interestRate']:
                            product_info['interestRate'] = details.get('interestRate', 0)

                    processed_products.append(product_info)
                except Exception as e:
                    logger.warning(f"處理產品時發生錯誤: {e}")
                    continue

            return processed_products
        except Exception as e:
            logger.error(f"處理 simple-earn/locked/position 回傳資料時發生錯誤: {e}")
            return []

    def _process_simple_earn_account_locked(self, response: Dict[str, Any], product_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        處理 simple-earn/account API 回傳的資料中的鎖定產品

        Args:
            response: API 回傳的原始資料
            product_details: 產品詳情資料，用於補充回傳資料的資訊

        Returns:
            List[Dict[str, Any]]: 處理後的產品列表
        """
        processed_products = []

        try:
            # 檢查並提取產品資料
            if not isinstance(response, dict):
                logger.warning(f"回傳格式不是字典: {type(response)}")
                return []

            # 從 simple-earn/account 回傳中提取鎖定產品
            locked_positions = []

            # 檢查不同可能的資料結構
            if 'data' in response:
                data = response.get('data', {})
                if 'positionAmountVos' in data:
                    for position in data.get('positionAmountVos', []):
                        if position.get('productId') and float(position.get('amount', 0)) > 0:
                            locked_positions.append(position)
                elif 'totalLockedAmount' in data and float(data.get('totalLockedAmount', 0)) > 0:
                    # 找出所有鎖定位置
                    locked_products = data.get('lockedAssets', [])
                    for locked_asset in locked_products:
                        positions = locked_asset.get('positions', [])
                        for position in positions:
                            locked_positions.append(position)

            logger.info(f"從 simple-earn/account 找到 {len(locked_positions)} 個鎖定產品位置")

            # 處理鎖定產品
            for position in locked_positions:
                try:
                    asset = position.get('asset', '')
                    total_amount = float(position.get('amount', 0))
                    product_id = position.get('productId', '')

                    # 創建標準化的產品資訊
                    product_info = {
                        "asset": asset,
                        "totalAmount": total_amount,
                        "productId": product_id,
                        "type": "LOCKED",
                        "status": position.get('status', 'HOLDING'),
                        "interestRate": position.get('apy', position.get('apr', 0)),
                        "redeemDate": position.get('endTime', position.get('redeemDate', '')),
                        "purchaseTime": position.get('createTime', position.get('purchaseTime', '')),
                        "usdt_value": 0,  # 初始化 USDT 價值，後續會計算
                    }

                    # 從產品詳情補充資訊
                    if product_id in product_details:
                        details = product_details[product_id]
                        if 'interestRate' not in product_info or not product_info['interestRate']:
                            product_info['interestRate'] = details.get('interestRate', 0)

                    processed_products.append(product_info)
                except Exception as e:
                    logger.warning(f"處理鎖定產品時發生錯誤: {e}")
                    continue

            return processed_products
        except Exception as e:
            logger.error(f"處理 simple-earn/account 回傳資料時發生錯誤: {e}")
            return []

    def _process_fixed_savings(self, response: Dict[str, Any], product_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        處理固定存款 API 回傳的資料

        Args:
            response: API 回傳的原始資料
            product_details: 產品詳情資料，用於補充回傳資料的資訊

        Returns:
            List[Dict[str, Any]]: 處理後的產品列表
        """
        processed_products = []

        try:
            # 檢查回傳格式
            positions = []
            if isinstance(response, dict) and 'data' in response:
                positions = response.get('data', [])
            elif isinstance(response, list):
                positions = response
            else:
                logger.warning(f"無法識別的回傳格式: {type(response)}")
                return []

            logger.info(f"處理 {len(positions)} 個固定存款產品位置")

            for position in positions:
                try:
                    asset = position.get('asset', '')
                    total_amount = float(position.get('principal', position.get('amount', 0)))
                    product_id = position.get('productId', '')

                    # 創建標準化的產品資訊
                    product_info = {
                        "asset": asset,
                        "totalAmount": total_amount,
                        "productId": product_id,
                        "type": "FIXED",
                        "status": position.get('status', 'HOLDING'),
                        "interestRate": position.get('interestRate', 0),
                        "redeemDate": position.get('endTime', position.get('redeemDate', '')),
                        "purchaseTime": position.get('createTime', position.get('purchaseTime', '')),
                        "usdt_value": 0,  # 初始化 USDT 價值，後續會計算
                    }

                    processed_products.append(product_info)
                except Exception as e:
                    logger.warning(f"處理固定存款產品時發生錯誤: {e}")
                    continue

            return processed_products
        except Exception as e:
            logger.error(f"處理固定存款回傳資料時發生錯誤: {e}")
            return []

    async def get_account_snapshot(self, account_type: str = "SPOT", limit: int = 5) -> Dict[str, Any]:
        """
        獲取賬戶快照信息

        Args:
            account_type: 賬戶類型，可選值: SPOT, MARGIN, FUTURES
            limit: 返回的快照數量

        Returns:
            Dict[str, Any]: 賬戶快照信息
        """
        await self._ensure_initialized()
        try:
            params = {
                "type": account_type,
                "limit": limit,
                "timestamp": self._get_timestamp()
            }

            # 使用API請求獲取賬戶快照
            response = await self._api_request_with_exponential_backoff(
                "GET",
                "https://api.binance.com/sapi/v1/accountSnapshot",
                params=params,
                headers=self._get_authenticated_headers()
            )

            return response
        except Exception as e:
            logger.error(f"獲取賬戶快照失敗: {e}")
            return {"code": -1, "msg": str(e)}

    async def get_user_asset(self) -> List[Dict[str, Any]]:
        """
        獲取用戶資產信息(使用/sapi/v3/asset/getUserAsset接口)

        Returns:
            List[Dict[str, Any]]: 用戶資產列表
        """
        await self._ensure_initialized()
        try:
            params = {
                "timestamp": self._get_timestamp()
            }

            # 使用API請求獲取用戶資產
            response = await self._api_request_with_exponential_backoff(
                "POST",
                "https://api.binance.com/sapi/v3/asset/getUserAsset",
                params=params,
                headers=self._get_authenticated_headers()
            )

            return response
        except Exception as e:
            logger.error(f"獲取用戶資產信息失敗: {e}")
            return []

    async def get_multiple_symbols_price(self, symbols: List[str], force_refresh: bool = False) -> List[Dict[str, Any]]:
        """
        批量獲取多個交易對的最新價格

        Args:
            symbols: 交易對列表，如["BTCUSDT", "ETHUSDT"]
            force_refresh: 是否強制刷新緩存

        Returns:
            List[Dict[str, Any]]: 價格列表
        """
        await self._ensure_initialized()
        try:
            # 檢查参數
            if not symbols:
                return []

            # 如果只有一個交易對，使用單一請求更高效
            if len(symbols) == 1:
                price = await self.get_latest_price(symbols[0], force_refresh=force_refresh)
                if price:
                    return [{"symbol": symbols[0], "price": price}]
                else:
                    return []

            # 使用批量獲取價格的API
            url = "https://api.binance.com/api/v3/ticker/price"
            prices = []

            # 批量API可以不帶參數，返回所有交易對的價格
            # 或者可以使用參數symbol篩選特定交易對
            # 這裡我們請求所有價格，然後在客戶端篩選
            response = await self._api_request_with_exponential_backoff("GET", url)

            if not response:
                logger.warning("批量獲取價格返回空響應")
                return []

            # 篩選出我們需要的交易對
            symbols_set = set(symbols)
            for item in response:
                if item.get("symbol") in symbols_set:
                    prices.append(item)

            if len(prices) != len(symbols):
                logger.warning(f"部分交易對價格未找到，請求了{len(symbols)}個，找到{len(prices)}個")

            return prices
        except Exception as e:
            logger.error(f"批量獲取價格失敗: {e}")
            return []

    def _get_authenticated_headers(self):
        """
        獲取帶有身份驗證的HTTP頭部

        Returns:
            Dict: 包含身份驗證信息的頭部
        """
        if not self.api_key:
            raise ValueError("API密鑰未設置")

        timestamp = self._get_timestamp()
        params = {'timestamp': timestamp}
        signature = self._generate_signature(params)
        params['signature'] = signature

        headers = {
            'X-MBX-APIKEY': self.api_key
        }
        return headers

    def _generate_signature(self, params: Dict) -> str:
        """
        生成API請求的簽名

        Args:
            params: 請求參數

        Returns:
            str: 簽名
        """
        if not self.api_secret:
            raise ValueError("API密鑰未設置")

        # 將參數轉換為查詢字符串
        query_string = '&'.join([f"{k}={v}" for k, v in sorted(params.items())])

        # 生成簽名
        signature = hmac.new(
            self.api_secret.encode('utf-8'),
            query_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

        return signature

    async def open_pair_trade(
        self,
        long_symbol: str,
        short_symbol: str,
        long_quantity: float,
        short_quantity: float,
        long_leverage: int = 1,
        short_leverage: int = 1
    ) -> Dict[str, Any]:
        """
        執行配對交易的開倉操作

        Args:
            long_symbol: 多單交易對
            short_symbol: 空單交易對
            long_quantity: 多單數量
            short_quantity: 空單數量
            long_leverage: 多單槓桿
            short_leverage: 空單槓桿

        Returns:
            Dict[str, Any]: 開倉結果，包含訂單信息和價格信息
        """
        try:
            # 確保客戶端已初始化
            await self._ensure_initialized()

            # 獲取當前價格
            long_price = await self.get_futures_price(long_symbol)
            short_price = await self.get_futures_price(short_symbol)

            if not long_price or not short_price:
                logger.error(f"無法獲取價格信息: {long_symbol}={long_price}, {short_symbol}={short_price}")
                return None

            # 設置槓桿
            if long_leverage > 1:
                await self.set_leverage(long_symbol, long_leverage)
            if short_leverage > 1:
                await self.set_leverage(short_symbol, short_leverage)

            # 使用原子性操作執行配對交易
            long_order = None
            short_order = None

            try:
                # 下多單
                long_order = await self._api_request_with_exponential_backoff(
                    self.client.futures_create_order,
                    symbol=long_symbol,
                    side="BUY",
                    type="MARKET",
                    quantity=long_quantity
                )

                logger.info(f"多單下單成功: {long_symbol} x {long_quantity}")

                # 等待訂單確認完成
                await asyncio.sleep(1)  # 先等待一小段時間讓訂單處理

                # 查詢並獲取實際訂單狀態
                max_attempts = 3
                for attempt in range(max_attempts):
                    try:
                        long_order_id = long_order.get("orderId")
                        if long_order_id:
                            updated_long_order = await asyncio.to_thread(
                                self._api_request_with_retry,
                                self.client.futures_get_order,
                                symbol=long_symbol,
                                orderId=long_order_id
                            )
                            if updated_long_order.get("status") == "FILLED":
                                long_order = updated_long_order
                                logger.info(f"多單訂單已確認完成: {long_symbol} x {updated_long_order.get('executedQty')}")
                                break
                            elif attempt == max_attempts - 1:
                                logger.warning(f"多單訂單未能在預期時間內完成: {long_symbol}, 當前狀態: {updated_long_order.get('status')}")
                    except Exception as e:
                        logger.warning(f"查詢多單訂單狀態時發生錯誤: {e}")

                    await asyncio.sleep(1)  # 每次重試間隔1秒

                try:
                    # 下空單
                    short_order = await self._api_request_with_exponential_backoff(
                        self.client.futures_create_order,
                        symbol=short_symbol,
                        side="SELL",
                        type="MARKET",
                        quantity=short_quantity
                    )

                    logger.info(f"空單下單成功: {short_symbol} x {short_quantity}")

                    # 等待空單確認完成
                    await asyncio.sleep(1)

                    # 查詢並獲取實際訂單狀態
                    for attempt in range(max_attempts):
                        try:
                            short_order_id = short_order.get("orderId")
                            if short_order_id:
                                updated_short_order = await asyncio.to_thread(
                                    self._api_request_with_retry,
                                    self.client.futures_get_order,
                                    symbol=short_symbol,
                                    orderId=short_order_id
                                )
                                if updated_short_order.get("status") == "FILLED":
                                    short_order = updated_short_order
                                    logger.info(f"空單訂單已確認完成: {short_symbol} x {updated_short_order.get('executedQty')}")
                                    break
                                elif attempt == max_attempts - 1:
                                    logger.warning(f"空單訂單未能在預期時間內完成: {short_symbol}, 當前狀態: {updated_short_order.get('status')}")
                        except Exception as e:
                            logger.warning(f"查詢空單訂單狀態時發生錯誤: {e}")

                        await asyncio.sleep(1)  # 每次重試間隔1秒

                except Exception as short_error:
                    # 如果下空單失敗，立即平掉多單以避免單邊風險
                    logger.error(f"下空單失敗，嘗試平掉多單: {short_error}")
                    try:
                        cancel_long_order = await self._api_request_with_exponential_backoff(
                            self.client.futures_create_order,
                            symbol=long_symbol,
                            side="SELL",
                            type="MARKET",
                            quantity=long_quantity,
                            reduceOnly=True
                        )
                        logger.info(f"已平掉多單以避免單邊風險: {cancel_long_order.get('orderId')}")
                    except Exception as cancel_error:
                        logger.critical(f"平掉多單失敗，存在單邊風險，請立即手動處理: {cancel_error}")

                    # 拋出原始錯誤，中止交易
                    raise short_error

            except Exception as order_error:
                if long_order and not short_order:
                    logger.error(f"配對交易只成功下了多單，但空單失敗: {order_error}")
                else:
                    logger.error(f"配對交易下單失敗: {order_error}")
                raise order_error

            # 獲取手續費
            long_entry_fee = await self.get_order_fee(long_symbol, str(long_order.get("orderId", "")))
            short_entry_fee = await self.get_order_fee(short_symbol, str(short_order.get("orderId", "")))

            # 組合開倉結果
            return {
                "long_order": long_order,
                "short_order": short_order,
                "long_price": long_price,
                "short_price": short_price,
                "long_quantity": long_quantity,
                "short_quantity": short_quantity,
                "long_entry_fee": long_entry_fee,
                "short_entry_fee": short_entry_fee,
                "total_entry_fee": long_entry_fee + short_entry_fee
            }
        except Exception as e:
            logger.error(f"配對交易開倉失敗: {e}")
            logger.error(traceback.format_exc())
            raise

    async def init_futures_websocket(self, symbols: List[str]) -> bool:
        """
        初始化期貨WebSocket連接

        Args:
            symbols: 要監控的交易對列表

        Returns:
            bool: 是否成功初始化
        """
        try:
            # 轉換為集合以便比較
            symbols_set = set(symbols)

            # 檢查是否已有連接且交易對相同
            already_connected = (
                self.futures_ws_connected and
                self.futures_ws_task and
                not self.futures_ws_task.done() and
                self.futures_ws_symbols == symbols_set
            )

            if already_connected:
                logger.debug("WebSocket已連接且交易對未變化，跳過重新初始化")
                return True

            # 如果已經有連接，先關閉
            if self.futures_ws_client:
                await self.release_futures_websocket()

            # 設置WebSocket相關屬性
            self.futures_ws_symbols = symbols_set
            self.futures_ws_prices = {}
            self.futures_ws_connected = True

            # 創建WebSocket任務
            self.futures_ws_task = asyncio.create_task(self._futures_websocket_loop())
            logger.info(f"期貨WebSocket已初始化，監控 {len(symbols)} 個交易對")
            return True
        except Exception as e:
            logger.error(f"初始化期貨WebSocket失敗: {e}")
            return False

    async def _futures_websocket_loop(self):
        """
        WebSocket循環，持續接收價格更新
        """
        try:
            while self.futures_ws_connected:
                try:
                    # 構建WebSocket URL
                    symbols_str = '/'.join([f"{symbol.lower()}@ticker" for symbol in self.futures_ws_symbols])
                    ws_url = f"wss://fstream.binance.com/stream?streams={symbols_str}"

                    # 在每次連接時創建新的session
                    async with aiohttp.ClientSession() as session:
                        async with session.ws_connect(ws_url) as ws:
                            logger.info("期貨WebSocket連接成功")
                            while self.futures_ws_connected:
                                msg = await ws.receive_json()
                                if msg and 'data' in msg:
                                    data = msg['data']
                                    symbol = data.get('s')
                                    price = float(data.get('c', 0))  # 使用收盤價
                                    if symbol and price > 0:
                                        self.futures_ws_prices[symbol] = price
                                        self.futures_ws_last_heartbeat = time.time()
                                        logger.debug(f"收到 {symbol} 價格更新: {price}")
                except Exception as e:
                    logger.error(f"WebSocket循環中發生錯誤: {e}")
                    await asyncio.sleep(5)  # 發生錯誤後等待5秒再重試
        except Exception as e:
            logger.error(f"WebSocket循環發生嚴重錯誤: {e}")
            self.futures_ws_connected = False

    async def release_futures_websocket(self):
        """
        釋放WebSocket連接
        """
        try:
            self.futures_ws_connected = False
            if self.futures_ws_task and not self.futures_ws_task.done():
                self.futures_ws_task.cancel()
                try:
                    await self.futures_ws_task
                except asyncio.CancelledError:
                    pass
            if self.futures_ws_client:
                await self.futures_ws_client.close()
            self.futures_ws_client = None
            self.futures_ws_prices = {}
            self.futures_ws_symbols = set()
            logger.info("期貨WebSocket已釋放")
        except Exception as e:
            logger.error(f"釋放WebSocket連接時發生錯誤: {e}")

    async def get_futures_price_ws(self, symbol: str) -> Optional[float]:
        """
        從WebSocket獲取期貨價格

        Args:
            symbol: 交易對符號

        Returns:
            Optional[float]: 價格，如果不可用則返回None
        """
        try:
            # 檢查WebSocket是否已連接
            if not self.futures_ws_connected:
                logger.warning("WebSocket未連接，嘗試重新連接")
                await self.init_futures_websocket(list(self.futures_ws_symbols))

            # 檢查價格是否在緩存中
            if symbol in self.futures_ws_prices:
                price = self.futures_ws_prices[symbol]
                # 檢查價格是否過期（超過5秒）
                if time.time() - self.futures_ws_last_heartbeat < 5:
                    return float(price)
                else:
                    logger.warning(f"{symbol} 的WebSocket價格已過期")

            # 如果WebSocket價格不可用，使用REST API
            logger.info(f"使用REST API獲取 {symbol} 價格")
            price = await self.get_futures_price(symbol)
            return float(price) if price is not None else None
        except Exception as e:
            logger.error(f"從WebSocket獲取 {symbol} 價格失敗: {e}")
            return None

    async def get_futures_available_margin(self) -> float:
        """
        獲取期貨帳戶可用保證金

        Returns:
            float: 可用保證金 (USDT)
        """
        try:
            await self._ensure_initialized()

            if not self.client:
                logger.error("獲取可用保證金失敗: 客戶端未初始化")
                return 0.0

            # 獲取期貨帳戶信息
            futures_account = await asyncio.to_thread(
                self._api_request_with_retry,
                self.client.futures_account
            )

            if not futures_account:
                logger.warning("未獲取到期貨帳戶資訊")
                return 0.0

            # 可用保證金 = 可用餘額
            available_balance = float(futures_account.get("availableBalance", 0))
            logger.info(f"期貨可用保證金: {available_balance} USDT")

            return available_balance

        except Exception as e:
            logger.error(f"獲取期貨可用保證金失敗: {e}")
            return 0.0

    async def calculate_required_margin(self, symbol: str, quantity: float, leverage: int, price: Optional[float] = None) -> float:
        """
        計算所需保證金

        Args:
            symbol: 交易對符號
            quantity: 交易數量
            leverage: 槓桿倍數
            price: 價格，如果不提供則獲取當前價格

        Returns:
            float: 所需保證金 (USDT)
        """
        try:
            # 如果沒有提供價格，獲取當前價格
            if price is None:
                price = await self.get_futures_price(symbol)
                if not price:
                    logger.error(f"無法獲取 {symbol} 價格")
                    return 0.0
                price = float(price)

            # 計算名義價值
            notional_value = quantity * price

            # 計算所需保證金 = 名義價值 / 槓桿
            required_margin = notional_value / leverage

            logger.debug(f"計算 {symbol} 所需保證金: 數量={quantity}, 價格={price}, 槓桿={leverage}x, 保證金={required_margin} USDT")

            return required_margin

        except Exception as e:
            logger.error(f"計算所需保證金失敗: {e}")
            return 0.0

    async def check_margin_sufficient(self, long_symbol: str, long_quantity: float, long_leverage: int,
                                      short_symbol: str, short_quantity: float, short_leverage: int) -> Dict[str, Any]:
        """
        檢查保證金是否足夠進行配對交易

        Args:
            long_symbol: 多單交易對
            long_quantity: 多單數量
            long_leverage: 多單槓桿
            short_symbol: 空單交易對
            short_quantity: 空單數量
            short_leverage: 空單槓桿

        Returns:
            Dict[str, Any]: 包含檢查結果的字典
        """
        try:
            # 獲取可用保證金
            available_margin = await self.get_futures_available_margin()

            # 獲取當前價格
            long_price = await self.get_futures_price(long_symbol)
            short_price = await self.get_futures_price(short_symbol)

            if not long_price or not short_price:
                return {
                    "sufficient": False,
                    "error": "無法獲取價格信息",
                    "available_margin": available_margin,
                    "required_margin": 0,
                    "long_required": 0,
                    "short_required": 0
                }

            long_price = float(long_price)
            short_price = float(short_price)

            # 計算所需保證金
            long_required = await self.calculate_required_margin(long_symbol, long_quantity, long_leverage, long_price)
            short_required = await self.calculate_required_margin(short_symbol, short_quantity, short_leverage, short_price)
            total_required = long_required + short_required

            # 直接檢查保證金是否充足（不使用緩衝）
            is_sufficient = available_margin >= total_required

            result = {
                "sufficient": is_sufficient,
                "available_margin": available_margin,
                "required_margin": total_required,
                "long_required": long_required,
                "short_required": short_required,
                "long_price": long_price,
                "short_price": short_price,
                "deficit": max(0, total_required - available_margin) if not is_sufficient else 0
            }

            if is_sufficient:
                logger.info(f"保證金檢查通過: 可用={available_margin}, 需要={total_required} USDT")
            else:
                logger.warning(f"保證金不足: 可用={available_margin}, 需要={total_required}, 缺口={result['deficit']} USDT")

            return result

        except Exception as e:
            logger.error(f"檢查保證金時發生錯誤: {e}")
            return {
                "sufficient": False,
                "error": f"檢查保證金時發生錯誤: {str(e)}",
                "available_margin": 0,
                "required_margin": 0,
                "long_required": 0,
                "short_required": 0
            }
