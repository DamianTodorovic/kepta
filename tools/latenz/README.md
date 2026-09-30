# Latenz-Benchmark — der eine Suchpfad, gemessen

Läuft mit `npx tsx tools/latenz/bench.ts --n 100000 --out ergebnisse/latenz-100k-2026-09-30.json`.

## Was gemessen wird — und was bewusst nicht

- **Schreiben über den Produkt-Pfad:** `saveWithIndex()` (Chunks + FTS5 + Wissensgraph) ohne äußere Transaktion, WAL, Default-Pragmas. Nichts beschönigt.
- **Suchen über DEN einen Suchpfad:** `searchMemories()` aus `src/core/engine.ts` — derselbe Pfad, den MCP, HTTP-API und der Harness nutzen. Inklusive `loadActive()` (lädt **alle** aktiven Erinnerungen je Abfrage), inklusive Reranking, inklusive Query-Erweiterung.
- **Embedder:** ein lokaler Stub-HTTP-Server antwortet mit deterministischen 768-dim-Vektoren (Dimension von `nomic-embed-text`). Der Vektor-Suchpfad läuft so reproduzierbar — gemessen wird die Engine, nicht die Wartezeit eines Modells.
- **Verschlüsselung aus** (Default-Extensions, Klartext): die Messung isoliert die Engine-Kosten; die Krypto-Costs sind konstant je Seite und verfälschen die Skalierungskurve nicht.
- **Abfrage-Mix:** 70 % Begriffe aus dem Korpus (Treffer-Fälle), 30 % Zufalls-Kombinationen (Verfehlen-Fälle), Seed-fixiert (`20260930`), 300 Abfragen, Warmup fliegt raus.

## Messreihe (MacBook — Hardware je JSON)

| Datum | Stand | p50 | p95 | p99 | Ingest (Produkt-Pfad) |
|---|---|---|---|---|---|
| 30.9.2026 | ohne Cache (`latenz-100k-2026-09-30.json`) | 6.986 ms | 7.156 ms | 7.496 ms | 2.530/s |
| 1.10.2026 | **mit Such-Cache** (`latenz-100k-cache-2026-10-01.json`) | **83,1 ms** | **94,8 ms** | 100,8 ms | 5.102/s |

**Faktor 76 auf p95.** Ziel-Meilensteine bleiben: p95 < 50 ms @ 100k → dann 1 Mio.

## Der Hebel: Such-Cache an der datenGeneration

Der Suchpfad materialisierte bei **jeder** Abfrage alles: `loadActive()` (alle aktiven Erinnerungen voll + lowercase), `allEmbeddableChunks()` (alle Vektoren), `getGraph()` (aller Graph) — bei 100k Erinnerungen ~7 s je Suche. Jetzt cacht die Engine diese drei Voll-Läufe pro Store an einem **Generationszähler**, den SQLite-Trigger bei jeder Mutation von `memories`/`chunks`/`entities`/`relations` erhöhen — auch direkte SQL-Importe invalidieren damit zuverlässig (Audit-Tests: `tests/core/suchcache.test.ts`, inkl. Roh-INSERT am Methoden-Audit vorbei).

Zwei Feinheiten, die Korrektheit sichern:
- Der UPDATE-Trigger zählt nur **inhaltliche** Änderungen (WHEN-Klausel). Grund: `recordAccess()` schreibt nach JEDER Suche Zugriffsstatistik — hätte der Trigger das gezählt, hätte die Suche sich selbst invalidiert.
- Stattdessen patcht die Engine die neuen Zugriffsstände direkt in die gecachten Records — die nächste Suche sieht exakt dieselben Werte wie ohne Cache, keine Approximation.

Nächste Kostenblöcke auf dem Weg zu < 50 ms (aus dem Feinprofil): Kosinus-Schleife über 20k×768-dim-Chunks, Rerank-Breite 500, FTS-Tiefe. Danach der Sprung auf 1 Mio Erinnerungen.

## Ehrlichkeits-Regeln

- Jede Zahl hier liegt als JSON in `ergebnisse/` und ist mit dem Skript reproduzierbar.
- Keine Zahl wird zitiert, die nicht aus einem Commit in diesem Ordner stammt.
- Hardware steht im JSON; Läufe über verschiedene Maschinen werden nicht gemischt.
