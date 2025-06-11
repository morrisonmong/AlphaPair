import base64
import logging
import os
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# 從環境變數獲取密鑰，生產環境中必須設定
SECRET_KEY = os.getenv("SECRET_KEY")
CRYPTO_SALT = os.getenv("CRYPTO_SALT")

# 驗證必要的環境變數
if not SECRET_KEY:
    raise ValueError("SECRET_KEY 環境變數未設定！請在 .env 檔案中設定此變數。")

if not CRYPTO_SALT:
    raise ValueError("CRYPTO_SALT 環境變數未設定！請在 .env 檔案中設定此變數。")

# 處理鹽值編碼
try:
    # 如果是十六進制字符串，則轉換為字節
    if all(c in '0123456789abcdefABCDEF' for c in CRYPTO_SALT):
        SALT = bytes.fromhex(CRYPTO_SALT)
    else:
        # 否則直接編碼
        SALT = CRYPTO_SALT.encode()
except Exception as e:
    raise ValueError(f"CRYPTO_SALT 格式錯誤: {e}")

# 緩存的 Fernet 實例
_fernet = None


def _get_fernet() -> Fernet:
    """獲取 Fernet 實例，用於加密和解密"""
    global _fernet
    if _fernet is None:
        try:
            # 使用 PBKDF2HMAC 從密鑰和鹽值生成密鑰
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=SALT,
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(SECRET_KEY.encode()))
            _fernet = Fernet(key)
        except Exception as e:
            logger.error(f"初始化加密器失敗: {e}")
            raise ValueError(f"無法初始化加密器，請檢查 SECRET_KEY 和 CRYPTO_SALT 設定: {e}")
    return _fernet


def encrypt_sensitive_data(data: str) -> str:
    """
    加密敏感數據

    Args:
        data: 要加密的數據

    Returns:
        str: 加密後的數據（Base64 編碼）
    """
    if not data:
        return ""

    try:
        # 直接加密數據
        encrypted_data = _get_fernet().encrypt(data.encode())
        encoded_data = base64.urlsafe_b64encode(encrypted_data).decode()
        logger.debug(f"加密數據: 原始長度={len(data)}, 加密後長度={len(encoded_data)}")
        return encoded_data
    except Exception as e:
        logger.error(f"加密數據時發生錯誤: {e}")
        raise ValueError(f"加密失敗: {e}")


def decrypt_sensitive_data(encrypted_data: str) -> str:
    """
    解密敏感數據

    Args:
        encrypted_data: 加密的數據（Base64 編碼）

    Returns:
        str: 解密後的數據
    """
    if not encrypted_data:
        return ""

    try:
        # 解碼 Base64
        decoded_data = base64.urlsafe_b64decode(encrypted_data)
        # 解密數據
        decrypted_data = _get_fernet().decrypt(decoded_data)
        result = decrypted_data.decode()
        logger.debug(f"解密數據: 加密長度={len(encrypted_data)}, 解密後長度={len(result)}")
        return result
    except InvalidToken:
        logger.warning("無效的加密令牌，可能是數據未加密或使用了不同的密鑰")
        return encrypted_data
    except Exception as e:
        logger.error(f"解密數據時發生錯誤: {e}")
        # 如果解密失敗，返回原始數據
        return encrypted_data
