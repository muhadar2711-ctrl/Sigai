from __future__ import annotations

import os
from typing import Dict, List

from .registry import registry


def _check_env_vars(env_vars):
    return all(bool(os.getenv(var)) for var in env_vars)


def get_mcp_health_status() -> List[Dict[str, str]]:
    status_list = []
    mcps = registry.get_all()

    for mcp_id, data in mcps.items():
        depends_on = data.get("depends_on_env", [])
        has_handler = data.get("handler") is not None

        if not has_handler:
            status = "UNAVAILABLE"
        elif depends_on and not _check_env_vars(depends_on):
            status = "NOT_CONFIGURED"
        else:
            status = "ONLINE"

        status_list.append(
            {
                "id": mcp_id,
                "name": data["name"],
                "domain": data["domain"],
                "status": status,
            }
        )

    return sorted(status_list, key=lambda item: (item["domain"], item["id"]))


def get_mcp_health_summary() -> Dict[str, int]:
    counts = {"ONLINE": 0, "NOT_CONFIGURED": 0, "UNAVAILABLE": 0}
    for item in get_mcp_health_status():
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    counts["TOTAL"] = sum(counts.values())
    return counts
