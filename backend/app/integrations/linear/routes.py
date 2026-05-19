"""
Linear Integration Routes
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from backend.app.services.publish_service import publish_document
from backend.app.db.supabase_client import get_supabase_client

router = APIRouter(prefix="/publish", tags=["Publishing (Layer 4)"])

@router.post("/linear/{document_id}", summary="Publish approved document to Linear")
async def api_publish_to_linear(
    document_id: str,
    integration_id: Optional[str] = Query(None, description="UUID of the Linear integration. Defaults to first active Linear integration if omitted.")
):
    """
    Publishes an approved User Story or Technical Task to Linear.
    Automatically handles state changes (approved -> publishing -> published/failed)
    and prevents duplicate ticket creations.
    """
    if not integration_id:
        # Resolve active Linear integration automatically
        db = get_supabase_client()
        res = db.table("integrations") \
            .select("id") \
            .eq("type", "linear") \
            .eq("is_active", True) \
            .limit(1) \
            .execute()
            
        if not res.data:
            raise HTTPException(
                status_code=400,
                detail="No active Linear integration configured. Please configure one or supply integration_id."
            )
        integration_id = res.data[0]["id"]
        
    try:
        result = await publish_document(document_id, integration_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
