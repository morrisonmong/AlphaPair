import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from ..database.mongodb import get_database, get_collection
from app.models.user import PasswordUpdate
from app.utils.auth import get_password_hash, verify_password

logger = logging.getLogger(__name__)


class UserService:
    """用戶服務，用於處理用戶相關操作"""

    def __init__(self):
        self.db = None
        self.collection = None
        self._initialized = False
        self.collection_name = "users"

    async def _ensure_initialized(self):
        """確保服務已初始化"""
        if not self._initialized:
            self.db = await get_database()
            self.collection = await get_collection(self.collection_name)
            self._initialized = True

    async def get_all_users(self) -> List[Dict[str, Any]]:
        """
        獲取所有用戶

        Returns:
            List[Dict[str, Any]]: 用戶列表
        """
        await self._ensure_initialized()
        try:
            cursor = self.collection.find({})
            users = []
            async for doc in cursor:
                users.append(doc)
            return users
        except Exception as e:
            logger.error(f"獲取用戶列表時發生錯誤: {e}")
            return []

    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        根據ID獲取用戶

        Args:
            user_id: 用戶ID

        Returns:
            Optional[Dict[str, Any]]: 用戶信息，如果不存在則返回None
        """
        await self._ensure_initialized()
        try:
            return await self.collection.find_one({"_id": user_id})
        except Exception as e:
            logger.error(f"獲取用戶 {user_id} 時發生錯誤: {e}")
            return None

    async def create_user(self, user_data: Dict[str, Any]) -> Optional[str]:
        """
        創建新用戶

        Args:
            user_data: 用戶數據

        Returns:
            Optional[str]: 創建的用戶ID，如果失敗則返回None
        """
        await self._ensure_initialized()
        try:
            user_data["created_at"] = datetime.now()
            result = await self.collection.insert_one(user_data)
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"創建用戶時發生錯誤: {e}")
            return None

    async def update_user(self, user_id: str, user_data: Dict[str, Any]) -> bool:
        """
        更新用戶信息

        Args:
            user_id: 用戶ID
            user_data: 要更新的用戶數據

        Returns:
            bool: 是否更新成功
        """
        await self._ensure_initialized()
        try:
            user_data["updated_at"] = datetime.now()
            result = await self.collection.update_one(
                {"_id": user_id},
                {"$set": user_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"更新用戶 {user_id} 時發生錯誤: {e}")
            return False

    async def delete_user(self, user_id: str) -> bool:
        """
        刪除用戶

        Args:
            user_id: 用戶ID

        Returns:
            bool: 是否刪除成功
        """
        await self._ensure_initialized()
        try:
            result = await self.collection.delete_one({"_id": user_id})
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"刪除用戶 {user_id} 時發生錯誤: {e}")
            return False

    async def update_password(self, user_id: str, password_update: PasswordUpdate) -> bool:
        """
        更新用戶密碼

        Args:
            user_id: 用戶ID
            password_update: 密碼更新數據

        Returns:
            bool: 是否更新成功
        """
        await self._ensure_initialized()
        try:
            user = await self.collection.find_one({"_id": user_id})
            if not user:
                raise ValueError("找不到用戶")

            # 驗證當前密碼
            if not verify_password(password_update.current_password, user["hashed_password"]):
                raise ValueError("當前密碼不正確")

            # 驗證新密碼
            if password_update.new_password != password_update.confirm_password:
                raise ValueError("新密碼與確認密碼不符")

            # 更新密碼
            hashed_password = get_password_hash(password_update.new_password)
            result = await self.collection.update_one(
                {"_id": user_id},
                {"$set": {"hashed_password": hashed_password, "updated_at": datetime.now()}}
            )
            return result.modified_count > 0
        except ValueError as e:
            logger.warning(f"更新用戶 {user_id} 密碼失敗: {e}")
            raise e
        except Exception as e:
            logger.error(f"更新用戶 {user_id} 密碼時發生未知錯誤: {e}")
            raise e


# 創建服務實例
user_service = UserService()
