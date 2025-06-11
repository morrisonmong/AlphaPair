from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from bson import ObjectId
from pydantic import BaseModel
from jose import jwt, JWTError
from ..models.user import User, UserCreate, Token
from ..utils.auth import (
    authenticate_user,
    create_access_token,
    get_password_hash,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    get_user,
    SECRET_KEY,
    ALGORITHM
)
from ..database.mongodb import get_users_collection
from ..utils.time_utils import get_utc_plus_8_now

router = APIRouter(
    prefix="/auth",
    tags=["認證"],
    responses={404: {"description": "找不到"}},
)


@router.post("/register", response_model=User)
async def register_user(user_create: UserCreate):
    # 獲取用戶集合
    users_collection = await get_users_collection()

    # 檢查用戶名是否已存在
    existing_user = await users_collection.find_one({"username": user_create.username})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用戶名已被使用"
        )

    # 檢查郵箱是否已存在
    existing_email = await users_collection.find_one({"email": user_create.email})
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="郵箱已被使用"
        )

    # 創建用戶
    now = get_utc_plus_8_now()
    user_id = str(ObjectId())
    user_dict = user_create.dict()
    hashed_password = get_password_hash(user_create.password)

    user_in_db = {
        "_id": user_id,
        **user_dict,
        "hashed_password": hashed_password,
        "created_at": now,
        "updated_at": now
    }

    # 移除密碼字段
    del user_in_db["password"]

    # 保存到數據庫
    await users_collection.insert_one(user_in_db)

    # 返回創建的用戶信息（不包含密碼）
    return {
        "id": user_id,
        "username": user_create.username,
        "email": user_create.email,
        "full_name": user_create.full_name,
        "disabled": user_create.disabled,
        "role": user_create.role,
        "created_at": now,
        "updated_at": now
    }


@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await authenticate_user(form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用戶名或密碼錯誤",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


class RefreshTokenRequest(BaseModel):
    token: str


@router.post("/refresh-token", response_model=Token)
async def refresh_access_token(request: RefreshTokenRequest):
    """
    刷新訪問令牌
    """
    try:
        # 解析舊 token
        payload = jwt.decode(request.token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")

        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="無效的令牌",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 檢查用戶是否存在
        user = await get_user(username=username)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用戶不存在",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 創建新 token
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": username}, expires_delta=access_token_expires
        )

        return {"access_token": access_token, "token_type": "bearer"}
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="無法驗證令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
