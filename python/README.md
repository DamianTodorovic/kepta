# kepta

**Python-Client für [KEPTA](https://github.com/DamianTodorovic/kepta) — dem lokalen Gedächtnis für KI-Agenten.**

Deine Agenten vergessen dich nach jedem Gespräch. KEPTA behebt das — mit einer SQLite-Datei auf deinem Rechner. Kein Konto, keine Cloud, keine Telemetrie.

Dieses Paket ist der **Client, nicht die App**. KEPTA läuft als Desktop-Anwendung auf demselben Gerät; hier verbindest du dich damit.

```bash
pip install kepta
```

## In dreißig Sekunden

```python
from kepta import KeptaClient

kepta = KeptaClient()          # findet die laufende Instanz von allein

kepta.save("Rezept Carbonara", "Guanciale, Pecorino, Eigelb. Keine Sahne.", tags=["kochen"])

for hit in kepta.search("was koche ich mit Nudeln"):
    print(f"{hit.score:.2f}  {hit.memory.title}")
```

Das Wort *Nudeln* steht in der Notiz nicht. Gefunden wird sie trotzdem — die Suche kombiniert Volltext, Vektoren und Wissensgraph per Reciprocal Rank Fusion.

## Warum das interessant ist

**Dasselbe Gedächtnis wie deine Agenten.** Claude Desktop und Cursor sprechen über MCP mit derselben Datenbank. Was dein Python-Skript schreibt, weiß Claude in der nächsten Antwort.

**Erinnerungen altern.** Jede hat Typ, Gültigkeit und Konfidenz. Zieht jemand um, verdrängt die neue Adresse die alte — die alte bleibt als Historie und fällt im Ranking ab. Widersprüche stapeln sich nicht.

```python
alt = kepta.save("Wohnort", "Alex wohnt in Hamburg.")
kepta.update(alt.id, valid_to=1788400000000)      # abgelaufen ab diesem Zeitpunkt
kepta.save("Wohnort aktuell", "Alex wohnt jetzt in Leipzig.")

m = kepta.list()[0]
m.is_expired, m.is_superseded                      # Zustand direkt am Objekt
```

**Keine Abhängigkeiten.** Nur die Standardbibliothek. Ein Gedächtnis, das Privatsphäre verspricht, sollte keinen fremden Code in deinen Prozess holen.

## Die Verbindung finden

`KeptaClient()` sucht in dieser Reihenfolge:

1. Umgebungsvariable `KEPTA_URL`
2. `~/.kepta/endpoint.json` — die Adressdatei, die KEPTA beim Start schreibt
3. `http://127.0.0.1:3000` als Rückfall für den Entwicklungsmodus

Schritt 2 ist der wichtige: Die gepackte App wählt einen zufälligen Port. Explizit geht natürlich auch:

```python
kepta = KeptaClient("http://127.0.0.1:52341")
```

Läuft nichts, bekommst du keinen kryptischen Netzwerkfehler, sondern einen Satz, der sagt, was zu tun ist:

```python
if not kepta.is_alive():
    print("KEPTA läuft nicht — App starten oder KEPTA_URL setzen.")
```

## Was der Client kann

| Methode | Zweck |
|---|---|
| `health()` · `is_alive()` | Status, Version, Anzahl Knoten |
| `list(trash=False)` | Alle Erinnerungen oder den Papierkorb |
| `search(query, top_k, tags, type, scope)` | Hybride Suche mit temporaler Gewichtung |
| `save(title, content, …)` | Anlegen — Typ, Tags, Konfidenz, Gültigkeit |
| `update(id, **felder)` | Ändern; `valid_to=` statt `validTo=` |
| `delete(id, permanent=False)` | Papierkorb, auf Wunsch endgültig |
| `restore(id)` | Aus dem Papierkorb zurückholen |
| `graph()` | Entitäten und Relationen |

`Memory` und `SearchHit` sind eingefrorene Dataclasses mit Typannotationen. `SearchHit` zeigt neben dem Gesamtwert auch die Einzelspuren `vector_score` und `lexical_score`.

## KEPTA installieren

Die App gibt es für macOS, Windows und Linux unter [Releases](https://github.com/DamianTodorovic/kepta/releases) — jeweils Intel und ARM. MIT-Lizenz, kostenlos.

## Lizenz

MIT
