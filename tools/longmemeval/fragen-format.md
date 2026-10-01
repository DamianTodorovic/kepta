# Datensatz-Format (LongMemEval)

Quelle: offizielles LongMemEval-Release (Wu et al., ICLR 2025) — **nicht** ins Repo
committed, nur der SHA-256 der verwendeten Datei wird im Ergebnis-JSON ausgewiesen.

## Erwartete Felder pro Frage (Teilmenge, die der Runner nutzt)

| Feld | Typ | Bedeutung |
|---|---|---|
| `question_id` | string | stabile ID (Dedup + Pro-Frage-Ergebnis) |
| `question_type` | string | eine der fünf Fähigkeiten |
| `question` | string | die Frage an das Gedächtnis |
| `answer` | string | Referenzantwort für den Judge |
| `haystack_sessions` | array | Sessions mit `session_id`, `session_date?`, `turns[{role, content}]` |
| `answer_session_ids` | string[] | **nur im -oracle-Split** — im vollen Test verboten (Orakel) |

## Regeln für den Runner

1. `answer_session_ids` wird im vollen Test **nie gelesen** — das Gerüst zählt nur,
   wie viele Datensätze das Feld tragen (Kontrollzahl gegen versehentliche Orakel-Nutzung).
2. Ingest: eine Session = mehrere Memories, `session_date` → Zeitstempel der Notiz
   (bi-temporal: gültig-ab = Session-Datum), Quellverweis `session_id` in der Notiz.
3. Ergebnis-JSON muss enthalten: KEPTA-Version, Modellname+Ollama-Version,
   Datensatz-Dateiname + SHA-256, Datum, Genauigkeit gesamt und pro Fähigkeit,
   Abstention-Quote, Anzahl „Fehler/Leer" pro Kategorie.

## Fairness

Kein Prompt-Tuning auf den Referenzantworten; der Judge-Prompt wird EINMAL committed
und danach nur mit Versionsbump geändert. Jede veröffentlichte Zahl verweist auf den
exakten Commit.
