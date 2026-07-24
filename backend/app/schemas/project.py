from pydantic import BaseModel


# ── Request schemas ──

class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
    park: str = "ganzhou"
    task_type: str = "detection"


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    park: str | None = None
    task_type: str | None = None


class ShareProjectRequest(BaseModel):
    team_id: int | None = None


# ── Response schemas ──

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str
    park: str
    task_type: str
    is_personal: bool
    created_by: int
    team_id: int | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    personal: list[ProjectResponse]
    shared: list[ProjectResponse]
