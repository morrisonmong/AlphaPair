import asyncio
import logging
import os
import sys
import traceback
from typing import Optional

# 嘗試導入 uvloop
try:
    import uvloop
    HAS_UVLOOP = True
except ImportError:
    HAS_UVLOOP = False

# 設置日誌
logger = logging.getLogger(__name__)


class EventLoopManager:
    """
    事件循環管理器，確保在整個應用程序中使用一致的事件循環
    """

    def __init__(self):
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._loop_id: Optional[int] = None
        self._is_uvloop: bool = False
        self._initialized: bool = False
        self._main_task = None
        self._shutdown_handlers = []

    def setup(self):
        """
        設置事件循環策略和初始循環
        """
        if self._initialized:
            logger.debug("事件循環管理器已初始化")
            return

        try:
            # 在 Windows 上使用 asyncio 的默認事件循環
            # 在 Unix 系統上使用 uvloop（如果可用）
            if sys.platform != 'win32' and HAS_UVLOOP:
                logger.info("設置 uvloop 事件循環策略")
                uvloop.install()
                self._is_uvloop = True
            else:
                if sys.platform == 'win32':
                    logger.info("在 Windows 上使用默認事件循環策略")
                else:
                    logger.warning("uvloop 不可用，使用默認事件循環策略")
                asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
                self._is_uvloop = False

            # 創建新的事件循環
            self._loop = asyncio.new_event_loop()
            self._loop_id = id(self._loop)
            asyncio.set_event_loop(self._loop)

            logger.info(f"創建新的事件循環 (ID: {self._loop_id}, uvloop: {self._is_uvloop})")
            self._initialized = True
        except Exception as e:
            logger.error(f"設置事件循環時發生錯誤: {e}")
            logger.error(traceback.format_exc())
            raise

    def get_loop(self) -> asyncio.AbstractEventLoop:
        """
        獲取當前事件循環，如果尚未初始化則初始化它

        Returns:
            asyncio.AbstractEventLoop: 當前事件循環
        """
        if not self._initialized:
            self.setup()

        # 檢查當前線程的事件循環是否與管理器的循環相同
        try:
            current_loop = asyncio.get_event_loop()
            if current_loop != self._loop:
                logger.warning(f"當前線程的事件循環 (ID: {id(current_loop)}) 與管理器的循環 (ID: {self._loop_id}) 不同")
                # 設置當前線程的事件循環為管理器的循環
                asyncio.set_event_loop(self._loop)
        except RuntimeError:
            # 如果當前線程沒有事件循環，設置為管理器的循環
            asyncio.set_event_loop(self._loop)

        return self._loop

    def run_until_complete(self, coro):
        """
        運行協程直到完成

        Args:
            coro: 要運行的協程

        Returns:
            協程的結果
        """
        loop = self.get_loop()
        return loop.run_until_complete(coro)

    def add_shutdown_handler(self, handler):
        """
        添加關閉處理程序

        Args:
            handler: 關閉處理程序函數
        """
        self._shutdown_handlers.append(handler)

    async def shutdown(self):
        """
        關閉事件循環和所有資源
        """
        logger.info("關閉事件循環和資源")

        # 執行所有關閉處理程序
        for handler in self._shutdown_handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler()
                else:
                    handler()
            except Exception as e:
                logger.error(f"執行關閉處理程序時發生錯誤: {e}")
                logger.error(traceback.format_exc())

        # 關閉事件循環
        try:
            loop = self.get_loop()

            # 取消所有任務
            tasks = [t for t in asyncio.all_tasks(loop) if t is not asyncio.current_task()]
            if tasks:
                logger.info(f"取消 {len(tasks)} 個未完成的任務")
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

            # 停止事件循環
            loop.stop()
            logger.info("事件循環已停止")
        except Exception as e:
            logger.error(f"關閉事件循環時發生錯誤: {e}")
            logger.error(traceback.format_exc())

    def run(self, main_coro):
        """
        運行主協程並處理關閉信號

        Args:
            main_coro: 主協程
        """
        loop = self.get_loop()

        # 創建主任務
        self._main_task = loop.create_task(main_coro)

        try:
            # 運行事件循環
            loop.run_forever()
        except KeyboardInterrupt:
            logger.info("接收到鍵盤中斷信號")
        finally:
            # 關閉事件循環
            loop.run_until_complete(self.shutdown())
            loop.close()
            logger.info("事件循環已關閉")


# 創建全局事件循環管理器實例
event_loop_manager = EventLoopManager()
