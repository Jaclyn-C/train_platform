from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import engine
from sqlmodel import SQLModel
from app.api import auth, projects, teams, datasets, labels, annotations, training

# Import all models so SQLModel.metadata knows about them
from app.models import user, project, team, team_member  # noqa: F401
from app.models.dataset import Dataset  # noqa: F401
from app.models.label import Label  # noqa: F401
from app.models.annotation import Annotation  # noqa: F401
from app.models.training_job import TrainingJob  # noqa: F401

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables. Shutdown: cleanup."""
    # Create all tables on startup (for dev; use Alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(datasets.router, prefix="/api")
app.include_router(labels.router, prefix="/api")
app.include_router(annotations.router, prefix="/api")
app.include_router(training.router, prefix="/api")


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "version": settings.VERSION}
