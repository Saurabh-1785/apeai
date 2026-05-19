"""
GitHub Integration Payload Mapper
"""

from typing import Dict, Any

def map_to_github(task: Dict[str, Any]) -> Dict[str, Any]:
    """
    Translates the universal task format into the GitHub Issue creation format.
    """
    labels = list(task.get("labels", []))
    
    # Optionally append priority as a label for visual grouping in GitHub Issues
    priority = task.get("priority")
    if priority:
        labels.append(f"priority:{priority}")
        
    return {
        "title": task.get("title", "AI Task"),
        "body": task.get("description", ""),
        "labels": labels
    }
