# Beleg-Ordner `docs/belege/` — was hier liegt, woher es kommt, und wer es zitiert

Die Regel, die diesen Ordner gibt: **ein Beleg, den ein Kunde nicht oeffnen kann, ist kein
Beleg.** Dieser Repo ignoriert `*.log` (`.gitignore:25`), also liegt jede Messdatei hier als
`.log.txt` — Inhalt byte-identisch zum Lauf, nur die Endung erweitert. Die Wache
(`scripts/zahlen-belege.mjs`, byte-identisch zum Kern) oeffnet jedes Artefakt, das ein Satz
zitiert, und verlangt die Zahl dort; ein Beleg, den `git ls-files` nicht kennt, gilt nicht.

Was in diesem Ordner **nicht** steht: Messlaeufe des Kerns. Die App und die Engine sind zwei
Baeume, und ein Satz nennt seinen Baum. Drei Kopien von Kern-Belegen lagen hier zeitweise
ungetrackt (sie stammen aus der Nacht des 12.10., als dieselben Zahlen in beiden Raeumen
gezogen wurden) — sie sind am 13.10. in die Arbeitsmappe zuruegelegt, nicht geloescht:
`audit-2026-10-09/ablage-app-13-10/` mit einer eigenen Erklaerung. Die rote Fassung dieser
Laeufe liegt, korrekt gekuerzt, im Kern-Repo unter `docs/belege/`.

| Datei im Repo | Bytes | sha256 (16) |
|---|---|---|
| `tag-13-10/eval-korpus-1143.log.txt` | 3419 B | `8b343e7457825fa0…` |
| `tag-13-10/eval-korpus-1413.log.txt` | 4181 B | `dcd3e42dc0021921…` |
| `tag-13-10/ablation-beine-1144.log.txt` | 1904 B | `62d15147e59de149…` |

Summe: **9504 Bytes** in 3 Dateien, Stand der aeltesten Kopie: 2026-10-13 12:13 UTC.

## Die zwei Eval-Laeufe sind derselbe Lauf mit zwei Etiketten

`eval-korpus-1143.log.txt` meldet seine erste Zahl als `Precision@5: 62.2 %` / `81.1 %`.
Die Rechenstelle teilt durch `min(5, relevante Notizen)` — das ist ein Recall, gekappt, keine
Precision. Am 13.10. ist die Ausgabe der App auf `Recall@5 (capped)` umbenannt worden (der
Kern trug die Korrektur schon seit 12.10.), und `eval-korpus-1413.log.txt` ist derselbe Lauf
nach der Umbenennung: **alle Zahlen unveraendert** (`62.2 / 51.1 / 0.559` fuer die v1-Grundlage,
`81.1 / 71.1 / 0.758` fuer die Engine), die drei Zeilen heissen jetzt so, wie die Rechnung ist.
Die README zitiert den Laeuft mit dem richtigen Etikett; der aeltere bleibt liegen, weil er die
Korrektur selbst zeigt — nicht weil jemand die alte Zahl verkauft sehen wollte.

Haelt die Verwechslung nicht mehr zusammen: `scripts/ablation.ts` teilt durch 5 und meldet auf
demselben Korpus `P@5` — 23 % gegen die 81 % des Eval-Laufs. Zwei Metriken, zwei Namen, kein
Vergleich zwischen ihnen. Gewacht von `tests/eval-metrik.test.ts` (vier Faelle, mit Gegenprobe:
ein Text, der `Precision@5` druckt, wo er durch `min(5, relevante)` teilt, wird gefunden).

## Was sich nachbauen laesst und was nicht

`npm run eval` laeuft deterministisch offline — jeder kann die Zahl selbst ziehen.
`npm run ablation` braucht fuer das Vektor-Bein ein lokales Ollama mit `nomic-embed-text`;
ohne den Dienst meldet der Lauf das Bein leer. Der Beleg hier ist ein Lauf **mit** Vektor-Bein
(der Dienst stand beide Male: 12.10. nachts und 13.10. um 12:14 UTC wiederholt), und die Zeile in der
README nennt diesen Pfad, damit ein Leser weiss, was er sieht, wenn er es selbst versucht.
