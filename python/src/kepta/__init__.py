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

from importlib.metadata import PackageNotFoundError, version as _package_version

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

# Eine Version, EINE Quelle: pyproject.toml. Die hart codierte Zahl driftete
# still von 0.1.3 nach 0.1.7 auseinander (26.9.-Lektion — dieselbe Klasse wie
# die stehengebliebene version.ts). Seitdem liest der Client sie aus den
# Paket-Metadaten; der Fallback gilt nur für einen unverpackten Quellbaum.
try:
    __version__ = _package_version("kepta")
except PackageNotFoundError:
    __version__ = "0.0.0.dev0"
