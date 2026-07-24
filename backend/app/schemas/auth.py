from pydantic import BaseModel, EmailStr


# ── Request schemas ──

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "engineer"
    name: str


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    avatar: str | None = None
    old_password: str | None = None
    new_password: str | None = None


# ── Response schemas ──

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    name: str
    role: str
    avatar: str
    created_at: str
    is_active: bool

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
