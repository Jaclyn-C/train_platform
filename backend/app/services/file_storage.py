"""
Real file storage service.
Organizes files on disk: storage/projects/{project_id}/{batch_name}/{stage}/
"""

import os
import shutil
from pathlib import Path
from datetime import datetime, timezone

STORAGE_ROOT = Path("storage")
PROJECTS_DIR = STORAGE_ROOT / "projects"


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_stage_dir(project_id: int, batch_name: str, stage: str) -> Path:
    """Get the disk path for a specific stage in a batch."""
    return PROJECTS_DIR / str(project_id) / batch_name / stage


def save_uploaded_files(
    project_id: int,
    batch_name: str,
    stage: str,
    files: list,  # list of UploadFile from FastAPI
) -> list[dict]:
    """Save uploaded files to disk. Returns list of {name, size, path}."""
    stage_dir = ensure_dir(get_stage_dir(project_id, batch_name, stage))
    saved = []
    for f in files:
        file_path = stage_dir / f.filename
        with open(file_path, "wb") as dst:
            f.file.seek(0)
            shutil.copyfileobj(f.file, dst)
        file_size = file_path.stat().st_size
        saved.append({"name": f.filename, "size": file_size, "path": str(file_path)})
    return saved


def list_stage_files(project_id: int, batch_name: str, stage: str) -> list[dict]:
    """List files in a stage directory with metadata."""
    stage_dir = get_stage_dir(project_id, batch_name, stage)
    if not stage_dir.exists():
        return []

    files = []
    for entry in sorted(stage_dir.iterdir()):
        if entry.is_file():
            fname = entry.name
            fsize = entry.stat().st_size
            ftype = "video" if fname.lower().endswith(('.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm')) else "image" if fname.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.jfif')) else "file"
            files.append({"name": fname, "size": fsize, "size_label": format_size(fsize), "type": ftype})
        elif entry.is_dir() and stage in ("extracted", "deduplicated"):
            # Count images in subfolder
            imgs = list(entry.glob("*.jpg")) + list(entry.glob("*.jpeg")) + list(entry.glob("*.png"))
            files.append({"name": entry.name, "size": 0, "size_label": f"{len(imgs)} 张图片", "type": "folder"})
    return files


def list_stage_images(project_id: int, batch_name: str, stage: str) -> list[str]:
    """List image paths (relative) in a stage directory, recursing into subdirs."""
    stage_dir = get_stage_dir(project_id, batch_name, stage)
    if not stage_dir.exists():
        return []

    img_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.jfif'}
    images = []
    for f in sorted(stage_dir.rglob("*")):
        if f.is_file() and f.suffix.lower() in img_exts:
            images.append(str(f.relative_to(stage_dir)))
    return images


def get_stage_image_count(project_id: int, batch_name: str, stage: str) -> int:
    """Count total images in a stage (recursive)."""
    stage_dir = get_stage_dir(project_id, batch_name, stage)
    if not stage_dir.exists():
        return 0
    img_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.jfif'}
    return sum(1 for f in stage_dir.rglob("*") if f.is_file() and f.suffix.lower() in img_exts)


def delete_stage_dir(project_id: int, batch_name: str, stage: str):
    """Delete a stage directory and all its contents."""
    stage_dir = get_stage_dir(project_id, batch_name, stage)
    if stage_dir.exists():
        shutil.rmtree(stage_dir)


def delete_batch_dir(project_id: int, batch_name: str):
    """Delete an entire batch directory."""
    batch_dir = PROJECTS_DIR / str(project_id) / batch_name
    if batch_dir.exists():
        shutil.rmtree(batch_dir)


def format_size(bytes_val: int) -> str:
    if bytes_val < 1048576:
        return f"{bytes_val / 1024:.1f} KB"
    return f"{bytes_val / 1048576:.1f} MB"
