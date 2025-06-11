from fastapi import APIRouter, Depends, HTTPException, status
from app.models.user import User, PasswordUpdate
from app.services.user_service import user_service
from app.auth.auth_bearer import get_current_user

router = APIRouter(
    prefix="/user",
    tags=["用戶"],
    responses={404: {"description": "找不到"}},
)


@router.post("/update-password")
async def update_password(
    password_update: PasswordUpdate,
    current_user: User = Depends(get_current_user)
):
    try:
        success = await user_service.update_password(current_user["id"], password_update)
        if success:
            return {"message": "密碼更新成功"}
        else:
            # 這種情況理論上不應該發生，因為錯誤會以異常形式拋出
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="密碼更新失敗，但未報告具體錯誤"
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="內部伺服器錯誤"
        )
