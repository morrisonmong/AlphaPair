"""
這個文件是為了向後兼容而保留的。
實際的應用定義在 app/main.py 中。
"""

import asyncio
import logging
import signal
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.api_v1.api import api_router
from app.config import settings
from app.database.mongodb import ping_database, close_connections
from app.utils.event_loop import event_loop_manager
from app.utils.logging_setup import setup_colored_logging

# 設置日誌
logger = setup_colored_logging(level=logging.INFO)

# 設置信號處理
shutdown_event = asyncio.Event()


def handle_shutdown_signal(sig, frame):
    """處理關閉信號"""
    logger.info(f"收到信號 {sig}，準備關閉 API 服務...")
    shutdown_event.set()


# 註冊信號處理程序
signal.signal(signal.SIGINT, handle_shutdown_signal)
signal.signal(signal.SIGTERM, handle_shutdown_signal)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI 應用程序的生命週期管理
    """
    # 啟動時執行
    logger.info("API 服務啟動中...")

    # 初始化事件循環
    loop = event_loop_manager.get_loop()
    logger.info(f"使用事件循環 (ID: {id(loop)})")

    # 測試數據庫連接
    if await ping_database():
        logger.info("數據庫連接成功")
    else:
        logger.error("數據庫連接失敗")

    # 添加關閉處理程序
    event_loop_manager.add_shutdown_handler(close_connections)

    yield

    # 關閉時執行
    logger.info("API 服務關閉中...")
    await close_connections()
    logger.info("API 服務已關閉")

# 創建 FastAPI 應用程序
app = FastAPI(
    title=settings.app_name,
    description="AlphaPair API",
    version="1.0.0",
    lifespan=lifespan,
)

# 添加 CORS 中間件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含 API 路由
app.include_router(api_router, prefix=settings.api_v1_prefix)

# 健康檢查端點


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    db_status = await ping_database()
    return {
        "status": "ok" if db_status else "error",
        "database": "connected" if db_status else "disconnected",
        "event_loop_id": id(event_loop_manager.get_loop()),
    }


def main():
    """主函數"""
    # 初始化事件循環
    event_loop_manager.setup()

    # 啟動 Uvicorn 服務器
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower(),
        loop="asyncio",  # 使用 asyncio 事件循環
    )


if __name__ == "__main__":
    main()
