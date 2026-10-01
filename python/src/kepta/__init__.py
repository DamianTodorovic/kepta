"""KEPTA — local memory for AI agents, from Python.

This package is the client, not the app. KEPTA itself runs as a desktop app on
the same machine; here you connect to it.

    from kepta import KeptaClient

    kepta = KeptaClient()          # finds the running instance on its own
    kepta.save("Home", "Alex lives in Hamburg.", tags=["personal"])
    for hit in kepta.search("where does Alex live"):
        print(hit.memory.title, hit.score)

Everything stays on the device: the server listens on 127.0.0.1 only.
"""

from .client import (
    DEFAULT_URL,
    KeptaClient,
    KeptaError,
    Memory,
    MemoryType,
    SearchHit,
    data_dir,
    discover_url,
)

__all__ = [
    "KeptaClient",
    "KeptaError",
    "Memory",
    "MemoryType",
    "SearchHit",
    "discover_url",
    "data_dir",
    "DEFAULT_URL",
    "__version__",
]

__version__ = "0.1.3"
