from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token, decode_access_token
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
    UpdateProfileRequest,
)

router = APIRouter(prefix="/auth", tags=["认证"])
security = HTTPBearer()


# ── Dependencies ──

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate JWT and return the current user."""
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证令牌")

    user_id: int = int(payload.get("sub"))
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的认证令牌")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在")

    return user


# ── Endpoints ──

@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT token."""
    result = await db.execute(select(User).where(User.username == request.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            name=user.name,
            role=user.role,
            avatar=user.avatar,
            created_at=user.created_at.isoformat(),
            is_active=user.is_active,
        ),
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    # Check username uniqueness
    result = await db.execute(select(User).where(User.username == request.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="用户名已存在")

    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已被注册")

    user = User(
        username=request.username,
        email=request.email,
        name=request.name or request.username,
        password_hash=hash_password(request.password),
        role=request.role,
        avatar=request.name[0] if request.name else request.username[0],
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(data={"sub": str(user.id), "role": user.role})

    return TokenResponse(
        access_token=access_token,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            name=user.name,
            role=user.role,
            avatar=user.avatar,
            created_at=user.created_at.isoformat(),
            is_active=user.is_active,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        avatar=current_user.avatar,
        created_at=current_user.created_at.isoformat(),
        is_active=current_user.is_active,
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile. Optionally change password."""
    if request.name is not None:
        current_user.name = request.name
        current_user.avatar = request.name[0]
    if request.email is not None:
        # Check email uniqueness
        result = await db.execute(
            select(User).where(User.email == request.email, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="邮箱已被使用")
        current_user.email = request.email
    if request.old_password and request.new_password:
        if not verify_password(request.old_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="旧密码错误")
        if len(request.new_password) < 6:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="新密码至少 6 位")
        current_user.password_hash = hash_password(request.new_password)

    await db.commit()
    await db.refresh(current_user)

    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        name=current_user.name,
        role=current_user.role,
        avatar=current_user.avatar,
        created_at=current_user.created_at.isoformat(),
        is_active=current_user.is_active,
    )
