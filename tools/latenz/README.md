# Latenz-Benchmark — der eine Suchpfad, gemessen

Läuft mit `npx tsx tools/latenz/bench.ts --n 100000 --out ergebnisse/latenz-100k-2026-09-30.json`.

## Was gemessen wird — und was bewusst nicht

- **Schreiben über den Produkt-Pfad:** `saveWithIndex()` (Chunks + FTS5 + Wissensgraph) ohne äußere Transaktion, WAL, Default-Pragmas. Nichts beschönigt.
- **Suchen über DEN einen Suchpfad:** `searchMemories()` aus `src/core/engine.ts` — derselbe Pfad, den MCP, HTTP-API und der Harness nutzen. Inklusive `loadActive()` (lädt **alle** aktiven Erinnerungen je Abfrage), inklusive Reranking, inklusive Query-Erweiterung.
- **Embedder:** ein lokaler Stub-HTTP-Server antwortet mit deterministischen 768-dim-Vektoren (Dimension von `nomic-embed-text`). Der Vektor-Suchpfad läuft so reproduzierbar — gemessen wird die Engine, nicht die Wartezeit eines Modells.
- **Verschlüsselung aus** (Default-Extensions, Klartext): die Messung isoliert die Engine-Kosten; die Krypto-Costs sind konstant je Seite und verfälschen die Skalierungskurve nicht.
- **Abfrage-Mix:** 70 % Begriffe aus dem Korpus (Treffer-Fälle), 30 % Zufalls-Kombinationen (Verfehlen-Fälle), Seed-fixiert (`20260930`), 300 Abfragen, Warmup fliegt raus.

## Messreihe (Apple M4, MacBook — Details je JSON)

| Datum | Stand | Erinnerungen | p50 | p95 | p99 | Ingest (Produkt-Pfad) |
|---|---|---|---|---|---|---|
| 30.9.2026 | ohne Cache (`latenz-100k-2026-09-30.json`) | 100k | 6.986 ms | 7.156 ms | 7.496 ms | 2.530/s |
| 1.10.2026 | **mit Such-Cache** (`latenz-100k-cache-2026-10-01.json`) | 100k | 83,1 ms | 94,8 ms | 100,8 ms | 5.102/s |
| 1.10.2026 | Cache + vorgerechnete Vektornormen (`latenz-100k-cache2-2026-10-01.json`) | 100k | 72,0 ms | 85,0 ms | 92,4 ms | — |
| 1.10.2026 | **1 Million Erinnerungen** (`latenz-1m-2026-10-01.json`) | 1.000.000 | 641,7 ms | **782,8 ms** | 837,4 ms | 3.618/s |
| 1.10.2026 | **AND-first-FTS** 100k (`latenz-100k-fts-2026-10-01.json`) | 100k | **46,6 ms** | 87,6 ms | 94,0 ms | — |
| 1.10.2026 | **AND-first-FTS** 1 Mio (`latenz-1m-fts-2026-10-01.json`) | 1.000.000 | **276,5 ms** | 672,5 ms | 729,3 ms | — |
| 1.10.2026 | **+ Delta-Cache-Pflege** 1 Mio (`latenz-1m-delta-2026-10-01.json`) | 1.000.000 | 256,5 ms | 649,4 ms | 715,9 ms | — |

**Der Delta-Durchbruch:** Der Cache-Aufbau nach dem Ingest kollabierte von **359,4 s auf 0,74 s** — der Such-Cache wächst jetzt mit jedem Write mit (`aktiviereSuchCacheDelta(store)` nach dem Store-Aufbau; Store-Methoden melden jede Memory-Mutation, die Engine patcht deltafisch). Der SQLite-Trigger bleibt als Sicherheitsnetz: Wege ohne Meldung (Roh-SQL, Importe) verschieben die Generation ohne Patch → Volllauf-Fallback. Serverbetrieb mit häufigen Writes zahlt damit nie einen 6-Minuten-Neuaufbau.

## Wo die verbleibenden Millisekunden liegen (1-Mio-Befund nach AND-first-FTS)

1. **Median 276,5 ms** — der AND-Schnitt hat den typischen Fall 2,3× beschleunigt und die Retrieval-Qualität byte-identisch gehalten (Eval vor/nach). 
2. **Der p95-Schwanz (672 ms):** dünne AND-Schnitte zahlen den vollen OR-Scan doppelt — auf dem Bench-Korpus ein Worst-Case, denn jedes Dokument teilt denselben 12-Wort-Vokabular (in echter Zipf-Verteilung sind Terme viel seltener). Hebel: OR-Fallback mit begrenzter Scan-Tiefe (FTS5 bietet das nicht nativ — eigener Posting-Cursor) oder Quorum-Matching (`NEAR`/K-of-N), beides Retrieval-Verhalten → nur mit Eval-Gegenprobe.
3. **Cache-Aufbau bei 1 Mio: GELÖST (Delta-Pflege)** — 398 s → 0,74 s, weil der Cache mit jedem Write mitwächst; der Trigger-Generation-Vergleich bleibt als Sicherheitsnetz für unbemeldete Schreibwege (Roh-SQL, Importe).
4. Kosinus-Spur klein (Normen vorgerechnet, 20k Chunks konstant); Rerank über 500 Kandidaten konstant.

Ehrliche Einordnung: Die < 50 ms-Zahl bei 1 Mio ist **nicht erreicht** und wird nicht behauptet, bevor der Record im Repo liegt. Stand: 276,5 ms (Median) / 672,5 ms (p95).

## Der Hebel: Such-Cache an der datenGeneration

Der Suchpfad materialisierte bei **jeder** Abfrage alles: `loadActive()` (alle aktiven Erinnerungen voll + lowercase), `allEmbeddableChunks()` (alle Vektoren), `getGraph()` (aller Graph) — bei 100k Erinnerungen ~7 s je Suche. Jetzt cacht die Engine diese drei Voll-Läufe pro Store an einem **Generationszähler**, den SQLite-Trigger bei jeder Mutation von `memories`/`chunks`/`entities`/`relations` erhöhen — auch direkte SQL-Importe invalidieren damit zuverlässig (Audit-Tests: `tests/core/suchcache.test.ts`, inkl. Roh-INSERT am Methoden-Audit vorbei).

Zwei Feinheiten, die Korrektheit sichern:
- Der UPDATE-Trigger zählt nur **inhaltliche** Änderungen (WHEN-Klausel). Grund: `recordAccess()` schreibt nach JEDER Suche Zugriffsstatistik — hätte der Trigger das gezählt, hätte die Suche sich selbst invalidiert.
- Stattdessen patcht die Engine die neuen Zugriffsstände direkt in die gecachten Records — die nächste Suche sieht exakt dieselben Werte wie ohne Cache, keine Approximation.

Nächster Arbeitsschritt: FTS-Scan begrenzen (Hebel 1) und Delta-Pflege für den Cache (Hebel 2), gemessen je als neuer Record in `ergebnisse/`.

## Ehrlichkeits-Regeln

- Jede Zahl hier liegt als JSON in `ergebnisse/` und ist mit dem Skript reproduzierbar.
- Keine Zahl wird zitiert, die nicht aus einem Commit in diesem Ordner stammt.
- Hardware steht im JSON; Läufe über verschiedene Maschinen werden nicht gemischt.
