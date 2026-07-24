from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.core.database import get_db
from app.models.label import Label
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(prefix="/projects/{project_id}/labels", tags=["标签"])


class LabelCreate(BaseModel):
    name: str
    color: str = "#1890ff"


class LabelResponse(BaseModel):
    id: int
    project_id: int
    name: str
    color: str
    shortcut: str

    model_config = {"from_attributes": True}


@router.get("", response_model=list[LabelResponse])
async def list_labels(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Label).where(Label.project_id == project_id).order_by(Label.id)
    )
    return result.scalars().all()


@router.post("", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label(
    project_id: int,
    req: LabelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    label = Label(project_id=project_id, name=req.name, color=req.color)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return label


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    project_id: int,
    label_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Label).where(Label.id == label_id, Label.project_id == project_id)
    )
    await db.commit()
