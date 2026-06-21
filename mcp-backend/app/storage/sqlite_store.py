from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List, Optional


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _project_root() -> Path:
    # __file__ is /mcp-backend/app/storage/sqlite_store.py
    # parents[0] is storage
    # parents[1] is app
    # parents[2] is mcp-backend
    return Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class ChatRecord:
    session_id: str
    role: str
    content: str
    created_at: str


class SQLiteStore:
    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.root = _project_root()
        self.db_path = db_path or (self.root / "data" / "sigai_chat.db")
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_schema(self) -> None:
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS chat_session_summaries (
                        session_id TEXT PRIMARY KEY,
                        summary TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                    """
                )
                conn.commit()

    def append_message(self, session_id: str, role: str, content: str) -> None:
        if not session_id:
            raise ValueError("session_id is required")
        if role not in {"user", "model", "assistant", "system"}:
            raise ValueError(f"Unsupported role: {role}")

        payload = ChatRecord(
            session_id=session_id,
            role="assistant" if role == "model" else role,
            content=content.strip(),
            created_at=_utc_now(),
        )

        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (payload.session_id, payload.role, payload.content, payload.created_at),
                )
                conn.commit()

    def list_messages(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        if not session_id:
            return []
        limit = max(1, min(limit, 500))
        with self._lock:
            with self._connect() as conn:
                rows = conn.execute(
                    """
                    SELECT session_id, role, content, created_at
                    FROM chat_messages
                    WHERE session_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                    """,
                    (session_id, limit),
                ).fetchall()
        messages = [dict(row) for row in rows]
        messages.reverse()
        return messages

    def set_summary(self, session_id: str, summary: str) -> None:
        if not session_id:
            return
        summary = summary.strip()
        with self._lock:
            with self._connect() as conn:
                conn.execute(
                    """
                    INSERT INTO chat_session_summaries (session_id, summary, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(session_id) DO UPDATE SET summary=excluded.summary, updated_at=excluded.updated_at
                    """,
                    (session_id, summary, _utc_now()),
                )
                conn.commit()

    def get_summary(self, session_id: str) -> Optional[str]:
        if not session_id:
            return None
        with self._lock:
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT summary FROM chat_session_summaries WHERE session_id = ?",
                    (session_id,),
                ).fetchone()
        return row["summary"] if row else None


store = SQLiteStore()
