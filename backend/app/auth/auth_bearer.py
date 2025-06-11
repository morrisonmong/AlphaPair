from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
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


class JWTBearer(HTTPBearer):
    def __init__(self, auto_error: bool = True):
        super(JWTBearer, self).__init__(auto_error=auto_error)

    async def __call__(self, request: Request):
        credentials: HTTPAuthorizationCredentials = await super(JWTBearer, self).__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="無效的認證方案"
                )
            if not self.verify_jwt(credentials.credentials):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="無效的令牌或已過期"
                )
            return credentials.credentials
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="無效的授權代碼"
            )

    def verify_jwt(self, jwtoken: str) -> bool:
        try:
            payload = jwt.decode(jwtoken, SECRET_KEY, algorithms=[ALGORITHM])
            return True if payload else False
        except JWTError:
            return False


async def get_current_user(token: str = Depends(JWTBearer())):
    """
    獲取當前用戶

    Args:
        token: JWT令牌

    Returns:
        dict: 當前用戶信息

    Raises:
        HTTPException: 如果令牌無效或用戶不存在
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="無法驗證憑證"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無法驗證憑證"
        )

    # 獲取用戶集合
    users_collection = await get_users_collection()

    # 查詢用戶
    user_dict = await users_collection.find_one({"username": username})
    if user_dict is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用戶不存在"
        )

    # 將 _id 轉換為字符串
    if "_id" in user_dict:
        user_dict["id"] = str(user_dict.pop("_id"))

    return user_dict
