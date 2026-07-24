from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.core.database import get_db
from app.models.team import Team
from app.models.user import User
from app.api.auth import get_current_user

router = APIRouter(prefix="/teams", tags=["团队"])


class CreateTeamRequest(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: int
    name: str
    owner_id: int
    created_at: str


def _to_response(t: Team) -> TeamResponse:
    return TeamResponse(
        id=t.id,
        name=t.name,
        owner_id=t.owner_id,
        created_at=t.created_at.isoformat(),
    )


@router.get("", response_model=list[TeamResponse])
async def list_teams(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Team).order_by(Team.id))
    teams = result.scalars().all()
    return [_to_response(t) for t in teams]


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    request: CreateTeamRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    team = Team(name=request.name, owner_id=current_user.id)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return _to_response(team)
