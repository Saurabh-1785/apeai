"""
Jira Integration Routes
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from backend.app.services.publish_service import publish_document
from backend.app.db.supabase_client import get_supabase_client

router = APIRouter(prefix="/publish", tags=["Publishing (Layer 4)"])

@router.post("/jira/{document_id}", summary="Publish approved document to Jira Cloud")
async def api_publish_to_jira(
    document_id: str,
    integration_id: Optional[str] = Query(None, description="UUID of the Jira integration. Defaults to first active Jira integration if omitted.")
):
    """
    Publishes an approved User Story or Technical Task to Jira Cloud.
    Automatically handles state changes (approved -> publishing -> published/failed)
    and prevents duplicate ticket creations.
    """
    if not integration_id:
        # Resolve active Jira integration automatically
        db = get_supabase_client()
        res = db.table("integrations") \
            .select("id") \
            .eq("type", "jira") \
            .eq("is_active", True) \
            .limit(1) \
            .execute()
            
        if not res.data:
            raise HTTPException(
                status_code=400,
                detail="No active Jira integration configured. Please configure one or supply integration_id."
            )
        integration_id = res.data[0]["id"]
        
    try:
        result = await publish_document(document_id, integration_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
