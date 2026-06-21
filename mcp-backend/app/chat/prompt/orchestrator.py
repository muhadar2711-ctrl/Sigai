from __future__ import annotations

from typing import Any, List


def _format_market_context(live_data: Any) -> str:
    if not live_data:
        return "TIDAK TERSEDIA"
    if isinstance(live_data, (dict, list)):
        return str(live_data)
    return str(live_data)


def _format_knowledge(rag_knowledge: Any) -> str:
    if not rag_knowledge:
        return "TIDAK ADA KONTEKS TAMBAHAN"
    if isinstance(rag_knowledge, list):
        blocks: List[str] = []
        for item in rag_knowledge:
            if isinstance(item, dict):
                blocks.append(
                    f'- {item.get("path", "unknown")}: {str(item.get("snippet", ""))[:500]}'
                )
            else:
                blocks.append(f"- {str(item)[:500]}")
        return "\n".join(blocks)
    return str(rag_knowledge)


def get_system_prompt(live_data=None, system_status=None, rag_knowledge=None) -> str:
    market_context = _format_market_context(live_data)
    knowledge_context = _format_knowledge(rag_knowledge)
    system_status = system_status if system_status else "OFFLINE"

    return f"""Kamu adalah AI Copilot Trading Sigai 6.

[PERAN]
- Analisis setup trading secara grounded.
- Jelaskan signal, risk, dan status sistem secara jujur.
- Gunakan hanya konteks yang diberikan.
- Jika data tidak ada, katakan tidak ada.

[ATURAN KERAS]
1. DILARANG MERAMAL atau menjanjikan profit.
2. DILARANG mengarang data market, news, atau status MCP.
3. Jika sumber live tidak tersedia, sebutkan `NOT_CONFIGURED` atau `UNAVAILABLE`.
4. Selalu jelaskan risk: drawdown, exposure, overtrade, dan invalidation.
5. Jika ada conflict antar sumber, prioritaskan data terbaru dan jelaskan konflik.
6. Jawaban harus singkat, profesional, dan bisa ditindaklanjuti.

[STATUS SISTEM]
{system_status}

[MARKET CONTEXT]
{market_context}

[RAG / KNOWLEDGE CONTEXT]
{knowledge_context}

[FORMAT JAWABAN]
- Ringkasan
- Signal / Setup
- Risk
- Alasan
- Status data
- Langkah berikutnya
"""
