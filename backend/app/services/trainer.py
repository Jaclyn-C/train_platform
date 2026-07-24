"""
Real YOLO training service.
Runs ultralytics YOLO training in a background thread, streams progress to a shared state dict.
"""

import json
import threading
import time
from pathlib import Path
from datetime import datetime, timezone

import torch
from ultralytics import YOLO

# In-memory store for running/pending jobs: {job_id: {status, progress, ...}}
_jobs_store: dict[int, dict] = {}
_store_lock = threading.Lock()

MODELS_DIR = Path("storage/models")
DATASETS_DIR = Path("storage/datasets")


def _get_device(device_str: str) -> str:
    """Normalize device string."""
    if device_str == "mps" and torch.backends.mps.is_available():
        return "mps"
    if device_str == "mps":
        return "cpu"  # fallback
    if device_str == "cpu":
        return "cpu"
    # cuda:0 etc — pass through
    return device_str


def _on_train_epoch(trainer_obj):
    """Ultralytics callback — fired after each epoch."""
    job_id = getattr(trainer_obj, "_job_id", None)
    if job_id is None:
        return

    epoch = trainer_obj.epoch + 1
    total = trainer_obj.epochs
    metrics = {
        "epoch": epoch,
        "total": total,
        "progress": round(epoch / total * 100, 1),
        "box_loss": round(float(trainer_obj.loss_items[0, 0]) if hasattr(trainer_obj, "loss_items") else 0, 4),
        "cls_loss": round(float(trainer_obj.loss_items[0, 1]) if hasattr(trainer_obj, "loss_items") else 0, 4),
        "dfl_loss": round(float(trainer_obj.loss_items[0, 2]) if hasattr(trainer_obj, "loss_items") else 0, 4),
    }
    with _store_lock:
        if job_id in _jobs_store:
            _jobs_store[job_id].update(metrics)
            _jobs_store[job_id]["logs"] = _jobs_store[job_id].get("logs", []) + [
                f"Epoch {epoch}/{total}  box={metrics['box_loss']:.4f} cls={metrics['cls_loss']:.4f} dfl={metrics['dfl_loss']:.4f}"
            ]


def get_job_status(job_id: int) -> dict | None:
    with _store_lock:
        return _jobs_store.get(job_id)


def run_training(job_id: int, config: dict):
    """
    Run YOLO training in the current thread.
    Call this via thread.start() with the job written to DB already.
    """
    device_str = config.get("device", "mps")
    device = _get_device(device_str)
    epochs = config.get("epochs", 100)
    batch = config.get("batch", 16)
    imgsz = config.get("imgsz", 640)
    model_name = config.get("model", "yolo11m.pt")
    optimizer = config.get("optimizer", "AdamW")
    lr0 = config.get("lr0", 0.001)
    lrf = config.get("lrf", 0.01)
    amp = config.get("amp", True)
    workers = config.get("workers", 4)

    # --- Build dataset YAML ---
    project_id = config.get("project_id")
    dataset_yaml = _build_dataset_yaml(project_id)
    if not dataset_yaml or not dataset_yaml.exists():
        # Fallback to coco128 demo dataset for testing
        _jobs_store[job_id] = _jobs_store.get(job_id, {})
        _jobs_store[job_id]["logs"] = _jobs_store[job_id].get("logs", []) + [
            "No project data found, using coco128 demo dataset for testing",
            "Upload your own data for real training"
        ]
        dataset_yaml = Path("coco128.yaml")  # ultralytics will auto-download

    # --- Update state ---
    with _store_lock:
        _jobs_store[job_id] = {
            "status": "running",
            "progress": 0,
            "current_epoch": 0,
            "total_epochs": epochs,
            "logs": [f"Starting training: {model_name}, epochs={epochs}, batch={batch}, device={device}"],
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

    # --- Train ---
    try:
        model = YOLO(model_name)
        # Attach job_id for callback
        model.add_callback("on_train_epoch_end", _on_train_epoch)
        # Store job_id on the trainer after model.train() kicks off
        original_train = model.train

        def training_wrapper(**kwargs):
            result = original_train(**kwargs)
            return result

        # We need to inject job_id before training starts — use on_train_start callback
        def _on_train_start(trainer_obj):
            trainer_obj._job_id = job_id

        model.add_callback("on_train_start", _on_train_start)

        results = model.train(
            data=str(dataset_yaml),
            epochs=epochs,
            batch=batch,
            imgsz=imgsz,
            device=device,
            optimizer=optimizer,
            lr0=lr0,
            lrf=lrf,
            amp=amp,
            workers=workers,
            project=str(MODELS_DIR),
            name=f"project_{project_id}",
            exist_ok=True,
            verbose=False,
        )

        # --- Done ---
        final_metrics = {
            "mAP50": round(float(results.results_dict.get("metrics/mAP50(B)", 0)), 4),
            "mAP50-95": round(float(results.results_dict.get("metrics/mAP50-95(B)", 0)), 4),
            "precision": round(float(results.results_dict.get("metrics/precision(B)", 0)), 4),
            "recall": round(float(results.results_dict.get("metrics/recall(B)", 0)), 4),
        }
        weight_path = Path(results.save_dir) / "weights" / "best.pt"

        with _store_lock:
            _jobs_store[job_id].update({
                "status": "completed",
                "progress": 100,
                "current_epoch": epochs,
                "metrics": final_metrics,
                "weight_path": str(weight_path),
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "logs": _jobs_store[job_id].get("logs", []) + [
                    f"Training complete! mAP50={final_metrics['mAP50']} mAP50-95={final_metrics['mAP50-95']}"
                ],
            })

    except Exception as e:
        _fail_job(job_id, str(e))


def _fail_job(job_id: int, error: str):
    with _store_lock:
        _jobs_store[job_id] = _jobs_store.get(job_id, {})
        _jobs_store[job_id].update({
            "status": "failed",
            "error": error,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "logs": _jobs_store[job_id].get("logs", []) + [f"ERROR: {error}"],
        })


def _build_dataset_yaml(project_id: int) -> Path | None:
    """
    Build a YOLO-format data.yaml from the train/val datasets for the given project.
    Returns the path to the yaml file, or None if data is missing.
    """
    from app.core.database import async_session
    from app.models.dataset import Dataset
    from app.models.label import Label
    from sqlalchemy import select
    import asyncio

    async def _query():
        async with async_session() as db:
            datasets = (await db.execute(
                select(Dataset).where(Dataset.project_id == project_id)
            )).scalars().all()

            train_ds = [d for d in datasets if d.stage == "train"]
            val_ds = [d for d in datasets if d.stage == "val"]
            if not train_ds:
                return None

            labels = (await db.execute(
                select(Label).where(Label.project_id == project_id)
            )).scalars().all()

            label_names = [l.name.split("/")[0].strip() for l in labels]
            if not label_names:
                label_names = ["object"]

            yaml_path = Path(f"storage/datasets/project_{project_id}/data.yaml")
            yaml_path.parent.mkdir(parents=True, exist_ok=True)
            yaml_path.write_text(
                f"path: {yaml_path.parent.absolute()}\n"
                f"train: train/images\n"
                f"val: val/images\n"
                f"nc: {len(label_names)}\n"
                f"names: {label_names}\n"
            )
            return yaml_path

    try:
        return asyncio.run(_query())
    except Exception:
        return None
