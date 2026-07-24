"""
Video frame extraction — real processing using imageio.
Supports two modes matching prototype:
  - frame_interval: extract every N frames  (prototype default: 30)
  - time_interval:  extract every N seconds (project_root default: 0.1s)

Based on:
  - prototype/data_center.html (extractMode: interval / time)
  - project_root/警卫/scripts/video_to_frames.py
"""

import threading
from pathlib import Path

from app.services.file_storage import get_stage_dir, get_stage_image_count


_extract_progress: dict[int, dict] = {}
_progress_lock = threading.Lock()


def get_extract_progress(job_id: int) -> dict | None:
    with _progress_lock:
        return _extract_progress.get(job_id)


def _update_progress(job_id: int, **kwargs):
    with _progress_lock:
        if job_id not in _extract_progress:
            _extract_progress[job_id] = {}
        _extract_progress[job_id].update(kwargs)


def extract_frames(
    project_id: int,
    batch_name: str,
    source_dataset_id: int,
    mode: str = "interval",       # "interval" (by frame count) or "time" (by seconds)
    interval_value: float = 30,   # 30 frames, or 5 seconds depending on mode
    quality: int = 85,            # JPEG quality (prototype default: 85)
):
    """Extract frames from all videos in the raw_videos stage. Runs in a background thread."""
    import cv2
    from PIL import Image

    source_dir = get_stage_dir(project_id, batch_name, "raw_videos")
    output_dir = get_stage_dir(project_id, batch_name, "extracted")

    if not source_dir.exists():
        _update_progress(source_dataset_id, status="failed", error="源文件目录不存在")
        return

    video_exts = {'.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'}
    video_files = [f for f in source_dir.iterdir() if f.suffix.lower() in video_exts]
    if not video_files:
        _update_progress(source_dataset_id, status="failed", error="没有找到视频文件")
        return

    _update_progress(source_dataset_id, status="running",
                     total_videos=len(video_files), processed=0,
                     mode=mode, interval_value=interval_value, quality=quality,
                     total_frames=0, extracted=0)

    total_extracted = 0
    for vi, video_path in enumerate(video_files):
        video_name = video_path.stem
        out_subdir = output_dir / video_name
        out_subdir.mkdir(parents=True, exist_ok=True)

        try:
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps <= 0: fps = 30

            if mode == "time":
                frames_per_interval = max(1, int(fps * interval_value))
            else:
                frames_per_interval = max(1, int(interval_value))

            frame_idx = 0
            extracted = 0
            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                if frame_idx % frames_per_interval == 0:
                    current_time = frame_idx / fps
                    frame_filename = out_subdir / f"frame_{extracted:06d}_{current_time:.2f}s.jpg"
                    # OpenCV reads BGR, convert to RGB for PIL
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    img = Image.fromarray(frame_rgb)
                    img.save(str(frame_filename), "JPEG", quality=quality, optimize=True, progressive=True)
                    extracted += 1
                frame_idx += 1

            cap.release()
            total_extracted += extracted
            _update_progress(source_dataset_id, processed=vi + 1,
                           total_frames=total_extracted, extracted=total_extracted,
                           current_video=video_name, last_fps=fps)

        except Exception as e:
            _update_progress(source_dataset_id, error=str(e))
            continue

    # Final stats
    total_imgs = get_stage_image_count(project_id, batch_name, "extracted")
    subfolder_count = len(list(output_dir.iterdir())) if output_dir.exists() else 0

    _update_progress(source_dataset_id, status="completed",
                     extracted=total_imgs, subfolder_count=subfolder_count,
                     total_videos=len(video_files))


def start_extract(project_id: int, batch_name: str, source_dataset_id: int,
                  mode: str = "interval", interval_value: float = 30, quality: int = 85):
    """Start frame extraction in a background thread."""
    _update_progress(source_dataset_id, status="starting")
    t = threading.Thread(
        target=extract_frames,
        args=(project_id, batch_name, source_dataset_id, mode, interval_value, quality),
        daemon=True,
    )
    t.start()
    return t
