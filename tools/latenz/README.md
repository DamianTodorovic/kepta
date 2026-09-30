# Latenz-Benchmark — der eine Suchpfad, gemessen

Läuft mit `npx tsx tools/latenz/bench.ts --n 100000 --out ergebnisse/latenz-100k-2026-09-30.json`.

## Was gemessen wird — und was bewusst nicht

- **Schreiben über den Produkt-Pfad:** `saveWithIndex()` (Chunks + FTS5 + Wissensgraph) ohne äußere Transaktion, WAL, Default-Pragmas. Nichts beschönigt.
- **Suchen über DEN einen Suchpfad:** `searchMemories()` aus `src/core/engine.ts` — derselbe Pfad, den MCP, HTTP-API und der Harness nutzen. Inklusive `loadActive()` (lädt **alle** aktiven Erinnerungen je Abfrage), inklusive Reranking, inklusive Query-Erweiterung.
- **Embedder:** ein lokaler Stub-HTTP-Server antwortet mit deterministischen 768-dim-Vektoren (Dimension von `nomic-embed-text`). Der Vektor-Suchpfad läuft so reproduzierbar — gemessen wird die Engine, nicht die Wartezeit eines Modells.
- **Verschlüsselung aus** (Default-Extensions, Klartext): die Messung isoliert die Engine-Kosten; die Krypto-Costs sind konstant je Seite und verfälschen die Skalierungskurve nicht.
- **Abfrage-Mix:** 70 % Begriffe aus dem Korpus (Treffer-Fälle), 30 % Zufalls-Kombinationen (Verfehlen-Fälle), Seed-fixiert (`20260930`), 300 Abfragen, Warmup fliegt raus.

## Bester Stand (30.9.2026, MacBook — siehe JSON für Hardware)

| Kennzahl | Wert bei 100.000 Erinnerungen |
|---|---|
| Ingest, Produkt-Pfad | **2.530 Erinnerungen/s** (linear bis 100k, 39,5 s gesamt) |
| Ingest, Roh-Pfad (`createMemory`) | 10.121/s |
| Suche p50 / p95 / p99 | **6.986 / 7.156 / 7.496 ms** |
| DB-Größe | 188 MB |

## Der Befund (das ist der Punkt des Benchmarks)

Die Suche ist bei 100k Erinnerungen **~140× zu langsam** für das Ziel p95 < 50 ms. Ursache ist nicht SQLite und nicht die Krypto, sondern der Suchpfad selbst:

1. **`loadActive()` pro Abfrage** (`engine.ts`): 20 geseitigte SELECTs, die alle aktiven Erinnerungen **voll materialisieren** (Titel + ganzer Inhalt) und je Zeile `toLowerCase()` laufen lassen — bei 100k Zeilen pro einziger Suche.
2. **`entityMentionsInQuery()` pro Abfrage**: lädt den gesamten Graphen (`getGraph`), nur um Abfrage-Entitäten zu finden.
3. **`allEmbeddableChunks()` pro Abfrage**: lädt alle Chunk-Vektoren (hier 20k × 768 × 4 B ≈ 60 MB) in den Speicher, um Cosine zu rechnen.

## Nächster Hebel (P3, Working-Backwards-Schritt)

Cache der aktiven Erinnerungen auf Store-Ebene mit **expliziter Invalidierung**: `KeptaStore` bekommt einen Daten-Generation-Zähler, der am Ende **jeder** mutierenden Methode (upsert/update/trash/restore/supersede/bulk/import/sync/migrate) hochgezählt wird; `searchMemories` nutzt den Cache nur bei unveränderter Generation. Ergebnis-Korrektheit hat Vorrang vor Tempo: Invalidation-Audit als Testmatrix über alle mutierenden Methoden. Danach: Graph-Abfrage-Stub und Streaming-Chunks fürs Vektor-Bein. Ziel-Meilensteine: p95 < 500 ms @ 100k → < 200 ms → < 50 ms, jeder Schritt ein neuer Record in `ergebnisse/`.

## Ehrlichkeits-Regeln

- Jede Zahl hier liegt als JSON in `ergebnisse/` und ist mit dem Skript reproduzierbar.
- Keine Zahl wird zitiert, die nicht aus einem Commit in diesem Ordner stammt.
- Hardware steht im JSON; Läufe über verschiedene Maschinen werden nicht gemischt.
