"""
认证路由
处理用户登录、注册等
"""
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.security import create_access_token, decode_access_token, verify_password
from app.utils.logger import log

router = APIRouter()

# OAuth2密码流
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")


class Token(BaseModel):
    """Token响应模型"""
    access_token: str
    token_type: str


class UserResponse(BaseModel):
    """用户响应模型"""
    id: int
    username: str
    is_admin: bool
    
    class Config:
        from_attributes = True


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    获取当前登录用户
    依赖注入，用于保护需要认证的路由
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    # 从数据库获取用户
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    获取当前管理员用户
    用于保护需要管理员权限的路由
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user


@router.post("/token", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录
    返回JWT Token
    """
    # 查找用户
    result = await db.execute(
        select(User).where(User.username == form_data.username)
    )
    user = result.scalar_one_or_none()
    
    # 验证用户名和密码
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 创建访问令牌
    access_token = create_access_token(data={"sub": user.username})
    
    log.info(f"用户登录: {user.username}")
    
    return {"access_token": access_token, "token_type": "bearer"}


class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str
    password: str


@router.post("/login", response_model=Token)
async def login_json(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录（JSON格式）
    用于Flutter Web等现代前端
    """
    # 查找用户
    result = await db.execute(
        select(User).where(User.username == login_data.username)
    )
    user = result.scalar_one_or_none()
    
    # 验证用户名和密码
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
        )
    
    # 创建访问令牌
    access_token = create_access_token(data={"sub": user.username})
    
    log.info(f"用户登录: {user.username}")
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    获取当前用户信息
    """
    return current_user
