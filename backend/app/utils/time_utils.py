from datetime import datetime, timezone, timedelta

# 定義 UTC+8 時區
UTC_PLUS_8 = timezone(timedelta(hours=8))


def get_utc_plus_8_now():
    """獲取 UTC+8 時區的當前時間（保留向後兼容）

    注意：推薦使用 get_utc_now() 並在需要時進行時區轉換
    """
    return datetime.now(UTC_PLUS_8)


def get_utc_now():
    """獲取 UTC 時區的當前時間（推薦使用）

    所有數據庫存儲應使用此函數生成時間
    """
    return datetime.now(timezone.utc)


def convert_to_timezone(dt, tz=UTC_PLUS_8):
    """將時間轉換到指定時區

    Args:
        dt: 要轉換的 datetime 對象
        tz: 目標時區，默認為 UTC+8

    Returns:
        轉換後的 datetime 對象
    """
    if dt.tzinfo is None:
        # 如果是 naive datetime，假設它是 UTC 時間
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)


def format_datetime(dt, format_str="%Y-%m-%d %H:%M:%S"):
    """格式化 datetime 對象為字符串

    Args:
        dt: datetime 對象
        format_str: 格式化字符串

    Returns:
        格式化後的字符串
    """
    return dt.strftime(format_str)


def utc_to_local(utc_dt, local_tz=UTC_PLUS_8):
    """將UTC時間轉換為本地時間

    Args:
        utc_dt: UTC時間的datetime對象
        local_tz: 本地時區，默認為UTC+8

    Returns:
        本地時區的datetime對象
    """
    if utc_dt.tzinfo is None:
        utc_dt = utc_dt.replace(tzinfo=timezone.utc)
    return utc_dt.astimezone(local_tz)


def local_to_utc(local_dt, local_tz=UTC_PLUS_8):
    """將本地時間轉換為UTC時間

    Args:
        local_dt: 本地時間的datetime對象
        local_tz: 本地時區，默認為UTC+8

    Returns:
        UTC時區的datetime對象
    """
    if local_dt.tzinfo is None:
        local_dt = local_dt.replace(tzinfo=local_tz)
    return local_dt.astimezone(timezone.utc)


def get_start_of_day(dt):
    """獲取指定日期的開始時間（00:00:00）

    Args:
        dt: datetime對象

    Returns:
        當天開始時間的datetime對象，保留原時區
    """
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def parse_date_string(date_str, format_str=None):
    """將日期字符串解析為datetime對象

    Args:
        date_str: 日期字符串，例如 "2023-01-01" 或 ISO 格式如 "2023-01-01T12:00:00.000Z"
        format_str: 日期格式，如果為 None，則嘗試自動檢測格式

    Returns:
        解析後的datetime對象，設置為UTC時區
    """
    try:
        # 預處理：解決 URL 編碼問題
        if date_str:
            # 替換可能被編碼的字符
            date_str = date_str.replace('%3A', ':').replace('%2B', '+')

        # 嘗試檢測日期格式
        if format_str is None:
            # 處理帶有 T 和 Z 的 ISO 8601 格式
            if 'T' in date_str:
                # 處理包含毫秒的情況
                if '.' in date_str:
                    if date_str.endswith('Z'):
                        # 如果以 Z 結尾 (UTC 時間)
                        dt = datetime.strptime(
                            date_str, "%Y-%m-%dT%H:%M:%S.%fZ")
                        dt = dt.replace(tzinfo=timezone.utc)
                    else:
                        # 如果不以 Z 結尾
                        dt = datetime.strptime(
                            date_str, "%Y-%m-%dT%H:%M:%S.%f")
                        dt = dt.replace(tzinfo=UTC_PLUS_8)
                else:
                    if date_str.endswith('Z'):
                        # 如果以 Z 結尾 (UTC 時間)
                        dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
                        dt = dt.replace(tzinfo=timezone.utc)
                    else:
                        # 如果不以 Z 結尾
                        dt = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S")
                        dt = dt.replace(tzinfo=UTC_PLUS_8)
            else:
                # 標準日期格式 YYYY-MM-DD
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                dt = dt.replace(tzinfo=UTC_PLUS_8)
        else:
            # 使用指定的格式
            dt = datetime.strptime(date_str, format_str)
            # 檢查是否已經有時區信息
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC_PLUS_8)

        return dt
    except Exception as e:
        raise ValueError(f"無法解析日期字串 '{date_str}': {str(e)}")


def ensure_timezone(dt, default_tz=timezone.utc):
    """確保 datetime 對象有時區信息，如果沒有則添加默認時區

    Args:
        dt: datetime 對象
        default_tz: 默認時區，預設為 UTC

    Returns:
        帶有時區信息的 datetime 對象
    """
    if dt is None:
        return dt
    
    if not isinstance(dt, datetime):
        raise TypeError(f"Expected datetime object, got {type(dt)}")
        
    # 如果沒有時區信息，添加默認時區
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=default_tz)
    
    return dt
