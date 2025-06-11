from app.scripts.log_trade_events import main
import asyncio
import logging
import os
import sys

# 添加項目根目錄到 Python 路徑
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# 配置日誌
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("logs/trade_logger.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("啟動交易事件監控...")

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("交易事件監控已停止")
    except Exception as e:
        logger.error(f"交易事件監控發生錯誤: {e}")
        logger.exception(e)
