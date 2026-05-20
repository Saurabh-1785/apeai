"""
ApeAI — Publish Service

Orchestrates the publication of approved documents (stories, tasks) to
external platforms. Converts internal task format to a universal format,
transitions states, prevents duplicates, and saves ticket links.
"""

import logging
from typing import Dict, Any

from backend.app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

def to_universal_format(doc: Dict[str, Any]) -> Dict[str, Any]:
    """
    Converts a platform-internal story or task document into the flat,
    platform-independent Universal Task Format.
    """
    doc_type = doc.get("type")
    content = doc.get("content", {})
    
    if doc_type == "story":
        title = doc.get("title") or content.get("title") or "Unnamed Story"
        user_role = content.get("user_role", "")
        req = content.get("requirement", "")
        benefit = content.get("benefit", "")
        ac_list = content.get("acceptance_criteria", [])
        priority = content.get("priority", "Medium")
        
        # Construct descriptions
        description = f"{user_role}\n{req}\n{benefit}\n\n### Acceptance Criteria\n"
        for ac in ac_list:
            description += f"- {ac}\n"
            
        return {
            "title": title,
            "description": description.strip(),
            "priority": priority,
            "labels": ["user-story", "story"],
            "assignee": None
        }
        
    elif doc_type == "task":
        title = doc.get("title") or "Unnamed Task"
        story_title = content.get("story_title", "")
        frontend_tasks = content.get("frontend_tasks", [])
        backend_tasks = content.get("backend_tasks", [])
        testing_tasks = content.get("testing_tasks", [])
        complexity = content.get("estimated_complexity", "Medium")
        dependencies = content.get("dependencies", [])
        
        description = f"**Story Ref:** {story_title}\n\n"
        if frontend_tasks:
            description += "### Frontend Tasks\n"
            for t in frontend_tasks:
                description += f"- [ ] {t}\n"
            description += "\n"
        if backend_tasks:
            description += "### Backend Tasks\n"
            for t in backend_tasks:
                description += f"- [ ] {t}\n"
            description += "\n"
        if testing_tasks:
            description += "### Testing Tasks\n"
            for t in testing_tasks:
                description += f"- [ ] {t}\n"
            description += "\n"
            
        description += f"**Complexity:** {complexity}\n"
        if dependencies:
            description += f"**Dependencies:** {', '.join(dependencies)}\n"
            
        return {
            "title": title,
            "description": description.strip(),
            "priority": "Medium",
            "labels": ["technical-task", "task"],
            "assignee": None
        }
    else:
        # Generic fallback
        return {
            "title": doc.get("title") or "AI Document",
            "description": content.get("summary") or doc.get("summary") or str(content),
            "priority": "Medium",
            "labels": [doc_type] if doc_type else [],
            "assignee": None
        }


async def publish_document(document_id: str, integration_id: str) -> Dict[str, Any]:
    """
    Publishes an approved document to an external integration.
    
    Args:
        document_id: UUID of the document (BRD, PRD, Story, Task)
        integration_id: UUID of the integration configuration
        
    Returns:
        Dict indicating success status and external ticket link info.
    """
    db = get_supabase_client()
    
    # 1. Fetch document
    doc_res = db.table("documents").select("*").eq("id", document_id).single().execute()
    if not doc_res.data:
        raise ValueError(f"Document not found: {document_id}")
    doc = doc_res.data
    
    # 2. Fetch integration
    int_res = db.table("integrations").select("*").eq("id", integration_id).single().execute()
    if not int_res.data:
        raise ValueError(f"Integration not found: {integration_id}")
    integration = int_res.data
    
    # 3. Prevent Duplicate Publishing: Check if already published to this integration
    existing = db.table("ticket_links") \
        .select("*") \
        .eq("document_id", document_id) \
        .eq("integration_id", integration_id) \
        .execute()
        
    if existing.data:
        raise ValueError(f"Document {document_id} has already been published to integration {integration_id}")
        
    # 4. Human-in-the-Loop check: Must be approved
    current_status = doc.get("status")
    if current_status != "approved":
        raise ValueError(f"Only approved documents can be published. Current status: {current_status}")
        
    # 5. Log the publish attempt (stay in 'approved' status during the attempt)
    logger.info(f"🔄 Publishing document {document_id} to integration {integration_id}...")
    
    try:
        # 6. Map to universal format
        universal_task = to_universal_format(doc)
        
        # 7. Dispatch based on integration type
        int_type = integration.get("type")
        result = None
        
        if int_type == "github":
            from backend.app.integrations.github.client import publish_to_github
            result = await publish_to_github(universal_task, integration)
        elif int_type == "jira":
            from backend.app.integrations.jira.client import publish_to_jira
            result = await publish_to_jira(universal_task, integration)
        elif int_type == "linear":
            from backend.app.integrations.linear.client import publish_to_linear
            result = await publish_to_linear(universal_task, integration)
        else:
            raise ValueError(f"Unsupported integration type: {int_type}")
            
        # 8. Create ticket link in database (External Ticket Storage)
        from backend.app.services.document_service import create_ticket_link
        link = await create_ticket_link(
            document_id=document_id,
            integration_id=integration_id,
            external_id=result["external_id"],
            external_url=result.get("external_url"),
            external_status=result.get("external_status", "Open")
        )
        
        # 9. Transition to 'published'
        db.table("documents").update({"status": "published"}).eq("id", document_id).execute()
        logger.info(f"✅ Successfully published document {document_id} as ticket {result['external_id']}")
        
        return {
            "success": True,
            "ticket_link": link,
            "external_url": result.get("external_url"),
            "external_id": result["external_id"]
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to publish document {document_id}: {e}", exc_info=True)
        # Revert to 'approved' so the user can retry
        try:
            db.table("documents").update({"status": "approved"}).eq("id", document_id).execute()
        except Exception as re:
            logger.error(f"Failed to reset document status to 'approved': {re}")
        raise e
