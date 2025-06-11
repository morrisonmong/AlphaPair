import logging
from typing import Dict, Any, List
from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv
from app.utils.logging_setup import setup_colored_logging

# 載入環境變數
load_dotenv()

# 設置日誌
logger = setup_colored_logging(level=logging.INFO)


class DatabaseSettings(BaseSettings):
    """數據庫配置"""
    url: str = Field(
        default="mongodb://localhost:27017",
        description="MongoDB 連接 URL",
        alias="MONGODB_URL"
    )
    db_name: str = Field(
        default="alphapair",
        description="MongoDB 數據庫名稱",
        alias="MONGODB_DB"
    )
    server_selection_timeout_ms: int = Field(
        default=5000,
        description="MongoDB 服務器選擇超時（毫秒）",
        alias="MONGODB_SERVER_SELECTION_TIMEOUT_MS"
    )
    connect_timeout_ms: int = Field(
        default=5000,
        description="MongoDB 連接超時（毫秒）",
        alias="MONGODB_CONNECT_TIMEOUT_MS"
    )
    socket_timeout_ms: int = Field(
        default=10000,
        description="MongoDB 套接字超時（毫秒）",
        alias="MONGODB_SOCKET_TIMEOUT_MS"
    )
    max_pool_size: int = Field(
        default=50,
        description="MongoDB 連接池大小",
        alias="MONGODB_MAX_POOL_SIZE"
    )
    max_retries: int = Field(
        default=5,
        description="MongoDB 連接重試次數",
        alias="MONGODB_MAX_RETRIES"
    )
    retry_delay: int = Field(
        default=2,
        description="MongoDB 連接重試延遲（秒）",
        alias="MONGODB_RETRY_DELAY"
    )

    model_config = SettingsConfigDict(
        env_prefix="MONGODB_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def connection_config(self) -> Dict[str, Any]:
        """獲取 MongoDB 連接配置"""
        return {
            "serverSelectionTimeoutMS": self.server_selection_timeout_ms,
            "connectTimeoutMS": self.connect_timeout_ms,
            "socketTimeoutMS": self.socket_timeout_ms,
            "maxPoolSize": self.max_pool_size,
            "retryWrites": True,
            "w": "majority"
        }


class APISettings(BaseSettings):
    """API 配置"""
    title: str = Field(
        default="AlphaPair API",
        description="API 標題"
    )
    description: str = Field(
        default="AlphaPair 加密貨幣配對交易監控與管理平台 API",
        description="API 描述"
    )
    version: str = Field(
        default="0.1.0",
        description="API 版本"
    )
    cors_origins: List[str] = Field(
        default=["*"],
        description="CORS 允許的來源"
    )
    debug: bool = Field(
        default=False,
        description="是否啟用調試模式"
    )

    model_config = SettingsConfigDict(
        env_prefix="API_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


class MonitorSettings(BaseSettings):
    """監控服務配置"""
    update_interval: int = Field(
        default=1,
        description="監控數據更新間隔（秒）",
        alias="MONITOR_UPDATE_INTERVAL"
    )
    error_retry_interval: int = Field(
        default=10,
        description="監控任務錯誤重試間隔（秒）",
        alias="MONITOR_ERROR_RETRY_INTERVAL"
    )

    # 資產快照排程配置
    asset_snapshot_hours: str = Field(
        default="0,8,16",
        description="資產快照執行時間（小時，UTC 時間，用逗號分隔）",
        alias="ASSET_SNAPSHOT_HOURS"
    )
    asset_snapshot_minute: int = Field(
        default=0,
        description="資產快照執行分鐘",
        alias="ASSET_SNAPSHOT_MINUTE"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True  # 允許使用 alias 名稱
    )


class Settings(BaseSettings):
    """應用程序配置"""
    # 環境
    environment: str = Field(
        default="development",
        description="運行環境"
    )
    is_docker: bool = Field(
        default=False,
        description="是否在 Docker 中運行"
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True  # 允許使用 alias 名稱
    )

    # 使用計算屬性來獲取數據庫和API設置

    @computed_field
    @property
    def db(self) -> DatabaseSettings:
        return DatabaseSettings()

    @computed_field
    @property
    def api(self) -> APISettings:
        return APISettings()

    @computed_field
    @property
    def monitor(self) -> MonitorSettings:
        return MonitorSettings()


# 創建全局配置實例
settings = Settings()


def get_settings() -> Settings:
    """獲取應用程序配置"""
    return settings


# settings = get_settings() # 確保 get_settings 被調用以加載配置
