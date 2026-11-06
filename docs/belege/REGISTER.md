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
| `tag-0311/eval-drei-beine-1352.log.txt` | 6562 B | `e3cff29fc8384b3a…` |
| `tag-0311/eval-bge-m3-1404.log.txt` | 6144 B | `e136f87d902ee5e2…` |
| `tag-0311/sprachuebergriff-nomic-1406.log.txt` | 2623 B | `390c15c2cf839f2c…` |
| `tag-0311/sprachuebergriff-bge-m3-1406.log.txt` | 2631 B | `eb01ff875ec16b39…` |
| `tag-0411/wortschatz-vor-3-2-138-2233.log.txt` | 1648 B | `7cf81827ff35447e…` |
| `tag-0411/wortschatz-nach-3-2-139-0023.log.txt` | 959 B | `92084dce677a6844…` |
| `tag-0411/tuer-48-vor-3-2-139-0123.log.txt` | 4355 B | `31bcebfde0182eb1…` |
| `tag-0411/tuer-48-nach-der-heilung-am-baum-0150.log.txt` | 4388 B | `7428ed38b6e73497…` |
| `tag-0411/tuer-48-landung-3-2-140-0220.log.txt` | 4394 B | `d1ee4f7532d02440…` |
| `tag-0411/spurbau-grundlagen-40000-0136.log.txt` | 2651 B | `48847604a5ff01ac…` |
| `tag-0411/begriffsnamen-form-0159.log.txt` | 783 B | `a31931315d622e1a…` |
| `tag-0411/tuer-53-vor-3-2-140-bund-0549.log.txt` | 4544 B | `418cdc25a488f34a…` |
| `tag-0411/tuer-53-nach-3-2-142-bund-0550.log.txt` | 4477 B | `b7718ae78e8dc48a…` |
| `tag-0411/tuer-53-objekt-3-2-142-0602.log.txt` | 4479 B | `b51deb57b55e62b6…` |
| `tag-0411/objekt-3-2-143-legende-und-fenster-0628.log.txt` | 9302 B | `0c4faa9f7dc3b646…` |
| `tag-0411/verstaendlichkeit-objekt-0800.log.txt` | 7287 B | `7e84b56971bb47ce…` |
| `tag-0411/verstaendlichkeit-objekt-3-2-144-1545.log.txt` | 6976 B | `5bb3fa207afa0da9…` |
| `tag-0411/objekt-3-2-145-fit-titel-1601.log.txt` | 3941 B | `4f705a2960539da1…` |
| `tag-0411/fps-400-1614.log.txt` | 1494 B | `4794122f31b6f168…` |
| `tag-0411/fps-1500-1616.log.txt` | 1498 B | `80d505454daa6c4b…` |
| `tag-0411/fps-3000-1610.log.txt` | 1502 B | `c4fd4233a647584e…` |
| `tag-0411/fps-3000-1938.log.txt` | 1761 B | `298741b05e73018c…` |
| `tag-0411/fps-3000-nach-146.log.txt` | 1716 B | `6a2b7d8fe3ec1970…` |
| `tag-0411/fps-3000-verweigerung-146.log.txt` | 373 B | `3e1fe12981f18c81…` |
| `tag-0411/begriffskurve-3000-2009.log.txt` | 2373 B | `aa9e1661b751ac1b…` |
| `tag-0411/fps-3000-mit-kopf-und-farbe-2014.log.txt` | 2121 B | `ecadeef466000735…` |
| `tag-0411/fps-3000-148-2049.log.txt` | 3923 B | `5e97e489a1d36976…` |
| `tag-0411/fps-3000-148-2052.log.txt` | 3928 B | `7caf4c7efeb5f306…` |
| `tag-0411/fps-3000-148-2054.log.txt` | 3837 B | `1361eee0e05d74b7…` |
| `tag-0411/fps-400-148-2057.log.txt` | 3773 B | `16aece9126685ad1…` |
| `tag-0411/fps-1500-148-2059.log.txt` | 3793 B | `fda1e10fdc7e167b…` |
| `tag-0411/fps-3000-149-2109.log.txt` | 3900 B | `495d020de8fd380d…` |
| `tag-0411/fps-3000-149-abbruch-2115.log.txt` | 3460 B | `df1ae59f53bff27a…` |
| `tag-0411/fps-3000-149-nachzug-2119.log.txt` | 4039 B | `aa474a2357b5c023…` |
| `tag-0411/fps-3000-149-ruhig-2132.log.txt` | 3994 B | `cd8708cfc25c3122…` |
| `tag-0411/fenster-pruefer-3-2-151-2311.log.txt` | 20654 B | `0c69863a9ef5ceb5…` |
| `tag-0411/einstellungen-tab-152-2349.log.txt` | 1573 B | `37088707f8a3c371…` |
| `tag-13-10/eval-korpus-1143.log.txt` | 3419 B | `8b343e7457825fa0…` |
| `tag-13-10/eval-korpus-1413.log.txt` | 4181 B | `dcd3e42dc0021921…` |
| `tag-13-10/ablation-beine-1144.log.txt` | 1904 B | `62d15147e59de149…` |
| `app-abnahme/nachzug-vorher-rot.log.txt` | 6030 B | `1e240e7500dd47b2…` |
| `app-abnahme/nachzug-tuer-gruen.log.txt` | 1008 B | `5bf5486e036c9104…` |
| `app-abnahme/nachzug-flaeche-vorher-rot.log.txt` | 16278 B | `9c0ac4b1640fd829…` |
| `app-abnahme/nachzug-flaeche-gruen.log.txt` | 19204 B | `1e6eb0616a86a748…` |
| `app-abnahme/nachzug-mutation-rot.log.txt` | 22052 B | `1c8a44f87cda8e3a…` |

Summe: **269 634 Bytes in 51 Dateien** (gemessen am 5.11. um 12:19:14 MEZ mit `find` ueber den Ordner und `stat` je Datei, ohne `REGISTER.md` selbst; Zeilen und Dateien gegeneinander gezaehlt: 51 Zeilen, 51 Dateien, keine fehlt in einer der beiden Richtungen. Die vorige Zeile meldete 248 397 in 50 — der Zuwachs ist der Fenster-Volllauf gegen das ausgelieferte 3.2.154. Ein Zaehlfehler in einer Summen-Zeile ist hier schon zweimal vorgekommen, darum steht die Pruefung mit in der Zeile:
`find docs/belege -name '*.log.txt'`). Die fuenf Laeufe des 4.11. bis 02:21 machen 16 571
Bytes aus, die drei von Aufgabe #53 (05:49, 05:50 und 06:02 MEZ) 13 500 Bytes, der
Objektnachlauf von 3.2.143 (06:28 MEZ) 9 302 Bytes, der Sprach-Census (08:00 MEZ) 7 287 Bytes
und sein Wiederlauf am ausgelieferten 3.2.144 6 976 Bytes (Dateizeit 15:43:53 MEZ).
Der Fensterlauf am ausgelieferten 3.2.145 traegt 3 941 Bytes (Dateizeit 16:01:35 MEZ),
und die drei Kosten-Laeufe (400, 1 500, 3 000 Notizen) zusammen 4 494 Bytes
(Dateizeiten 16:14:19, 16:16:34 und 16:10:38 MEZ). Die drei Abendlaeufe am selben Bestand
(19:38, 19:54, und die Verweigerung des dritten) machen 1 761 + 1 716 + 373 = 3 850 Bytes aus,
und die beiden des spaeten Nachmittags 2 373 + 2 121 = 4 494 Bytes: die Begriffs-Kurve an der
Route (Dateizeit 20:09:12 MEZ) und der Kostenlauf, der zum ersten Mal den vollen Kopf der
Flaeche und die Farbe jeder Scheibe zeigt (Dateizeit 20:14:55 MEZ).

**Die fuenf Laeufe ab 20:49:52 MEZ sind die ersten mit frischem Bund.** Die Sonde baute ihren
eignen Bundle bis dahin nur, wenn er noch nicht da war; der Bundle auf der Platte stammte von
16:06 MEZ, und vier Laeufe danach (19:38, 19:54, 20:14, 20:36 MEZ) massesen dieselben alten
Bytes, waehrend ihre Protokolle 3.2.146 und 3.2.147 nannten. Seit demselben Schritt druckt der
Laeufer `fassung:` vor der ersten Zahl und bricht ab, wenn Server und Baum verschiedene
Fassungen melden. Die fuenf frischen Laeufe: 3 000 Notizen dreimal (Dateizeiten 20:49:52,
20:52:33, 20:54:54 MEZ; 621, 646 und 625 Scheiben, jedes Mal **0 Paare**) und die zwei
Kleineren danach (400 Notizen: 418 Scheiben, 0 Paare, 20:57:20 MEZ; 1 500 Notizen: 528
Scheiben, 0 Paare, 20:59:38 MEZ), alle an 3.2.148.

Drei Laeufe am ausgelieferten 3.2.149 gehoeren ebenso hierher: der erste (Dateizeit
21:09:31 MEZ) bestaetigt 0 Paare bei 625 Scheiben und zeigt den Schlepp-Griff zum ersten Mal
treffend ("Kandidat 1 von 8", 99 malende Rahmen). Der zweite (Dateizeit 21:15:59 MEZ) ist ein
**Abbruch mit Grund** und bleibt als Zeuge liegen: die Nach-zug-Lesung zaehlte die Scheiben des
ganzen Zuges statt eines Rahmens, die Vereinigung wuchs ueber 99 Rahmen, und die Paar-Pruefung
warf `RangeError: Set maximum size exceeded` — Exit 1, kein Urteil. Der dritte (Dateizeit
21:19:10 MEZ) misst nach demselben Schritt mit Ruhe-Warten und einem Rahmen: 637 Scheiben und
0 Paare vor dem Zug, 645 Scheiben und **0 Paare** danach, das Feld steht nach 7,2 s.

Der Fenster-Pruefer von 23:08:47 bis 23:11:38 MEZ
(`fenster-pruefer-3-2-151-2311.log.txt`, 20 654 B) ist der erste Volllauf ueber **jede**
Einstellung am ausgelieferten 3.2.151, der seine eigne Gleichheit mitbringt: die ersten
beiden Zeilen des Protokolls sind `Artefakte bytegleich mit dem installierten Objekt: 5
(erwartet 5)` und `Bundel: 5 Stuecke geprueft, Version laut Baum 3.2.151`. Danach 154
`ok`-Urteile, keine `FEHLT`- und keine `NICHT`-Zeile, keine unverarbeitete Ausnahme im
Fenster, und 23 Bilder in der Mappe unter
`audit-2026-10-09/feldzug/belege-0411/fenster-151/`.

Die Zeile war zwei Dateien hinterher: sie schrieb am 3.11. **"92 036 Bytes in 12 Dateien"**,
waehrend `find` am 4.11. vor den neuen Laeufen **94 787 Bytes in 14 Dateien** meldete — die
beiden Wortschatz-Laeufe von 3.2.139 (2 607 Bytes) erklaeren den groessten Teil davon; wo die
restlichen 144 Bytes herkommen, ist nicht nachgesehen. Nichts in diesem Repo prüft diese
Zahl (`scripts/zahlen-belege.mjs` liest das Register nur nach
Zitaten), also gilt die Regel von Hand: **wer hier eine Datei ergaenzt, zieht die Summe im
selben Schritt nach**, und zwar aus dem Befehl, nicht aus dem Gefuehl.

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
Vergleich zwischen ihnen. Gewacht von `tests/eval-metrik.test.ts` (sechs Faelle, mit Gegenprobe:
ein Text, der `Precision@5` druckt, wo er durch `min(5, relevante)` teilt, wird gefunden).

## Der dritte Beleg: eval und ablation bauen denselben Korpus (3.11.)

`tag-0311/eval-drei-beine-1352.log.txt` ist derselbe Korpus (58 Notizen, 45 Anfragen, Zeitanker
2026-09-01T12:00 UTC) zum ersten Mal aus dem **geteilten** Aufbau `scripts/eval-store.ts` und mit
einem dritten Bein. Was der Selbstblick am 2.11. gefunden hatte: `eval.ts` baute seinen Speicher
in eigener Regie — ohne Entitaeten, ohne Index-Spuren —, waehrend `ablation.ts` den geteilten
Aufbau mit allen drei Spuren benutzte. Zwei Werkzeuge, ein Wort, zwei Systeme, und die Zahl auf
der Flaeche stammte aus dem schwacheren.

Gemessen, in drei Beinen:

| Bein | Recall@5 (gekappt) | Hit@1 | MRR |
|---|---|---|---|
| v1 naive Substring-Suche | 62,2 % | 51,1 % | 0,559 |
| v2 Engine ohne Vektoren | 81,1 % | 71,1 % | 0,758 |
| v3 Engine **mit** Vektoren — ausgeliefertes Retrieval | 91,1 % | 75,6 % | 0,812 |

v1 und v2 sind **wortgleich** zu `eval-korpus-1413.log.txt` (die sechs Zeilen der beiden Blöcke
sind per `diff` identisch): der geteilte Aufbau hat die zwei alten Beine nicht verschoben, obwohl
er Entitaeten und zwei weitere supersede-Ketten mitbringt. v3 bestaetigt unabhaengig die 76 %,
die `ablation-beine-1144.log.txt` seit 13.10. fuer "volle fusion" meldet — zwei Werkzeuge, ein
Ergebnis. Die Flaeche nennt weiterhin 71 % (den Wortlaut der README nachlesen): dieser Ast der
Zustands-Tafel laeuft genau dann, wenn **kein** Ollama antwortet, also ohne Vektor-Bein.

Neu an der Ausgabe: jede Kategorie des Korpus (lexikalisch, umschreibung, graph, temporal,
ablenkung) steht jetzt als eigne Zeile da, und das dritte Bein benennt seinen Grund, wenn der
Embedder nicht antwortet, statt still zwei Beine zu zeigen. Die schwachsten Kategorien sind
`umschreibung` (3 Hit@1 von 10, auch mit Vektoren) und `temporal` (2 von 3; die eine Anfrage
"Bis wann muss die Umsatzsteuer abgegeben werden?" faellt, weil die Notiz abgelaufen ist).

## Der Sprachuebergriff: die Flaeche hat zu viel versprochen (3.11.)

Zwei Saetze behaupteten, das Vektor-Bein finde auch ueber eine Sprachgrenze hinweg
(`Settings.tsx` "Semantic similarity across languages", `SystemStatus.tsx` "with vectors it
is stronger across languages too"). Beide standen ohne jeden Messlauf da. `npm run
eval:sprache` (Skript: `scripts/eval-sprachuebergriff.ts`) misst das auf 15 Paaren —
dasselbe Ziel wie im Fixkorpus, nur die Sprache der Frage verschoben, die Ziele geerbt statt
erfunden, in beiden Sprachen gemessen und mit dem Vektor-Bein auch allein:

| Lauf | deutsch Hit@1 | englisch Hit@1 | nur Vektor-Bein, englisch |
|---|---|---|---|
| `sprachuebergriff-nomic-1406` (Standard-Embedder) | 60,0 % | **26,7 %** = 4 von 15 | 26,7 % |
| `sprachuebergriff-bge-m3-1406` (mehrsprachig) | 60,0 % | **20,0 %** = 3 von 15 | 20,0 % |
| `tag-0511/einstellungen-tab-153-1040.log.txt` | 1573 B | `fc352a20adde1a31…` |
| `tag-0511/einstellungen-tab-153-390.log.txt` | 1573 B | `8befa1a85b37e279…` |
| `tag-0511/fenster-volllauf-153-1041.log.txt` | 20637 B | `38e4f6635ed13d0c…` |
| `tag-0511/health-absage-153-1440.log.txt` | 1271 B | `58d93ee902dec9e7…` |
| `tag-0511/health-absage-153-390.log.txt` | 1267 B | `d48614bb77db8ddb…` |
| `tag-0511/fenster-volllauf-154-1216.log.txt` | 21237 B | `cb3fe768e9e6c6cf…` |
| `konkurrenz-0211/mem0-fakten-3b.log.txt` | 1491 B | `86b0edecc78a5ef0…` |
| `konkurrenz-0211/spur-fakten-3b-vollstaendig.jsonl` | 18726 B | `60fd05398df850c1…` |
| `konkurrenz-0211/unser-eval-0211.log.txt` | 3799 B | `84b1f8b6298ee82e…` |
| `konkurrenz-0611/spur-fair-0611.jsonl` | 14125 B | `2c92cd1827953d8d…` |
| `konkurrenz-0611/spur-fair-0611-zwei.jsonl` | 14126 B | `a8d5ce24745c3522…` |
| `konkurrenz-0611/ergebnis-fair-0611.json` | 494 B | `6fc4af90e64fc6b1…` |
| `konkurrenz-0611/ergebnis-fair-0611-zwei.json` | 494 B | `3c3d8b3e08540801…` |
| `konkurrenz-0611/lauf-fair.py.txt` | 4218 B | `51c49e20fb8294de…` |
| `konkurrenz-0611/lauf-fair.log.txt` | 2340 B | `30505b675a38ad91…` |
| `konkurrenz-0611b/spur-sqlitevec-0611.jsonl` | 18765 B | `f90707c41e9b1757…` |
| `konkurrenz-0611b/spur-sqlitevec-0611-zwei.jsonl` | 18765 B | `1f50fe94a91bceb7…` |
| `konkurrenz-0611b/ergebnis-sqlitevec-0611.json` | 938 B | `ea3def7d28297e9f…` |
| `konkurrenz-0611b/ergebnis-sqlitevec-0611-zwei.json` | 938 B | `2b1165e49bc20746…` |
| `konkurrenz-0611b/lauf-sqlitevec.py` | 6704 B | `59d33369272039b6…` |
| `konkurrenz-0611b/korpus-aus-repo.json` | 16982 B | `86b4307f450d4dcd…` |
| `konkurrenz-0611b/lauf-sqlitevec-0611.log.txt` | 1118 B | `690eb10ea10d1147…` |
| `konkurrenz-0611b/probe-laden.py` | 1056 B | `872de252c1e0f903…` |
| `konkurrenz-0611b/smoke.py` | 1213 B | `6dc46b671206aa47…` |
| `konkurrenz-0611b/spur-sqlitevec-bge-m3.jsonl` | 18751 B | `3a1ca5e0d878dc61…` |
| `konkurrenz-0611b/spur-sqlitevec-bge-m3-zwei.jsonl` | 18751 B | `035e4668a053a871…` |
| `konkurrenz-0611b/ergebnis-sqlitevec-bge-m3.json` | 932 B | `f2cf6d3b3afb186b…` |
| `konkurrenz-0611b/ergebnis-sqlitevec-bge-m3-zwei.json` | 932 B | `0e7307cb4632c35f…` |
| `konkurrenz-0611b/lauf-bge-m3-0611.log.txt` | 1580 B | `ef76a577ca82a4e3…` |
| `konkurrenz-0611c/spur-uns-nomic-0611.jsonl` | 9365 B | `3495a16144028dca…` |
| `konkurrenz-0611c/spur-uns-nomic-0611-zwei.jsonl` | 9365 B | `3495a16144028dca…` |
| `konkurrenz-0611c/spur-uns-bge-m3-0611.jsonl` | 8829 B | `98f5d1f628576ab9…` |
| `konkurrenz-0611c/spur-uns-bge-m3-0611-zwei.jsonl` | 8829 B | `98f5d1f628576ab9…` |
| `konkurrenz-0611c/auswertung-nomic-0611.txt` | 5839 B | `89e97ae5450b3c63…` |
| `konkurrenz-0611c/auswertung-bge-m3-0611.txt` | 5839 B | `74ec9cf8fa2dc8db…` |
| `konkurrenz-0611c/stufen-sonde.ts` | 368 B | `378cc0309dfe98b0…` |
| `konkurrenz-0611c/spur-leser.ts` | 2604 B | `f0d07e6d63d1f9e9…` |
| `konkurrenz-0611c/lauf-0611.log.txt` | 3462 B | `a4736cd0f1061483…` |
| `konkurrenz-0611d/sprache-nomic-0611.txt` | 2001 B | `816a0347bf2c6a46…` |
| `konkurrenz-0611d/sprache-nomic-0611-zwei.txt` | 2001 B | `816a0347bf2c6a46…` |
| `konkurrenz-0611d/sprache-bge-m3-0611.txt` | 1815 B | `3e66f2603be81156…` |
| `konkurrenz-0611d/sprache-bge-m3-0611-zwei.txt` | 1815 B | `3e66f2603be81156…` |
| `konkurrenz-0611d/lauf-0611.log.txt` | 3240 B | `d394a8b0ab6cc968…` |
| `konkurrenz-0611e/auswertung-chroma-0611.txt` | 5149 B | `289c35814f155e39…` |
| `konkurrenz-0611e/auswertung-chroma.py` | 10381 B | `380bf822a0c55e2c…` |
| `konkurrenz-0611e/ergebnis-chroma-bge-m3-eins.json` | 1163 B | `bf6f004949ab7bc1…` |
| `konkurrenz-0611e/ergebnis-chroma-bge-m3-zwei.json` | 1377 B | `95754a71ee142bb6…` |
| `konkurrenz-0611e/ergebnis-chroma-nomic-eins.json` | 1387 B | `ecfbc8bbb18d1dc5…` |
| `konkurrenz-0611e/ergebnis-chroma-nomic-zwei.json` | 1387 B | `36bea6c351926799…` |
| `konkurrenz-0611e/gleichstand-hetzner-0611.txt` | 1656 B | `6f8c2fd388bd862e…` |
| `konkurrenz-0611e/gleichstand-hetzner.py` | 3294 B | `097293680c6d25ef…` |
| `konkurrenz-0611e/korpus-aus-repo.json` | 16983 B | `982234a1ba4b50e7…` |
| `konkurrenz-0611e/korpus-export.ts` | 991 B | `f0266f2ceb281862…` |
| `konkurrenz-0611e/lauf-0611.log.txt` | 14607 B | `6a5771ae47cdc7c6…` |
| `konkurrenz-0611e/lauf-chroma.py` | 9126 B | `c594a315b3fcaa08…` |
| `konkurrenz-0611e/sonde.py` | 3216 B | `e30f716507603fc6…` |
| `konkurrenz-0611e/spur-chroma-bge-m3-eins.jsonl` | 21264 B | `4221042cd98f66f3…` |
| `konkurrenz-0611e/spur-chroma-bge-m3-zwei.jsonl` | 21264 B | `545530cb1fea0d50…` |
| `konkurrenz-0611e/spur-chroma-nomic-eins.jsonl` | 21293 B | `9199936e17019637…` |
| `konkurrenz-0611e/spur-chroma-nomic-zwei.jsonl` | 21293 B | `cc334357b5272d1c…` |
| `konkurrenz-0611e/spur-leser-0611e.ts` | 3242 B | `e98239851519f7b5…` |
| `konkurrenz-0611e/spur-uns-bge-m3-0611e-zwei.jsonl` | 8985 B | `a893ddc638a6dc81…` |
| `konkurrenz-0611e/spur-uns-bge-m3-0611e.jsonl` | 8985 B | `a893ddc638a6dc81…` |
| `konkurrenz-0611e/spur-uns-nomic-0611e-zwei.jsonl` | 9521 B | `3a6d77d7b056413f…` |
| `konkurrenz-0611e/spur-uns-nomic-0611e.jsonl` | 9521 B | `3a6d77d7b056413f…` |
| `konkurrenz-0611e/gleichstands-zensus-0611.txt` | 1577 B | `26f9b46a5272d56f…` |
| `konkurrenz-0611e/gleichstands-zensus.py` | 4624 B | `e298adbec15ea388…` |
| `konkurrenz-0611e/beine-auf-gleichstand-0611.txt` | 8647 B | `c584294a96721d57…` |
| `konkurrenz-0611e/beine-auf-gleichstand.ts` | 3022 B | `0a7c3ad0f49873b0…` |
| `konkurrenz-0611e/vektor-bein-stumm-0611.txt` | 8256 B | `52832c2048021dc4…` |
| `konkurrenz-0611e/vektor-bein-stumm.ts` | 2365 B | `950f0dc68fca08fe…` |
| `aussendung-0611/vermessen.mjs` | 15061 B | `099f212e9bb8eee8…` |
| `aussendung-0611/aussendung-0611.json` | 4113 B | `7f213a228bd8b330…` |
| `aussendung-0611/aussendung-0611.log.txt` | 3400 B | `8377e3c64c89e082…` |
| `aussendung-0611/beweisen-3-2-190-0611.txt` | 1094 B | `21c9789fca4692a5…` |
| `aussendung-0611/github-releases-0611.json` | 153795 B | `56f94e5bd9c71d1c…` |
| `aussendungsatz-0611/zaehlen.mjs` | 13425 B | `28f5a607e0c2b7c3…` |
| `aussendungsatz-0611/satz-riss.mjs` | 3005 B | `abedac906ac83c5f…` |
| `aussendungsatz-0611/messregel.mjs` | 1617 B | `7e1e7e38b586958f…` |
| `aussendungsatz-0611/zaehlung-0611.json` | 31503 B | `8680331a0b7b2c04…` |
| `aussendungsatz-0611/zaehlung-0611.log.txt` | 15016 B | `5353fda298f79e30…` |

Drei Folgen, aufgeschrieben, weil sie die Zahl nicht schoener machen:

1. Die Behauptung ist falsch. Ohne Vektoren treffen die englischen Fragen 13,3 %, mit
   Vektoren 26,7 % — der Zugriff verdoppelt sich und bleibt bei einer von vier Fragen.
2. Das mehrsprachige Modell, das die README deutschen Notizen seit 13.9. empfiehlt, loest es
   nicht: 20,0 % gegen 26,7 %, und auf dem deutschen Korpus bettet es im Vektor-Bein allein
   *schlechter* ein (46,7 % gegen 73,3 % Hit@1, siehe die Spalte oben). Ein Modelltausch waere
   kein Gewinn und muesste trotzdem jeden vorhandenen Knoten neu einbetten — die Vektor-Spur
   filtert die Abschnitte nach ihrem Modell (`src/core/engine.ts:294`), also liegen nach einem
   Wechsel alle vorhandenen Knoten ohne passende Spur da.
3. Fusion und reines Vektor-Bein melden dasselbe Ergebnis, also liegt es am Einbettner und
   nicht an der Rangfusion. Das ist der offene Punkt, nicht die Formel.

Der volle Eval-Lauf mit `bge-m3` auf dem deutschen Korpus liegt daneben
(`eval-bge-m3-1404.log.txt`: Hit@1 77,8 %, Recall@5 90,0 %, MRR 0,825; der Standardlauf in
`eval-drei-beine-1352.log.txt` meldet demgegenueber 75,6 / 91,1 / 0,812 — gemischt, kein Grund
fuer einen Umbau). Die Wortwahl der Flaeche haelt
jetzt `tests/components/flaeche-sprach-behauptung.test.ts`: jede Zeile, die von *language* redet,
muss ihre Zahl dabeihaben, und die beiden Belege muessen im Repo liegen und ihre Hit@1-Zeile
nennen. Die Saetze selbst sind auf das Messbare zurueckgesetzt ("Meaning, not only the exact
words").

## Was sich nachbauen laesst und was nicht

`npm run eval` laeuft in zwei Beinen deterministisch offline (v1, v2) und zieht das dritte
(v3, ausgeliefertes Retrieval) ueber ein lokales Ollama mit `nomic-embed-text`; antwortet der
Dienst nicht, steht der Grund benannt in der Ausgabe und der Lauf bleibt zweibeinig.
`npm run ablation` und `npm run eval:sprache` brauchen denselben Dienst fuer ihr Vektor-Bein.
Die Belege hier sind Laeufe **mit** Vektor-Bein (der Dienst stand 12.10. nachts, 13.10. um
12:14 UTC und am 3.11. um 13:06 UTC), und die Zeile in der README nennt diesen Pfad, damit ein
Leser weiss, was er sieht, wenn er es selbst versucht.

## Die fuenf Laeufe vom 4.11.: wo die 129 ms her kamen

`tag-0411/tuer-48-vor-3-2-139-0123.log.txt` und
`tag-0411/tuer-48-nach-der-heilung-am-baum-0150.log.txt` sind derselbe Griff an derselben
Kapsel (40 000 Notizen, 160 Vektoren) vor und nach der Heilung: die Bitte nach einem
Schreibfall meldet dort `ms: 157` mit `vektor=134.74` und `ms: 193` mit `vektor=134.57`,
meldet hier `ms: 31` mit `vektor=5.82` und `ms: 34` mit `vektor=5.96`. Der Nachtrag der Spur
steht in beiden Laeufen (`deltapatches` 1 und 2), das Vektor-Bein ging in beiden mit — die
beiden Zeilen vergleichen also dieselbe Arbeit. Der hintere Lauf ist am **gebauten Baum**
gemessen (3.2.139 stand noch in `package.json`, die Heilung schon in `src/`). Nach der Landung
fuehrt dieselbe Sonde denselben Griff am **ausgelieferten Stueck**
(`tag-0411/tuer-48-landung-3-2-140-0220.log.txt`): 33 ms mit `vektor=5.79` und 39 ms mit
`vektor=6.21`, beide Schreibfaelle sichtbar gelandet, `deltapatches` 1 und 2. Der dafuer
benutzte Bund ist bytegleich zum Objekt - `dist/server.cjs` und die aus dem installierten
`app.asar` ausgepackte Datei tragen dieselbe sha256 (`ddf76cd9f2c23fc5…`); gemessen wird also
das ausgelieferte Programm, nur gegen die Kapsel statt gegen den Bestand des Rechners.

`tag-0411/spurbau-grundlagen-40000-0136.log.txt` nennt die Grundgesamtheit und die einzelnen
Lesungen: `entities: 40008`, `memory_entities: 160000`, `relations: 360000`, und die
Rangfolge der Begriffe (`store.entityNamen()`) mit `123.41` / `63.90` / `65.12 ms` ueber drei
Laeufe — dieselbe Zusammenrechnung, die vor der Heilung in jeder ersten Anfrage nach einem
Schreibfall steckte. Dasselbe Blatt zeigt, dass die uebrigen Lesungen unschuldig waren:
`store.chunksFuerMemories([1 Notiz])` mit `0.12` / `0.02` / `0.09 ms`,
`store.allEmbeddableChunks()` mit `28.32` / `1.36` / `1.24 ms`.

`tag-0411/begriffsnamen-form-0159.log.txt` ist die Form der Namen und der Preis des neuen
Wegs: eine indizierte Lesung mit 400 Stuecken `0.20 ms`, mit 4000 Stuecken `2.22 ms`, gegen
`7.11 ms` fuer die ganze Namensliste und 63.90 ms fuer deren Rangfolge. Gebildet haben diese
Zahlen zwei Einmal-Laeufe in der Kapsel (`/tmp/tuerkontrolle`, eigener Schluessel, eigener
Port 3951); die Blaetter daneben liegen in der Arbeitsmappe
(`audit-2026-10-09/feldzug/belege-0411/spurbau-*.mts`), weil sie an diesen einen Bestand
gekoepft sind und keine Dauerwache des Repos sind. Die Tuer-Laeufe fährt
`audit-2026-10-09/pf1/tuerkontrolle.mjs --nur-messen --mit-ollama`.

## Die zwei Tuer-Laeufe vom 4.11. spaet: der Einbettungs-Nachzug, vorher und nachher

`tag-0411/tuer-53-vor-3-2-140-bund-0549.log.txt` und
`tag-0411/tuer-53-nach-3-2-142-bund-0550.log.txt` sind derselbe Griff an demselben Bestand
(40 010 bis 40 013 Notizen, 80 016 bis 80 020 Abschnitte, davon 224 bis 352 mit Vektor),
gefahren gegen zwei **Bund-Ordner**:
`dist-pf1-vor/server.cjs` ist die ausgepackte Datei aus dem zurueckgelegten
`/tmp/K3PTA-vor-3.2.141.app` (3.2.140), `dist-pf1/server.cjs` der Baum von 3.2.142. Kein
git-Rueckgang, keine zweite Maschine — dasselbe Programm, zwei Bytesaetze.

Der Sonde ist fuer diese Frage eine Zeile dazugekommen: sie wartet jetzt sichtbar darauf, dass
die Einbettungs-Queue einen Abschnitt erreicht hat (`Vektor-Nachzug gelandet: ja (224 -> 256)`),
und meldet es auch, wenn sie nicht wartet. Ohne dieses Warten misst die Suche eine Welt, in
der der Nachzug noch gar nicht stattgefunden hat — genau der Fall, der 3.2.140 und 3.2.141 in
einer frueheren Runde beide gleich aussehen liess.

Was die beiden Laeufe melden, ist die Zeile `vektor` im Kopf, den die Route selbst schreibt:

    vorher  {"ms":87,  "vektor":54.98, suchbauten 2, deltapatches 0   (256 Zeilen)
    vorher  {"ms":245, "vektor":38.92, suchbauten 3, deltapatches 0   (288 Zeilen)
    nachher {"ms":43,  "vektor":11.72, suchbauten 1, deltapatches 1   (320 Zeilen)
    nachher {"ms":43,  "vektor":16.91, suchbauten 1, deltapatches 2   (352 Zeilen)

Der Bau-Zaehler bleibt beim einen Kaltstart stehen, und jeder Nachzug zaehlt als Nachtrag.
Die 245 ms des zweiten Vorher-Laufs sind nicht der Nachzug allein — in derselben Zeile stehen
`wortlese=188.71` ms Volltext-Lesung, und die haelt diese Sonde fuer einen eignen, ungetrennten
Ausreisser. Verglichen wird darum die Segment-Zahl, nicht die Gesamtzeit.

## Die Nachlaeufe am ausgelieferten Stueck (4.11. 06:02 und 06:28 MEZ)

`tag-0411/tuer-53-objekt-3-2-142-0602.log.txt` ist derselbe Schreibfall-Griff wie die beiden
Bund-Laeufe oben, aber gegen die **installierte** Fassung 3.2.142 gefahren
(`audit-2026-10-09/pf1/tuerkontrolle.mjs`, Kopfzeile `Version 3.2.142`,
Verschluesselung true, Bestand 40 014 Notizen). Er fuehrt die Heilung am Objekt: nach dem
ersten Schreibfall `vektor=14.44` ms mit `deltapatches 1` und 384 Zeilen, nach dem zweiten
2 Nachtraege und 416 Zeilen, und die Zahl aus `/api/health` ist dieselbe wie die im Kopf der
Route — die Sonde und die Tuer widersprechen sich nicht.

`tag-0411/objekt-3-2-143-legende-und-fenster-0628.log.txt` ist eine Kette in vier Schritten
(06:27:48 bis 06:28:49 MEZ, alle vier mit Exit 0). Schritt eins ist der Fenster-Pruefer bei
390 x 844 mit 150 gesaeeten Notizen, und er beginnt mit der Gleichung, die allen vier Schritten
gilt: **die fuenf tragenden Artefakte sind bytegleich mit dem installierten app.asar (5 von 5)**.
Erst danach zaehlen seine Latten, und zwei davon gehoeren der zugeklappten Legende:
`die Bilanz des Ausschnitts bleibt auch hinter der Klappe lesbar: true` und
`die zugemachte Legende deckt hoechstens 25 % des Bildes: true`.
Die Schritte zwei bis drei und vier sind dieselbe Messung an drei Fensterbreiten
(`scripts/legende-hoehe.mjs --form=markdown --saat=30`), also an 30 Prosanotizen, Klappe zu
gegen Klappe auf, Anteil an der **Leinwand der Graph-Flaeche**, nicht am Browserfenster:

    390 x  844  zu 21.1 % (Kasten 334 x 141 px)   auf 50.4 % (334 x 337 px)
    820 x 1180  zu 14.9 % (Kasten 496 x 157 px)   auf 33.6 % (496 x 353 px)
    1440 x  900  zu 10.8 % (Kasten 638 x 140 px)  auf 25.8 % (869 x 246 px)

Die 25-Prozent-Latte steht nur fuer den zugeklappten Zustand; der aufgeklappte ist hier
bewusst nicht dagegen gehalten, weil er alles zeigen soll. Vor der Aufloesung des Rates lag
derselbe Kasten bei 390 x 844 und zugeklappt auf 334 x 191 px (28.5 %) — gemessen und
verworfen in der selben Scheibe, Beleg in der Arbeitsmappe (`BELEG-3.2.143.md`).

## Der Sprach-Census am Objekt (Dateizeit 07:55:33 MEZ) — Punkt 7 zum ersten Mal gemessen

`tag-0411/verstaendlichkeit-objekt-0800.log.txt` ist der erste richtige Lauf von
`scripts/verstaendlichkeit.mjs`: er liest die Menschensprache aus `src/components`, `src/lib`
und `src/pages`, und zaehlt einen Satz nur, wenn dieselben Bytes im **installierten** app.asar
stehen. 336 Kandidaten, 11 von der Gleichung verworfen, also **325 Saetze, die ein Mensch in
der ausgelieferten Faeche wirklich lesen kann**.

    unter der Kappe von 14 Woertern: 260 (80.0 %)      — die Latte selbst, keine Uebererfuellung
    mit Grund oder Folge:           16 (4.9 %)
    nennt eine Taetigkeit:          87 (26.8 %)
    mit mindestens einem Fachwort:  61 (18.8 %)
    Fachwort ohne Grund und ohne Taetigkeit: 29

Der Lauf meldet zwei Biss-Kontrollen: die Rate-Zeile von 3.2.143 wird getroffen, und ein Satz,
der nie ausgeliefert wurde, wird verworfen. Exit 0.

Ein frueherer Lauf (Dateizeit 07:49:58) meldete **167 Saetze und 91.0 %** und war falsch: die Sonde las das
Buendel als latin1, und jeder Satz mit einem echten Gedankenstrich (U+2014, drei Bytes in UTF-8)
fand sein Ziel nicht. Berichtigt auf eine Bytesuche plus eine leerraum-arme Lesung; die Zahl,
die jetzt gilt, ist die oben. Das Blatt von 07:52 liegt als
`audit-2026-10-09/feldzug/belege-0411/verstaendlichkeit-objekt-0752-erste-lesung.txt` in der
Arbeitsmappe, damit der Irrtum nachlesbar bleibt.

## Der Wiederlauf nach dem Sprachlauf (Dateizeit 15:43:53 MEZ, ausgeliefertes 3.2.144)

`tag-0411/verstaendlichkeit-objekt-3-2-144-1545.log.txt` ist derselbe Census gegen dasselbe
Werkzeug, aber am **getauschten** Objekt (asar 49 199 929 B, Tuer 15:43:00 MEZ mit
`Version 3.2.144 | Knoten 21064 | eingebettet 64163/64163`). Die zwei Zahlenspalten gehoeren
zusammen, weil nur der Unterschied eine Aussage ist:

    Grundgesamtheit der Flaeche      324  gegen  324  Saetze (unveraendert)
    unter der Kappe von 14 Woertern  259 (79.9 %)  ->  262 (80.9 %)
    mit mindestens einem Fachwort     60 (18.5 %)  ->   40 (12.3 %)
    Fachwort ohne Grund und ohne Taetigkeit  25     ->    8

Der Riegel steht jetzt auf dieser letzten Zahl (`FACH_OHNE_GRUND_MAX = 8` in
`scripts/verstaendlichkeit.mjs`), mit dem Grund in seinem eigenen Kommentar: ein einzelner
Satz bewegt die Kappenzahl um 0,3 Prozent, die Fachwortzahl ist das, was eine Sprachaenderung
wirklich meldet. Beide Urteile lauten HALTET, Exit 0, und die zwei Biss-Kontrollen melden
getroffen und verworfen.

## Der Fit-Titel am ausgelieferten 3.2.145 (Dateizeit 16:01:35 MEZ)

`tag-0411/objekt-3-2-145-fit-titel-1601.log.txt` ist der Fenster-Pruefer bei 390 x 844 gegen
das installierte Stueck, 150 gesaete Notizen. Er meldet die Gleichung zuerst (fuenf Artefakte
bytegleich, 5 von 5) und dann den Satz, um den es geht:

    Titel nach dem Druck: Fit — held at the readability floor, and all 150 notes are in the picture
    Bilanzzeile: schweigt (der Rahmen haelt alles) — der Vergleich ist ohne Gegenstand
    Kanten beruehrt: keine   (vorher und nachher)

Vor dem Flicken sagte derselbe Knopf an demselben Ort "some notes stay outside", wo keine
Notiz draussen war. Der Gegenfall — Notizen bleiben wirklich draussen — ist nicht in diesem
Lauf gemessen, weil die Lage des Feldes 32 Zufallsbits traegt und dieser Bestand bei diesem
Rahmen alles faengt; er steht als Fall in `tests/lib/gemeinschaften-bild.test.ts`
(`fitTitel(true, 6)` behaelt den alten Satz samt dem Weg nach draussen).

## Zeitzusatz: drei Namen in diesem Ordner sind gefuehlt, nicht gemessen

Die Dateinamen `-0752-`, `-0800-` und `-1545-` stammen aus einer Uhr, die ich nicht gefragt
habe. Die gemessenen mtimes sind 07:49:58, 07:55:36 und 15:43:53 MEZ (`stat -f %Sm`,
gegriffen 16:03 MEZ). Die Namen bleiben, weil sie in Commits und Paapieren stehen; die
wahren Zeiten stehen jetzt in diesem Register und in den Papieren, und die Regel, die hier
gebrochen wurde, ist die aeltere als dieses Blatt: **`date` und `stat` fragen, nie fuehlen.**

## Die drei Kosten-Laeufe (Dateizeiten 16:10, 16:14 und 16:16 MEZ)

`fps-400-1614`, `fps-1500-1616` und `fps-3000-1610` sind `node scripts/fps-laeufer.mjs`
mit `--knoten` 400, 1 500 und 3 000, gegen den aus dem committeten Baum gebauten Bund —
derselbe Koerper, den der Fenster-Pruefer um 16:01:35 als bytegleich mit dem installierten
Objekt bestaetigt hatte. Jedes Blatt nennt seinen Bestand, die Zahl der gemalten Scheiben,
die geschnittenen Paare, den tiefsten Schnitt, die Arbeit pro Bild und — wichtig — den
Maschinenstand vor und nach dem Lauf.

Der 3 000er meldet `geschnitten: 1 Paare, tiefster Schnitt 11 Welt-Einheiten` und, in derselben
Zeile, `NICHT RUHIG, Zahl nicht veröffentlichen`. Die Geometrie wird daraus zitiert, die
Millisekunden werden nicht zugesagt. Der erste 3 000er-Lauf (16:07:05) ist **nicht** abgelegt:
er gehoert zu der Sonde vor ihrer Berichtigung und meldete `0 notes` und `1602`-Titel-Klick ins
Leere; sein Nachfolger ab 16:10 ist der, der zaehlt.

## Der Nachlauf nach 3.2.146, und die dritte Verweigerung (20:04 MEZ)

`fps-3000-1938.log.txt` ist der Lauf vor der Heilung, mit dem ersten Stand der berichtigten
Sonde: 707 Scheiben, ein Paar, Radien 26 + 26, Abstand 41, Schnitt 11 Einheiten, und — neu
gedruckt — der Grund, warum der fruehere Lauf `0 notes` gemeldet hatte: die Flaeche sagt beim
ersten Griff `0 concepts · 0 links` und nach der Ruhe `6 concepts of 3,027 in all · 2,379 links`.

`fps-3000-nach-146.log.txt` ist derselbe Griff nach dem Nachschlag, am getauschten Stueck
(Tuer 19:54:14 MEZ, `Version 3.2.146 | Knoten 21064 | eingebettet 64163/64163`): 693 Scheiben,
**weiter ein Paar** (Abstand 47, Radien 26 + 26, Schnitt 5), und die Flaeche meldet in beiden
Lesungen `0 concepts · 0 links`. Die zwei Laeufe sind also nicht derselbe Bestand im selben
Zustand, und
das ist der Grund, warum die Heilung im Browser nicht belegt ist — siehe
`docs/graph-kosten.md`, Abschnitt "Nach der Heilung".

`fps-3000-verweigerung-146.log.txt` (373 B) ist der dritte Versuch, der nie gemessen hat: die
eigne Ruhe-Sonde verweigerte mit `max/median 2.36 ueber 1.8`. Die Verweigerung ist ein
Ergebnis, kein Ausfall, und ihr Zeuge liegt hier, damit niemand die Zahl ohne sie zitiert.
