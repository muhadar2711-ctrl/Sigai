from __future__ import annotations

from typing import Any, Dict, List, Optional

from app.storage.sqlite_store import store


class MemoryManager:
    """Persistent short-term chat memory backed by SQLite."""

    def get_session_context(self, session_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        return store.list_messages(session_id, limit=limit)

    def add_to_memory(self, session_id: str, role: str, content: str) -> None:
        store.append_message(session_id, role, content)

    def summarize_memory(self, session_id: str) -> Optional[str]:
        messages = store.list_messages(session_id, limit=24)
        if not messages:
            return None

        user_count = sum(1 for m in messages if m["role"] == "user")
        assistant_count = sum(1 for m in messages if m["role"] == "assistant")
        latest = messages[-6:]
        latest_text = "; ".join(
            f'{m["role"]}: {m["content"][:120].replace("\n", " ")}' for m in latest
        )
        summary = (
            f"Session berisi {len(messages)} pesan (user={user_count}, assistant={assistant_count}). "
            f"Ringkasan percakapan terakhir: {latest_text}"
        )
        store.set_summary(session_id, summary)
        return summary
