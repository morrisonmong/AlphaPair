from app.database.mongodb import get_user_settings_collection
from app.models.user_settings import UserSettings, UserSettingsUpdate
from app.utils.crypto import encrypt_sensitive_data, decrypt_sensitive_data
from app.utils.event_loop import event_loop_manager
from app.utils.time_utils import get_utc_plus_8_now
import logging
import traceback
from typing import Dict, Any

logger = logging.getLogger(__name__)


class UserSettingsService:
    """用戶設定服務"""

    # 需要加密的敏感字段列表（包含嵌套欄位）
    SENSITIVE_FIELDS = [
        "binance_api_key",
        "binance_api_secret",
        "line_token",
        "discord_webhook",
        "telegram_token",
        "telegram_chat_id"
    ]

    def _safe_log_data(self, data: Any, description: str = "") -> Dict[str, Any]:
        """
        安全地記錄資料，過濾敏感欄位

        Args:
            data: 要記錄的資料
            description: 資料描述

        Returns:
            過濾後的安全資料
        """
        if data is None:
            return None

        # 如果是 UserSettings 或 UserSettingsUpdate 對象，轉換為字典
        if hasattr(data, 'dict'):
            data_dict = data.dict()
        elif isinstance(data, dict):
            data_dict = data.copy()
        else:
            # 對於其他類型，直接返回
            return data

        # 遞歸過濾敏感欄位
        return self._filter_sensitive_recursive(data_dict)

    def _filter_sensitive_recursive(self, data: Any) -> Any:
        """
        遞歸過濾敏感資料

        Args:
            data: 要過濾的資料

        Returns:
            過濾後的安全資料
        """
        if data is None:
            return None

        if isinstance(data, dict):
            safe_data = {}
            for key, value in data.items():
                if key in self.SENSITIVE_FIELDS:
                    if value:
                        safe_data[key] = f"****(長度:{len(str(value))})"
                    else:
                        safe_data[key] = None
                elif isinstance(value, (dict, list)):
                    # 遞歸處理嵌套的字典和列表
                    safe_data[key] = self._filter_sensitive_recursive(value)
                else:
                    safe_data[key] = value
            return safe_data

        elif isinstance(data, list):
            # 處理列表中的每個元素
            return [self._filter_sensitive_recursive(item) for item in data]

        else:
            # 對於其他類型，直接返回
            return data

    def _encrypt_sensitive_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        加密字典中的敏感字段

        Args:
            data: 包含敏感字段的字典

        Returns:
            加密後的字典
        """
        encrypted_data = data.copy()

        for field in self.SENSITIVE_FIELDS:
            if field in encrypted_data and encrypted_data[field]:
                try:
                    # 安全地記錄加密前的長度
                    logger.info(f"準備加密字段: {field}, 原始長度: {len(encrypted_data[field])}")

                    # 確保金鑰是純文本，移除可能的空白字符和引號
                    encrypted_data[field] = encrypted_data[field].strip().strip('"\'')

                    # 加密數據
                    encrypted_data[field] = encrypt_sensitive_data(encrypted_data[field])
                    logger.info(f"已加密字段: {field}, 加密後長度: {len(encrypted_data[field])}")
                except Exception as e:
                    logger.error(f"加密字段 {field} 時發生錯誤: {e}")
                    # 如果加密失敗，設為 None 以避免存儲未加密的敏感數據
                    encrypted_data[field] = None

        return encrypted_data

    def _decrypt_sensitive_fields(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        解密字典中的敏感字段

        Args:
            data: 包含加密敏感字段的字典

        Returns:
            解密後的字典
        """
        decrypted_data = data.copy()

        for field in self.SENSITIVE_FIELDS:
            if field in decrypted_data and decrypted_data[field]:
                try:
                    decrypted_data[field] = decrypt_sensitive_data(decrypted_data[field])
                    logger.debug(f"已解密字段: {field}")
                except Exception as e:
                    logger.error(f"解密字段 {field} 時發生錯誤: {e}")
                    decrypted_data[field] = None

        return decrypted_data

    async def get_user_settings(self, user_id: str) -> UserSettings:
        """
        獲取用戶設定

        Args:
            user_id: 用戶ID

        Returns:
            用戶設定對象
        """
        try:
            logger.debug(f"開始獲取用戶設定: user_id={user_id}")
            collection = await get_user_settings_collection()
            settings_dict = await collection.find_one({"user_id": user_id})

            if not settings_dict:
                # 如果沒有找到設定，創建一個新的
                logger.info(f"未找到用戶設定，創建新設定: user_id={user_id}")
                settings = UserSettings(user_id=user_id)
                await self.create_user_settings(settings)
                return settings

            # 解密所有敏感字段
            settings_dict = self._decrypt_sensitive_fields(settings_dict)

            logger.debug(f"成功獲取用戶設定: user_id={user_id}")
            return UserSettings(**settings_dict)
        except Exception as e:
            logger.error(f"獲取用戶設定時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            raise

    async def create_user_settings(self, settings: UserSettings) -> UserSettings:
        """
        創建用戶設定

        Args:
            settings: 用戶設定對象

        Returns:
            創建的用戶設定對象
        """
        collection = await get_user_settings_collection()

        # 安全地記錄創建操作
        safe_settings = self._safe_log_data(settings, "創建用戶設定")
        logger.info(f"創建用戶設定: {safe_settings}")

        # 轉換為字典並加密敏感字段
        settings_dict = settings.dict()
        encrypted_dict = self._encrypt_sensitive_fields(settings_dict)

        await collection.insert_one(encrypted_dict)
        return settings

    async def update_user_settings(self, user_id: str, settings_update: UserSettingsUpdate) -> UserSettings:
        """
        更新用戶設定

        Args:
            user_id: 用戶ID
            settings_update: 用戶設定更新對象

        Returns:
            更新後的用戶設定對象
        """
        collection = await get_user_settings_collection()

        # 安全地記錄更新操作
        safe_update = self._safe_log_data(settings_update, "更新用戶設定")
        logger.info(f"更新用戶設定: user_id={user_id}, 更新內容: {safe_update}")

        # 準備更新數據
        update_data = settings_update.dict(exclude_unset=True)

        # 處理 notification_settings 的部分更新
        update_operations = {}

        # 處理非 notification_settings 的欄位
        for key, value in update_data.items():
            if key != "notification_settings":
                # 加密敏感字段
                if key in self.SENSITIVE_FIELDS:
                    encrypted_value = encrypt_sensitive_data(value) if value else value
                    update_operations[f"$set.{key}"] = encrypted_value
                else:
                    update_operations[f"$set.{key}"] = value

        # 處理 notification_settings 的部分更新
        if "notification_settings" in update_data and update_data["notification_settings"]:
            notification_updates = update_data["notification_settings"]
            for key, value in notification_updates.items():
                field_path = f"notification_settings.{key}"
                # 檢查是否為敏感字段
                if field_path in self.SENSITIVE_FIELDS:
                    encrypted_value = encrypt_sensitive_data(value) if value else value
                    update_operations[f"$set.notification_settings.{key}"] = encrypted_value
                else:
                    update_operations[f"$set.notification_settings.{key}"] = value

        # 添加更新時間
        update_operations["$set.updated_at"] = get_utc_plus_8_now()

        # 構建 MongoDB 更新操作
        mongo_update = {"$set": {}}
        for key, value in update_operations.items():
            if key.startswith("$set."):
                field_name = key[5:]  # 移除 "$set." 前綴
                mongo_update["$set"][field_name] = value

        # 執行更新
        if mongo_update["$set"]:
            # 安全地記錄更新的欄位名稱
            update_fields = [field for field in mongo_update["$set"].keys() if field != "updated_at"]
            logger.info(f"執行更新欄位: {update_fields}")

            result = await collection.update_one(
                {"user_id": user_id},
                mongo_update
            )
            logger.info(f"更新結果: matched={result.matched_count}, modified={result.modified_count}")

        # 返回更新後的設定
        updated_settings = await self.get_user_settings(user_id)

        # 安全地記錄更新後的設定
        safe_updated = self._safe_log_data(updated_settings, "更新後的設定")
        logger.info(f"用戶設定更新完成: user_id={user_id}, 設定概要: {safe_updated}")

        return updated_settings

    async def delete_user_settings(self, user_id: str) -> bool:
        """
        刪除用戶設定

        Args:
            user_id: 用戶ID

        Returns:
            是否成功刪除
        """
        collection = await get_user_settings_collection()
        result = await collection.delete_one({"user_id": user_id})
        return result.deleted_count > 0

    async def get_all_user_settings(self):
        """
        獲取所有用戶的設定

        Returns:
            所有用戶的設定列表
        """
        try:
            # 確保使用正確的事件循環
            loop = event_loop_manager.get_loop()
            logger.info(f"獲取所有用戶設定 (事件循環ID: {id(loop)})")

            # 確保使用正確的事件循環獲取集合
            collection = await get_user_settings_collection()
            settings_list = []

            try:
                # 使用同步方式獲取所有文檔，避免事件循環問題
                # 注意：這是一個潛在的阻塞操作，但在這種情況下是必要的
                # 因為 Motor 的異步操作會導致事件循環不匹配問題

                # 獲取 PyMongo 集合（同步版本）
                sync_collection = collection.delegate

                # 使用同步方式獲取所有文檔
                settings_dicts = list(sync_collection.find({}))

                logger.info(f"找到 {len(settings_dicts)} 個用戶設定")

                for settings_dict in settings_dicts:
                    try:
                        # 將 ObjectId 轉換為字符串
                        if '_id' in settings_dict:
                            settings_dict['_id'] = str(settings_dict['_id'])

                        # 解密所有敏感字段
                        decrypted_dict = self._decrypt_sensitive_fields(settings_dict)

                        # 創建 UserSettings 對象並添加到列表
                        settings = UserSettings(**decrypted_dict)
                        settings_list.append(settings)
                    except Exception as e:
                        logger.error(f"處理用戶設定時發生錯誤 (user_id={settings_dict.get('user_id')}): {e}")
                        logger.error(traceback.format_exc())
                        # 繼續處理下一個用戶，不中斷整個流程

                logger.info(f"成功處理 {len(settings_list)} 個用戶設定")
                return settings_list
            except Exception as e:
                logger.error(f"獲取用戶設定列表時發生錯誤: {e}")
                logger.error(traceback.format_exc())
                raise
        except Exception as e:
            logger.error(f"獲取所有用戶設定時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            # 返回空列表而不是拋出異常，以避免中斷調用方的流程
            return []


# 創建服務實例
user_settings_service = UserSettingsService()
