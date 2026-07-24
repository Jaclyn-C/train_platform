from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.models.project import Project
from app.models.user import User
from app.schemas.project import (
    CreateProjectRequest,
    UpdateProjectRequest,
    ShareProjectRequest,
    ProjectResponse,
    ProjectListResponse,
)
from app.api.auth import get_current_user

router = APIRouter(prefix="/projects", tags=["算法管理"])


def project_to_response(p: Project) -> ProjectResponse:
    return ProjectResponse(
        id=p.id,
        name=p.name,
        description=p.description,
        park=p.park,
        task_type=p.task_type,
        is_personal=p.is_personal,
        created_by=p.created_by,
        team_id=p.team_id,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


# ── Personal Projects ──

@router.get("/personal", response_model=list[ProjectResponse])
async def list_personal(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all personal projects for the current user."""
    result = await db.execute(
        select(Project)
        .where(Project.created_by == current_user.id, Project.is_personal == True)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [project_to_response(p) for p in projects]


@router.post("/personal", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_personal(
    request: CreateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new personal project."""
    project = Project(
        name=request.name,
        description=request.description,
        park=request.park,
        task_type=request.task_type,
        is_personal=True,
        created_by=current_user.id,
        team_id=None,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project_to_response(project)


@router.put("/personal/{project_id}", response_model=ProjectResponse)
async def update_personal(
    project_id: int,
    request: UpdateProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a personal project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.created_by == current_user.id,
            Project.is_personal == True,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="算法不存在")

    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    if request.park is not None:
        project.park = request.park
    if request.task_type is not None:
        project.task_type = request.task_type

    await db.commit()
    await db.refresh(project)
    return project_to_response(project)


@router.delete("/personal/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_personal(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a personal project."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.created_by == current_user.id,
            Project.is_personal == True,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="算法不存在")
    await db.delete(project)
    await db.commit()


# ── Share / Unshare ──

@router.put("/personal/{project_id}/share", response_model=ProjectResponse)
async def share_project(
    project_id: int,
    request: ShareProjectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Share a personal project to a team, or unshare (team_id=0 or null)."""
    result = await db.execute(
        select(Project).where(
            Project.id == project_id,
            Project.created_by == current_user.id,
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="算法不存在")

    project.team_id = request.team_id
    await db.commit()
    await db.refresh(project)
    return project_to_response(project)


# ── Team Projects ──

@router.get("/team", response_model=list[ProjectResponse])
async def list_team(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all team-shared projects visible to the current user."""
    # For now, return all projects that have a team_id set
    result = await db.execute(
        select(Project)
        .where(Project.team_id != None)
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [project_to_response(p) for p in projects]


# ── Single Project by ID ──

@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single project by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="算法不存在")
    return project_to_response(project)
