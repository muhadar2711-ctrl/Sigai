from __future__ import annotations

import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.chat.context.builder import build_context
from app.chat.memory.manager import MemoryManager
from app.chat.prompt.orchestrator import get_system_prompt
from app.chat.validator.response_validator import validate_response


router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: str
    content: str

    def to_gemini_format(self):
        return {
            "role": "user" if self.role == "user" else "model",
            "parts": [{"text": self.content}],
        }


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = Field(default_factory=list)
    images_base64: List[str] = Field(default_factory=list)
    mode: Optional[str] = "standard"
    session_id: Optional[str] = None


def _summarize_context(context: Dict[str, Any]) -> str:
    market = context.get("live_market_data", {})
    knowledge = context.get("retrieved_knowledge", [])
    status = context.get("system_status", {})
    lines = [
        f"Symbol: {context.get('symbol') or 'N/A'}",
        f"Market status: {market.get('status', 'UNKNOWN')}",
        f"Knowledge matches: {len(knowledge)}",
        f"Config status: {status}",
    ]
    return "\n".join(lines)


def _fallback_response(req: ChatRequest, context: Dict[str, Any]) -> str:
    knowledge = context.get("retrieved_knowledge", [])
    market = context.get("live_market_data", {})
    parts = [
        "Chat backend berjalan tanpa model generatif aktif.",
        f"Topik: {req.message.strip()}",
        f"Status market: {market.get('status', 'UNAVAILABLE')}",
    ]
    if market.get("quote"):
        quote = market["quote"]
        parts.append(
            f"Quote {quote.get('symbol')}: price={quote.get('price')} timestamp={quote.get('timestamp')}"
        )
    if knowledge:
        first = knowledge[0]
        parts.append(
            f"RAG teratas: {first.get('path')} | {str(first.get('snippet', ''))[:220]}"
        )
    parts.append("Gunakan ini sebagai dasar analisis manual dan risk check.")
    return "\n".join(parts)


@router.post("/completions")
async def chat_completions(req: ChatRequest):
    memory = MemoryManager()
    session_id = req.session_id or str(uuid.uuid4())

    memory.add_to_memory(session_id, "user", req.message)

    context = build_context(req.message, req.history)
    system_prompt = get_system_prompt(
        live_data=context["live_market_data"],
        system_status=context["system_status"],
        rag_knowledge=context["retrieved_knowledge"],
    )
    context["system_prompt_compiled"] = system_prompt

    ai_response = None
    provider_status = "NOT_CONFIGURED"

    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai

            client = genai.Client(api_key=api_key)
            contents = [
                msg.to_gemini_format()
                for msg in req.history
                if msg.content.strip() and msg.content != "Selesai."
            ]
            contents.append({"role": "user", "parts": [{"text": req.message}]})
            generation = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=contents,
                config={"system_instruction": system_prompt},
            )
            ai_response = generation.text or ""
            provider_status = "ONLINE"
        except Exception as exc:
            provider_status = "DEGRADED"
            ai_response = f"Provider generatif gagal: {exc}. Menggunakan fallback deterministik."
    else:
        provider_status = "NOT_CONFIGURED"

    if not ai_response or not ai_response.strip():
        ai_response = _fallback_response(req, context)

    safe_answer = validate_response(ai_response, context)
    memory.add_to_memory(session_id, "assistant", safe_answer)
    memory.summarize_memory(session_id)

    return {
        "success": True,
        "session_id": session_id,
        "response": safe_answer,
        "provider_status": provider_status,
        "context_summary": _summarize_context(context),
        "intermediate_steps": [
            {"agent": "ContextBuilder", "content": "Context assembled from live status and RAG"},
            {"agent": "MemoryManager", "content": "Conversation persisted to SQLite"},
            {"agent": "Validator", "content": "Response validated for unsafe claims"},
        ],
    }
