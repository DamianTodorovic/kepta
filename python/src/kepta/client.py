"""Python client for a locally running KEPTA.

KEPTA itself is a desktop app (Electron). This package does not install it — it
talks to the HTTP API of the running instance, so that Python agents use the same
memory as Claude Desktop or Cursor.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

MemoryType = Literal["semantic", "episodic", "procedural"]

DEFAULT_URL = "http://127.0.0.1:3000"
ENDPOINT_FILE = "endpoint.json"


class KeptaError(RuntimeError):
    """KEPTA was unreachable or returned an error."""


def data_dir() -> Path:
    """KEPTA's data directory. `KEPTA_DATA_DIR` wins, otherwise ~/.kepta."""
    override = os.environ.get("KEPTA_DATA_DIR")
    return Path(override) if override else Path.home() / ".kepta"


def discover_url() -> str:
    """Find the running instance.

    In order: `KEPTA_URL`, then the address file the server writes on startup,
    otherwise the development default port. A packaged build picks a random port,
    so without that file it could not be found at all.
    """
    env = os.environ.get("KEPTA_URL")
    if env:
        return env.rstrip("/")
    try:
        raw = (data_dir() / ENDPOINT_FILE).read_text(encoding="utf-8")
        url = json.loads(raw).get("url")
        if isinstance(url, str) and url:
            return url.rstrip("/")
    except (OSError, ValueError):
        pass
    return DEFAULT_URL


@dataclass(frozen=True)
class Memory:
    """A memory. Timestamps are milliseconds since the epoch."""

    id: str
    title: str
    content: str
    tags: list[str] = field(default_factory=list)
    type: MemoryType = "semantic"
    scope: str = "user"
    confidence: float | None = None
    valid_from: int | None = None
    valid_to: int | None = None
    superseded_by: str | None = None
    deleted_at: int | None = None
    created_at: int | None = None
    updated_at: int | None = None

    @property
    def is_expired(self) -> bool:
        """Past its validity window? KEPTA downweights such hits when ranking."""
        return self.valid_to is not None and self.valid_to < time.time() * 1000

    @property
    def is_superseded(self) -> bool:
        """Superseded by a newer memory."""
        return bool(self.superseded_by)

    @classmethod
    def from_api(cls, d: dict[str, Any]) -> "Memory":
        return cls(
            id=str(d.get("id", "")),
            title=str(d.get("title", "")),
            content=str(d.get("content", "")),
            tags=list(d.get("tags") or []),
            type=d.get("type") or "semantic",
            scope=d.get("scope") or "user",
            confidence=d.get("confidence"),
            valid_from=d.get("validFrom"),
            valid_to=d.get("validTo"),
            superseded_by=d.get("supersededBy"),
            deleted_at=d.get("deletedAt"),
            created_at=d.get("createdAt"),
            updated_at=d.get("updatedAt"),
        )


@dataclass(frozen=True)
class SearchHit:
    """A search hit, with the individual scores of each retrieval track."""

    memory: Memory
    score: float
    vector_score: float = 0.0
    lexical_score: float = 0.0

    @classmethod
    def from_api(cls, d: dict[str, Any]) -> "SearchHit":
        return cls(
            memory=Memory.from_api(d.get("memory") or {}),
            score=float(d.get("score") or 0.0),
            vector_score=float(d.get("cosineScore") or 0.0),
            lexical_score=float(d.get("bm25Score") or 0.0),
        )


class KeptaClient:
    """A speaking connection to a running KEPTA instance.

    >>> kepta = KeptaClient()
    >>> kepta.save("Carbonara", "Guanciale, pecorino, egg yolk.", tags=["cooking"])
    >>> [h.memory.title for h in kepta.search("carbonara without cream")]

    Search combines full text, vectors and the knowledge graph. The vector track
    needs a local embedding model (``ollama pull nomic-embed-text``); without it
    ``SearchHit.vector_score`` stays at 0.0 and search is purely lexical.
    """

    def __init__(self, url: str | None = None, timeout: float = 20.0) -> None:
        self.url = (url or discover_url()).rstrip("/")
        self.timeout = timeout

    # ---------- HTTP ----------

    def _request(self, method: str, path: str, body: Any = None, params: dict[str, Any] | None = None) -> Any:
        target = f"{self.url}{path}"
        if params:
            cleaned = {k: v for k, v in params.items() if v is not None}
            if cleaned:
                target += "?" + urlencode(cleaned)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = Request(target, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        try:
            with urlopen(req, timeout=self.timeout) as res:
                raw = res.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            raise KeptaError(f"{method} {path} failed ({e.code}): {detail}") from e
        except (URLError, TimeoutError) as e:
            raise KeptaError(
                f"KEPTA at {self.url} is unreachable. Is the app running? "
                f"Otherwise set KEPTA_URL. Cause: {e}"
            ) from e

    # ---------- Reading ----------

    def health(self) -> dict[str, Any]:
        """Status — version, node count, database path."""
        return self._request("GET", "/api/health")

    def is_alive(self) -> bool:
        """True when an instance answers."""
        try:
            return bool(self.health().get("ok"))
        except KeptaError:
            return False

    def list(self, *, trash: bool = False) -> list[Memory]:
        """Every memory. With `trash=True`, the trash instead."""
        data = self._request("GET", "/api/memories", params={"trash": "1" if trash else None})
        return [Memory.from_api(d) for d in (data or [])]

    def search(
        self,
        query: str,
        *,
        top_k: int = 5,
        tags: Iterable[str] | None = None,
        type: MemoryType | None = None,
        scope: str | None = None,
    ) -> list[SearchHit]:
        """Hybrid retrieval: full text, vectors and knowledge graph, fused by RRF."""
        body: dict[str, Any] = {"query": query, "topK": max(1, min(int(top_k), 100))}
        if tags:
            body["tags"] = list(tags)
        if type:
            body["type"] = type
        if scope:
            body["scope"] = scope
        data = self._request("POST", "/api/search", body)
        return [SearchHit.from_api(d) for d in (data or {}).get("results", [])]

    def graph(self) -> dict[str, Any]:
        """Entities and relations of the knowledge graph."""
        return self._request("GET", "/api/graph")

    # ---------- Writing ----------

    def save(
        self,
        title: str,
        content: str,
        *,
        tags: Iterable[str] | None = None,
        type: MemoryType | None = None,
        confidence: float | None = None,
        valid_from: int | None = None,
        valid_to: int | None = None,
    ) -> Memory:
        """Create a memory."""
        body: dict[str, Any] = {"title": title, "content": content}
        if tags is not None:
            body["tags"] = list(tags)
        if type is not None:
            body["type"] = type
        if confidence is not None:
            body["confidence"] = max(0.0, min(1.0, float(confidence)))
        if valid_from is not None:
            body["validFrom"] = valid_from
        if valid_to is not None:
            body["validTo"] = valid_to
        data = self._request("POST", "/api/memories", body)
        return Memory.from_api((data or {}).get("memory") or data or {})

    def update(self, memory_id: str, **patch: Any) -> Memory:
        """Change fields of a memory. Same keys as `save`."""
        mapping = {"valid_from": "validFrom", "valid_to": "validTo"}
        body: dict[str, Any] = {"id": memory_id}
        for key, value in patch.items():
            body[mapping.get(key, key)] = list(value) if key == "tags" and value is not None else value
        data = self._request("POST", "/api/memories", body)
        return Memory.from_api((data or {}).get("memory") or {})

    def delete(self, memory_id: str, *, permanent: bool = False) -> bool:
        """Move to trash. With `permanent=True` it is gone for good — no undo."""
        data = self._request(
            "DELETE", f"/api/memories/{memory_id}", params={"permanent": "1" if permanent else None}
        )
        return bool((data or {}).get("ok"))

    def restore(self, memory_id: str) -> bool:
        """Bring a memory back out of the trash."""
        data = self._request("POST", f"/api/memories/{memory_id}/restore")
        return bool((data or {}).get("ok", True))
