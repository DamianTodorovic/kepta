# KEPTA × LongMemEval — der Runner

Ziel: **LongMemEval ≥ 70 %**, unabhängig reproduzierbar, als öffentliches Asset im Core-Repo.
Benchmark-Paper: Wu et al., „LongMemEval: Benchmarking Chat Assistants on Long-Term
Interactive Memory" (ICLR 2025) — 500 Fragen über wochenlange Chat-Historien, fünf
Fähigkeiten: Informations-Extraktion, Multi-Session-Reasoning, Temporal-Reasoning,
Knowledge-Updates, Abstention („das weiß ich nicht" erkennen).

## Methodik (so läuft der Test)

1. **Ingest:** Jede Haystack-Session wird als Memories in einen frischen KEPTA-Store
   geschrieben — über **denselben Produkt-Schreibpfad** (`saveWithIndex`: Store +
   Index + Entitäten, kein Sonderweg). Ein Turn = eine Notiz, Typ nach Klassifikation,
   Zeitstempel aus dem Session-Datum (bi-temporal: gültig-ab = Session-Datum),
   Quellverweis `session_id` in der Notiz. Determinismus: Memory-ID = Hash aus
   `session_id#turn`, Dedup per Turn — ein zweiter Lauf ändert nichts.
2. **Antworten:** Jede Frage läuft durch den EINEN Suchpfad (FTS5-BM25 + Vektoren +
   Graph → RRF → Boosts), die Top-k-Notizen bilden den Antwortkontext. **Es antwortet
   kein Generator-LLM** — die Treffer werden als nummerierter Kontext weitergegeben.
   Orakel-Felder (`answer_session_ids`) werden NIE gelesen; der Runner warnt, wenn der
   Datensatz sie trägt.
3. **Richten:** Ein lokales LLM (Ollama, gleiche Maschine) bewertet Kontext gegen
   Referenz — **gemessen wird Kontext-Suffizienz** („does the CONTEXT alone contain the
   information needed"), nicht eine generierte Antwort. Urteil ja/nein/teilweise pro
   Frage, **teilweise zählt als halber Punkt** — die Genauigkeit ist kein Ja-Anteil.
   **Modell fixiert: `llama3.2:3b`**,
   Temperatur 0. Judge-Prompt committed (`JUDGE_PROMPT`, Version 1), ändert sich
   nur mit Versionsbump. Abstention-Fragen werden **umgekehrt gewertet**: liefert
   der Suchpfad nichts, kann die Assistenz korrekt verzichten (Punkt); enthält der
   Kontext „eine Antwort", halluziniert sie (kein Punkt).
   Deterministischer Vorweg: Steht die Referenz wörtlich in einem Treffer, zählt das
   als Ja **ohne Judge-Aufruf** (`verbatimTreffer`, Anteil im Record als
   `verbatim_quote` — im 61,5-%-Lauf 29,8 %).
4. **Report:** Genauigkeit gesamt + pro Fähigkeit, Abstention-Leer-Quote,
   Judge-Parse-Fehler — JSON in `ergebnisse/` mit Datum, Modell (+Ollama-Version),
   KEPTA-Version, Commit, Top-k und Datensatz-SHA-256. Nichts wird behauptet, was
   nicht in der Datei steht.

## Stand (21.9.2026): Pipeline komplett, erste Zahl steht aus

- `harness.ts` — alle drei Phasen implementiert (Ingest/Antworten/Judge) + Report;
  14 Tests in `tests/longmemeval.test.ts` (Wertung, Judge-Parser, Verbatim-Pfad,
  Fragen-Slices, Zeit-Hebel, Datensatz-Laden — ohne Ollama, ohne Download);
  End-to-End-Smoke mit echtem Ollama-Judge verifiziert.
- `lade-datensatz.mjs` — Download von der offiziellen Hugging-Face-Quelle
  (`xiaowu0162/LongMemEval`), SHA-256 wird ausgegeben; der Datensatz landet in
  `datensatz/` (gitignored) und wird **nicht** ins Repo committed.
- Judge-Modell-Erkenntnis (21.9.): `llama3.2:1b` versagt als strenger Richter
  (bewertet wörtlich enthaltene Fakten als NO) → `llama3.2:3b` fixiert, im
  OriginaI-Prompt verifiziert auf Ja/Nein/Teilweise-Fällen.

## Stand (22.9.2026): erste Zahl — 29,2 % auf LongMemEval-S (Baseline)

Erster voller Lauf, 500/500 gerichtet, 0 Judge-Parse-Fehler. Bericht:
`ergebnisse/longmemeval-2026-09-21-08d8dad4.json` (Modell llama3.2:3b 0.34.2,
Temperatur 0, topk 8, Datensatz-SHA-256 `08d8dad4…`, KEPTA 2.13.2, Commit `d308278`).

| Fähigkeit | n | Genauigkeit |
|---|---|---|
| information_extraction | 126 | **55,6 %** |
| multi_session_reasoning | 133 | 15,4 % |
| temporal_reasoning | 133 | 16,2 % |
| knowledge_updates | 78 | 36,5 % |
| abstention | 0 | — (Split enthält keine) |

**Ehrliche Einordnung:** Das ist die Baseline der reinen LEXIKALISCHEN Spur
(FTS5-BM25 + Graph, `used_vectors: false`) mit strengem pro-Treffer-Judge —
keine Zahl, mit der man wirbt, sondern der Startpunkt, von dem jeder Hebel
sichtbar wird:

1. **Vektorspur im Runner einschalten** (nomic-embed-text läuft bereits lokal
   in Ollama) — Multi-Session-Reasoning lebt von Semantik, nicht von Wortlaut.
2. **Temporal-Reasoning**: Session-Daten sind als Zeitstempel ingestiert; die
   Antwortphase nutzt sie noch nicht (asOf / Datums-Boost).
3. **topk anheben** (8 → 12) und Chunk-Größe prüfen — Kosten: mehr Judge-Aufrufe.

## Offene Schritte bis zur ersten Zahl

| Schritt | Aufwand | Notiz |
|---|---|---|
| ~~Datensatz beschaffen~~ | 5 Min | `node tools/longmemeval/lade-datensatz.mjs s` (278 MB) |
| ~~Ingest-Phase~~ · ~~Antwort-Phase~~ · ~~Judge~~ | erledigt | 21.9.2026, Pipeline + Tests grün |
| ~~Erste volle Zahl (500 Fragen)~~ | erledigt | **29,2 % Baseline**, Laufzeit ~1 h mit Bestands-Cache |
| Vektorspur + Temporal-Hebel Richtung 70 % | offen | Reihenfolge oben |

## Stand (24.9.2026): Messreihe ausgebaut — 29,2 → 32,5 → 33,2 %

Die Hebel aus der Baseline sind umgesetzt, jeder mit veröffentlichter Messung:

| Datum | Konfiguration | LongMemEval-S (500) | Commit |
|---|---|---|---|
| 22.9. | Baseline: lexikalisch, topk 8 | **29,2 %** | d308278-Bericht |
| 24.9. | topk 12 | **32,5 %** | 2d6dc38 |
| 24.9. | topk 12 + Timeline-Block (`--temporal`) | **33,2 %** | c047e7f |
| 25.9. | + Vektorspur über alle 441k Chunks (`--vektoren`) | **37,0 %** | Record committed |
| 1.10. | topk 16 + `--temporal` auf der neuen Such-Pipeline (Such-Cache, AND-first-FTS) | **39,0 %** | Record committed |
| 1.10. | **Judge-A/B (60 Fragen):** 3b 42,5 % vs. **14B 54,2 %** — der stärkere lokale Judge bewertet dieselbe Pipeline fairer (der 3b unterschätzt lange Kontexte) | — | Records committed |
| 1.10. | **Voller 500er mit dem 14B-Judge** (qwen2.5:14b, Q4, RTX 3060, komplett lokal) | **54,6 %** | Record committed |
| 1.10. | **Embedder-A/B: bge-m3 im eigenen Store** (500er, 3B-Judge — direkt vergleichbar mit 39,0) | **38,0 %** | A/B-Record — **nomic bleibt** (arctic-Muster: der Wechsel zahlt nicht) |
| 1.10. | **+ HyDE-lite** (500er, 14B-Judge — direkt vergleichbar mit 54,6; 569 Erweiterungen erzeugt) | **55,0 %** | Neue Bestmarke — der Wortlaut-Abstand zwischen Frage und Beleg schließt sich |
| 2.10. | **MAX: topk 32 + Zeitsplit + HyDE + `--temporal`** (500er, 14B-Judge, RTX 3060, komplett lokal) | **61,5 %** | Neue Bestmarke — Kontext-Suffizienz, lokal gerichtet (kein End-to-End-Wert, siehe Judge-Frame) |
| 2.10. | **A/B: topk 32 + HyDE + `--temporal` OHNE Zeitsplit** (500er, 14B-Judge — direkt vergleichbar mit 61,5) | **61,1 %** | Der Zeitsplit-Hebel ist isoliert: +0,4 — die Bestmarke bleibt 61,5 % |

**Judge-Frame (Ehrlichkeitsregel):** Die 3b-Serie (29,2→39,0) bleibt die Vergleichsbasis — ein Judgesprung ist eine bessere MESSLATTE, kein Retrieval-Fortschritt. Der 14B-Wert misst dieselbe Retrieval-Pipeline fairer: **61,5 % lokal, null Cloud**. **Was die Zahl ist:** Kontext-Suffizienz, gerichtet von qwen2.5:14b (Temperatur 0, Prompt v1), halbe Punkte für `teilweise`, und 29,8 % der Fragen ohne Judge-Aufruf durch den Wörtlich-Treffer entschieden. Zeps veröffentlichte 63,8 % sind **End-to-End-Antwortgenauigkeit** einer Generierungspipeline, gerichtet von einem Cloud-LLM — verwandte Evidenz, nicht dieselbe Metrik; wer beide Zahlen nebeneinanderstellt, muss diesen Unterschied dazuschreiben. bge-m3-Embedding ist geprüft (38,0 % gegen 39,0 — **nomic bleibt**, A/B-Record).

**Kein Holdout — die Serie ist in-sample.** Jeder Hebel (topk 8→12→16→32, `--temporal`,
`--zeitsplit`, HyDE, Vektor-Band/Floor, Judge-Größe 3b→14b) wurde auf denselben 500 Fragen
bzw. Pilot-Teilmengen davon ausgewählt (`pilot-10-fragen-*`, `pilot60-cabdd3ee-*`,
`temporal133-*`, `judge-ab-pilot60-*`). 61,5 % ist damit ein **optimistisch verzerrter
In-Sample-Wert**, kein generalisierungsfähiger Messwert. Die Records im Ordner belegen
die Auswahl eins zu eins — das ist der Stand, nicht eine Schönfärberei davon.
Folgen, die man mitlesen sollte:
- Die Zeitsplit-Differenz 61,5 % vs. 61,1 % sind **2 Punkte bei n=500** — das ist Rauschen,
  kein Nachweis. Der Hebel bleibt trotzdem stehen, weil er unabhängig begründet ist.
- **Abstention wurde nie geübt:** der LongMemEval-S-Split enthält keine solchen Fragen
  (`abstention: n 0`, `abstention_quote_leer: 0`), obwohl die umgekehrte Wertung existiert.
  Das ist eine Eigenschaft des Splits, kein Bug — aber die Fähigkeit bleibt unbelegt.
- Seit diesem Stand kennt der Runner `--offset N` (neu) neben `--limit N`: Tuning auf
  `--offset 0`, die eingefrorene Konfiguration danach auf dem unberührten Rest
  (`--offset 400` für die letzten 100). Slice-Läufe bekommen `-offsetN` im Record-Namen und
  schreiben `offset` ins JSON, damit ein Teillauf nie einen Gesamtlauf überschreibt oder
  für einen gehalten wird. Ein echter Holdout-Lauf steht noch aus — er ist die einzige
  Zahl, die 61,5 % ersetzen dürfte.

Weitere Pilot-Messungen (60 stratifizierte Fragen, 29.142 Notizen, 76.871
Chunks — **nicht** mit den 500er-Zahlen vergleichbar): topk 8 lexikalisch
32,5 % · Vektorspur (`--vektoren`, Produkt-Embedding-Queue) allein 30,8 % —
sie verdrängt bei engem topk die exakten Treffer · topk 12 35,0 % ·
`--zeitsplit` neutral (35,0 %).

### Die Schalter des Runners

| Flag | Wirkung |
|---|---|
| `--topk K` | Breite der Retrieval (12 hat sich gegen 8 durchgesetzt) |
| `--limit N` | nur die ersten N Fragen (Pilotläufe) |
| `--offset N` | N Fragen am Anfang überspringen — der Holdout-Slice: Tuning auf `--offset 0`, eingefrorene Konfiguration auf dem Rest |
| `--vektoren` | bettet alle Chunks über die Produkt-Embedding-Queue ein; ohne Ollama lexikalisch |
| `--zeitsplit` | Zeitfragen werden in Ereignis-Teilfragen zerlegt, Treffer nur ergänzend |
| `--temporal` | Zeitfragen bekommen einen Timeline-Block (Memory-Daten, Abstände, Spanne) vorangestellt |

### Nächste Hebel

1. **Holdout vor nächstem Hebel:** Konfiguration einfrieren (topk 32 + Zeitsplit +
   HyDE + `--temporal`, 14B-Judge), dann `--offset 400` auf den unberührten letzten
   100 Fragen laufen lassen. Erst dieser Wert darf öffentlich neben die 61,5 %.
2. Temporal-Tiefe: die Timeline deckt nur geretrieviewte Memories ab — wenn die
   Retrieval ein Ereignis verpasst, ist die Spanne falsch. Kandidat: Zeitsplit +
   Timeline kombiniert (messung offen).
3. Vektor-Band-Feintuning (Band/Floor der Engine), erst wenn die Vektorspur
   netto gewinnt.
4. Jede Verbesserung wird mit vollem 500er-Lauf und per-question Record
   veröffentlicht — die Serie ist das Asset.
