from typing import Optional
from sqlmodel import SQLModel, Field


class Label(SQLModel, table=True):
    __tablename__ = "labels"

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id", index=True)
    name: str = Field(max_length=100)       # e.g. "police / 警察"
    color: str = Field(default="#1890ff", max_length=20)
    shortcut: str = Field(default="", max_length=10)
