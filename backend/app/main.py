from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import motor.motor_asyncio
import logging
import traceback

from app.routers import register_routers, auth, pair_trade, binance, user_settings, trade_history, equity_curve, asset_snapshot, trade_statistics
from app.database import ping_database
from app.database.indexes import create_indexes
from app.config import settings, get_settings
from app.services.scheduler_service import scheduler_service

# 設置日誌
logger = logging.getLogger(__name__)

# 確保 Motor 使用正確的事件循環策略
# 這是解決事件循環問題的關鍵
asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

# 修正 Motor 的事件循環獲取方式
# 使用函數而不是直接賦值，確保每次都獲取當前的事件循環


def get_current_loop(self):
    """
    獲取當前事件循環的實例方法，用於替換 Motor 的 get_io_loop 方法

    Args:
        self: Motor 客戶端實例，由 Motor 自動傳入

    Returns:
        asyncio.AbstractEventLoop: 當前事件循環
    """
    try:
        return asyncio.get_running_loop()
    except RuntimeError:
        # 如果沒有運行中的事件循環，創建一個新的
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        return loop


motor.motor_asyncio.AsyncIOMotorClient.get_io_loop = get_current_loop

# 創建 FastAPI 應用
app = FastAPI(
    title=settings.api.title,
    description=settings.api.description,
    version=settings.api.version,
    debug=settings.api.debug
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.api.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 註冊所有路由
register_routers(app)

# 下面這些路由已在register_routers中註冊，移除重複代碼
# app.include_router(auth.router)
# app.include_router(binance.router)
# app.include_router(user_settings.router)
# app.include_router(pair_trade.router)
# app.include_router(trade_history.router)
# app.include_router(equity_curve.router)
# app.include_router(asset_snapshot.router)
# app.include_router(trade_statistics.router)


@app.on_event("startup")
async def startup_event():
    """
    應用程序啟動時執行的事件
    """
    logger.info("應用程序正在啟動...")

    try:
        # --- 新增日誌：確認啟動時讀取的資料庫配置（安全） ---
        import re
        db_url = settings.db.url
        safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', db_url)
        logger.info(f"Startup: 資料庫連接已配置: {safe_url}")
        # --- 結束新增日誌 ---

        # 創建資料庫索引
        await create_indexes()
        logger.info("資料庫索引創建完成")

        # 啟動排程服務
        await scheduler_service.start()

        logger.info("應用程序啟動完成")
    except Exception as e:
        logger.error(f"應用程序啟動時發生錯誤: {e}")
        logger.error(traceback.format_exc())


@app.on_event("shutdown")
async def shutdown_event():
    """
    應用程序關閉時執行的事件
    """
    logger.info("應用程序正在關閉...")

    try:
        # 停止排程服務
        await scheduler_service.stop()

        # 關閉數據庫連接
        # 在此處理數據庫連接關閉邏輯，如果有需要的話

        logger.info("應用程序已關閉")
    except Exception as e:
        logger.error(f"應用程序關閉時發生錯誤: {e}")
        logger.error(traceback.format_exc())


@app.get("/")
async def root():
    """API 根路徑，返回歡迎信息"""
    return {"message": "歡迎使用 AlphaPair API"}


@app.get("/health")
async def health_check():
    """健康檢查端點，用於監控服務狀態"""
    db_status = await ping_database()
    return {
        "status": "healthy" if db_status else "unhealthy",
        "database": "connected" if db_status else "disconnected",
        "environment": settings.environment,
        "version": settings.api.version
    }


@app.get("/config")
async def get_config(settings: settings = Depends(get_settings)):
    """獲取應用程序配置（僅在調試模式下可用）"""
    if not settings.api.debug:
        return {"message": "此端點僅在調試模式下可用"}

    # 返回非敏感配置信息
    return {
        "environment": settings.environment,
        "is_docker": settings.is_docker,
        "api": {
            "title": settings.api.title,
            "description": settings.api.description,
            "version": settings.api.version,
            "debug": settings.api.debug
        },
        "database": {
            "db_name": settings.db.db_name,
            "server_selection_timeout_ms": settings.db.server_selection_timeout_ms,
            "connect_timeout_ms": settings.db.connect_timeout_ms,
            "socket_timeout_ms": settings.db.socket_timeout_ms,
            "max_pool_size": settings.db.max_pool_size,
            "max_retries": settings.db.max_retries,
            "retry_delay": settings.db.retry_delay
        }
    }
