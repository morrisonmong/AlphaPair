# -*- coding: utf-8 -*-
import argparse
import asyncio
import logging
import uvicorn
import signal
import sys
import os
import time  # 已使用
import traceback
from app.services.monitor_service import MonitorService
from app.config import settings
# from app.utils.event_loop import event_loop_manager # 清理
from app.database.mongodb import ping_database, close_connections
# from typing import Optional # 未使用

# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log")
    ]
)

logger = logging.getLogger(__name__)

# --- 新增：在啟動時記錄資料庫連接狀態（不暴露敏感資訊） ---
try:
    db_url = settings.db.url
    # 安全地記錄資料庫連接資訊，隱藏密碼
    if db_url:
        # 解析 URL 並隱藏密碼
        import re
        safe_url = re.sub(r'://([^:]+):([^@]+)@', r'://\1:****@', db_url)
        logger.info(f"run.py: 資料庫連接配置已載入: {safe_url}")
    else:
        logger.warning("run.py: 未找到資料庫連接配置")
except Exception as e:
    logger.error(f"run.py: 無法存取資料庫配置: {e}")
# --- 結束新增 ---

# 移除全局 shutdown_event 和 shutdown_requested
# shutdown_event = asyncio.Event()
# shutdown_requested = False

# 將信號處理移至 run_monitor 內部
# def handle_shutdown_signal(sig, frame):
#     """處理關閉信號"""
#     logger.info(f"收到信號 {sig}，準備關閉監控服務...")
#     global shutdown_requested
#     shutdown_requested = True

# signal.signal(signal.SIGINT, handle_shutdown_signal)
# signal.signal(signal.SIGTERM, handle_shutdown_signal)


async def run_monitor():
    """運行監控服務"""
    logger.info("正在啟動監控服務...")

    loop = asyncio.get_running_loop()
    logger.info(f"監控服務使用事件循環: {id(loop)}")

    shutdown_event = asyncio.Event()

    # 在 run_monitor 內部定義信號處理函數，捕獲 loop 和 shutdown_event
    def handle_shutdown_signal(sig, frame):
        logger.info(f"收到信號 {sig}, 準備優雅關閉...")
        loop.call_soon_threadsafe(shutdown_event.set)

    # 註冊內部信號處理程序
    signal.signal(signal.SIGINT, handle_shutdown_signal)
    signal.signal(signal.SIGTERM, handle_shutdown_signal)

    # 測試數據庫連接
    if await ping_database():
        logger.info("數據庫連接成功")
    else:
        logger.error("數據庫連接失敗")
        return

    # 創建監控服務
    monitor_service = MonitorService(
        update_interval=settings.monitor.update_interval,  # 使用 settings 中的值
        error_retry_interval=settings.monitor.error_retry_interval,  # 使用 settings 中的值
        shutdown_event=shutdown_event
    )

    # 移除舊的關閉處理程序註冊
    # event_loop_manager.add_shutdown_handler(close_connections)

    try:
        logger.info("啟動監控服務")
        await monitor_service.start()

        # 等待關閉事件被設置
        logger.info("監控服務已啟動，等待關閉信號 (SIGINT/SIGTERM)")
        await shutdown_event.wait()

        logger.info("收到關閉事件，開始停止程序...")

    except Exception as e:
        logger.error(f"監控服務運行時發生錯誤: {e}")
        logger.error(traceback.format_exc())
    finally:
        # 關閉監控服務
        logger.info("關閉監控服務")
        await monitor_service.stop()

        # 關閉數據庫連接
        await close_connections()
        logger.info("監控服務已關閉")


# 將 main 改為 async def
async def main():
    """主函數"""
    try:
        parser = argparse.ArgumentParser(description="AlphaPair 後端服務")
        parser.add_argument(
            "--mode",
            type=str,
            choices=["api", "monitor"],
            default="api",
            help="運行模式: api (API服務) 或 monitor (監控服務)"
        )
        args = parser.parse_args()

        # 設置環境變數
        os.environ["IS_DOCKER"] = str(settings.is_docker).lower()
        logger.info(f"環境: {settings.environment}, Docker: {settings.is_docker}")

        # 嘗試使用 uvloop
        try:
            import uvloop
            asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
            logger.info("成功設置 uvloop 事件循環策略")
        except ImportError:
            logger.warning("未找到 uvloop，使用默認事件循環策略")
            asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())

        # --- 新增：等待數據庫就緒 ---
        max_wait_time = 60  # 最長等待60秒
        wait_interval = 3   # 每3秒檢查一次
        start_wait_time = time.time()
        db_ready = False
        logger.info("正在等待數據庫連接就緒...")
        while time.time() - start_wait_time < max_wait_time:
            try:
                # 直接 await ping_database
                db_ready = await ping_database()
                if db_ready:
                    logger.info("數據庫連接已就緒！")
                    break
                else:
                    logger.info(f"數據庫尚未就緒，將在 {wait_interval} 秒後重試...")
            except Exception as db_err:
                logger.warning(f"等待數據庫時發生錯誤: {db_err}，將在 {wait_interval} 秒後重試...")

            await asyncio.sleep(wait_interval)  # 直接 await

        if not db_ready:
            logger.error("等待數據庫超時，服務將退出。")
            sys.exit(1)  # 超時則退出
        # --- 等待結束 ---

        # 主事件循環由 asyncio.run() 管理，無需手動創建/設置

        if args.mode == "api":
            logger.info("正在啟動API服務...")
            logger.info("使用 app/main.py 中定義的 FastAPI 應用")

            # 配置 Uvicorn (注意 loop="asyncio" 或 "uvloop" 取決於是否成功導入)
            uvicorn_config = uvicorn.Config(
                "app.main:app",
                host="0.0.0.0",
                port=8000,
                reload=settings.api.debug,
                loop="uvloop" if "uvloop" in sys.modules else "asyncio",
                log_level="info"
            )
            server = uvicorn.Server(uvicorn_config)
            await server.serve()

        elif args.mode == "monitor":
            logger.info("正在啟動監控服務...")
            try:
                await run_monitor()  # 直接 await 運行監控服務
            except KeyboardInterrupt:
                logger.info("收到鍵盤中斷，正在關閉服務...")
            except Exception as e:
                logger.error(f"運行監控服務時發生錯誤: {e}")
                logger.error(traceback.format_exc())
            # finally 塊由 run_monitor 內部處理數據庫關閉
            # asyncio.run 會處理事件循環的關閉

    except Exception as e:
        logger.error(f"主程序發生錯誤: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    # 使用 asyncio.run 啟動異步 main 函數
    asyncio.run(main())
