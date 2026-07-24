from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class TeamMember(SQLModel, table=True):
    __tablename__ = "team_members"

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(foreign_key="teams.id")
    user_id: int = Field(foreign_key="users.id")
    role: str = Field(default="member", max_length=20)  # owner, admin, member
    permission: str = Field(default="read", max_length=20)  # read, write
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
