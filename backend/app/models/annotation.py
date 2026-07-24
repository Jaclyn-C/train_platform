from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Annotation(SQLModel, table=True):
    __tablename__ = "annotations"

    id: Optional[int] = Field(default=None, primary_key=True)
    dataset_id: int = Field(foreign_key="datasets.id", index=True)
    image_index: int = Field(default=0)       # which image in the dataset (1-based)
    label_id: int = Field(foreign_key="labels.id")
    bbox_x: float = Field(default=0)
    bbox_y: float = Field(default=0)
    bbox_w: float = Field(default=0)
    bbox_h: float = Field(default=0)
    confidence: Optional[float] = Field(default=None)  # null = manual, number = auto pre-annotation
    is_auto: bool = Field(default=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
