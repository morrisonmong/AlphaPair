import logging
import traceback
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta

from app.models.asset_snapshot import AssetSnapshot
from app.database.mongodb import get_database, get_collection
from app.services.binance_service import BinanceService
from app.services.user_settings_service import user_settings_service
from app.utils.time_utils import get_utc_now, get_utc_plus_8_now, get_start_of_day

logger = logging.getLogger(__name__)


class AssetSnapshotService:
    """資產快照服務，用於定期獲取和存儲用戶資產數據"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "asset_snapshots"

        # 導入 user_service
        from app.services.user_service import user_service
        self.user_service = user_service

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def get_asset_snapshots(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        interval: str = "day"  # day, hour
    ) -> List[AssetSnapshot]:
        """
        獲取用戶的資產快照記錄

        Args:
            user_id: 用戶ID
            start_date: 開始日期
            end_date: 結束日期
            interval: 時間間隔，'day' 或 'hour'

        Returns:
            List[AssetSnapshot]: 資產快照列表
        """
        await self._ensure_initialized()

        try:
            # 構建查詢條件
            query = {"user_id": user_id}

            # 處理時間範圍查詢 - 需要同時考慮兩種快照格式
            time_query = []

            if start_date or end_date:
                # 為排程快照構建查詢條件（使用 created_at）
                scheduled_query = {}
                if start_date:
                    scheduled_query["created_at"] = {"$gte": start_date}
                if end_date:
                    if "created_at" in scheduled_query:
                        scheduled_query["created_at"]["$lte"] = end_date
                    else:
                        scheduled_query["created_at"] = {"$lte": end_date}

                # 為手動快照構建查詢條件（使用 date）
                manual_query = {}
                if start_date:
                    manual_query["date"] = {"$gte": start_date}
                if end_date:
                    if "date" in manual_query:
                        manual_query["date"]["$lte"] = end_date
                    else:
                        manual_query["date"] = {"$lte": end_date}

                # 使用 $or 查詢兩種格式
                time_query = [scheduled_query, manual_query]

            if time_query:
                query["$or"] = time_query

            logger.info(f"查詢資產快照，條件: {query}")

            # 對於日級別的查詢，需要特殊處理以避免重複
            if interval == "day":
                # 使用聚合管道來處理兩種不同的快照格式
                pipeline = [
                    {"$match": query},
                    {
                        "$addFields": {
                            # 統一時間戳欄位：優先使用 timestamp，其次 created_at
                            "unified_timestamp": {
                                "$cond": {
                                    "if": {"$and": [{"$ne": ["$timestamp", None]}, {"$ne": ["$timestamp", ""]}]},
                                    "then": "$timestamp",
                                    "else": "$created_at"
                                }
                            },
                            # 統一日期欄位：從時間戳中提取日期
                            "unified_date": {
                                "$dateToString": {
                                    "format": "%Y-%m-%d",
                                    "date": {
                                        "$cond": {
                                            "if": {"$and": [{"$ne": ["$timestamp", None]}, {"$ne": ["$timestamp", ""]}]},
                                            "then": "$timestamp",
                                            "else": "$created_at"
                                        }
                                    },
                                    "timezone": "+08:00"  # 使用 UTC+8 時區
                                }
                            }
                        }
                    },
                    {"$sort": {"unified_timestamp": 1}},  # 按統一時間戳排序
                    {
                        "$group": {
                            "_id": "$unified_date",  # 按日期分組
                            "doc": {"$last": "$$ROOT"}  # 取每天最後的快照
                        }
                    },
                    {"$replaceRoot": {"newRoot": "$doc"}},
                    {"$sort": {"unified_timestamp": 1}}  # 最終按時間排序
                ]

                cursor = self.collection.aggregate(pipeline)
                snapshots = []
                async for doc in cursor:
                    doc["id"] = str(doc.pop("_id"))
                    # 確保 timestamp 欄位存在（用於前端處理）
                    if "timestamp" not in doc or doc["timestamp"] is None or doc["timestamp"] == "":
                        if "created_at" in doc and doc["created_at"] is not None:
                            doc["timestamp"] = doc["created_at"]
                    # 移除聚合過程中添加的臨時欄位
                    doc.pop("unified_timestamp", None)
                    doc.pop("unified_date", None)

                    try:
                        snapshots.append(AssetSnapshot(**doc))
                    except Exception as e:
                        logger.warning(f"跳過無效的快照記錄: {e}, 文檔: {doc}")
                        continue

                logger.info(f"返回 {len(snapshots)} 筆日級別資產快照記錄")
                return snapshots
            else:
                # 小時級別查詢，直接查詢
                cursor = self.collection.find(query).sort([
                    ("timestamp", 1), ("created_at", 1)
                ])

                snapshots = []
                async for doc in cursor:
                    doc["id"] = str(doc.pop("_id"))
                    # 確保 timestamp 欄位存在
                    if "timestamp" not in doc or doc["timestamp"] is None:
                        if "created_at" in doc and doc["created_at"] is not None:
                            doc["timestamp"] = doc["created_at"]

                    try:
                        snapshots.append(AssetSnapshot(**doc))
                    except Exception as e:
                        logger.warning(f"跳過無效的快照記錄: {e}, 文檔: {doc}")
                        continue

                logger.info(f"返回 {len(snapshots)} 筆小時級別資產快照記錄")
                return snapshots

        except Exception as e:
            logger.error(f"獲取資產快照時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return []

    async def create_asset_snapshot(
        self,
        user_id: str,
        snapshot_data: Dict[str, Any],
        data_source: str = "scheduled"
    ) -> Optional[AssetSnapshot]:
        """
        創建資產快照

        Args:
            user_id: 用戶ID
            snapshot_data: 快照數據
            data_source: 數據來源

        Returns:
            Optional[AssetSnapshot]: 創建的資產快照
        """
        await self._ensure_initialized()

        try:
            # 獲取當前時間（UTC+8）
            now = get_utc_plus_8_now()
            today = get_start_of_day(now)

            # 創建資產快照記錄
            snapshot = AssetSnapshot(
                user_id=user_id,
                timestamp=get_utc_now(),
                date=today,
                hour=now.hour,
                data_source=data_source,
                **snapshot_data
            )

            # 保存到數據庫
            result = await self.collection.insert_one(snapshot.dict(exclude={"id"}))
            snapshot.id = str(result.inserted_id)
            logger.info(f"已創建資產快照: {snapshot.id}")

            return snapshot

        except Exception as e:
            logger.error(f"創建資產快照時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def get_user_asset_data(self, user_id: str, force_refresh: bool = False) -> Optional[Dict[str, Any]]:
        """
        獲取用戶的資產數據

        Args:
            user_id: 用戶ID
            force_refresh: 是否強制刷新價格緩存

        Returns:
            Optional[Dict[str, Any]]: 用戶資產數據，如果失敗則返回None
        """
        try:
            # 確保初始化
            await self._ensure_initialized()

            # 創建幣安服務實例
            binance_service = BinanceService(user_id=user_id)

            # 確保API客戶端已初始化
            client = await binance_service._ensure_initialized()
            if not client:
                logger.error(f"初始化幣安客戶端失敗，無法獲取用戶 {user_id} 的資產數據")
                return None

            # 使用增強的binance_service獲取用戶資產數據
            # 使用REST API而非WebSocket獲取價格，以減少資源佔用
            logger.info(f"開始獲取用戶 {user_id} 的完整資產數據")
            asset_data = await binance_service.get_user_asset_data(force_refresh=force_refresh)

            if not asset_data:
                logger.error(f"獲取用戶 {user_id} 的資產數據失敗")
                return None

            # 處理返回數據以符合資產快照格式
            formatted_data = {
                "spot_balance": asset_data.get("spot_only_balance", 0),
                "futures_balance": asset_data.get("futures_balance", 0),
                "funding_balance": asset_data.get("funding_in_spot_balance", 0),
                "total_balance": asset_data.get("total_balance", 0),
                "spot_assets": asset_data.get("spot_assets", {}),
                "futures_positions": asset_data.get("futures_positions", []),
                "funding_products": asset_data.get("funding_products", {}),
                # 保留原始數據以便調試
                "spot_only_balance": asset_data.get("spot_only_balance", 0),
                "funding_in_spot_balance": asset_data.get("funding_in_spot_balance", 0)
            }

            # 計算日變化
            # 查詢昨日的資產快照
            yesterday = get_start_of_day(
                get_utc_plus_8_now() - timedelta(days=1))
            yesterday_snapshot = await self.collection.find_one({
                "user_id": user_id,
                "date": {"$gte": yesterday, "$lt": yesterday + timedelta(days=1)}
            }, sort=[("date", 1), ("hour", 1)])

            if yesterday_snapshot:
                daily_change = formatted_data["total_balance"] - \
                    yesterday_snapshot["total_balance"]
                daily_change_percent = (
                    daily_change / yesterday_snapshot["total_balance"]) * 100 if yesterday_snapshot["total_balance"] > 0 else 0
                formatted_data["daily_change"] = daily_change
                formatted_data["daily_change_percent"] = daily_change_percent

            logger.info(f"成功獲取用戶 {user_id} 的資產數據：總資產 {formatted_data['total_balance']} USDT")
            return formatted_data

        except Exception as e:
            logger.error(f"獲取用戶 {user_id} 的資產數據時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return None

    async def create_daily_snapshot_for_all_users(self) -> int:
        """
        為所有用戶創建每日資產快照

        Returns:
            int: 成功創建的快照數量
        """
        await self._ensure_initialized()

        try:
            # 獲取所有用戶設置
            all_user_settings = await user_settings_service.get_all_user_settings()
            logger.info(f"找到 {len(all_user_settings)} 個用戶設置")

            created_count = 0
            for settings in all_user_settings:
                user_id = settings.id
                # 檢查是否已配置幣安API
                if not settings.binance_api_key or not settings.binance_api_secret:
                    logger.warning(f"用戶 {user_id} 未配置幣安API，跳過資產快照")
                    continue

                # 獲取資產數據
                asset_data = await self.get_user_asset_data(user_id)
                if not asset_data:
                    logger.warning(f"無法獲取用戶 {user_id} 的資產數據，跳過資產快照")
                    continue

                # 創建資產快照
                snapshot = await self.create_asset_snapshot(
                    user_id=user_id,
                    snapshot_data=asset_data,
                    data_source="scheduled"
                )
                if snapshot:
                    created_count += 1
                    logger.info(f"已為用戶 {user_id} 創建資產快照: {snapshot.id}")

            logger.info(f"成功為 {created_count} 個用戶創建資產快照")
            return created_count

        except Exception as e:
            logger.error(f"為所有用戶創建資產快照時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            return 0

    async def _create_daily_snapshot(self):
        """創建每日資產快照"""
        try:
            logger.info("開始創建每日資產快照")
            # 確保初始化
            await self._ensure_initialized()

            # 獲取所有用戶
            users = await self.user_service.get_all_users()
            created_count = 0

            for user in users:
                user_id = str(user["_id"])
                logger.info(f"為用戶 {user_id} 創建資產快照")

                # 獲取用戶資產數據 (force_refresh=True 強制刷新價格緩存)
                asset_data = await self.get_user_asset_data(user_id, force_refresh=True)
                if not asset_data:
                    logger.warning(f"無法獲取用戶 {user_id} 的資產數據，跳過創建快照")
                    continue

                # 使用標準的 create_asset_snapshot 方法創建快照
                snapshot = await self.create_asset_snapshot(
                    user_id=user_id,
                    snapshot_data=asset_data,
                    data_source="scheduled"
                )

                if snapshot:
                    created_count += 1
                    logger.info(f"成功為用戶 {user_id} 創建資產快照: {snapshot.id}")
                else:
                    logger.warning(f"為用戶 {user_id} 創建資產快照失敗")

            logger.info(f"每日資產快照創建完成，成功創建 {created_count} 個快照")
            return created_count > 0
        except Exception as e:
            logger.error(f"創建每日資產快照時發生錯誤: {e}")
            traceback.print_exc()
            return False


# 創建服務實例
asset_snapshot_service = AssetSnapshotService()
