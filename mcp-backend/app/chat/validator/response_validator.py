from __future__ import annotations

from typing import Any, Dict


_BANNED_PHRASES = (
    "pasti profit",
    "100% win",
    "jaminan profit",
    "guaranteed profit",
    "sure win",
)


def validate_response(response: str, context: Dict[str, Any]) -> str:
    text = (response or "").strip()
    if not text:
        return "Respons kosong. Backend perlu konfigurasi atau konteks tambahan."

    lower = text.lower()
    for phrase in _BANNED_PHRASES:
        if phrase in lower:
            return (
                "Respons diblokir karena mengandung klaim tidak valid. "
                "Gunakan analisis berbasis data, risk, dan invalidation."
            )

    if "live market data" in lower and not context.get("live_market_data"):
        return (
            "Data market live tidak tersedia. Sistem hanya dapat menjelaskan konteks "
            "yang benar-benar ada."
        )

    return text
