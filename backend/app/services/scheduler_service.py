import asyncio
import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, Any, Callable, Coroutine

from app.services.asset_snapshot_service import AssetSnapshotService
from app.utils.time_utils import get_utc_now
from app.config import settings

logger = logging.getLogger(__name__)


class SchedulerService:
    """排程服務，用於管理定時任務"""

    def __init__(self):
        self.tasks = {}  # 任務字典，key 為任務名稱，value 為任務對象
        self.running = False
        self.shutdown_event = None

    async def start(self):
        """啟動排程服務"""
        if self.running:
            logger.warning("排程服務已在運行中")
            return

        self.running = True
        self.shutdown_event = asyncio.Event()
        logger.info("排程服務已啟動")

        # 註冊定時任務
        self.register_tasks()

    async def stop(self):
        """停止排程服務"""
        if not self.running:
            logger.warning("排程服務未運行")
            return

        self.running = False
        if self.shutdown_event:
            self.shutdown_event.set()

        # 取消所有任務
        for task_name, task in self.tasks.items():
            if not task["task"].done():
                logger.info(f"正在取消任務: {task_name}")
                task["task"].cancel()

        self.tasks = {}
        logger.info("排程服務已停止")

    def register_tasks(self):
        """註冊所有定時任務"""
        # 從 settings 讀取資產快照時間配置
        snapshot_hours_str = settings.monitor.asset_snapshot_hours
        snapshot_minute = settings.monitor.asset_snapshot_minute

        # 解析小時列表
        try:
            snapshot_hours = [int(h.strip()) for h in snapshot_hours_str.split(",")]
        except ValueError:
            logger.warning(f"無效的資產快照小時配置: {snapshot_hours_str}，使用預設值")
            snapshot_hours = [0, 8, 16]

        # 註冊資產快照任務
        self.register_task(
            name="daily_asset_snapshot",
            coro=self.daily_asset_snapshot,
            trigger="cron",
            hour=snapshot_hours,
            minute=snapshot_minute
        )

        logger.info(f"已註冊 {len(self.tasks)} 個定時任務")
        logger.info(f"資產快照排程時間: {snapshot_hours}:{snapshot_minute:02d} UTC")

    def register_task(self, name: str, coro: Callable[..., Coroutine], trigger: str, **trigger_args):
        """
        註冊定時任務

        Args:
            name: 任務名稱
            coro: 協程函數
            trigger: 觸發器類型，"cron" 或 "interval"
            **trigger_args: 觸發器參數
                對於 "cron"：year, month, day, week, day_of_week, hour, minute, second
                對於 "interval"：seconds, minutes, hours, days, weeks
        """
        if name in self.tasks:
            logger.warning(f"任務 {name} 已存在，將被覆蓋")

            # 取消舊任務
            old_task = self.tasks[name]["task"]
            if not old_task.done():
                old_task.cancel()

        # 創建並啟動任務
        loop = asyncio.get_event_loop()
        task = loop.create_task(self._task_wrapper(
            name, coro, trigger, trigger_args))

        # 註冊到任務字典
        self.tasks[name] = {
            "name": name,
            "coro": coro,
            "trigger": trigger,
            "trigger_args": trigger_args,
            "task": task,
            "last_run": None,
            "next_run": None
        }

        logger.info(f"已註冊任務: {name}, 觸發器: {trigger}, 參數: {trigger_args}")

    async def _task_wrapper(self, name: str, coro: Callable[..., Coroutine], trigger: str, trigger_args: Dict[str, Any]):
        """
        任務包裝器，處理任務的排程和執行

        Args:
            name: 任務名稱
            coro: 協程函數
            trigger: 觸發器類型
            trigger_args: 觸發器參數
        """
        try:
            logger.info(f"任務 {name} 開始運行")

            while self.running and not (self.shutdown_event and self.shutdown_event.is_set()):
                # 計算下次運行時間
                next_run = self._calculate_next_run(trigger, trigger_args)

                if name in self.tasks:
                    self.tasks[name]["next_run"] = next_run

                # 計算需要等待的時間
                now = get_utc_now()
                wait_seconds = (next_run - now).total_seconds()

                if wait_seconds > 0:
                    logger.debug(
                        f"任務 {name} 將在 {wait_seconds:.2f} 秒後運行，下次運行時間: {next_run}")
                    await asyncio.sleep(wait_seconds)

                # 執行任務
                if self.running and not (self.shutdown_event and self.shutdown_event.is_set()):
                    try:
                        logger.info(f"正在執行任務: {name}")
                        await coro()

                        # 更新最後運行時間
                        if name in self.tasks:
                            self.tasks[name]["last_run"] = get_utc_now()

                        logger.info(f"任務 {name} 執行完成")
                    except asyncio.CancelledError:
                        logger.info(f"任務 {name} 被取消")
                        break
                    except Exception as e:
                        logger.error(f"任務 {name} 執行時發生錯誤: {e}")
                        logger.error(traceback.format_exc())
                else:
                    break

        except asyncio.CancelledError:
            logger.info(f"任務 {name} 被取消")
        except Exception as e:
            logger.error(f"任務 {name} 運行時發生嚴重錯誤: {e}")
            logger.error(traceback.format_exc())

        logger.info(f"任務 {name} 已停止")

    def _calculate_next_run(self, trigger: str, trigger_args: Dict[str, Any]) -> datetime:
        """
        計算下次運行時間

        Args:
            trigger: 觸發器類型，"cron" 或 "interval"
            trigger_args: 觸發器參數

        Returns:
            datetime: 下次運行時間
        """
        now = get_utc_now()

        if trigger == "interval":
            # 間隔觸發器
            seconds = trigger_args.get("seconds", 0)
            minutes = trigger_args.get("minutes", 0)
            hours = trigger_args.get("hours", 0)
            days = trigger_args.get("days", 0)

            interval = timedelta(
                seconds=seconds,
                minutes=minutes,
                hours=hours,
                days=days
            )

            return now + interval

        elif trigger == "cron":
            # Cron 觸發器（簡化版，只支持小時和分鐘）
            hours = trigger_args.get("hour", [0])
            minutes = trigger_args.get("minute", [0])

            if not isinstance(hours, list):
                hours = [hours]
            if not isinstance(minutes, list):
                minutes = [minutes]

            # 計算下次運行時間
            next_runs = []
            for hour in hours:
                for minute in minutes:
                    next_run = now.replace(microsecond=0, second=0)

                    # 如果當前時間已經過了這個時間點，就設置為明天的這個時間
                    if next_run.hour > hour or (next_run.hour == hour and next_run.minute >= minute):
                        next_run = next_run + timedelta(days=1)

                    next_run = next_run.replace(hour=hour, minute=minute)
                    next_runs.append(next_run)

            # 返回最近的下次運行時間
            return min(next_runs) if next_runs else now + timedelta(days=1)

        else:
            logger.warning(f"未知的觸發器類型: {trigger}，默認1小時後運行")
            return now + timedelta(hours=1)

    async def daily_asset_snapshot(self):
        """每日定時執行資產快照任務"""
        try:
            logger.info("執行每日資產快照任務")
            asset_snapshot_service = AssetSnapshotService()
            # 使用新的創建快照方法，會強制刷新緩存並為每個用戶創建快照
            result = await asset_snapshot_service._create_daily_snapshot()
            logger.info(f"每日資產快照任務完成: {result}")
            return result
        except Exception as e:
            logger.error(f"執行每日資產快照任務失敗: {e}")
            traceback.print_exc()
            return False


# 創建服務實例
scheduler_service = SchedulerService()
