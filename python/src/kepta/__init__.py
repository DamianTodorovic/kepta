"""KEPTA — lokales Gedächtnis für KI-Agenten, von Python aus.

Dieses Paket ist der Client, nicht die App. KEPTA selbst läuft als Desktop-App
auf demselben Rechner; hier verbindest du dich damit.

    from kepta import KeptaClient

    kepta = KeptaClient()          # findet die laufende Instanz von allein
    kepta.save("Wohnort", "Alex wohnt in Hamburg.", tags=["personal"])
    for hit in kepta.search("wo wohnt Alex"):
        print(hit.memory.title, hit.score)

Alles bleibt auf dem Gerät: Der Server lauscht nur auf 127.0.0.1.
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

__version__ = "0.1.0"
