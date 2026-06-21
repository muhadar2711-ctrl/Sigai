from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Tuple


ROOT = Path(__file__).resolve().parents[4]
SEARCH_DIRS = [
    ROOT / "knowledge",
    ROOT / "enterprise",
    ROOT / "manifest",
    ROOT / "rag",
    ROOT / "versions",
    ROOT / "docs",
]

STOPWORDS = {
    "yang", "dan", "atau", "untuk", "dengan", "dari", "the", "a", "an", "to", "of",
    "di", "ke", "pada", "dalam", "ini", "itu", "adalah", "bisa", "akan", "is", "for",
    "on", "be", "as", "by", "at", "with", "jika", "kalau", "saya", "kamu",
}


def _tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z0-9_]+", text.lower())
    return [t for t in tokens if t not in STOPWORDS and len(t) > 1]


def _score(text: str, query_tokens: List[str]) -> float:
    if not query_tokens:
        return 0.0
    text_tokens = _tokenize(text)
    if not text_tokens:
        return 0.0
    counts = Counter(text_tokens)
    match = sum(counts.get(token, 0) for token in query_tokens)
    coverage = len(set(query_tokens) & set(text_tokens)) / len(set(query_tokens))
    density = match / max(20, len(text_tokens))
    return (coverage * 0.7) + (density * 0.3)


def _read_excerpt(path: Path, max_chars: int = 3000) -> str:
    try:
        content = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    return content[:max_chars]


def retrieve_knowledge(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    query_tokens = _tokenize(query)
    candidates: List[Tuple[float, Path]] = []

    for base in SEARCH_DIRS:
        if not base.exists():
            continue
        for path in base.rglob("*.md"):
            if path.name.startswith("."):
                continue
            text = _read_excerpt(path, max_chars=2500)
            score = _score(text, query_tokens)
            if score > 0:
                candidates.append((score, path))

    candidates.sort(key=lambda item: (-item[0], str(item[1])))
    results: List[Dict[str, Any]] = []

    for score, path in candidates[:limit]:
        content = _read_excerpt(path)
        snippet_tokens = query_tokens[:3]
        snippet = content
        if snippet_tokens:
            lowered = content.lower()
            for token in snippet_tokens:
                idx = lowered.find(token.lower())
                if idx >= 0:
                    start = max(0, idx - 180)
                    end = min(len(content), idx + 360)
                    snippet = content[start:end]
                    break

        results.append(
            {
                "path": str(path.relative_to(ROOT)),
                "score": round(float(score), 4),
                "snippet": snippet.strip(),
            }
        )

    return results
