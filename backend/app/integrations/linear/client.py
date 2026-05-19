"""
Linear Integration Client
"""

import httpx
import logging
from .mapper import map_to_linear

logger = logging.getLogger(__name__)

async def publish_to_linear(task: dict, integration: dict) -> dict:
    """
    Publishes the universal task to Linear using GraphQL IssueCreate mutation.
    """
    api_key = integration.get("api_key")  # Personal Access Token
    team_id = integration.get("project_id")  # Linear Team ID (UUID)
    api_url = integration.get("api_url") or "https://api.linear.app/graphql"
    config = integration.get("config", {}) or {}
    
    if not api_key:
        raise ValueError("Linear Personal Access Token (API Key) is missing")
    if not team_id:
        raise ValueError("Linear Team ID (Project ID) is missing")
        
    variables = map_to_linear(task, team_id)
    
    # Check if dry run is enabled in integration config
    if config.get("dry_run") is True:
        logger.info(f"[Linear Dry Run] Would publish issue to {api_url}: {variables}")
        return {
            "external_id": "MOCK-LIN-1234",
            "external_url": "https://linear.app/issue/LIN-1234",
            "external_status": "todo"
        }
        
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json"
    }
    
    mutation = """
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          url
        }
      }
    }
    """
    
    payload = {
        "query": mutation,
        "variables": variables
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(api_url, json=payload, headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Linear GraphQL Error: {response.status_code} - {response.text}")
            raise RuntimeError(f"Failed to communicate with Linear API: {response.text}")
            
        data = response.json()
        if "errors" in data:
            logger.error(f"Linear GraphQL returned errors: {data['errors']}")
            raise RuntimeError(f"Linear API error: {data['errors'][0]['message']}")
            
        result = data.get("data", {}).get("issueCreate", {})
        if not result.get("success"):
            raise RuntimeError("Linear issue creation query did not succeed.")
            
        issue_data = result.get("issue", {})
        return {
            "external_id": issue_data.get("id"),
            "external_url": issue_data.get("url"),
            "external_status": "todo"
        }
