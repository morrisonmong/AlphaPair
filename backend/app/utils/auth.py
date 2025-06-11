import os
from datetime import timedelta
from typing import Optional

from jose import JWTError, jwt

from passlib.context import CryptContext

from fastapi import Depends, HTTPException, status

from fastapi.security import OAuth2PasswordBearer

from dotenv import load_dotenv

from ..models.user import TokenData, User, UserInDB

from ..database.mongodb import get_users_collection
from ..utils.time_utils import get_utc_plus_8_now

import logging


# 載入環境變數

load_dotenv()


# 獲取JWT配置 - 強制從環境變數讀取，無預設值
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "240"))

# 驗證必要的環境變數
if not SECRET_KEY:
    raise ValueError("SECRET_KEY 環境變數未設定！請在 .env 檔案中設定此變數。")


# 密碼上下文

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# OAuth2 密碼Bearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


# Get a logger instance
logger = logging.getLogger(__name__)


# 驗證密碼


def verify_password(plain_password, hashed_password):

    return pwd_context.verify(plain_password, hashed_password)


# 生成密碼哈希


def get_password_hash(password):

    return pwd_context.hash(password)


# 獲取用戶


async def get_user(username: str):

    users_collection = await get_users_collection()

    user_dict = await users_collection.find_one({"username": username})

    if user_dict:

        return UserInDB(**user_dict)

    return None


# 驗證用戶


async def authenticate_user(username: str, password: str):
    logger.info(f"開始驗證用戶: {username}")
    user = await get_user(username)

    if not user:
        logger.warning(f"驗證失敗：找不到用戶 {username}")
        return False

    logger.info(f"找到用戶 {username}，準備驗證密碼。用戶資料: {user.dict(exclude={'hashed_password'})}")  # Log user data excluding hash for security
    logger.debug(f"用戶 {username} 的哈希密碼: {user.hashed_password}")  # Log hash only in debug

    try:
        password_verified = verify_password(password, user.hashed_password)
        if not password_verified:
            logger.warning(f"用戶 {username} 的密碼驗證失敗")
            return False
        logger.info(f"用戶 {username} 密碼驗證成功")
        return user
    except Exception as e:
        logger.error(f"驗證用戶 {username} 密碼時發生錯誤: {e}", exc_info=True)
        # Depending on policy, you might want to return False or re-raise
        # Returning False here to prevent login on error, matching original logic flow
        # Re-raising might expose internal errors, but could be useful for debugging
        # raise HTTPException(
        #     status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        #     detail="內部伺服器錯誤，無法驗證密碼"
        # )
        return False


# 創建訪問令牌


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):

    to_encode = data.copy()

    if expires_delta:

        expire = get_utc_plus_8_now() + expires_delta

    else:

        expire = get_utc_plus_8_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


# 獲取當前用戶


async def get_current_user(token: str = Depends(oauth2_scheme)):

    credentials_exception = HTTPException(

        status_code=status.HTTP_401_UNAUTHORIZED,

        detail="無法驗證憑證",

        headers={"WWW-Authenticate": "Bearer"},

    )

    try:

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        username: str = payload.get("sub")

        if username is None:

            raise credentials_exception

        token_data = TokenData(username=username)

    except JWTError:

        raise credentials_exception

    user = await get_user(username=token_data.username)

    if user is None:

        raise credentials_exception

    return user


# 獲取當前活躍用戶


async def get_current_active_user(current_user: User = Depends(get_current_user)):

    if current_user.disabled:

        raise HTTPException(status_code=400, detail="用戶已停用")

    return current_user
