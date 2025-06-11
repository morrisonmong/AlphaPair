# 初始化 database 包
# 從 mongodb.py 導入所需函數
from .mongodb import (
    get_database,
    get_client,
    ping_database,
    get_users_collection,
    get_trades_collection,
    get_assets_collection,
    get_api_keys_collection,
    get_user_settings_collection,
    get_pair_trades_collection,
    get_all_user_settings,
    get_pair_trades,
    close_connections,
    # 暫時註釋掉所有新增的數據庫操作函數
    # clear_collection,
    # find_one,
    # find_many,
    # insert_one,
    # update_one,
    # delete_one,
    # 集合名稱常量
    COLLECTION_USERS,
    COLLECTION_TRADES,
    COLLECTION_ASSETS,
    COLLECTION_API_KEYS,
    COLLECTION_USER_SETTINGS,
    COLLECTION_PAIR_TRADES,
    COLLECTION_TRADE_HISTORY
)

# 導出所有函數，使其可以從 app.database 直接導入
__all__ = [
    'get_database',
    'get_client',
    'ping_database',
    'get_users_collection',
    'get_trades_collection',
    'get_assets_collection',
    'get_api_keys_collection',
    'get_user_settings_collection',
    'get_pair_trades_collection',
    'get_all_user_settings',
    'get_pair_trades',
    'close_connections',
    # 暫時註釋掉所有新增的數據庫操作函數
    # 'clear_collection',
    # 'find_one',
    # 'find_many',
    # 'insert_one',
    # 'update_one',
    # 'delete_one',
    # 集合名稱常量
    'COLLECTION_USERS',
    'COLLECTION_TRADES',
    'COLLECTION_ASSETS',
    'COLLECTION_API_KEYS',
    'COLLECTION_USER_SETTINGS',
    'COLLECTION_PAIR_TRADES',
    'COLLECTION_TRADE_HISTORY'
]
