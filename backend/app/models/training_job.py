from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field, Column, JSON


class TrainingJob(SQLModel, table=True):
    __tablename__ = "training_jobs"

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id", index=True)
    task_name: str = Field(max_length=300)
    model: str = Field(default="yolo11m.pt", max_length=100)       # yolo11n/m/l/x
    epochs: int = Field(default=100)
    batch: int = Field(default=16)
    imgsz: int = Field(default=640)
    optimizer: str = Field(default="AdamW", max_length=50)
    lr0: float = Field(default=0.001)
    lrf: float = Field(default=0.01)
    device: str = Field(default="mps", max_length=20)              # mps / cpu / cuda:0
    workers: int = Field(default=4)
    amp: bool = Field(default=True)
    status: str = Field(default="queued", max_length=20)          # queued / running / completed / stopped / failed
    config_json: Optional[str] = Field(default=None, sa_column=Column(JSON))  # full config snapshot
    progress: float = Field(default=0.0)
    current_epoch: int = Field(default=0)
    total_epochs: int = Field(default=100)
    metrics: Optional[str] = Field(default=None, sa_column=Column(JSON))  # {"mAP50": ..., "mAP50-95": ..., "box_loss": ...}
    started_at: Optional[datetime] = Field(default=None)
    finished_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
