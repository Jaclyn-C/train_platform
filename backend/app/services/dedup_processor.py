"""
Image deduplication — real processing using imagehash + OpenCV.
Based on project_root/警卫/scripts/remove_duplicates.py
"""

import os
import shutil
import threading
from pathlib import Path

from app.services.file_storage import get_stage_dir, get_stage_image_count


_dedup_progress: dict[int, dict] = {}
_dedup_lock = threading.Lock()


def get_dedup_progress(job_id: int) -> dict | None:
    with _dedup_lock:
        return _dedup_progress.get(job_id)


def _update(job_id: int, **kwargs):
    with _dedup_lock:
        if job_id not in _dedup_progress:
            _dedup_progress[job_id] = {}
        _dedup_progress[job_id].update(kwargs)


def deduplicate_images(
    project_id: int,
    batch_name: str,
    source_dataset_id: int,
    similarity_threshold: float = 0.95,
):
    """
    Remove duplicate/similar images, copying unique ones to the deduplicated stage.
    Uses the same algorithm as remove_duplicates.py:
    - imagehash (ahash + phash + dhash + whash)
    - cv2.matchTemplate for pixel-level comparison
    """
    import cv2
    import numpy as np
    from PIL import Image, ImageFile
    import imagehash
    from itertools import combinations

    ImageFile.LOAD_TRUNCATED_IMAGES = True

    source_dir = get_stage_dir(project_id, batch_name, "extracted")
    output_dir = get_stage_dir(project_id, batch_name, "deduplicated")

    if not source_dir.exists():
        _update(source_dataset_id, status="failed", error="抽帧目录不存在，请先执行抽帧")
        return

    _update(source_dataset_id, status="running")

    # Collect all images
    img_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    images = []
    for f in sorted(source_dir.rglob("*")):
        if f.is_file() and f.suffix.lower() in img_exts:
            images.append({"path": str(f), "filename": f.name, "parent": f.parent.name})

    total = len(images)
    _update(source_dataset_id, total=total, processed=0, removed=0)

    # Calculate hashes
    image_data = []
    for img in images:
        try:
            with Image.open(img["path"]) as pil_img:
                if pil_img.mode != 'RGB':
                    pil_img = pil_img.convert('RGB')
                hashes = {
                    'ahash': imagehash.average_hash(pil_img),
                    'phash': imagehash.phash(pil_img),
                    'dhash': imagehash.dhash(pil_img),
                    'whash': imagehash.whash(pil_img),
                }
            image_data.append({**img, "hashes": hashes})
        except Exception:
            continue

    _update(source_dataset_id, valid=len(image_data))

    # Compare
    to_skip: set[str] = set()
    to_preserve: set[str] = set()

    for i, (a, b) in enumerate(combinations(image_data, 2)):
        if a["filename"] in to_skip or b["filename"] in to_skip:
            continue

        # Check if all 4 hashes are identical
        identical = all(a["hashes"][k] == b["hashes"][k] for k in ['ahash', 'phash', 'dhash', 'whash'])
        if identical:
            mt_a = os.path.getmtime(a["path"])
            mt_b = os.path.getmtime(b["path"])
            keep = a if mt_a < mt_b else b
            discard = b if keep is a else a
            to_skip.add(discard["filename"])
            to_preserve.add(keep["filename"])
            continue

        # Hash similarity check
        hash_sim = sum(a["hashes"][k] - b["hashes"][k] < 5 for k in ['ahash', 'phash', 'dhash', 'whash']) / 4
        if hash_sim > 0:
            try:
                pil_a = Image.open(a["path"]).convert('RGB')
                pil_b = Image.open(b["path"]).convert('RGB')
                arr_a = np.array(pil_a.resize((256, 256)))
                arr_b = np.array(pil_b.resize((256, 256)))
                if len(arr_a.shape) == 3:
                    arr_a = cv2.cvtColor(arr_a, cv2.COLOR_RGB2GRAY)
                if len(arr_b.shape) == 3:
                    arr_b = cv2.cvtColor(arr_b, cv2.COLOR_RGB2GRAY)
                similarity = cv2.matchTemplate(arr_a, arr_b, cv2.TM_CCOEFF_NORMED)[0][0]
                if similarity >= similarity_threshold:
                    mt_a = os.path.getmtime(a["path"])
                    mt_b = os.path.getmtime(b["path"])
                    keep = a if mt_a < mt_b else b
                    discard = b if keep is a else a
                    to_skip.add(discard["filename"])
                    to_preserve.add(keep["filename"])
            except Exception:
                pass

    # Everything not skipped is preserved
    for img in image_data:
        if img["filename"] not in to_skip:
            to_preserve.add(img["filename"])

    # Copy preserved images to output
    output_dir.mkdir(parents=True, exist_ok=True)
    copied = 0
    for img in image_data:
        if img["filename"] in to_preserve:
            dest = output_dir / img["filename"]
            counter = 1
            while dest.exists():
                name, ext = os.path.splitext(img["filename"])
                dest = output_dir / f"{name}_{counter}{ext}"
                counter += 1
            shutil.copy2(img["path"], str(dest))
            copied += 1

    removed = total - copied
    dedup_rate = round(removed / total * 100, 1) if total > 0 else 0
    _update(source_dataset_id, status="completed", total=total, kept=copied,
            removed=removed, dedup_rate=dedup_rate)


def start_dedup(project_id: int, batch_name: str, source_dataset_id: int,
                similarity_threshold: float = 0.95):
    _update(source_dataset_id, status="starting")
    t = threading.Thread(
        target=deduplicate_images,
        args=(project_id, batch_name, source_dataset_id, similarity_threshold),
        daemon=True,
    )
    t.start()
    return t
