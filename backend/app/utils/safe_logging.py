"""
安全日誌工具模組
提供安全的日誌記錄功能，自動過濾敏感資料
"""

import re
from typing import Any
import logging

logger = logging.getLogger(__name__)

# 敏感欄位列表
SENSITIVE_FIELDS = [
    "password", "passwd", "pwd",
    "api_key", "api_secret", "secret_key", "access_token", "refresh_token",
    "binance_api_key", "binance_api_secret",
    "line_token", "discord_webhook", "telegram_token", "telegram_chat_id",
    "webhook_url", "bot_token", "chat_id", "token",
    "private_key", "public_key", "certificate",
    "database_url", "db_url", "connection_string"
]

# URL 中的敏感資訊模式
URL_PATTERNS = [
    (r'://([^:]+):([^@]+)@', r'://\1:****@'),  # 資料庫連接字串中的密碼
    (r'(token=)([^&\s]+)', r'\1****'),         # URL 參數中的 token
    (r'(key=)([^&\s]+)', r'\1****'),           # URL 參數中的 key
    # Discord webhook URL: https://discord.com/api/webhooks/{id}/{token}
    (r'(discord\.com/api/webhooks/)(\d+)/([^/\s]+)', r'\1\2/****'),
    # Telegram bot API: https://api.telegram.org/bot{token}/
    (r'(api\.telegram\.org/bot)([^/\s]+)/', r'\1****/'),
    # 一般 webhook URL 路徑中的敏感部分
    (r'(/webhooks?/)([^/\s]+)/([^/\s]+)', r'\1\2/****'),
]


def mask_sensitive_url(url: str) -> str:
    """
    遮罩 URL 中的敏感資訊

    Args:
        url: 原始 URL

    Returns:
        遮罩後的安全 URL
    """
    if not url or not isinstance(url, str):
        return url

    safe_url = url
    for pattern, replacement in URL_PATTERNS:
        safe_url = re.sub(pattern, replacement, safe_url)

    return safe_url


def mask_sensitive_value(value: Any) -> str:
    """
    遮罩敏感值

    Args:
        value: 要遮罩的值

    Returns:
        遮罩後的字串
    """
    if value is None:
        return None

    value_str = str(value)
    if not value_str:
        return value_str

    # 如果是 URL，使用 URL 遮罩
    if value_str.startswith(('http://', 'https://', 'mongodb://', 'postgresql://', 'mysql://')):
        return mask_sensitive_url(value_str)

    # 一般敏感值遮罩
    length = len(value_str)
    if length <= 4:
        return "****"
    elif length <= 8:
        return f"{value_str[:2]}****"
    else:
        return f"{value_str[:4]}****{value_str[-4:]}"


def filter_sensitive_data(data: Any, max_depth: int = 10) -> Any:
    """
    遞歸過濾敏感資料

    Args:
        data: 要過濾的資料
        max_depth: 最大遞歸深度，防止無限遞歸

    Returns:
        過濾後的安全資料
    """
    if max_depth <= 0:
        return "...(max depth reached)"

    if data is None:
        return None

    if isinstance(data, dict):
        safe_data = {}
        for key, value in data.items():
            key_lower = str(key).lower()

            # 檢查是否為敏感欄位
            is_sensitive = any(sensitive_field in key_lower for sensitive_field in SENSITIVE_FIELDS)

            if is_sensitive and value:
                safe_data[key] = mask_sensitive_value(value)
            elif isinstance(value, (dict, list)):
                # 遞歸處理嵌套結構
                safe_data[key] = filter_sensitive_data(value, max_depth - 1)
            else:
                safe_data[key] = value

        return safe_data

    elif isinstance(data, list):
        # 處理列表中的每個元素
        return [filter_sensitive_data(item, max_depth - 1) for item in data]

    elif isinstance(data, str) and data.startswith(('http://', 'https://', 'mongodb://', 'postgresql://', 'mysql://')):
        # 處理 URL 字串
        return mask_sensitive_url(data)

    else:
        # 對於其他類型，直接返回
        return data


def safe_log(logger_instance: logging.Logger, level: int, message: str, data: Any = None, **kwargs):
    """
    安全地記錄日誌

    Args:
        logger_instance: 日誌記錄器實例
        level: 日誌級別
        message: 日誌訊息
        data: 要記錄的資料（會被安全過濾）
        **kwargs: 其他關鍵字參數
    """
    if data is not None:
        safe_data = filter_sensitive_data(data)
        full_message = f"{message}: {safe_data}"
    else:
        full_message = message

    # 過濾 kwargs 中的敏感資料
    safe_kwargs = filter_sensitive_data(kwargs) if kwargs else {}

    logger_instance.log(level, full_message, **safe_kwargs)


def safe_info(logger_instance: logging.Logger, message: str, data: Any = None, **kwargs):
    """安全地記錄 INFO 級別日誌"""
    safe_log(logger_instance, logging.INFO, message, data, **kwargs)


def safe_debug(logger_instance: logging.Logger, message: str, data: Any = None, **kwargs):
    """安全地記錄 DEBUG 級別日誌"""
    safe_log(logger_instance, logging.DEBUG, message, data, **kwargs)


def safe_warning(logger_instance: logging.Logger, message: str, data: Any = None, **kwargs):
    """安全地記錄 WARNING 級別日誌"""
    safe_log(logger_instance, logging.WARNING, message, data, **kwargs)


def safe_error(logger_instance: logging.Logger, message: str, data: Any = None, **kwargs):
    """安全地記錄 ERROR 級別日誌"""
    safe_log(logger_instance, logging.ERROR, message, data, **kwargs)


# 便利函數：直接使用模組級別的 logger
def log_safe_info(message: str, data: Any = None, **kwargs):
    """使用模組 logger 安全地記錄 INFO 日誌"""
    safe_info(logger, message, data, **kwargs)


def log_safe_debug(message: str, data: Any = None, **kwargs):
    """使用模組 logger 安全地記錄 DEBUG 日誌"""
    safe_debug(logger, message, data, **kwargs)


def log_safe_warning(message: str, data: Any = None, **kwargs):
    """使用模組 logger 安全地記錄 WARNING 日誌"""
    safe_warning(logger, message, data, **kwargs)


def log_safe_error(message: str, data: Any = None, **kwargs):
    """使用模組 logger 安全地記錄 ERROR 日誌"""
    safe_error(logger, message, data, **kwargs)
