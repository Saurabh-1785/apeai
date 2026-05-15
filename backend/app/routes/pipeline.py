"""
ApeAI — Pipeline Routes

Endpoints for triggering AI pipeline stages:
- /pipeline/cluster
- /pipeline/summarize/{cluster_id}
- /pipeline/generate-brd/{cluster_id}
- /pipeline/generate-prd/{cluster_id}
- /pipeline/generate-stories/{cluster_id}
- /pipeline/generate-tasks/{story_id}
"""

import logging
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException

from backend.app.ai.services.clustering_service import cluster_unprocessed_feedback
from backend.app.ai.services.generation_service import (
    summarize_cluster,
    generate_brd,
    generate_prd,
    generate_stories,
    generate_tasks
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/pipeline", tags=["AI Pipeline Orchestration"])

@router.post("/cluster", summary="Cluster all unprocessed feedback")
async def api_cluster_feedback():
    """Triggers the iterative clustering logic for all un-clustered feedback."""
    try:
        return await cluster_unprocessed_feedback()
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/summarize/{cluster_id}", summary="Generate AI summary for a cluster")
async def api_summarize_cluster(cluster_id: str):
    """Analyzes feedback in a cluster and updates its title and summary."""
    try:
        return await summarize_cluster(cluster_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Summarization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-brd/{cluster_id}", summary="Generate BRD for a cluster")
async def api_generate_brd(cluster_id: str):
    """Generates a Business Requirements Document based on the cluster summary."""
    try:
        return await generate_brd(cluster_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"BRD generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-prd/{cluster_id}", summary="Generate PRD for a cluster")
async def api_generate_prd(cluster_id: str, brd_id: str):
    """Generates a Product Requirements Document based on a BRD."""
    try:
        return await generate_prd(cluster_id, brd_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"PRD generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-stories/{cluster_id}", summary="Generate User Stories for a cluster")
async def api_generate_stories(cluster_id: str, prd_id: str):
    """Generates Agile User Stories based on a PRD."""
    try:
        return await generate_stories(cluster_id, prd_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Stories generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/generate-tasks/{story_id}", summary="Generate Tasks for a story")
async def api_generate_tasks(cluster_id: str, story_id: str):
    """Breaks down a User Story into technical tasks."""
    try:
        return await generate_tasks(cluster_id, story_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Task generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/status", summary="Full pipeline status")
async def api_pipeline_status():
    """Returns an overview of where all feedback is in the pipeline."""
    # This calls the existing document service helper
    from backend.app.services.document_service import get_pipeline_status
    return await get_pipeline_status()
