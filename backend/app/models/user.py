from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from datetime import datetime

from enum import Enum


class UserRole(str, Enum):

    ADMIN = "admin"

    USER = "user"


class UserBase(BaseModel):

    email: EmailStr

    username: str

    full_name: Optional[str] = None

    disabled: bool = False

    role: UserRole = UserRole.USER


class UserCreate(UserBase):

    password: str


class UserUpdate(BaseModel):

    email: Optional[EmailStr] = None

    username: Optional[str] = None

    full_name: Optional[str] = None

    disabled: Optional[bool] = None

    role: Optional[UserRole] = None

    password: Optional[str] = None


class UserInDB(UserBase):

    id: str = Field(..., alias="_id")

    hashed_password: str

    created_at: datetime

    updated_at: datetime

    class Config:

        populate_by_name = True


class User(UserBase):

    id: str

    created_at: datetime

    updated_at: datetime

    class Config:

        populate_by_name = True


class Token(BaseModel):

    access_token: str

    token_type: str


class TokenData(BaseModel):

    username: Optional[str] = None

    role: Optional[UserRole] = None


class PasswordUpdate(BaseModel):

    current_password: str

    new_password: str

    confirm_password: str
