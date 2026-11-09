# Konkurrenz gemessen, nicht verglichen

Punkt 8 heisst: *mit grossem Abstand das Beste*. Dieser Ordner-Teil hält fest, wie
weit wir von dem Abstand entfernt sind, und zwar an Zahlen, die ein Kunde selbst
nachfahren kann. Jede Zahl nennt ihr Artefakt; eine Zahl ohne Artefakt steht hier nicht.

Der Korpus ist auf allen Zeilen derselbe: **58 Notizen, 45 Anfragen, fünf Kategorien**
(`scripts/eval-corpus.ts`, gezaehlt ueber `npx tsx`). Das Mass ist auf allen Zeilen
dasselbe: **Hit@1** — die erste Antwort nennt eine der Ziel-IDs der Anfrage.

| System | Konfiguration | Hit@1 | Artefakt |
|---|---|---|---|
| K3PTA, naive Substring-Suche (v1-Bein) | eigener Eval-Aufbau | **51,1 %** (23/45) | `docs/belege/tag-0311/eval-drei-beine-1352.log.txt` |
| K3PTA, ohne Vektoren (v2-Bein) | BM25 + RRF + Temporal + Entitaeten | **71,1 %** (32/45) | dito |
| K3PTA, **ausgeliefert** (v3-Bein) | dazu Vektoren | **75,6 %** (34/45) | dito |
| mem0 2.2.1, Fakten-Zerlegung, `llama3.2:3b` | 2.11.2026, Leitung | **24,4 %** (11/45) | `docs/belege/konkurrenz-0211/spur-fakten-3b-vollstaendig.jsonl` |
| mem0 2.2.1, **fair gefahren** | ganzes Stueck, `infer=False`, Wort-Suche an, nomic-embed-text lokal | **51,1 %** (23/45) | `docs/belege/konkurrenz-0611/spur-fair-0611.jsonl` und `…-zwei.jsonl` |
| **sqlite-vec 0.1.9**, reines Cosinus-KNN | dieselben Texte, dasselbe Einbett (nomic-embed-text, 768 D), k=5, **nichts** ausser Vektoren | **42,2 %** (19/45) | `docs/belege/konkurrenz-0611b/spur-sqlitevec-0611.jsonl` und `…-zwei.jsonl` |
| **sqlite-vec 0.1.9**, reines Cosinus-KNN, **zweites Einbett** | derselbe Lauf, nur `bge-m3` (1024 D) statt nomic | **66,7 %** (30/45) | `docs/belege/konkurrenz-0611b/spur-sqlitevec-bge-m3.jsonl` und `…-zwei.jsonl` |
| K3PTA, **ausgeliefert** (v3-Bein), **zweites Einbett** | derselbe Aufbau und derselbe Suchweg, nur `bge-m3` (1024 D) statt nomic | **77,8 %** (35/45) | `docs/belege/konkurrenz-0611c/spur-uns-bge-m3-0611.jsonl` und `…-zwei.jsonl` |
| **chroma 1.5.9**, reines Cosinus-KNN | dieselben Texte, dasselbe Einbett (nomic-embed-text, 768 D), k=5, Cosinus-Raum gesetzt und **gemessen**, nichts ausser Vektoren | **42,2 %** (19/45) | `docs/belege/konkurrenz-0611e/spur-chroma-nomic-eins.jsonl` und `…-zwei.jsonl` |
| **chroma 1.5.9**, reines Cosinus-KNN, **zweites Einbett** | derselbe Lauf, nur `bge-m3` (1024 D) statt nomic | **68,9 %** (31/45) | `docs/belege/konkurrenz-0611e/spur-chroma-bge-m3-eins.jsonl` und `…-zwei.jsonl` |
| **mem0 2.2.1**, fair gefahren, **zweites Einbett** | dieselbe faire Konfiguration wie die nomic-Zeile (ganzes Stueck, `infer=False`, mem0s eigne Rangfolge), nur `bge-m3` (1024 D) über Ollama statt nomic — 9.11.2026, 20:06/20:06:29 MEZ, zwei frische Speicher | **68,9 %** (31/45) | `docs/belege/konkurrenz-0911b/spur-mem0-bgem3-0911-eins.jsonl` und `…-zwei.jsonl` |
| **SQLite FTS5**, Schachtel (implizites UND, unicode61, kein Stemming) | derselbe Notiz-Text, Satzzeichen aus der Frage entfernt — 9.11.2026, 20:22/20:24 MEZ, zwei frische DBs; **42 von 45 Anfragen leer**: das UND stirbt an den Fragenwörtern und an der Beugung ("Produktion" vs Token "produktions"); mit entfernten Funktionswörtern dieselben 3 von 45 | **6,7 %** (3/45) | `docs/belege/konkurrenz-0911c/spur-fts5-0911-roh-eins.jsonl` und `…-zwei.jsonl` |
| **SQLite FTS5**, ODER-Fallback-Praxis (ODER über die Begriffe, bm25-Rang) | dieselbe DB, die übliche Fallback-Konfiguration, wenn das UND stirbt; temporal 0/3, ablenkung 0/4, umschreibung 1/10 — das Lexik-Verfahren kann beides nicht | **44,4 %** (20/45) | `docs/belege/konkurrenz-0911c/spur-fts5-0911-oder-eins.jsonl` und `…-zwei.jsonl` |

## Berichtigung 16:52 MEZ: die Kategorie-Zahl war eine Modell-Aussage, keine Verfahrensaussage

Die erste Fassung dieses Abschnitts schrieb, reines KNN treffe **"0 von 3 Zeitfragen und
0 von 10 Umformulierungen"**, und nannte das die Begruendung fuer BM25, RRF, Zeitstrahl und
Entitaeten. Nachgeprueft mit einem zweiten Einbett (16:52:30 und 16:52:51 MEZ, derselbe
Korpus, dasselbe Skript, nur `bge-m3` statt `nomic-embed-text`): dasselbe reine KNN trifft
**6 von 10 Umformulierungen** und **1 von 3 Zeitfragen**, lexikalisch 20 von 25, und kommt
insgesamt auf **66,7 %** — 8,9 Punkte unter der Auslieferung, nicht 33,4.

Die Aussage war also **halb richtig und halb Modell-Aussage**: was sie gemessen hat, ist die
Cosinus-Naehe *von nomic-embed-text*, nicht die von Vektorsuche allgemein. Richtig bleibt:
(a) mit dem Einbett, das K3PTA ausliefert (`src/core/embeddings.ts:20` ->
nomic-embed-text), ist der faire Gleich-Stufen-Vergleich 75,6 gegen 42,2; (b) die Fusion
gewinnt gegen reines KNN **auf derselben Einbettstufe** 33,4 Punkte. Neu und offener als
vorher: der Abstand **schrumpft auf 8,9 Punkte**, wenn das Einbett wechselt — und zwar für
beide Seiten. Das ist kein Schönheitsfehler, sondern eine Frage ans Produkt: **welches
Einbett liefert unsre Rangfolge, wenn es nicht das voreingestellte ist?** Gemessen ist die
Gegenseite (reines KNN) für `bge-m3`; unsre eigne Rangfolge mit `bge-m3` war zu dem
Zeitpunkt **nicht** gemessen und stand als nächster Lauf an — **das war falsch**, sie war
schon am 3.11. gemessen (`docs/belege/tag-0311/eval-bge-m3-1404.log.txt`, 14:04 MEZ auf
3.2.125), und auf dem heutigen Baum ist sie 17:09 MEZ punktgenau reproduziert. Siehe
Abschnitt P113.

Was die Zeile *nicht* sagt, bleibt: sqlite-vec ist eine Erweiterung, kein
Gedächtnisdienst — kein Speichern, kein Aktualisieren, kein Vergessen, keine Mandanten-Wand.
Die Zeile misst das **Verfahren**, nicht das Produkt. Und derselbe Vorwurf, der am 2.11.
gegen den mem0-Fakten-Lauf erhoben wurde ("eine Konfiguration, die der Mitbewerber so nicht
ausliefert"), gilt hier nicht: eine Vektortabelle mit k-NN *ist* genau das, was sqlite-vec
ausliefert.

Geworden ist die Zeile so: Kapsel `/tmp/konk-sqlitevec-0611` (python 3.14.7, apsw,
sqlite-vec 0.1.9; die sqlite-Bibliothek im apsw ist 3.54.1, nicht die 3.50.4 des Systems),
Korpus und Fragen aus `scripts/eval-corpus.ts` und **gegen die mem0-Kapsel nachgeprueft**
(58 Notiztexte und 45 Anfragen, identisch), Einbettung über Ollama nur auf 127.0.0.1, zwei
Läufe 16:40:55 und 16:40:58 MEZ mit **derselben Rangfolge** in beiden Traces.
Rückgängig: `rm -rf /tmp/konk-sqlitevec-0611`.

## P112, 17:09 MEZ: die eigne Rangfolge mit dem zweiten Einbett, in der richtigen Einheit

**Vorbemerkung P113 (17:30 MEZ):** dieser Abschnitt ist **keine Neufund-Messung**. Dieselben
sieben Zahlen standen schon am 3.11. im Repo (`docs/belege/tag-0311/eval-bge-m3-1404.log.txt`
und `eval-drei-beine-1352.log.txt`, 14:04/13:52 MEZ auf 3.2.125). Was dieser Abschnitt neu
gibt, ist (a) die **Reproduktion auf 3.2.189** -- 64 Fassungen später, jede Kategorie am
gleichen Platz -- und (b) die **Modell-Abhängigkeit in derselben Einheit** gemessen, die vorher
niemand berechnet hatte. Der Irrtum, hier sei die Frage zum ersten Mal beantwortet, ist in
P111s Satz gewurzelt; berichtigt wird er im Abschnitt P113.

Die Berichtigung oben hat eine offene Frage hinterlassen, die hier beantwortet ist: **was
tut die Fusion mit `bge-m3`?** Gefahren 17:09:20 bis 17:09:32 MEZ mit demselben Aufbau, den
`scripts/eval.ts` für sein v3-Bein benutzt (`scripts/eval-store.ts`, `vektoren: true`),
demselben Suchweg (`searchMemories`, limit 10) und denselben Formeln, zwei Läufe je Stufe,
Rangfolge Zeile für Zeile identisch in beiden. Das Aggregat jeder Stufe ist dasselbe wie das
des `npm run eval`-Ausdrucks, der zur selben Uhrzeit voll laufen gelassen wurde
(`auswertung-nomic-0611.txt`, `auswertung-bge-m3-0611.txt`).

| Stufe gewechselt (nomic → bge-m3) | K3PTA, ausgelieferte Fusion | sqlite-vec, reines KNN | chroma, reines KNN (P118) |
|---|---|---|---|
| Hit@1 | 75,6 % → **77,8 %** (netto +1 Anfrage) | 42,2 % → **66,7 %** (netto +11 Anfragen) | 42,2 % → **68,9 %** (netto +12 Anfragen) |
| Recall@5 (gekappt) | 91,1 % → **90,0 %** | — | — |
| Erst-Treffer wechselt die Richtigkeit | **3 von 45** = 6,7 % | **15 von 45** = 33,3 % | **14 von 45** = 31,1 % |
| anderer erster Treffer überhaupt | 7 von 45 = 15,6 % | 25 von 45 = 55,6 % | 25 von 45 = 55,6 % |
| ganze Liste unverändert | 16 von 45 = 35,6 % | **0 von 45** = 0,0 % | **0 von 45** = 0,0 % |

Die Zahl, die die Tabelle trägt, ist nicht der Punktabstand, sondern **der Bruchteil der
Anfragen, dessen Rangfolge das Modell wechselt** — dieselbe Einheit auf beiden Seiten, an
demselben Korpus, mit denselben 45 Anfragen. Beim reinen Vektor hängt die Reihenfolge fast
ganz am Einbett: keine einzige der 45 Listen bleibt unter `bge-m3` so, wie sie unter nomic
war. Bei uns bleibt mehr als ein Drittel unverändert, und die Richtigkeit wechselt in der
Hälfte der Fälle, die der Mitbewerber braucht — auf einem Stand, der vorher schon 33,4
Punkte höher liegt.

Das ist die messbare Lesart von *Robustheit*: Die Fusion holt den Vektor-Gewinn in die
Rangfolge, ohne die Rangfolge an das Modell anzulehnen. **Der Satz gilt nur in dieser
Einheit**: die zwei Punkte Hit@1, die `bge-m3` bei uns holt, sind eine Anfrage von 45, und
dieselbe Stufe **verliert** Recall@5 (91,1 → 90,0) und eine ablenkende Anfrage. Ein
Default-Wechsel wäre damit nicht begründet; `nomic-embed-text` bleibt
(`src/core/embeddings.ts:20`).

Die drei Anfragen, bei denen bei uns die Richtigkeit wechselt, stehen im Protokoll
(`lauf-0611.log.txt`): zwei Umformulierungen kommen hinzu ("Wie fotografiere ich drinnen
richtig?", "Was gibt es an Heiligabend zu essen?"), eine Ablenkung fällt weg ("Was steht zur
Datenbank an?", MRR 1,00 → 0,50).

**Der blinde Fleck auf diesem Weg, und warum die Sonde zuerst da stand:** der erste
Vergleich der beiden Stufen verglich die letzten 22 Zeilen von `npm run eval`. Die sind in
beiden Läufen bytegleich — das letzte Block, das der Ausdruck malt, ist
`Details (v2-Engine)`, also das Bein **ohne Vektoren**, und das berührt kein Einbett. Eine
Schwanzzeilen-Gleichheit war hier kein Beweis, sondern das Erwartete. Deshalb liegt jetzt
die Zeile-für-Zeile-Spur bei den Artefakten, und ihr Aggregat ist gegen den vollen
Ausdruck nachgerechnet (`tests/konkurrenz-einbett-stufen.test.ts`).

## P113, 17:30 MEZ: die Berichtigung -- unsre bge-m3-Rangfolge war schon gemessen, und die Sprache ist kein Modell-Fund

**Was hier zurückgenommen wird.** P111 schrieb um 16:52 MEZ, unsre eigne Rangfolge mit
`bge-m3` sei "**nicht** gemessen", und P112 schrieb denselben Satz als eigne Neuerung. Beide
waren falsch, und die Widerlegung liegt im **eignen Repo**: `docs/belege/tag-0311/eval-bge-m3-1404.log.txt`
(npm run eval, `KEPTA_EMBED_MODEL=bge-m3`, kepta@3.2.125, 2026-11-03 13:04:56 UTC = 14:04 MEZ)
meldet für das v3-Bein **Recall@5 90,0 %, Hit@1 77,8 %, MRR 0,825** und die Kategorien
ablenkung 25 %, graph 100 %, lexikalisch 96 %, temporal 67 %, umschreibung 50 %. Das Sprach-Artefakt
desselben Ordners (`sprachuebergriff-bge-m3-1406.log.txt`) zitiert diese Zahl sogar mit Händen.
Der Lauf von heute (17:09:27 MEZ, 3.2.189) hat **jede einzelne** davon getroffen -- also ist
die korrekte Meldekategorie nicht "neu gemessen", sondern **"über 64 Fassungen reproduziert"**.

**Die Regel, die daraus folgt und die mechanisch zieht:** bevor ein Lauf als Antwort auf eine
offene Frage verkauft wird, gehört die Frage gegen den **Beleg-Ordner** geprüft, nicht nur
gegen die Papiere der eignen Nacht. `tests/konkurrenz-sprachstufen.test.ts` hält das jetzt
fest, indem er die heutigen Zahlen gegen die 3.11-Artefakte rechnet (Fall 3 und Fall 7) --
wer eine Reproduktion als Neufund ausgibt, sieht die alten Artefakte im selben Lauf stehen.

**Zweitens, die Sprache unter beiden Stufen** (`scripts/eval-sprachuebergriff.ts`, 15 Paare,
Ziele geerbt, Richtung englische Frage gegen deutsche Notizen, Gegenrichtung **nicht gemessen**;
3.11 und heute, je Stufe zwei bytegleiche Läufe):

| Bein | Stufe | deutsch Hit@1 | englisch Hit@1 | Sprachpreis |
|---|---|---|---|---|
| v3, ausgeliefertes Retrieval | nomic-embed-text | 60,0 % | **26,7 %** (4/15) | -33,3 Pp |
| v3, ausgeliefertes Retrieval | bge-m3 | 60,0 % | **26,7 %** (4/15) | -33,3 Pp |
| nur das Vektor-Bein (Diagnose) | nomic-embed-text | 73,3 % | 26,7 % | -46,7 Pp |
| nur das Vektor-Bein (Diagnose) | bge-m3 | **46,7 %** | **20,0 %** | -26,7 Pp |

Die Lesung: **das mehrsprachige Einbett ist kein Hebel für die Sprachgrenze.** Am
ausgelieferten Bein ändert es keine einzige Anfrage (26,7 % in beiden Stufen). Am
Diagnose-Bein wird der *Abstand* kleiner (-46,7 → -26,7 Pp) -- und das ist die Falle, die
dieser Abschnitt zubaut: der Abstand schrumpft, weil **beide Seiten fallen** (deutsch
73,3 → 46,7, englisch 26,7 → 20,0). Ein kleinerer Abstand bei niedrigerer englischer
Absolute ist kein Sprachgewinn, sondern ein **Nenner, der still schrumpft** -- dieselbe
Klasse wie P104s "Nenner, der nicht schrumpfen darf". Gemessen und gehalten wird deshalb
jede Seite einzeln, nicht der Preis.

**Was damit für #44 gilt:** die Modell-Hypothese ist geprüft und **widerlegt** (kein Default-
Wechsel, kein Umbau des Bestands -- jeder Knoten müsste neu eingebettet werden,
`src/core/engine.ts:294` filtert nach Modell). Offen bleibt damit ein Mechanismus auf der
**Frage-Seite** (Übersetzung oder zweisprachiger Schlüssel vor dem Einbetten), und der ist
hier weder gebaut noch gemessen; seine Latenz wäre zuerst an `scripts/volllauf`-Art zu messen,
nicht an 58 Notizen.

## P118, 18:43 MEZ: die Zahl des reinen Vektors ist eine Spanne, kein Punkt

P111 und P112 haben gezeigt, dass dieselbe Rangfolge **vom Einbett** abhängt. Diese Stufe
zeigt, dass sie auch **vom Werkzeug** abhängt -- und misst beides an einem zweiten Produkt.
Gefahren 18:42:37 bis 18:43:08 MEZ: chroma 1.5.9 in einer egnen Kapsel
(`/tmp/konk-chroma-0611`, python 3.14.7), dasselbe Korpus (58 Notizen, 45 Anfragen --
vorher aus `scripts/eval-corpus.ts` exportiert und **bytegleich** zu P110s Korpusdatei),
dieselben Einbett-Stufen, k=5, nur Vektoren, nichts sonst. Zwei Läufe je Stufe.

| chroma 1.5.9, reines Cosinus-KNN | nomic-embed-text | bge-m3 |
|---|---|---|
| Hit@1 | **19/45 = 42,2 %** | **31/45 = 68,9 %** |
| in den ersten fünf | 26/45 = 57,8 % | 40/45 = 88,9 % |
| umschreibung | 0 von 10 | 6 von 10 |
| temporal | 0 von 3 | 1 von 3 |
| lexikalisch | 15 von 25 | 20 von 25 |

**Gleich-Stufen-Vergleich, beide Produkte, beide Stufen** (die einzige Lesart, die etwas über
die Fusion sagt):

| gegen reines Cosinus-KNN | sqlite-vec | chroma |
|---|---|---|
| nomic-Stufe: 34/45 gegen 19/45 | **15 Anfragen = 33,4 Pp** | **15 Anfragen = 33,4 Pp** |
| bge-Stufe: 35/45 gegen 30 bzw. 31 | **5 Anfragen = 11,1 Pp** | **4 Anfragen = 8,9 Pp** |

Der Abstand an der nomic-Stufe ist **in beiden Produkten auf die Anfrage gleich**. An der
bge-Stufe ist er es nicht: 31 gegen 30. Die eine Anfrage, die entscheidet, heißt
`"Hetzner"`, Kategorie graph, erwartet sind m01, m16, m36, m37. Grund, **gemessen und nicht
vermutet** (`docs/belege/konkurrenz-0611e/gleichstand-hetzner-0611.txt`): die zwei Notizen
m16 und m17 haben **dieselbe** Cosinus-Ähnlichkeit zur Frage --
`0,5002722382648656` gegen `0,5002722382648656`, auf sechzehn Stellen gleich -- und beide
Werkzeuge melden denselben Abstand `0,499727`. chroma stellt m16 zuerst (Treffer),
sqlite-vec stellt m17 zuerst (kein Treffer). **Ein echter Gleichstand, den das Verfahren
nicht entscheiden kann; über ihn entscheidet die Speicherordnung des Produkts.**

Was daraus nach aussen steht: eine Konkurrenz-Zahl für reines KNN darf nicht als Punkt
geschrieben werden. Richtig ist die **Spanne**: 42,2 % an der nomic-Stufe (beide Produkte),
66,7 bis 68,9 % an der bge-Stufe. Und unsre Führung ist an der starken Stufe **vier bis fünf
Anfragen von 45**, nicht 15 -- die 15 gelten nur, wo beide Seiten nomic fahren. Das ist
dieselbe Ehrlichkeit, die P111 von der Modell-Aussage verlangt hat, jetzt gegen das Werkzeug.

**Ist die Spanne Wuerfelglueck -- und unsre Fuehrung etwa auch?** Der
Gleichstands-Zensus (`docs/belege/konkurrenz-0611e/gleichstands-zensus.py`, 19:01:36 bis
19:01:41 MEZ) prueft fuer beide Stufen alle 45 Anfragen, ob die beste und die zweitbeste
Aehnlichkeit gleich sind (Toleranz 1e-12, float64 und float32):

| | nomic-Stufe | bge-Stufe |
|---|---|---|
| Anfragen mit Gleichstand auf Platz 1 | **0 von 45** | **1 von 45** |
| davon haengt Treffer oder Fehlgriff daran | 0 | 1 (`"Hetzner"`: m16 gilt, m17 nicht) |
| unsre erste Stelle auf dieser einen Anfrage | -- | **m36, ausserhalb der Gruppe, Treffer** |

Das ist die Antwort, die vor dem Verkaufsatz stehen muss: **das Wuerfeln ist die
Mitbewerber-Seite.** Keine einzige Anfrage der nomic-Stufe haengt an einem Platz-1-
Gleichstand, und die einzige der bge-Stufe ist genau die, die 31 von 30 trennt. Unsre
Rangfolge entscheidet dieselbe Anfrage ausserhalb des Gleichstands: sie setzt m36 auf
Platz 1 -- eine Notiz, die zur Gleichstands-Gruppe gar nicht gehoert (0,4992953 gegen
0,5002722) und ein gueltiger Ausweis ist. Tiefer in den ersten fuenf liegen weitere
Gleichstaende (5 Anfragen an der nomic-, 2 an der bge-Stufe, stets m16 gegen m17); sie
aendern am ersten Treffer des Mitbewerbers nichts, und deshalb ist die Zahl, die dort
schwankt, genau eine.

**Welches Bein hebt m36?** Gemessen, nicht gefuehlt: `beine-auf-gleichstand.ts`
(19:16:27 und 19:16:38 MEZ, acht Bein-Kombinationen, beide Stufen, Beleg
`docs/belege/konkurrenz-0611e/beine-auf-gleichstand-0611.txt`). Erste Stelle auf
`"Hetzner"`:

| Fahrnis | nomic-Stufe | bge-Stufe (die trennende) |
|---|---|---|
| alle drei Beine (ausgeliefert) | m36, traegt | m36, traegt |
| nur BM25 | m16 -- gueltig, aber **in der Gleichstands-Gruppe** | m16, in der Gruppe |
| nur Vektor | m36, traegt | **leere Liste** (kein Treffer moeglich) |
| nur Entitaeten | m36, traegt | m36, traegt |
| BM25 + Vektor | m36, traegt | m16, in der Gruppe |
| BM25 + Entitaeten | m36, traegt | m36, traegt |
| Vektor + Entitaeten | m36, traegt | m36, traegt |
| kein Bein | leer | leer |

Die Zuordnung ist damit die **Entitaeten-Lage**: sie allein setzt m36 an die erste Stelle,
an beiden Stufen, und das ist der Grund, warum unsre Antwort auf dieser Anfrage ausserhalb
des Gleichstands liegt. BM25 allein wuerde m16 nennen -- gueltig, aber an denselben Wurf
gebunden wie der Mitbewerber. **Der Zeitstrahl ist aus diesem Satz gestrichen**: die Engine
schaltet drei Beine (`src/core/engine.ts:485` -- bm25, vector, entity), ein temporal-Bein
als Schalter gibt es nicht, und was nicht schaltbar ist, kann hier nichts beigetragen
haben. (Die fruehere Fassung dieses Abschnitts schrieb "BM25, Entitaeten und Zeitstrahl" --
das war eine Aufzaehlung von Bausteinen, keine Messung, und in der Messung ist es die
Entitaeten-Lage.)

Zwei offene Punkte aus derselben Fahrnis: an der **bge-Stufe gibt das Vektor-Bein allein
fuer "Hetzner" eine leere Liste** zurueck (Diagnose-Fahrnis, nicht die ausgelieferte -- aber
eine Luecke mit Namen), und auf `"Welcher Server ist gemeint?"` (ablenkung, erwartet m01)
nennt **jede** Bein-Kombination m16 als erste Stelle, auch die Auslieferung: die
Ablenkungsfrage an einem Nahe-Duplett verlieren wir, waehrend der Mitbewerber sie an beiden
Stufen ebenfalls verliert.

**Nebenbefund, und er gehört zu P112:** unsre eigne Spur aus 17:09 MEZ
(`konkurrenz-0611c`) schreibt ins Feld `erwartet` nur den **ersten** gültigen Ausweis
(`docs/belege/konkurrenz-0611c/spur-leser.ts:36`, `erwartet: q.relevant[0]`). Die
Ledger-Zahlen waren dadurch nie falsch -- P112 rechnet gegen das Korpus, nicht gegen das
Feld. Aber ein Leser, der das Feld für die ganze Erwartung hält, misst **30 statt 34**
(nomic) und **31 statt 35** (bge-m3): vier Anfragen zu niedrig, und die vier liegen genau an
den sechs Anfragen des Korpus, die mehrere gültige Ausweise haben. Heilung: die Spur
`docs/belege/konkurrenz-0611e/spur-uns-{nomic,bge-m3}-0611e.jsonl` schreibt die ganze Liste,
und ihre erste Stelle ist in **allen 45 Anfragen dieselbe** wie um 17:09 MEZ -- zwei Stunden
auseinander, gleiche Rangfolge.

**Was dieser Schnitt nicht heilt:** er sagt nichts über txtai (#30 bleibt offen), nichts über
die Geschwindigkeit an einem echten Bestand (58 Notizen sind ein Korpus, kein Bestand), und
er ändert **nichts am ausgelieferten Objekt** -- keine neue Fassung, kein Tausch.

## P120, 19:21 MEZ: unsre eigne Vektor-Stimme schweigt unter einer Grenze, die an einem Modell geeicht ist

P119 fiel eine Zeile auf, die nicht ins Verfahren passte: mit `tracks = {bm25:false,
vector:true, entity:false}` und `KEPTA_EMBED_MODEL=bge-m3` antwortet die Engine auf
`"Hetzner"` mit einer **leeren Liste** — an der nomic-Stufe mit vier Notizen. Der Grund
steht in `src/core/engine.ts:551`:

    const untergrenze = Math.max(VECTOR_FLOOR, bestSim * VECTOR_BAND)

mit `VECTOR_BAND = 0,86` (engine.ts:37) und **`VECTOR_FLOOR = 0,58`** (engine.ts:51). Der
Bandteil ist modelgleich — `bestSim * 0,86` liegt immer unter `bestSim`, also bleibt der
beste Kandidat in jeder Stufe stehen. Der absolute Teil ist es nicht: liegt der beste
Cosinus einer Anfrage unter 0,58, faellt die *ganze* Kandidatenliste durch die Masche.

Gemessen an allen 45 Anfragen, beide Stufen, dieselbe Engine, derselbe Aufbau
(`docs/belege/konkurrenz-0611e/vektor-bein-stumm.ts`, 19:21:28 und 19:21:30 MEZ, Exit 0):

| Fahrnis nur mit dem Vektor-Bein | nomic-Stufe | bge-Stufe |
|---|---|---|
| Anfragen mit leerer Liste | **1 von 45 = 2,2 %** | **13 von 45 = 28,9 %** |
| Kategorien der 13 | -- | 6 umschreibung, 3 graph, 3 lexikalisch, 1 ablenkung |
| davon trifft unsre Fusion trotzdem | 1 | **8** |
| Anfragen, auf denen die **ganze Fusion** leer zurueckkommt | **0** | **2** |

Die zwei endgueltig leeren sind benannt: `"Was mag meine Grossmutter?"` (erwartet m18) und
`"Wie lege ich Geld an?"` (erwartet m49). An der ausgelieferten nomic-Stufe gibt es **keine**
leere Fusions-Antwort; die zwei entstehen, wenn jemand `KEPTA_EMBED_MODEL=bge-m3` setzt. Die
Robustheit der Fusion verdeckt den Defekt meist (8 von 13), aber nicht immer. Die
Flaeche ist in diesem Fall **nicht stumm**, das war mein erster Satz und er war falsch:
`src/components/Dashboard.tsx:2265` sagt bei einer Suchanfrage ohne Treffer (und der Wortlaut ist **im installierten Objekt** gezaehlt: `scripts/pruefe-asar-inhalt.cjs` meldet ihn am Bundel der 3.2.190 um 19:34:36 MEZ 1 mal, bei 420 geoeffneten Pruefungen)
`Nothing found for "…". Try different terms, raise the result count, or switch to keyword
search.` — drei naechste Schritte, und der dritte (zurueck zum Wort-Bein) trifft genau das
Verhalten, das hier schweigt. Was der Hinweis **nicht** nennt, ist die Ursache: dass die
eigne Vektor-Stimme wegen einer an nomic geeichten Untergrenze ausgefallen ist. Geoeffnet
bleibt damit ein einziger Satz: die Flaeche erklaert den leeren Zustand, aber nicht
*warum* das Bein leer war.

**Was damit nicht mehr geschrieben werden darf:** "die Engine ist modelgleich" und
"ein andres Einbett ist nur eine Frage der Qualitaet". Eine Konstante ist an einer Stufe
geeicht, und das ist kein Qualitaetsunterschied, sondern ein Schaltverhalten.

**Der Flicken ist fertig und nicht angewandt** (Grund: es ist ein Objekt-Schnitt, und die
Bau-Kante haelt — 9,23 Gi frei gegen 9,9 Gi, gemessen 19:13:55 MEZ):

    const band = Math.max(VECTOR_FLOOR, bestSim * VECTOR_BAND);
    const untergrenze = Math.min(bestSim, band);

Der absolute Wert greift dann nur noch als Obergrenze des Bandes, nicht mehr als Mundkorb;
der Unrat-Schutz bleibt, weil die Band-Enge wirkt, sobald `bestSim >= 0,58 / 0,86 = 0,6744`.
Dazugehoert der zweite Teil: wenn das Bein trotz allem leer bleibt (gar keine Embeddings der
fragenden Stufe), muss der **Grund** in der Antwort stehen, nicht die Stille. Reihenfolge beim
Landen: erst den Fall "mindestens ein Treffer auf einer stummen Anfrage" rot sehen, dann
zaehlen, dass die Zahl der leeren Listen nicht still auf 0 faellt, dann Census und Abnahme im
echten Fenster. Papier in der Mappe: `audit-2026-10-09/feldzug/P120-VEKTOR-STUMM-0611.md`.

## Was die letzte Zeile sagt, und was sie nicht sagt

Sie sagt: ein Speicher-Dienst, der gerade verbreitet ist, erreicht auf *unsrem* Korpus
ohne Fakt-Fabrikation **denselben Wert wie unsre eigne naive Baseline** — 23 von 45.
Die Auslieferung liegt 24,5 Punkte darueber.

Sie sagt nicht: dass mem0 schlecht ist. Der Lauf ist eine Konfiguration, kein Produkt:
lokale Einbettung ueber Ollama, kein Cloud-Speicher, kein Reranker, `top_k=5`,
`threshold` ungesetzt, und mem0s eigne Fakt-Fabrikation war **ab** (sonst haette ein LLM
jede Notiz umgeschrieben). mem0s eigene Studie nennt 94,4 auf LongMemEval unter ihrem
eignem Aufbau — das ist eine andere Skala, ein anderer Korpus und ein andrer Richter,
und die Vergleichsseite im Verkaufsordner sagt das auch so.

## Die Latte, die der Repo haelt

`tests/konkurrenz-mem0-latte.test.ts` (7 Faelle) rechnet beide mem0-Zahlen **aus den
Traces neu** und verlangt:

- gegen die Fakten-Zerlegung: **mindestens 30 Punkte** Abstand,
- gegen den fairen Lauf: **mindestens 20 Punkte** Abstand.

Beide Schwellen sind nicht bequem, sondern scharf gewaehlt: unsre *eigne* Baseline
(51,1 %) liegt gegen den fairen Lauf bei Abstand **0** und gegen die Fakten-Konfiguration
bei 26,7 — die Latte faellt also genau dann, wenn das ausgelieferte Retrieval auf
Baseline-Niveau zurueckfaellt. Bewiesen, nicht behauptet: Schwelle probehalber auf 30
gehoben, Fall rot mit `expected 24.5 to be greater than or equal to 30`
(6.11.2026 11:10:56 MEZ), danach zurueck auf 20.

`tests/konkurrenz-chroma-latte.test.ts` (17 Faelle, P118) haelt die dritte Stufe und
die zwei neuen Regeln:

- die Zahl des reinen Vektors wird **als Spanne** gefahren -- 19/45 an der nomic-Stufe in
  *beiden* Produkten, 30 und 31 an der bge-Stufe, und die eine verschiedene Anfrage ist mit
  Namen und erwartet-Menge festgehalten (`"Hetzner"`, m16 gegen m17);
- der Fuehrungs-Abstand der Fusion ist an der nomic-Stufe **15 Anfragen gegen jedes
  Werkzeug**, an der bge-Stufe **4 gegen chroma und 5 gegen sqlite-vec** -- ein Fall, der
  rot wird, wenn jemand die 15 auf beide Stufen schreibt;
- die **rechnerische Treue** der egnen Spur: `erwartet` muss die ganze Liste sein und ihre
  Laenge `anzahl_erwartet` treffen, die erste Stelle muss auf 45 von 45 Anfragen dieselbe
  sein wie in P112s Spur, und der Fehler der alten Feldform ist mit seiner Groesse
  festgehalten (30 gegen 34, 31 gegen 35 -- vier Anfragen, sechs mehrdeutige Anfragen im
  Korpus);
- der **Gleichstands-Zensus**: 0 von 45 Anfragen haben an der nomic-Stufe einen Gleichstand
  auf Platz 1, genau einer an der bge-Stufe, und er ist der entscheidende; unsre eigne erste
  Stelle auf dieser Anfrage ist m36 -- eine Notiz ausserhalb der Gleichstands-Gruppe. Ein
  Fall, der rot wird, wenn jemand die Fuehrung der Fusion als Gluecksfall stehen laesst
  oder wenn unsre Rangfolge dort auf m16 oder m17 faellt.

Bewiesen, nicht behauptet, alles am 6.11. gemessen: (a) 18:51:46 MEZ liegt P112s alter
Feldstand ueber der berichtigten Spur -- der Form-Fall faellt rot, die Rangfolgen-Faelle
bleiben gruen (die erste Stelle war nie betroffen); das Artefakt ist danach bytegleich
(sha256 `3a6d77d7b056413f…` vor und nach dem Eingriff). (b) 18:53:28 MEZ wird die
bge-Erwartung gegen chroma probehalber auf 5 Anfragen gehoben -- der Fall faellt mit
`expected 4 to be 5`, danach zurueck auf 4. (c) 19:04:14 MEZ werden die zwei Zensus-Erwartungen
probehalber auf "2 von 45" und auf m16 gesetzt -- beide Faelle rot
(`expected '--- Stufe nomic-embed-text (768 D)…' to contain 'A. Gleichstand auf Platz 1:
2 von 45'` und dieselbe Form fuer m16), um 19:04:20 MEZ zurueckgesetzt, 17 Faelle gruen.

## Die Zahl, die kein Artefakt mehr hat

Das Papier der Leitung vom 2.11. (`audit-2026-10-09/feldzug/P8-MEM0-LAUF-0211.md` in der
Arbeitsmappe) haelt **62,2 % (28/45)** als Haltezahl fest. Ihr Artefakt
`ergebnis-fair.json` lag in `/tmp/konk-mem0-ld/` und existiert nicht mehr; der
dauerhafte Trace des 2.11. ist die Fakten-Konfiguration und sagt 24,4 %. Die 62,2 % sind
hier **nicht** widerlegt — sie sind nicht nachrechenbar. Wer sie brauchen will, muss den
Lauf fahren, dessen Konfiguration sie hatte. Der faire Lauf vom 6.11. ist eine *neue*,
sauber beschriebene Konfiguration; er ersetzt die alte Zahl nicht, er setzt eine zweite
hin, die ein Artefakt hat.

## Nachfahren

    # Kapsel ausserhalb des Projekts, rueckgaengig mit rm -rf
    python3 -m venv /tmp/konk-mem0-fair-0611/venv
    /tmp/konk-mem0-fair-0611/venv/bin/pip install "mem0ai[extras]" ollama
    # Korpus und Anfragen als JSON (liest scripts/eval-corpus.ts):
    npx tsx -e 'import {CORPUS,QUERIES} from "./scripts/eval-corpus"; …'
    /tmp/konk-mem0-fair-0611/venv/bin/python lauf-fair.py

Das Skript liegt bei den Artefakten: `docs/belege/konkurrenz-0611/lauf-fair.py.txt`.
Ergebnis und Protokoll ebenso (`ergebnis-fair-0611*.json`, `lauf-fair.log.txt`).
Dauer 2,4 und 2,6 Sekunden, Spitze 0,15 GiB — kein Netz nach aussen, nur lokale
Ollama-Aufrufe auf 127.0.0.1.

## P178 (9.11.2026): die Produkt-Zeile auf der zweiten Stufe — und der Abstand, der bleibt

mem0 fair mit dem zweiten Einbett (9.11., 20:06:21 und 20:06:29 MEZ, zwei frische
Speicher, `infer=False`, bge-m3 über Ollama): **68,9 % (31/45), zweimal identisch**,
Recall@5 88,9 %. Der Einbett-Hebel hebt mem0 um **+17,8 Punkte** (51,1 → 68,9) —
weniger als die Hebel der Verfahrens-Zeilen (+24,5 sqlite-vec, +26,7 chroma): mem0s
eigne Rangfolge dämpft, was der Embedder bringt. Unsre eigne Spur auf derselben Stufe
steht bei **77,8 % (35/45)** — der Abstand der Fusion zur Produkt-Zeile beträgt auf der
zweiten Stufe **8,9 Punkte**, dasselbe Bild wie bei den Verfahrens-Zeilen nach der
Berichtigung oben: **die Stufe (das Einbett) macht den großen Unterschied, die Fusion
den verbleibenden.** K3PTA führt damit weiterhin jede Zeile des Ledgers, auf beiden
Stufen, aber der ehrliche Abstand auf der zweiten Stufe ist 8,9 Punkte, nicht 24,5.
Die Latte (`tests/konkurrenz-mem0-latte.test.ts`, drittes Bein) hält den Abstand mit
einer Grenze von 5 Punkten und fällt bei Gleichstand.

Nebenbefund: cognee 1.6.7 (der zweite Produkt-Kandidat dieser Welle) ist auf diesem
Rechner nicht lauffähig — seine Graph-Engine (ladybug/lbug) fehlt die C-Bibliothek,
die es nur als unversionierten Fremd-Download gibt; Zeugnis
`docs/belege/konkurrenz-0911b/lauf-cognee-0911.log.txt`.
