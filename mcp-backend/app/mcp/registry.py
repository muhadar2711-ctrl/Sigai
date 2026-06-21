from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .registry_blueprint import DOMAINS, MCPS_BLUEPRINT


@dataclass
class MCPEntry:
    mcp_id: str
    name: str
    domain: str
    depends_on_env: List[str] = field(default_factory=list)
    handler: Optional[Any] = None
    enabled: bool = True


class MCPRegistry:
    def __init__(self):
        self._mcps: Dict[str, MCPEntry] = {}
        self.seed_blueprints()

    def seed_blueprints(self) -> None:
        for item in MCPS_BLUEPRINT:
            mcp_id = item["id"]
            if "oanda" in mcp_id.lower():
                continue
            self._mcps[mcp_id] = MCPEntry(
                mcp_id=mcp_id,
                name=item["name"],
                domain=item["domain"],
                depends_on_env=list(item.get("env", [])),
            )

    def register(
        self,
        mcp_id: str,
        name: str,
        domain: str,
        depends_on_env: Optional[List[str]] = None,
        handler: Optional[Any] = None,
    ) -> None:
        self._mcps[mcp_id] = MCPEntry(
            mcp_id=mcp_id,
            name=name,
            domain=domain,
            depends_on_env=depends_on_env or [],
            handler=handler,
        )

    def set_handler(self, mcp_id: str, handler: Any) -> None:
        if mcp_id in self._mcps:
            self._mcps[mcp_id].handler = handler

    def set_enabled(self, mcp_id: str, enabled: bool) -> None:
        if mcp_id in self._mcps:
            self._mcps[mcp_id].enabled = enabled

    def get(self, mcp_id: str) -> Optional[MCPEntry]:
        return self._mcps.get(mcp_id)

    def get_all(self) -> Dict[str, Dict[str, Any]]:
        return {
            mcp_id: {
                "name": entry.name,
                "domain": entry.domain,
                "depends_on_env": entry.depends_on_env,
                "handler": entry.handler,
                "enabled": entry.enabled,
            }
            for mcp_id, entry in self._mcps.items()
        }

    def get_domain_counts(self) -> Dict[str, int]:
        counts: Dict[str, int] = {domain: 0 for domain in DOMAINS}
        for entry in self._mcps.values():
            counts[entry.domain] = counts.get(entry.domain, 0) + 1
        return counts

    def live_ids(self) -> List[str]:
        return [mcp_id for mcp_id, entry in self._mcps.items() if entry.handler is not None]


registry = MCPRegistry()
