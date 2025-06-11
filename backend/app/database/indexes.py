import logging
from pymongo import IndexModel, ASCENDING, DESCENDING

from app.database.mongodb import get_database

logger = logging.getLogger(__name__)


async def create_indexes():
    """
    創建所有集合的索引
    """
    db = await get_database()

    # 為 pair_trades 集合創建索引
    pair_trades_indexes = [
        IndexModel([("user_id", ASCENDING)], background=True),
        IndexModel([("status", ASCENDING)], background=True),
        IndexModel([("user_id", ASCENDING), ("status", ASCENDING)],
                   background=True),
        IndexModel([("created_at", DESCENDING)], background=True),
        IndexModel([("closed_at", DESCENDING)], background=True),
        IndexModel([("updated_at", DESCENDING)], background=True),
        IndexModel([("total_pnl", DESCENDING)], background=True),
        IndexModel([("user_id", ASCENDING),
                   ("created_at", DESCENDING)], background=True),
        IndexModel([("user_id", ASCENDING),
                   ("closed_at", DESCENDING)], background=True),
    ]

    # 為 trade_history 集合創建索引
    trade_history_indexes = [
        IndexModel([("user_id", ASCENDING)], background=True),
        IndexModel([("trade_id", ASCENDING)], background=True),
        IndexModel([("created_at", DESCENDING)], background=True),
        IndexModel([("closed_at", DESCENDING)], background=True),
        IndexModel([("total_pnl", DESCENDING)], background=True),
        IndexModel([("user_id", ASCENDING),
                   ("created_at", DESCENDING)], background=True),
        IndexModel([("user_id", ASCENDING),
                   ("closed_at", DESCENDING)], background=True),
        IndexModel([("user_id", ASCENDING),
                   ("total_pnl", DESCENDING)], background=True),
    ]

    # 創建索引
    try:
        pair_trades_collection = db["pair_trades"]
        result = await pair_trades_collection.create_indexes(pair_trades_indexes)
        logger.info(f"為 pair_trades 集合創建了 {len(result)} 個索引")
    except Exception as e:
        logger.error(f"為 pair_trades 集合創建索引時發生錯誤: {e}")

    try:
        trade_history_collection = db["trade_history"]
        result = await trade_history_collection.create_indexes(trade_history_indexes)
        logger.info(f"為 trade_history 集合創建了 {len(result)} 個索引")
    except Exception as e:
        logger.error(f"為 trade_history 集合創建索引時發生錯誤: {e}")
