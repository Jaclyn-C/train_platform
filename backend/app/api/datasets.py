from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.project import Project
from app.models.user import User
from app.api.auth import get_current_user
from app.schemas.dataset import DatasetResponse, BatchGroup

router = APIRouter(prefix="/datasets", tags=["数据集"])


def _to_response(d: Dataset) -> DatasetResponse:
    return DatasetResponse(
        id=d.id,
        project_id=d.project_id,
        batch_name=d.batch_name,
        stage=d.stage,
        stage_label=d.stage_label,
        file_count=d.file_count,
        size_label=d.size_label,
        status=d.status or "",
        auto_status=d.auto_status or "",
        sort_order=d.sort_order,
        created_at=d.created_at.isoformat(),
    )


# ── Stage order ──
STAGE_ORDER = {
    "raw_videos": 0,
    "extracted": 1,
    "deduplicated": 2,
    "labeled": 3,
    "train": 4,
    "val": 5,
}
STAGE_LABELS = {
    "raw_videos": "files/",
    "extracted": "extracted_frames/",
    "deduplicated": "deduplicated/",
    "labeled": "labeled/",
    "train": "train/",
    "val": "val/",
}


@router.get("/batches", response_model=list[BatchGroup])
async def list_batches(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all datasets for a project, grouped by batch."""
    result = await db.execute(
        select(Dataset)
        .where(Dataset.project_id == project_id)
        .order_by(Dataset.batch_name.desc(), Dataset.sort_order)
    )
    datasets = result.scalars().all()

    # Group by batch_name
    groups: dict[str, list[DatasetResponse]] = {}
    for d in datasets:
        groups.setdefault(d.batch_name, []).append(_to_response(d))

    batches = []
    for batch_name, children in groups.items():
        batch_date = children[0].created_at[:10] if children else ""
        status = "未标注"
        for c in children:
            if c.stage == "val":
                status = "已完成"
            elif c.stage == "train" and status != "已完成":
                status = "已训练"
            elif c.stage == "labeled" and status not in ("已完成", "已训练"):
                status = "已标注"
        batches.append(BatchGroup(
            batch_name=batch_name,
            batch_date=batch_date,
            status=status,
            children=children,
        ))

    return batches


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_files(
    project_id: int = Form(...),
    stage: str = Form("raw_videos"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    files: list[UploadFile] = File(...),
):
    """Upload files and create a new dataset entry."""
    if not files:
        raise HTTPException(400, "请选择文件")

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    time_suffix = now.strftime("%H%M%S")
    batch_name = f"上传批次_{date_str}_{time_suffix}"
    stage_label = STAGE_LABELS.get(stage, f"{stage}/")
    file_count = len(files)

    dataset = Dataset(
        project_id=project_id,
        batch_name=batch_name,
        stage=stage,
        stage_label=stage_label,
        file_count=file_count,
        size_label=f"{file_count} 个文件",
        status="已完成" if stage in ("raw_videos",) else "",
        sort_order=STAGE_ORDER.get(stage, 0),
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return _to_response(dataset)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a dataset and all downstream datasets in the same batch."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "数据集不存在")

    # Delete all downstream stages (higher sort_order) in the same batch
    await db.execute(
        delete(Dataset).where(
            Dataset.project_id == ds.project_id,
            Dataset.batch_name == ds.batch_name,
            Dataset.sort_order >= ds.sort_order,
        )
    )
    await db.commit()


@router.post("/{dataset_id}/process", response_model=DatasetResponse)
async def process_dataset(
    dataset_id: int,
    action: str = Form(...),  # "extract" | "dedup" | "label" | "split"
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Simulate processing a dataset: extract frames, dedup, etc."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(404, "数据集不存在")

    now = datetime.now(timezone.utc)

    if action == "extract":
        # Create extracted entry
        new_stage = "extracted"
        count = 1248
        label = "1,248 张"
    elif action == "dedup":
        new_stage = "deduplicated"
        count = 1102
        label = "1,102 张"
    elif action == "label":
        new_stage = "labeled"
        count = ds.file_count
        label = f"{ds.file_count} 张"
    elif action == "split":
        # Create both train and val
        train = Dataset(
            project_id=ds.project_id,
            batch_name=ds.batch_name,
            stage="train",
            stage_label="train/",
            file_count=771,
            size_label="771 张 + 标签",
            status="已完成",
            sort_order=4,
        )
        val = Dataset(
            project_id=ds.project_id,
            batch_name=ds.batch_name,
            stage="val",
            stage_label="val/",
            file_count=331,
            size_label="331 张 + 标签",
            status="已完成",
            sort_order=5,
        )
        db.add_all([train, val])
        await db.commit()
        return _to_response(train)
    else:
        raise HTTPException(400, f"Unknown action: {action}")

    new_ds = Dataset(
        project_id=ds.project_id,
        batch_name=ds.batch_name,
        stage=new_stage,
        stage_label=STAGE_LABELS.get(new_stage, f"{new_stage}/"),
        file_count=count,
        size_label=label,
        status="已完成",
        sort_order=STAGE_ORDER.get(new_stage, 0),
    )
    db.add(new_ds)
    await db.commit()
    await db.refresh(new_ds)
    return _to_response(new_ds)
