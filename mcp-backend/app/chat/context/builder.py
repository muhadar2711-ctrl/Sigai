from __future__ import annotations

import os
import re
from typing import Any, Dict, Optional

from app.chat.retrieval.rag_retriever import retrieve_knowledge


_COMMON_SYMBOLS = ("XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "US30", "NAS100")


def _detect_symbol(message: str) -> Optional[str]:
    upper = (message or "").upper()
    for symbol in _COMMON_SYMBOLS:
        if symbol in upper:
            return symbol
    match = re.search(r"\b([A-Z]{3,10}USD|XAUUSD|EURUSD|GBPUSD|USDJPY)\b", upper)
    return match.group(1) if match else None


def _market_snapshot(symbol: Optional[str]) -> Dict[str, Any]:
    if not symbol:
        return {"status": "NOT_REQUESTED"}

    try:
        from app.market.twelvedata import TwelveDataFeed

        feed = TwelveDataFeed()
        quote = feed.get_quote(symbol)
        if quote.get("error"):
            error_text = str(quote.get("error", "")).lower()
            return {
                "status": "NOT_CONFIGURED" if "not configured" in error_text else "UNAVAILABLE",
                "symbol": symbol,
                "error": quote.get("error"),
            }
        return {"status": "ONLINE", "symbol": symbol, "quote": quote}
    except Exception as exc:
        return {"status": "UNAVAILABLE", "symbol": symbol, "error": str(exc)}


def _status_snapshot() -> Dict[str, Any]:
    required_envs = {
        "TWELVEDATA_API_KEY": bool(os.getenv("TWELVEDATA_API_KEY")),
        "META_API_TOKEN": bool(os.getenv("META_API_TOKEN")),
        "META_API_ACCOUNT_ID": bool(os.getenv("META_API_ACCOUNT_ID")),
        "EA_WEBHOOK_SECRET": bool(os.getenv("EA_WEBHOOK_SECRET")),
        "GEMINI_API_KEY": bool(os.getenv("GEMINI_API_KEY")),
    }
    return required_envs


def build_context(user_message: str, history: list) -> Dict[str, Any]:
    symbol = _detect_symbol(user_message)
    market_data = _market_snapshot(symbol)
    knowledge = retrieve_knowledge(user_message)
    status = _status_snapshot()

    return {
        "symbol": symbol,
        "live_market_data": market_data,
        "system_status": status,
        "retrieved_knowledge": knowledge,
        "system_prompt_compiled": None,
    }
