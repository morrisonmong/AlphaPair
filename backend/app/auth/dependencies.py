from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import os
from dotenv import load_dotenv
from ..database.mongodb import get_users_collection

# 載入環境變數
load_dotenv()

# 獲取JWT配置 - 強制從環境變數讀取，無預設值
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")

# 驗證必要的環境變數
if not SECRET_KEY:
    raise ValueError("SECRET_KEY 環境變數未設定！請在 .env 檔案中設定此變數。")

# OAuth2 密碼Bearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")


async def get_current_user_id(token: str = Depends(oauth2_scheme)) -> str:
    """
    從 JWT token 獲取當前使用者 ID

    Args:
        token: JWT令牌

    Returns:
        str: 當前使用者ID

    Raises:
        HTTPException: 如果令牌無效
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="無效的身份驗證憑證",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # 解碼 JWT token
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        username: str = payload.get("sub")

        if username is None:
            raise credentials_exception

        # 獲取用戶集合
        users_collection = await get_users_collection()

        # 查詢用戶
        user = await users_collection.find_one({"username": username})
        if user is None:
            raise credentials_exception

        # 返回用戶ID
        return str(user["_id"])
    except JWTError:
        raise credentials_exception
