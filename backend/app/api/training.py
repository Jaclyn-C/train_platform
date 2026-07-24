import threading
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.training_job import TrainingJob
from app.models.user import User
from app.api.auth import get_current_user
from app.services.trainer import run_training, get_job_status

router = APIRouter(prefix="/training", tags=["训练"])


class StartTrainingRequest(BaseModel):
    project_id: int
    task_name: str = ""
    model: str = "yolo11m.pt"
    epochs: int = 100
    batch: int = 16
    imgsz: int = 640
    optimizer: str = "AdamW"
    lr0: float = 0.001
    lrf: float = 0.01
    device: str = "mps"
    workers: int = 4
    amp: bool = True
    # Augmentation
    hsv_h: float = 0.015
    hsv_s: float = 0.7
    hsv_v: float = 0.4
    degrees: float = 0.0
    fliplr: float = 0.5
    mosaic: float = 1.0


class TrainingJobResponse(BaseModel):
    id: int
    project_id: int
    task_name: str
    model: str
    epochs: int
    batch: int
    imgsz: int
    device: str
    status: str
    progress: float
    current_epoch: int
    total_epochs: int
    metrics: dict | None
    started_at: str | None
    finished_at: str | None
    created_at: str

    model_config = {"from_attributes": True}


class TrainingStatusResponse(BaseModel):
    status: str
    progress: float
    current_epoch: int
    total_epochs: int
    metrics: dict | None
    logs: list[str]
    error: str | None
    started_at: str | None
    finished_at: str | None


def _to_response(job: TrainingJob) -> TrainingJobResponse:
    return TrainingJobResponse(
        id=job.id,
        project_id=job.project_id,
        task_name=job.task_name,
        model=job.model,
        epochs=job.epochs,
        batch=job.batch,
        imgsz=job.imgsz,
        device=job.device,
        status=job.status,
        progress=job.progress,
        current_epoch=job.current_epoch,
        total_epochs=job.total_epochs,
        metrics=job.metrics,
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
        created_at=job.created_at.isoformat(),
    )


@router.get("/jobs", response_model=list[TrainingJobResponse])
async def list_jobs(
    project_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List training jobs, optionally filtered by project."""
    q = select(TrainingJob).order_by(TrainingJob.created_at.desc())
    if project_id:
        q = q.where(TrainingJob.project_id == project_id)
    result = await db.execute(q)
    return [_to_response(j) for j in result.scalars().all()]


@router.post("/start", response_model=TrainingJobResponse, status_code=status.HTTP_201_CREATED)
async def start_training(
    req: StartTrainingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new training job."""
    task_name = req.task_name or f"{req.model.replace('.pt','')}-{req.epochs}e-b{req.batch}"

    job = TrainingJob(
        project_id=req.project_id,
        task_name=task_name,
        model=req.model,
        epochs=req.epochs,
        batch=req.batch,
        imgsz=req.imgsz,
        optimizer=req.optimizer,
        lr0=req.lr0,
        lrf=req.lrf,
        device=req.device,
        workers=req.workers,
        amp=req.amp,
        total_epochs=req.epochs,
        status="queued",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Start training in background thread
    config = req.model_dump()
    config["project_id"] = req.project_id
    t = threading.Thread(target=run_training, args=(job.id, config), daemon=True)
    t.start()

    return _to_response(job)


@router.get("/jobs/{job_id}/status", response_model=TrainingStatusResponse)
async def job_status(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get real-time status of a training job."""
    # Check in-memory store first (for running jobs)
    live = get_job_status(job_id)
    if live:
        return TrainingStatusResponse(
            status=live["status"],
            progress=live.get("progress", 0),
            current_epoch=live.get("epoch", live.get("current_epoch", 0)),
            total_epochs=live.get("total", live.get("total_epochs", 100)),
            metrics=live.get("metrics"),
            logs=live.get("logs", [])[-50:],
            error=live.get("error"),
            started_at=live.get("started_at"),
            finished_at=live.get("finished_at"),
        )

    # Fallback to DB for completed/failed jobs
    result = await db.execute(select(TrainingJob).where(TrainingJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "训练任务不存在")

    return TrainingStatusResponse(
        status=job.status,
        progress=job.progress,
        current_epoch=job.current_epoch,
        total_epochs=job.total_epochs,
        metrics=job.metrics,
        logs=[],
        error=None,
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
    )


@router.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TrainingJob).where(TrainingJob.id == job_id))
    job = result.scalar_one_or_none()
    if job:
        await db.delete(job)
        await db.commit()
