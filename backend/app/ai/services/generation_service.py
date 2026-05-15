"""
ApeAI — Generation Service

Orchestrates Gemini AI to generate structured product documents.
Enforces JSON output for all stages.
"""

import logging
import json
from typing import Dict, Any, List

from backend.app.ai.gemini_client import gemini_client
from backend.app.ai.prompts import (
    CLUSTER_SUMMARY_PROMPT,
    BRD_PROMPT,
    PRD_PROMPT,
    STORY_PROMPT,
    TASK_PROMPT
)
from backend.app.db.supabase_client import get_supabase_client
from backend.app.services.cluster_service import get_cluster, update_cluster
from backend.app.services.document_service import create_document

logger = logging.getLogger(__name__)

async def summarize_cluster(cluster_id: str) -> Dict[str, Any]:
    """Analyze all feedback in a cluster and generate a summary."""
    cluster = await get_cluster(cluster_id, include_feedback=True)
    feedback_items = cluster.get("feedback_items", [])
    
    if not feedback_items:
        raise ValueError("No feedback items found in cluster")

    feedback_text = "\n".join([
        f"- {f['content']} (Source: {f['source']})" 
        for f in feedback_items
    ])
    
    prompt = CLUSTER_SUMMARY_PROMPT.format(feedback_text=feedback_text)
    
    # Use Flash for summarization
    model = gemini_client.get_model(model_type="flash", json_mode=True)
    response = await model.generate_content_async(prompt)
    
    data = json.loads(response.text)
    
    # Update cluster with AI-generated title and summary
    await update_cluster(
        cluster_id,
        title=data["title"],
        summary=data["summary"],
        status="clustered",
        confidence_score=95.0 # Example score
    )
    
    return data

async def generate_brd(cluster_id: str) -> Dict[str, Any]:
    """Generate a BRD from a cluster summary."""
    cluster = await get_cluster(cluster_id, include_feedback=False)
    summary = cluster.get("summary")
    
    if not summary:
        raise ValueError("Cluster must be summarized before generating BRD")

    prompt = BRD_PROMPT.format(cluster_summary=summary)
    
    # Use Pro for BRD reasoning
    model = gemini_client.get_model(model_type="pro", json_mode=True)
    response = await model.generate_content_async(prompt)
    
    data = json.loads(response.text)
    
    # Save as a document
    doc = await create_document(
        cluster_id=cluster_id,
        doc_type="brd",
        title=data["title"],
        content=data
    )
    
    # Update cluster status
    await update_cluster(cluster_id, status="brd_generated")
    
    return doc

async def generate_prd(cluster_id: str, brd_id: str) -> Dict[str, Any]:
    """Generate a PRD based on an existing BRD."""
    from backend.app.services.document_service import get_document
    brd = await get_document(brd_id)
    
    prompt = PRD_PROMPT.format(brd_content=json.dumps(brd["content"]))
    
    model = gemini_client.get_model(model_type="pro", json_mode=True)
    response = await model.generate_content_async(prompt)
    
    data = json.loads(response.text)
    
    doc = await create_document(
        cluster_id=cluster_id,
        doc_type="prd",
        title=data["title"],
        content=data,
        parent_id=brd_id
    )
    
    await update_cluster(cluster_id, status="prd_generated")
    return doc

async def generate_stories(cluster_id: str, prd_id: str) -> List[Dict[str, Any]]:
    """Generate user stories from a PRD."""
    from backend.app.services.document_service import get_document
    prd = await get_document(prd_id)
    
    prompt = STORY_PROMPT.format(prd_content=json.dumps(prd["content"]))
    
    model = gemini_client.get_model(model_type="pro", json_mode=True)
    response = await model.generate_content_async(prompt)
    
    stories_data = json.loads(response.text)
    
    created_stories = []
    for story in stories_data:
        doc = await create_document(
            cluster_id=cluster_id,
            doc_type="story",
            title=story["title"],
            content=story,
            parent_id=prd_id
        )
        created_stories.append(doc)
    
    await update_cluster(cluster_id, status="stories_generated")
    return created_stories

async def generate_tasks(cluster_id: str, story_id: str) -> Dict[str, Any]:
    """Generate technical tasks for a specific story."""
    from backend.app.services.document_service import get_document
    story = await get_document(story_id)
    
    prompt = TASK_PROMPT.format(story_content=json.dumps(story["content"]))
    
    model = gemini_client.get_model(model_type="flash", json_mode=True)
    response = await model.generate_content_async(prompt)
    
    data = json.loads(response.text)
    
    doc = await create_document(
        cluster_id=cluster_id,
        doc_type="task",
        title=f"Technical Tasks: {story['title']}",
        content=data,
        parent_id=story_id
    )
    
    # Note: We only update cluster status if this was the last story or similar logic
    # but for now we'll just return it.
    return doc
