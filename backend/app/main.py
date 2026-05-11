"""
ApeAI — FastAPI Application Entry Point

This is the main file that:
  - Creates the FastAPI app instance
  - Mounts all route modules
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
from backend.app.routes import manual, github, email
from backend.app.routes.slack import start_slack_listener, stop_slack_listener
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
    logger.info("🦍 ApeAI Ingestion Layer — Starting up")
    logger.info("=" * 60)

    # Report configuration status
    logger.info(f"  Supabase:  {'✅ configured' if settings.supabase_configured else '❌ not configured'}")
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
    title="ApeAI — Ingestion API",
    description=(
        "Layer 1 of the ApeAI Product Operations platform. "
        "Collects feedback from multiple sources (manual, CSV, Slack, "
        "GitHub, email), normalizes it into a unified format, and "
        "stores it in Supabase for downstream AI processing."
    ),
    version="0.1.0",
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


# ─── Mount Route Modules ──────────────────────────────────

app.include_router(manual.router)
app.include_router(github.router)
app.include_router(email.router)


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
        version="0.1.0",
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
        "app": "ApeAI Ingestion API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "manual_feedback": "POST /feedback/manual",
            "csv_upload": "POST /feedback/csv",
            "github_webhook": "POST /feedback/github",
            "email_webhook": "POST /feedback/email",
            "stats": "GET /feedback/stats",
        },
    }
