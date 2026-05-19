"""
Linear Integration Payload Mapper
"""

from typing import Dict, Any

def map_to_linear(task: Dict[str, Any], team_id: str) -> Dict[str, Any]:
    """
    Translates the universal task format into the Linear issueCreate GraphQL mutation variables.
    Linear maps priorities as integers: 0 (no priority), 1 (urgent), 2 (high), 3 (normal), 4 (low).
    """
    priority_num = 0
    p = task.get("priority", "Medium").lower()
    if "high" in p or "must" in p:
        priority_num = 2
    elif "medium" in p or "should" in p:
        priority_num = 3
    elif "low" in p or "could" in p:
        priority_num = 4
        
    return {
        "input": {
            "title": task.get("title", "AI Task"),
            "description": task.get("description", ""),
            "teamId": team_id,
            "priority": priority_num
        }
    }
