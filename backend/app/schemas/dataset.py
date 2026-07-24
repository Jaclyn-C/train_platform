from pydantic import BaseModel


class DatasetResponse(BaseModel):
    id: int
    project_id: int
    batch_name: str
    stage: str
    stage_label: str
    file_count: int
    size_label: str
    status: str
    auto_status: str
    sort_order: int
    created_at: str

    model_config = {"from_attributes": True}


# Grouped by batch
class BatchGroup(BaseModel):
    batch_name: str
    batch_date: str
    status: str
    children: list[DatasetResponse]
