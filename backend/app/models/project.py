from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship


class Project(SQLModel, table=True):
    __tablename__ = "projects"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=200)
    description: str = Field(default="", max_length=500)
    park: str = Field(default="ganzhou", max_length=50)
    task_type: str = Field(default="detection", max_length=50)
    is_personal: bool = Field(default=True)
    created_by: int = Field(foreign_key="users.id")
    team_id: Optional[int] = Field(default=None, foreign_key="teams.id", nullable=True)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
