from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.database import get_db
from app.models.dataset import Dataset
from app.models.user import User
from app.api.auth import get_current_user
from app.schemas.dataset import DatasetResponse, BatchGroup
from app.services.file_storage import (
    save_uploaded_files, list_stage_files, list_stage_images,
    get_stage_image_count, delete_stage_dir, format_size,
    get_stage_dir,
)
from app.services.video_processor import start_extract, get_extract_progress
from app.services.dedup_processor import start_dedup, get_dedup_progress

router = APIRouter(prefix="/datasets", tags=["数据集"])


def _to_response(d: Dataset) -> DatasetResponse:
    return DatasetResponse(
        id=d.id, project_id=d.project_id, batch_name=d.batch_name,
        stage=d.stage, stage_label=d.stage_label, file_count=d.file_count,
        size_label=d.size_label, status=d.status or "", auto_status=d.auto_status or "",
        sort_order=d.sort_order, created_at=d.created_at.isoformat(),
    )


STAGE_ORDER = {"raw_videos": 0, "extracted": 1, "deduplicated": 2, "labeled": 3, "train": 4, "val": 5}
STAGE_LABELS = {"raw_videos": "files/", "extracted": "extracted_frames/",
                "deduplicated": "deduplicated/", "labeled": "labeled/",
                "train": "train/", "val": "val/"}


# ── List ──

@router.get("/batches", response_model=list[BatchGroup])
async def list_batches(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Dataset).where(Dataset.project_id == project_id)
        .order_by(Dataset.batch_name.desc(), Dataset.sort_order)
    )
    datasets = result.scalars().all()

    groups: dict[str, list[DatasetResponse]] = {}
    for d in datasets:
        groups.setdefault(d.batch_name, []).append(_to_response(d))

    batches = []
    for batch_name, children in groups.items():
        batch_date = children[0].created_at[:10] if children else ""
        status = "未标注"
        for c in children:
            if c.stage == "val": status = "已完成"
            elif c.stage == "train" and status != "已完成": status = "已训练"
            elif c.stage == "labeled" and status not in ("已完成", "已训练"): status = "已标注"
        batches.append(BatchGroup(batch_name=batch_name, batch_date=batch_date, status=status, children=children))

    return batches


# ── File listing ──

@router.get("/{dataset_id}/files")
async def list_dataset_files(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List actual files in a dataset stage."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds: raise HTTPException(404, "数据集不存在")

    files = list_stage_files(ds.project_id, ds.batch_name, ds.stage)
    return {"dataset": _to_response(ds), "files": files}


@router.get("/{dataset_id}/images")
async def list_dataset_images(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List image paths in a dataset stage."""
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds: raise HTTPException(404, "数据集不存在")

    images = list_stage_images(ds.project_id, ds.batch_name, ds.stage)
    return {"dataset": _to_response(ds), "images": images[:200], "total": len(images)}


# ── Image serving ──

@router.get("/{dataset_id}/image/{filename:path}")
async def serve_image(
    dataset_id: int,
    filename: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve an actual image file from disk. No auth needed — images load via <img> tags."""
    from fastapi.responses import FileResponse
    from urllib.parse import unquote
    filename = unquote(filename)  # decode %2F → /
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds: raise HTTPException(404, "数据集不存在")

    stage_dir = get_stage_dir(ds.project_id, ds.batch_name, ds.stage)
    file_path = stage_dir / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(404, "文件不存在")
    return FileResponse(str(file_path))


# ── Upload ──

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_files(
    project_id: int = Form(...),
    stage: str = Form("raw_videos"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    files: list[UploadFile] = File(...),
):
    if not files: raise HTTPException(400, "请选择文件")

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%Y%m%d")
    time_suffix = now.strftime("%H%M%S")
    batch_name = f"上传批次_{date_str}_{time_suffix}"
    stage_label = STAGE_LABELS.get(stage, f"{stage}/")

    # Save files to disk
    saved = save_uploaded_files(project_id, batch_name, stage, files)
    file_count = len(saved)
    total_size = sum(f["size"] for f in saved)
    vcount = sum(1 for f in saved if f["name"].lower().endswith(('.mp4','.avi','.mov','.mkv','.wmv','.flv','.webm')))
    icount = file_count - vcount
    size_parts = []
    if vcount: size_parts.append(f"{vcount} 个视频")
    if icount: size_parts.append(f"{icount} 张图片")
    size_label = f"{file_count} 个文件（{' + '.join(size_parts)}）" if size_parts else f"{file_count} 个文件"

    dataset = Dataset(
        project_id=project_id, batch_name=batch_name, stage=stage,
        stage_label=stage_label, file_count=file_count, size_label=size_label,
        status="已完成", sort_order=STAGE_ORDER.get(stage, 0),
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    return _to_response(dataset)


# ── Delete ──

@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_dataset(
    dataset_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds: raise HTTPException(404, "数据集不存在")

    # Delete downstream stages from disk
    for stage_key, order in STAGE_ORDER.items():
        if order >= ds.sort_order:
            delete_stage_dir(ds.project_id, ds.batch_name, stage_key)

    # Delete from DB
    await db.execute(delete(Dataset).where(
        Dataset.project_id == ds.project_id,
        Dataset.batch_name == ds.batch_name,
        Dataset.sort_order >= ds.sort_order,
    ))
    await db.commit()


# ── Process ──

class ProcessRequest(BaseModel):
    action: str  # "extract" | "dedup" | "label" | "split" | "check_extract" | "check_dedup"
    mode: str = "interval"           # "interval" (by frame) | "time" (by seconds)
    interval_value: float = 30       # 30 frames or 5 seconds
    quality: int = 85                # JPEG quality 70/85/95
    similarity_threshold: float = 0.95
    train_ratio: float = 0.7


@router.post("/{dataset_id}/process")
async def process_dataset(
    dataset_id: int,
    req: ProcessRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Dataset).where(Dataset.id == dataset_id))
    ds = result.scalar_one_or_none()
    if not ds: raise HTTPException(404, "数据集不存在")

    project_id = ds.project_id
    batch_name = ds.batch_name
    now = datetime.now(timezone.utc)

    if req.action == "extract":
        # Check for video files on disk
        source_files = list_stage_files(project_id, batch_name, "raw_videos")
        video_files = [f for f in source_files if f["type"] == "video"]
        if not video_files:
            # Return info that there are no videos
            return {"status": "no_videos", "message": "没有视频文件可抽帧"}
        # Start extraction in background thread
        start_extract(project_id, batch_name, dataset_id, req.mode, req.interval_value, req.quality)
        return {"status": "started", "message": f"开始抽帧，共 {len(video_files)} 个视频文件"}

    elif req.action == "dedup":
        start_dedup(project_id, batch_name, dataset_id, req.similarity_threshold)
        return {"status": "started", "message": "开始去重"}

    elif req.action == "label":
        return {"status": "ok", "message": "标注任务已创建"}

    elif req.action == "split":
        import random, shutil
        from app.models.label import Label
        from pathlib import Path

        source_dir = get_stage_dir(project_id, batch_name, "labeled")
        train_img_dir = get_stage_dir(project_id, batch_name, "train") / "images"
        train_lbl_dir = get_stage_dir(project_id, batch_name, "train") / "labels"
        val_img_dir = get_stage_dir(project_id, batch_name, "val") / "images"
        val_lbl_dir = get_stage_dir(project_id, batch_name, "val") / "labels"

        for d in [train_img_dir, train_lbl_dir, val_img_dir, val_lbl_dir]:
            d.mkdir(parents=True, exist_ok=True)

        img_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.jfif'}
        # Collect images from labeled/
        all_images = []
        if source_dir.exists():
            for f in source_dir.rglob("*"):
                if f.is_file() and f.suffix.lower() in img_exts:
                    txt_path = f.parent / "labels" / (f.stem + ".txt")
                    all_images.append({"img": f, "txt": txt_path if txt_path.exists() else None})

        random.seed(42)
        random.shuffle(all_images)
        split_idx = int(len(all_images) * req.train_ratio)
        train_items = all_images[:split_idx]
        val_items = all_images[split_idx:]

        for item in train_items:
            shutil.copy2(str(item["img"]), str(train_img_dir / item["img"].name))
            if item["txt"]: shutil.copy2(str(item["txt"]), str(train_lbl_dir / item["txt"].name))
        for item in val_items:
            shutil.copy2(str(item["img"]), str(val_img_dir / item["img"].name))
            if item["txt"]: shutil.copy2(str(item["txt"]), str(val_lbl_dir / item["txt"].name))

        # Get label names for data.yaml
        lbl_result = await db.execute(select(Label).where(Label.project_id == project_id))
        labels = lbl_result.scalars().all()
        names = [l.name.split("/")[0].strip() for l in labels] if labels else ["object"]

        yaml_path = get_stage_dir(project_id, batch_name, "val").parent / "data.yaml"
        yaml_path.write_text(f"train: train/images\nval: val/images\nnc: {len(names)}\nnames: {names}\n")

        train_ds = Dataset(project_id=project_id, batch_name=batch_name, stage="train",
                           stage_label="train/", file_count=len(train_items),
                           size_label=f"{len(train_items)} 张 + 标签", status="已完成", sort_order=4)
        val_ds = Dataset(project_id=project_id, batch_name=batch_name, stage="val",
                         stage_label="val/", file_count=len(val_items),
                         size_label=f"{len(val_items)} 张 + 标签", status="已完成", sort_order=5)
        db.add_all([train_ds, val_ds])
        await db.commit()
        return {"status": "completed", "train": len(train_items), "val": len(val_items)}

    elif req.action == "check_extract":
        progress = get_extract_progress(dataset_id)
        if progress is None: return {"status": "unknown"}
        # If extraction just completed, create the DB record
        if progress.get("status") == "completed":
            total = get_stage_image_count(project_id, batch_name, "extracted")
            subfolder_count = progress.get("subfolder_count", 0)
            # Check if DB record already exists
            existing = await db.execute(
                select(Dataset).where(Dataset.project_id == project_id,
                                       Dataset.batch_name == batch_name,
                                       Dataset.stage == "extracted")
            )
            if not existing.scalar_one_or_none():
                ds = Dataset(project_id=project_id, batch_name=batch_name, stage="extracted",
                             stage_label="extracted_frames/", file_count=total,
                             size_label=f"{total} 张 · {subfolder_count} 个子文件夹",
                             status="已完成", sort_order=1)
                db.add(ds)
                await db.commit()
        return progress

    elif req.action == "check_dedup":
        progress = get_dedup_progress(dataset_id)
        if progress is None: return {"status": "unknown"}
        if progress.get("status") == "completed":
            total = progress.get("kept", 0)
            dedup_rate = progress.get("dedup_rate", 0)
            existing = await db.execute(
                select(Dataset).where(Dataset.project_id == project_id,
                                       Dataset.batch_name == batch_name,
                                       Dataset.stage == "deduplicated")
            )
            if not existing.scalar_one_or_none():
                ds = Dataset(project_id=project_id, batch_name=batch_name, stage="deduplicated",
                             stage_label="deduplicated/", file_count=total,
                             size_label=f"{total} 张 · 已去重 {dedup_rate}%",
                             status="已完成", sort_order=2)
                db.add(ds)
                await db.commit()
        return progress

    else:
        raise HTTPException(400, f"Unknown action: {req.action}")
