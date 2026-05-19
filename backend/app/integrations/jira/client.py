"""
Jira Integration Client
"""

import httpx
import logging
from .mapper import map_to_jira

logger = logging.getLogger(__name__)

async def publish_to_jira(task: dict, integration: dict) -> dict:
    """
    Publishes the universal task to Jira Cloud as a new Issue.
    """
    api_key = integration.get("api_key")  # API Token
    project_key = integration.get("project_id")  # e.g., "PROJ"
    api_url = integration.get("api_url")  # e.g., "https://domain.atlassian.net"
    config = integration.get("config", {}) or {}
    email = config.get("email")
    
    if not api_key:
        raise ValueError("Jira API Token (API Key) is missing")
    if not project_key:
        raise ValueError("Jira Project Key (Project ID) is missing")
    if not api_url:
        raise ValueError("Jira Cloud Instance URL (API URL) is missing")
    if not email:
        raise ValueError("Jira user email is missing from integration configuration (config.email)")
        
    payload = map_to_jira(task, project_key)
    url = f"{api_url.rstrip('/')}/rest/api/3/issue"
    
    # Check if dry run is enabled in integration config
    if config.get("dry_run") is True:
        logger.info(f"[Jira Dry Run] Would publish issue to {url}: {payload}")
        return {
            "external_id": f"{project_key}-101",
            "external_url": f"{api_url.rstrip('/')}/browse/{project_key}-101",
            "external_status": "To Do"
        }
        
    # Basic Authentication: username (email) and password (API token)
    auth = (email, api_key)
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers, auth=auth)
        
        if response.status_code not in (200, 201):
            logger.error(f"Jira API Error: {response.status_code} - {response.text}")
            raise RuntimeError(f"Failed to create Jira issue: {response.text}")
            
        data = response.json()
        external_id = data["key"]
        external_url = f"{api_url.rstrip('/')}/browse/{external_id}"
        
        return {
            "external_id": external_id,
            "external_url": external_url,
            "external_status": "To Do"
        }
