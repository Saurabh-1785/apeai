"""
Jira Integration Payload Mapper
"""

from typing import Dict, Any

def map_to_jira(task: Dict[str, Any], project_key: str) -> Dict[str, Any]:
    """
    Translates the universal task format into the Jira REST API v3 Issue format.
    Jira v3 uses the Atlassian Document Format (ADF) for descriptions.
    """
    priority_name = "Medium"
    p = task.get("priority", "Medium").lower()
    if "high" in p or "must" in p:
        priority_name = "High"
    elif "low" in p or "could" in p:
        priority_name = "Low"
        
    description_text = task.get("description", "")
    
    # Simple Atlassian Document Format (ADF) representation of plain text / markdown description
    # ADF is a structured JSON format representing the document.
    # To keep it robust, we construct paragraph nodes for each line block.
    content_nodes = []
    lines = description_text.split("\n")
    for line in lines:
        if line.strip():
            content_nodes.append({
                "type": "paragraph",
                "content": [
                    {
                        "type": "text",
                        "text": line
                    }
                ]
            })
            
    # Fallback to single empty paragraph if description is blank
    if not content_nodes:
        content_nodes.append({
            "type": "paragraph",
            "content": []
        })

    return {
        "fields": {
            "project": {
                "key": project_key
            },
            "summary": task.get("title", "AI Task"),
            "description": {
                "type": "doc",
                "version": 1,
                "content": content_nodes
            },
            "issuetype": {
                "name": "Task"
            },
            "priority": {
                "name": priority_name
            },
            "labels": [label.replace(" ", "-") for label in task.get("labels", [])]
        }
    }
