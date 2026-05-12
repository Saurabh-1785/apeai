"""
ApeAI — FastAPI Application Entry Point

This is the main file that:
  - Creates the FastAPI app instance
  - Mounts all route modules (Layer 1 + Layer 2)
  - Configures CORS middleware
  - Starts the Slack listener on startup
  - Provides health check and stats endpoints

Run with:
  cd /home/Saurabh/apeai
  source .venv/bin/activate
  uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.db.supabase_client import check_supabase_connection
from backend.app.models.feedback import HealthResponse, StatsResponse

# Layer 1 routes
from backend.app.routes import manual, github, email
from backend.app.routes.slack import start_slack_listener, stop_slack_listener

# Layer 2 routes
from backend.app.routes import embeddings, clusters
from backend.app.routes.documents import (
    doc_router,
    approval_router,
    integration_router,
    ticket_router,
    pipeline_router,
)

from backend.app.services.save_feedback import get_feedback_stats

# ─── Logging Configuration ─────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("apeai")


# ─── Lifecycle Events ──────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    
    Startup: log config status, start Slack listener
    Shutdown: clean up resources
    """
    # ── Startup ──
    logger.info("=" * 60)
    logger.info("🦍 ApeAI — Starting up (Layer 1 + Layer 2)")
    logger.info("=" * 60)

    # Report configuration status
    logger.info(f"  Supabase:  {'✅ configured' if settings.supabase_configured else '❌ not configured'}")
    logger.info(f"  OpenAI:    {'✅ configured' if settings.openai_configured else '⏭️  not configured (needed for embeddings)'}")
    logger.info(f"  Slack:     {'✅ configured' if settings.slack_configured else '⏭️  not configured (optional)'}")
    logger.info(f"  GitHub:    {'✅ configured' if settings.github_configured else '⏭️  not configured (optional)'}")
    logger.info(f"  Email:     ✅ endpoint ready (no config needed)")
    logger.info("-" * 60)

    # Start Slack listener if configured
    if settings.slack_configured:
        start_slack_listener()

    yield

    # ── Shutdown ──
    logger.info("🦍 ApeAI shutting down...")
    stop_slack_listener()


# ─── Create FastAPI App ────────────────────────────────────

app = FastAPI(
    title="ApeAI — Product Operations API",
    description=(
        "ApeAI Product Operations platform API. "
        "Layer 1: Feedback ingestion from multiple sources. "
        "Layer 2: Storage with pgvector embeddings, clusters, "
        "documents, approvals, integrations, and pipeline tracking."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


# ─── CORS Middleware ───────────────────────────────────────
# Allow all origins during development. Restrict in production.

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Global Exception Handler ─────────────────────────────
# Catches unhandled exceptions (e.g., Supabase connection errors)
# and returns proper JSON error responses instead of raw 500s.

from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all for unhandled errors — returns proper JSON."""
    error_msg = str(exc)
    # Connection-related errors → 503 Service Unavailable
    if any(term in error_msg for term in ["Name or service not known", "Connection refused", "ConnectError"]):
        return JSONResponse(
            status_code=503,
            content={"detail": f"Database unavailable: {error_msg}"},
        )
    # Everything else → 500
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {error_msg}"},
    )


# ─── Mount Layer 1 Routes (Ingestion) ─────────────────────


app.include_router(manual.router)
app.include_router(github.router)
app.include_router(email.router)


# ─── Mount Layer 2 Routes (Storage) ───────────────────────

app.include_router(embeddings.router)
app.include_router(clusters.router)
app.include_router(doc_router)
app.include_router(approval_router)
app.include_router(integration_router)
app.include_router(ticket_router)
app.include_router(pipeline_router)


# ─── Core Endpoints ───────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="Health check",
)
async def health_check():
    """
    Check if the API and Supabase connection are healthy.
    
    Returns status of the API and database connection.
    """
    supabase_status = "not_configured"
    if settings.supabase_configured:
        supabase_status = "connected" if check_supabase_connection() else "disconnected"

    return HealthResponse(
        status="ok",
        supabase=supabase_status,
        version="0.2.0",
    )


@app.get(
    "/feedback/stats",
    response_model=StatsResponse,
    tags=["System"],
    summary="Feedback statistics",
)
async def feedback_stats():
    """
    Get total feedback count and breakdown by source.
    
    Useful for the future dashboard to show ingestion metrics.
    """
    stats = await get_feedback_stats()
    return StatsResponse(
        total=stats.get("total", 0),
        by_source=stats.get("by_source", {}),
    )


@app.get(
    "/",
    tags=["System"],
    summary="API root",
)
async def root():
    """Welcome endpoint with links to docs."""
    return {
        "app": "ApeAI Product Operations API",
        "version": "0.2.0",
        "docs": "/docs",
        "health": "/health",
        "layers": {
            "layer_1_ingestion": {
                "manual_feedback": "POST /feedback/manual",
                "csv_upload": "POST /feedback/csv",
                "github_webhook": "POST /feedback/github",
                "email_webhook": "POST /feedback/email",
                "stats": "GET /feedback/stats",
            },
            "layer_2_storage": {
                "embeddings": "/embeddings/*",
                "clusters": "/clusters/*",
                "documents": "/documents/*",
                "approvals": "/approvals/*",
                "integrations": "/integrations/*",
                "ticket_links": "/ticket-links/*",
                "pipeline": "GET /pipeline/status",
            },
        },
    }
