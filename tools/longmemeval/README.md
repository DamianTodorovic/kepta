# K3PTA × LongMemEval — der Runner

Ziel: **LongMemEval ≥ 70 %**, unabhängig reproduzierbar, als öffentliches Asset im Core-Repo.
Benchmark-Paper: Wu et al., „LongMemEval: Benchmarking Chat Assistants on Long-Term
Interactive Memory" (ICLR 2025) — 500 Fragen über wochenlange Chat-Historien, fünf
Fähigkeiten: Informations-Extraktion, Multi-Session-Reasoning, Temporal-Reasoning,
Knowledge-Updates, Abstention („das weiß ich nicht" erkennen).

## Methodik (so läuft der Test)

1. **Ingest:** Jede Haystack-Session wird als Memories in einen frischen K3PTA-Store
   geschrieben — über **denselben Produkt-Schreibpfad** (`saveWithIndex`: Store +
   Index + Entitäten, kein Sonderweg). Ein Turn = eine Notiz, Typ nach Klassifikation,
   Zeitstempel aus dem Session-Datum (bi-temporal: gültig-ab = Session-Datum),
   Quellverweis `session_id` in der Notiz. Determinismus: Memory-ID = Hash aus
   `session_id#turn`, Dedup per Turn — ein zweiter Lauf ändert nichts.
2. **Antworten:** Jede Frage läuft durch den EINEN Suchpfad (FTS5-BM25 + Vektoren +
   Graph → RRF → Boosts), die Top-k-Notizen bilden den Antwortkontext. Orakel-
   Felder (`answer_session_ids`) werden NIE gelesen; der Runner warnt, wenn der
   Datensatz sie trägt.
3. **Richten:** Ein lokales LLM (Ollama, gleiche Maschine) bewertet Kontext gegen
   Referenz — ja/nein/teilweise, pro Frage. **Modell fixiert: `llama3.2:3b`**,
   Temperatur 0. Judge-Prompt committed (`JUDGE_PROMPT`, Version 1), ändert sich
   nur mit Versionsbump. Abstention-Fragen werden **umgekehrt gewertet**: liefert
   der Suchpfad nichts, kann die Assistenz korrekt verzichten (Punkt); enthält der
   Kontext „eine Antwort", halluziniert sie (kein Punkt).
4. **Report:** Genauigkeit gesamt + pro Fähigkeit, Abstention-Leer-Quote,
   Judge-Parse-Fehler — JSON in `ergebnisse/` mit Datum, Modell (+Ollama-Version),
   K3PTA-Version, Commit, Top-k und Datensatz-SHA-256. Nichts wird behauptet, was
   nicht in der Datei steht.

## Stand (21.9.2026): Pipeline komplett, erste Zahl steht aus

- `harness.ts` — alle drei Phasen implementiert (Ingest/Antworten/Judge) + Report;
  9 Tests in `tests/longmemeval.test.ts`; End-to-End-Smoke mit echtem Ollama-Judge
  verifiziert.
- `lade-datensatz.mjs` — Download von der offiziellen Hugging-Face-Quelle
  (`xiaowu0162/LongMemEval`), SHA-256 wird ausgegeben; der Datensatz landet in
  `datensatz/` (gitignored) und wird **nicht** ins Repo committed.
- Judge-Modell-Erkenntnis (21.9.): `llama3.2:1b` versagt als strenger Richter
  (bewertet wörtlich enthaltene Fakten als NO) → `llama3.2:3b` fixiert, im
  OriginaI-Prompt verifiziert auf Ja/Nein/Teilweise-Fällen.

## Stand (22.9.2026): erste Zahl — 29,2 % auf LongMemEval-S (Baseline)

Erster voller Lauf, 500/500 gerichtet, 0 Judge-Parse-Fehler. Bericht:
`ergebnisse/longmemeval-2026-09-21-08d8dad4.json` (Modell llama3.2:3b 0.34.2,
Temperatur 0, topk 8, Datensatz-SHA-256 `08d8dad4…`, K3PTA 2.13.2, Commit `d308278`).

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

Weitere Pilot-Messungen (60 stratifizierte Fragen, 29.142 Notizen, 76.871
Chunks — **nicht** mit den 500er-Zahlen vergleichbar): topk 8 lexikalisch
32,5 % · Vektorspur (`--vektoren`, Produkt-Embedding-Queue) allein 30,8 % —
sie verdrängt bei engem topk die exakten Treffer · topk 12 35,0 % ·
`--zeitsplit` neutral (35,0 %).

### Die Schalter des Runners

| Flag | Wirkung |
|---|---|
| `--topk K` | Breite der Retrieval (12 hat sich gegen 8 durchgesetzt) |
| `--vektoren` | bettet alle Chunks über die Produkt-Embedding-Queue ein; ohne Ollama lexikalisch |
| `--zeitsplit` | Zeitfragen werden in Ereignis-Teilfragen zerlegt, Treffer nur ergänzend |
| `--temporal` | Zeitfragen bekommen einen Timeline-Block (Memory-Daten, Abstände, Spanne) vorangestellt |

### Nächste Hebel

1. Temporal-Tiefe: die Timeline deckt nur geretrieviewte Memories ab — wenn die
   Retrieval ein Ereignis verpasst, ist die Spanne falsch. Kandidat: Zeitsplit +
   Timeline kombiniert (messung offen).
2. Vektor-Band-Feintuning (Band/Floor der Engine), erst wenn die Vektorspur
   netto gewinnt.
3. Jede Verbesserung wird mit vollem 500er-Lauf und per-question Record
   veröffentlicht — die Serie ist das Asset.

## Stand (1.10.2026): 61,5 % — und der größte Sprung kam vom Richter

Alle Läufe unterhalb sind 500-Fragen-Läufe, jeder mit Per-Frage-Record im
öffentlichen Core-Repo unter `tools/longmemeval/ergebnisse/`:

| Datum | Konfiguration | Richter | LongMemEval-S (500) |
|---|---|---|---|
| 22.9. | lexikalisch, topk 8 | llama3.2:3b | 29,2 % |
| 24.9. | topk 12 | llama3.2:3b | 32,5 % |
| 24.9. | topk 12 + `--temporal` | llama3.2:3b | 33,2 % |
| 25.9. | + Vektorspur (`--vektoren`) | llama3.2:3b | 37,0 % |
| 1.10. | topk 16, Vektorspur | llama3.2:3b | 39,0 % |
| 1.10. | **dieselbe Engine, nur der Richter getauscht** | qwen2.5:14b-instruct | **54,6 %** |
| 1.10. | + HyDE | qwen2.5:14b-instruct | 55,0 % |
| 1.10. | + topk 32 | qwen2.5:14b-instruct | 61,1 % |
| 1.10. | + `--zeitsplit` | qwen2.5:14b-instruct | **61,5 %** |

**Was die Serie zeigt:** Der einzelne größte Sprung ist keine Retrieval-
Änderung, sondern das Judge-Modell — 39,0 % mit `llama3.2:3b` gegen 54,6 % mit
`qwen2.5:14b-instruct` bei identischer Engine. Der A/B auf 60 geschichteten
Fragen weist es isoliert aus: 42,5 % → 54,2 % (+11,7 pp),
`judge-ab-pilot60-3b.json` gegen `judge-ab-pilot60-14b.json`. Wer eine Zahl aus
dieser Serie vergleicht, vergleicht immer auch den Richter.

**Was 61,5 % heißt:** 202 `ja`, 211 `teilweise`, 87 `nein` — ein halber Punkt
für eine teilweise richtige Antwort. Streng binär (nur `ja`) sind es **40,4 %**.
Pro Fähigkeit: information_extraction 126 → 84,9 % · multi_session_reasoning
133 → 50,4 % · temporal_reasoning 133 → 45,5 % · knowledge_updates 78 → 76,9 % ·
abstention 0 (der Split enthält keine).

**Der Lauf selbst:** `qwen2.5:14b-instruct-q4_K_M`, Ollama 0.33.2, Temperatur 0,
topk 32, HyDE (569 Erweiterungen), `--zeitsplit` + `--temporal`, Vektorspur an,
Datensatz `longmemeval_s` SHA-256 `08d8dad4…`, K3PTA 2.13.22, 10.376
Judge-Aufrufe, 0 Parse-Fehler, 98 min Laufzeit.
Record: `longmemeval-2026-10-01-08d8dad4-topk32-hyde-zeitsplit-14b.json`.

**Drei Grenzen, die dazugehören:**

1. **In-sample.** Die Schalter (topk, HyDE, Band/Floor) sind auf demselben Split
   getuned, auf dem gemessen wird. Der Runner im öffentlichen Core-Repo hat seit
   dem Audit `--offset`, das einen Holdout abschneidet — gelaufen ist der noch
   nicht. Diese App-Kopie kennt das Flag noch nicht; die Messreihe läuft auf dem
   Core-Stand.
2. **Vektorspur an.** `used_vectors: true`; ohne laufenden Embedder fällt die
   Antwort auf die lexikalische Spur zurück, und die liegt deutlich niedriger.
3. **Kontext-Suffizienz, kein Leaderboard.** Bewertet wird, ob der gerufene
   Kontext die Antwort trägt — lokal, ohne Generator-LLM. Das ist nicht die
   End-to-End-Genauigkeit, mit der Vendor-Benchmarks vergleichen.
