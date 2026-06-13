"""FastAPI application entry (SPEC §6).

Lifespan: ensure dirs, init + reconcile the index, start the scheduler. All
routers mounted under ``/api``. CORS open to ``*`` (backend
binds loopback only; run.py controls the host).
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db, paths, runner, scheduler
from .routes import executions, settings, tasks, triggers, workflows


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    paths.ensure_dirs()
    db.init_db()
    db.reconcile()
    # Finalize runs orphaned by an abrupt shutdown before the scheduler can fire
    # or the API can accept new runs — a fresh process owns no live run, so any
    # on-disk 'running'/'queued' execution is an orphan (SPEC §6).
    runner.recover_orphans()
    scheduler.start()
    try:
        yield
    finally:
        scheduler.stop()


app = FastAPI(title="worker-forge", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(workflows.router, prefix="/api")
app.include_router(triggers.wf_router, prefix="/api")
app.include_router(triggers.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(executions.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
