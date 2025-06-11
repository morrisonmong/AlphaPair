import logging
import time
import asyncio
import traceback
from typing import Optional, Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
import os
from dotenv import load_dotenv
from app.config import settings
from bson.codec_options import CodecOptions
from datetime import timezone, timedelta
from pymongo.errors import OperationFailure
from urllib.parse import urlparse, parse_qs

# 設置日誌
logger = logging.getLogger(__name__)

# --- 新增：在啟動時記錄資料庫連接狀態（不暴露敏感資訊） ---
try:
    db_url = settings.db.url
    # 安全地記錄資料庫連接資訊，隱藏密碼
    if db_url:
        import re
        safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', db_url)
        logger.info(f"mongodb.py: 資料庫連接配置已載入: {safe_url}")
    else:
        logger.warning("mongodb.py: 未找到資料庫連接配置")
except Exception as e:
    logger.error(f"mongodb.py: 無法存取資料庫配置: {e}")
# --- 結束新增 ---

# 載入環境變數
load_dotenv()

# 定義 UTC+8 時區
UTC_PLUS_8 = timezone(timedelta(hours=8))

# 創建 CodecOptions 以處理時區
codec_options = CodecOptions(tz_aware=True, tzinfo=timezone.utc)

# 全局變數
_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None
_collections: Dict[str, AsyncIOMotorCollection] = {}
_client_loop_id: Optional[int] = None
_last_check_time: float = 0
_check_count: int = 0
_error_count: int = 0

# 集合名稱常量
COLLECTION_USERS = "users"  # 用戶
COLLECTION_TRADES = "trades"  # 交易
COLLECTION_ASSETS = "assets"  # 資產快照
COLLECTION_API_KEYS = "api_keys"  # API 密鑰
COLLECTION_USER_SETTINGS = "user_settings"  # 用戶設置
COLLECTION_PAIR_TRADES = "pair_trades"  # 配對交易
COLLECTION_TRADE_HISTORY = "trade_history"  # 交易歷史


async def get_client() -> AsyncIOMotorClient:
    """獲取異步 MongoDB 客戶端實例，如果不存在則創建。"""
    global _client
    if _client is None:
        try:
            logger.info("嘗試創建新的 MongoDB 客戶端實例...")
            conn_url = settings.db.url
            # 安全地記錄連接資訊，隱藏密碼
            import re
            safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', conn_url)
            logger.info(f"準備使用資料庫連接: {safe_url}")

            # 解析 URL 以提取 authSource
            parsed_url = urlparse(conn_url)
            query_params = parse_qs(parsed_url.query)
            auth_source = query_params.get('authSource', [None])[0]
            logger.info(f"從 URL 提取的 authSource: {auth_source}")

            # 準備客戶端參數
            client_kwargs = {
                "serverSelectionTimeoutMS": settings.db.server_selection_timeout_ms,
                "connectTimeoutMS": settings.db.connect_timeout_ms,
                "socketTimeoutMS": settings.db.socket_timeout_ms,
                "maxPoolSize": settings.db.max_pool_size,
                "retryWrites": True,  # 根據需要可以從 settings 獲取
            }

            # 如果從 URL 中提取到 authSource，則明確傳遞給客戶端
            if auth_source:
                client_kwargs["authSource"] = auth_source
                logger.info(f"明確設置 authSource 參數為: {auth_source}")

            _client = AsyncIOMotorClient(conn_url, **client_kwargs)
            # --- 新增日誌 ---
            logger.info(f"AsyncIOMotorClient object created: {_client}")
            # --- 結束新增 ---

            # 測試連接 (驗證現在應該使用正確的 authSource)
            await _client.admin.command('ping')
            logger.info("成功連接到 MongoDB 並創建客戶端實例！")
        except OperationFailure as e:
            logger.error(f"創建 MongoDB 客戶端時驗證失敗: {e.details}")
            _client = None  # 確保失敗時 client 為 None
            raise
        except Exception as e:
            logger.error(f"創建 MongoDB 客戶端時發生未知錯誤: {e}")
            _client = None  # 確保失敗時 client 為 None
            raise
    return _client


async def get_database() -> AsyncIOMotorDatabase:
    """
    獲取數據庫實例，確保客戶端已初始化

    Returns:
        AsyncIOMotorDatabase: MongoDB 數據庫實例
    """
    global _db

    try:
        # 獲取客戶端
        client = await get_client()

        # 如果數據庫未初始化，初始化它
        if _db is None:
            # 使用 settings 中的 db_name
            db_name = settings.db.db_name
            _db = client[db_name]
            logger.debug(f"獲取 MongoDB 數據庫: {db_name}")

        return _db
    except Exception as e:
        logger.error(f"獲取數據庫實例時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        raise


async def get_collection(collection_name: str) -> AsyncIOMotorCollection:
    """
    獲取集合實例，確保數據庫已初始化

    Args:
        collection_name: 集合名稱

    Returns:
        AsyncIOMotorCollection: MongoDB 集合實例
    """
    global _collections

    try:
        # 如果集合已緩存，直接返回
        if collection_name in _collections:
            return _collections[collection_name]

        # 獲取數據庫
        db = await get_database()

        # 獲取集合
        collection = db[collection_name]

        # 緩存集合
        _collections[collection_name] = collection
        logger.debug(f"獲取 MongoDB 集合: {collection_name}")

        return collection
    except Exception as e:
        logger.error(f"獲取集合 {collection_name} 時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        raise


# 獲取常用集合的函數
async def get_users_collection() -> AsyncIOMotorCollection:
    """獲取用戶集合"""
    return await get_collection(COLLECTION_USERS)


async def get_trades_collection() -> AsyncIOMotorCollection:
    """獲取交易集合"""
    return await get_collection(COLLECTION_TRADES)


async def get_assets_collection() -> AsyncIOMotorCollection:
    """獲取資產集合"""
    return await get_collection(COLLECTION_ASSETS)


async def get_api_keys_collection() -> AsyncIOMotorCollection:
    """獲取API密鑰集合"""
    return await get_collection(COLLECTION_API_KEYS)


async def get_user_settings_collection() -> AsyncIOMotorCollection:
    """獲取用戶設置集合"""
    return await get_collection(COLLECTION_USER_SETTINGS)


async def get_pair_trades_collection() -> AsyncIOMotorCollection:
    """獲取配對交易集合"""
    return await get_collection(COLLECTION_PAIR_TRADES)


# 數據庫操作函數
async def ping_database() -> bool:
    """測試數據庫連接"""
    client = await get_client()
    if client is None:
        logger.error("無法獲取數據庫客戶端以進行 ping 測試")
        return False
    try:
        # 獲取數據庫對象
        db = await get_database()  # 這會使用 client[settings.db.db_name]
        # --- 新增日誌 ---
        logger.info(f"ping_database: Attempting db.command('dbstats') on database '{db.name}' using client {client}")
        # --- 結束新增 ---
        # 在目標數據庫上執行命令
        await db.command('dbstats')
        # logger.info("成功執行 dbstats 命令")
        return True
    except OperationFailure as e:
        if e.code == 18:  # AuthenticationFailed
            logger.error(f"數據庫驗證失敗: {e.details.get('errmsg', e)}, full error: {e.details}")
        else:
            logger.error(f"數據庫操作失敗: {e.details.get('errmsg', e)}, full error: {e.details}")
        logger.error(traceback.format_exc())
        return False
    except Exception as e:
        logger.error(f"測試數據庫連接時發生未知錯誤: {e}")
        logger.error(traceback.format_exc())
        return False


async def get_all_user_settings() -> List[Dict[str, Any]]:
    """
    獲取所有用戶設置 (此處省略解密邏輯以保持簡潔)
    """
    try:
        logger.info(f"獲取所有用戶設定")
        collection = await get_user_settings_collection()
        settings_list = await collection.find({}).to_list(length=None)  # 获取所有
        # 處理 _id
        for s in settings_list:
            if "_id" in s:
                s["id"] = str(s.pop("_id"))
            # ... (省略解密) ...
        logger.info(f"成功獲取 {len(settings_list)} 個用戶設定")
        return settings_list
    except Exception as e:
        logger.error(f"獲取所有用戶設置時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        return []


async def get_pair_trades(user_id: str, status: str = "active") -> List[Dict[str, Any]]:
    """
    獲取用戶的配對交易 (簡化錯誤處理)
    """
    try:
        logger.info(f"獲取配對交易 (用戶: {user_id}, 狀態: {status})")
        collection = await get_pair_trades_collection()
        query = {"user_id": user_id}
        if status:
            query["status"] = status

        trades = await collection.find(query).to_list(length=None)  # 获取所有
        for t in trades:
            if "_id" in t:
                t["id"] = str(t.pop("_id"))
        logger.info(f"找到 {len(trades)} 個配對交易 (用戶: {user_id}, 狀態: {status})")
        return trades
    except Exception as e:
        logger.error(f"獲取配對交易時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        return []


async def close_connections():
    """關閉所有數據庫連接"""
    global _client, _db, _collections, _client_loop_id

    if _client:
        try:
            logger.info("關閉 MongoDB 連接")
            _client.close()  # Motor 3.x 使用 close() 而不是 await _client.close()
        except Exception as e:
            logger.error(f"關閉 MongoDB 連接時發生錯誤: {e}")
            logger.error(traceback.format_exc())
        finally:
            _client = None
            _db = None
            _collections = {}
            _client_loop_id = None


async def create_collection(db: AsyncIOMotorDatabase, collection_name: str):
    """創建集合"""
    try:
        collections = await db.list_collection_names()
        if collection_name not in collections:
            await db.create_collection(collection_name)
            logger.info(f"創建集合: {collection_name}")
        else:
            logger.info(f"集合已存在: {collection_name}")
    except Exception as e:
        logger.error(f"創建集合 {collection_name} 時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        raise


async def init_db():
    """初始化數據庫 (移除索引創建，因為初始化腳本會做)"""
    try:
        db = await get_database()
        await create_collection(db, COLLECTION_USERS)
        await create_collection(db, COLLECTION_TRADES)
        await create_collection(db, COLLECTION_ASSETS)
        await create_collection(db, COLLECTION_API_KEYS)
        await create_collection(db, COLLECTION_USER_SETTINGS)
        await create_collection(db, COLLECTION_PAIR_TRADES)
        # # 創建索引應由初始化腳本完成
        # user_settings_collection = await get_collection(COLLECTION_USER_SETTINGS)
        # await user_settings_collection.create_index("user_id", unique=True)
        logger.info("數據庫集合檢查/創建完成 (索引由初始化腳本處理)")
    except Exception as e:
        logger.error(f"初始化數據庫時發生錯誤: {e}")
        logger.error(traceback.format_exc())
        raise
