from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


class Dataset(SQLModel, table=True):
    __tablename__ = "datasets"

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id", index=True)
    batch_name: str = Field(max_length=200)          # e.g. "上传批次_20260628"
    stage: str = Field(max_length=50)                 # raw_videos | extracted | deduplicated | labeled | train | val
    stage_label: str = Field(default="", max_length=50)  # "files/", "extracted_frames/", etc.
    file_count: int = Field(default=0)
    size_label: str = Field(default="", max_length=100)  # "4 个文件", "1,248 张"
    status: str = Field(default="", max_length=50)    # 已完成 | 标注中 | 未标注
    auto_status: str = Field(default="", max_length=50)  # review | in_progress | none
    sort_order: int = Field(default=0)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
