"""
GitHub Integration Client
"""

import httpx
import logging
from .mapper import map_to_github

logger = logging.getLogger(__name__)

async def publish_to_github(task: dict, integration: dict) -> dict:
    """
    Publishes the universal task to GitHub Issues.
    """
    api_key = integration.get("api_key")
    project_id = integration.get("project_id")  # Expects "owner/repo"
    api_url = integration.get("api_url") or "https://api.github.com"
    
    if not api_key:
        raise ValueError("GitHub Personal Access Token (API Key) is missing")
    if not project_id:
        raise ValueError("GitHub Repository (Project ID) is missing, format must be 'owner/repo'")
        
    payload = map_to_github(task)
    url = f"{api_url.rstrip('/')}/repos/{project_id}/issues"
    
    # Check if dry run is enabled in integration config
    config = integration.get("config", {}) or {}
    if config.get("dry_run") is True:
        logger.info(f"[GitHub Dry Run] Would publish issue to {url}: {payload}")
        return {
            "external_id": "MOCK-GH-123",
            "external_url": f"https://github.com/{project_id}/issues/123",
            "external_status": "open"
        }
        
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        
        if response.status_code != 201:
            logger.error(f"GitHub API Error: {response.status_code} - {response.text}")
            raise RuntimeError(f"Failed to create GitHub issue: {response.text}")
            
        data = response.json()
        return {
            "external_id": str(data["number"]),
            "external_url": data["html_url"],
            "external_status": data["state"]
        }
