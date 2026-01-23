"""
认证路由
处理用户登录、注册等
"""
from datetime import datetime, timedelta
from typing import Optional
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User
from app.security import create_access_token, decode_access_token, verify_password, hash_password
from app.utils.logger import log
from app.config import settings

router = APIRouter()

# OAuth2密码流
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token")

SETTINGS_FILE = Path("config/system_settings.json")
DEFAULT_REGISTRATION_ENABLED = False


def _is_registration_enabled() -> bool:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return bool(data.get("registration_enabled", DEFAULT_REGISTRATION_ENABLED))
        except Exception as e:
            log.warning(f"读取系统设置失败，默认禁用注册: {e}")
            return DEFAULT_REGISTRATION_ENABLED
    return DEFAULT_REGISTRATION_ENABLED


class Token(BaseModel):
    """Token响应模型"""
    access_token: str
    token_type: str


class LoginResponse(BaseModel):
    """登录响应模型（包含用户信息）"""
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    """用户响应模型"""
    id: int
    username: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_admin: bool
    age_rating_limit: str = "all"
    telegram_id: Optional[str] = None
    created_at: datetime
    
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


class RegisterRequest(BaseModel):
    """注册请求模型"""
    username: str
    password: str


class RegisterResponse(BaseModel):
    """注册响应模型（包含用户信息）"""
    access_token: str
    token_type: str
    user: dict


@router.post("/login", response_model=LoginResponse)
async def login_json(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户登录（JSON格式）
    用于Flutter Web和React Web等现代前端
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
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
        }
    }


@router.post("/register", response_model=RegisterResponse)
async def register_user(
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    用户注册（JSON格式）
    """
    if not _is_registration_enabled():
        raise HTTPException(status_code=403, detail="当前未开启注册")

    username = register_data.username.strip()
    password = register_data.password

    if len(username) < 3 or len(username) > 30:
        raise HTTPException(status_code=400, detail="用户名长度需在3-30之间")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="密码长度至少6位")

    result = await db.execute(
        select(User).where(User.username == username)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    user = User(
        username=username,
        password_hash=hash_password(password),
        is_admin=False,
        age_rating_limit=settings.rbac.default_age_rating,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": user.username})
    log.info(f"新用户注册: {user.username}")

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "display_name": user.display_name,
            "avatar_url": user.avatar_url,
            "is_admin": user.is_admin,
        }
    }


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """
    获取当前用户信息
    """
    return current_user
