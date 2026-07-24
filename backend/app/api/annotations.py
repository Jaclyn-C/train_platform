from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.annotation import Annotation
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(prefix="/annotations", tags=["标注"])


class AnnotationItem(BaseModel):
    id: int | None = None
    label_id: int
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    confidence: float | None = None
    is_auto: bool = False


class SaveRequest(BaseModel):
    dataset_id: int
    image_index: int
    annotations: list[AnnotationItem]


class AnnotationItemResponse(BaseModel):
    id: int
    dataset_id: int
    image_index: int
    label_id: int
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    confidence: float | None
    is_auto: bool

    model_config = {"from_attributes": True}


def _to_response(a: Annotation) -> AnnotationItemResponse:
    return AnnotationItemResponse(
        id=a.id,
        dataset_id=a.dataset_id,
        image_index=a.image_index,
        label_id=a.label_id,
        bbox_x=a.bbox_x,
        bbox_y=a.bbox_y,
        bbox_w=a.bbox_w,
        bbox_h=a.bbox_h,
        confidence=a.confidence,
        is_auto=a.is_auto,
    )


@router.get("/{dataset_id}/{image_index}", response_model=list[AnnotationItemResponse])
async def get_annotations(
    dataset_id: int,
    image_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Annotation)
        .where(Annotation.dataset_id == dataset_id, Annotation.image_index == image_index)
        .order_by(Annotation.id)
    )
    return [_to_response(a) for a in result.scalars().all()]


@router.post("/save", response_model=list[AnnotationItemResponse])
async def save_annotations(
    req: SaveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Replace all annotations for one image."""
    # Delete existing
    await db.execute(
        delete(Annotation).where(
            Annotation.dataset_id == req.dataset_id,
            Annotation.image_index == req.image_index,
        )
    )
    # Insert new
    saved = []
    for item in req.annotations:
        a = Annotation(
            dataset_id=req.dataset_id,
            image_index=req.image_index,
            label_id=item.label_id,
            bbox_x=item.bbox_x,
            bbox_y=item.bbox_y,
            bbox_w=item.bbox_w,
            bbox_h=item.bbox_h,
            confidence=item.confidence,
            is_auto=item.is_auto,
        )
        db.add(a)
        saved.append(a)
    await db.commit()
    return [_to_response(a) for a in saved]
