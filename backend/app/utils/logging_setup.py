import logging
import sys
from typing import Optional

try:
    import colorlog
    HAS_COLORLOG = True
except ImportError:
    HAS_COLORLOG = False
    print("Warning: colorlog 套件未安裝，使用標準日誌輸出。安裝命令: pip install colorlog")


def setup_colored_logging(level: int = logging.INFO,
                          log_file: Optional[str] = None) -> logging.Logger:
    """
    設置帶有顏色的日誌配置
    
    Args:
        level: 日誌級別，默認為INFO
        log_file: 可選的日誌文件路徑
    
    Returns:
        logging.Logger: 配置好的根日誌記錄器
    """
    # 定義顏色映射
    color_dict = {
        'DEBUG': 'cyan',
        'INFO': 'green',
        'WARNING': 'yellow',
        'ERROR': 'red',
        'CRITICAL': 'bold_red',
    }
    
    # 創建根日誌記錄器
    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    
    # 檢查是否已存在處理器，避免重複
    if root_logger.handlers:
        for handler in root_logger.handlers:
            root_logger.removeHandler(handler)
    
    # 設置格式化器
    if HAS_COLORLOG:
        # 使用彩色格式化器
        formatter = colorlog.ColoredFormatter(
            "%(log_color)s%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
            reset=True,
            log_colors=color_dict,
            secondary_log_colors={},
            style='%'
        )
    else:
        # 使用標準格式化器
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
    
    # 添加控制台處理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)
    
    # 如果提供了日誌文件，還添加文件處理器
    if log_file:
        file_handler = logging.FileHandler(log_file, encoding='utf-8')
        file_handler.setFormatter(logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        ))
        root_logger.addHandler(file_handler)
    
    return root_logger


def get_logger(name: str, level: Optional[int] = None) -> logging.Logger:
    """
    獲取命名的日誌記錄器
    
    Args:
        name: 日誌記錄器名稱
        level: 可選的日誌級別，如果不提供則使用根日誌記錄器的級別
    
    Returns:
        logging.Logger: 命名的日誌記錄器
    """
    logger = logging.getLogger(name)
    if level is not None:
        logger.setLevel(level)
    return logger 