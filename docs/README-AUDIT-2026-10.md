# README-Audit 12.10.2026 — Teil 1: jede Behauptung gegen den Baum

Stand des geprüften Baums: `~/kepta-core` @ **`e70da08`**, `package.json` → **3.4.0**.
Geprüft 12.10. gegen 22:00, alle Befehle gefahren, keiner vermutet.
Papiere: `README.md` **373** Zeilen, `README.de.md` **225** Zeilen.

**Der Wächter ist rot, und mein erster Blick hat das übersehen.** `node scripts/zahlen-belege.mjs`
→ **EXIT 1**, **237 Befunde, alle Klasse `pflicht-ohne-zitat`** (eine Zahl, die ihr Zitat nicht
trifft). Verteilung, gezählt mit `grep -oE "^  [A-Za-z0-9_.-]+\.md:[0-9]+" | uniq -c`:
**183 in `CHANGELOG.md`** (nicht diese Scheibe), **27 in `README.md`** und **27 in
`README.de.md`** — **54 in meinem Anteil**. Der Stand ist `e70da08`, also war der Wächter vor
meiner einzigen Zeilenänderung rot; ich habe nichts kaputt gemacht, aber ich habe es auch nicht
geerbt bekommen ohne Meldung.

**Wie ich selbst fast darauf hereingefallen wäre:** der erste Lauf endete auf
`node scripts/zahlen-belege.mjs | tail -6; echo $?` — das `echo $?` maß den `tail`, nicht den
Wächter, und schrieb ein falsches „EXIT 0" in diesen Absatz. Ohne Pipe gemessen: 1. Genau diese
Falle steht als Hausregel im Gedächtnis (Exit-Code nie durch eine Pipe verlieren), und ich bin ihr
in derselben Sitzung erlegen. Korrigiert, bevor das Papier weitergegeben wird.
Die 292 sind der Grund, warum dieser Audit existiert: eine Zahl kann belegt sein und der Satz
darumherum trotzdem falsch.

## Die Fallen, eine nach der anderen

| # | Prüfsatz | Befehl, den ich fuhr | Antwort | Urteil |
|---|---|---|---|---|
| 1 | Der Kern heißt nie „open source" | `grep -niE "open source\|quelloffen" README.md README.de.md` | EN:365 „source-available, **not OSI-approved open source**"; DE:10 und DE:225 dasselbe in Deutsch. Kein nacktes „open source" für den Kern | **hält** |
| 2 | „free / no limits" nur mit Kapazitätszahl | `sed -n '97p' README.md` + `grep -c "before it slows"` | EN:97 nennt `KEPTA_MAX_ACTIVE` **5000**, `server.…`, und „a brake on a runaway agent … **not a paywall** — raise it with that variable and nothing else changes". „before it slows": **kein Treffer** | **hält** |
| 3 | Kein „3 000 nodes at 60 fps" | `grep -niE "3 ?000 nodes\|60 ?fps" README.md README.de.md` | Kein Treffer in beiden. Die lebende Aussage EN:252 / DE:151 nennt **0 sich schneidende Paare** bei 400/1 500/3 000, belegt mit Commit **im veröffentlichten Paket**, Messzeit **2026-10-12 14:44**, Urteil der Ruhe-Sonde und zwei Guard-Zahlen, die im Test erwartet werden | **hält** — und ist das Vorbild, wie die übrigen Zeilen aussehen sollten |
| 4 | LongMemEval-Zahlen sind gesperrt | `grep -nE "61[.,]5\|40[.,]4\|32[.,]08" README.md README.de.md` | **kein Treffer.** Der Rückzug (EN:351-353, DE:193-197) nennt die Records 2.13.2–2.13.22 und die ausgelieferte Version **3.4.0** | **hält.** Eigener Fehlgriff notiert: ich verdächtigte den Absatz, noch 3.2.0 zu nennen — gemessen steht dort 3.4.0. Kein Befund |
| 5 | Kein „besser als X" ohne Messung | `grep -niE "better than\|besser als" README.md README.de.md` | **kein Treffer** in beiden | **hält** |
| 6 | Der Superlativ im Fuß | `grep -n "best place" README.md README.de.md npm/README.md ../kepta-app/README.md` | EN:372 trug „**the best place** to store knowledge for AI" — ein Vergleichswort ohne Messung | **hielt nicht — gestrichen.** Jetzt: „one local, encrypted memory that every AI reads and writes". Begründung: „best" ist eine Rangfolge, und keine Zahl im Haus ordnet uns einen Rang zu |
| 7 | Zwei Papiere, ein Stand | Zeilenzahlen + grep | 373 gegen 225 Zeilen. Die Fußzeile 372 existiert nur englisch — inhaltlich kein Widerspruch, aber der deutsche Leser bekommt keinen Abschluss-Satz | **hält, mit Kante** |

## Was ich nicht geprüft habe, und warum

- **Die 54 Zahlen ohne Zitat in meinen beiden Papieren.** Sie sind gefunden und zugeordnet;
  jede einzelne braucht entweder ihr Artefakt daneben oder den Strich. Nicht in dem Lauf, der hier endet.
- **Jede einzelne der 567 Behauptungen.** Die Wächterin zählt sie, ich habe die sieben Klassen
  geprüft, die dieses Haus schon erwischt haben, und jede Zeile, die ein Vergleichswort, ein
  „always/never", ein „no/without" oder eine Zeitangabe trägt, ist damit abgedeckt — aber 292
  Behauptungen laufen ohne Zitat durch die Papiere. Die Liste dieser 292 ist die eigentliche
  Arbeit, und sie ist nicht in einem Lauf zu machen.
- **`npm test`** lief nicht. Ich habe eine Zeile im Fuß geändert; die Suite-Zahl zieht die Leitung
  selbst, und ein Suite-Lauf während deiner Messung wäre genau der zweite Läufer, den du
  ausschließen willst.
- **Teil 2 (das Machwerk)** ist nicht gebaut. Die zehn Zeilen, die ein Leser zuerst braucht, die
  Reihenfolge danach und das Bildmaterial sind in `R1-README-PLAN.md` §4 und §5 schon gesetzt; was
  fehlt, ist der Umbau der Papiere daraufhin und das Lesen der vier Maßstäbe
  (claude-mem, Mem0, Zep, Letta) mit dem, was sie besser machen.

## Was als Nächstes folgt, in dieser Reihenfolge

1. Die 292 Behauptungen ohne Zitat aus `zahlen-belege.mjs` in eine Tabelle legen und pro Zeile
   entweder ein Artefakt setzen oder den Satz streichen.
2. Die vier Maßstabs-READMEs lesen, Unterschiede in einer Tabelle: Aufbau, Bild in den ersten
   30 Zeilen, Architektur-Diagramm, „reproduce this" unter jeder Zahl, Lizenz-Klarheit,
   Schlecht-Wetter-Abschnitt.
3. `README.md` auf die gesetzte Zehn-Zeilen-Ordnung umbauen (was es ist · was es **nicht** ist ·
   ein Befehl mit Ergebnis in 30 Sekunden · Beweis-Bild · Lizenz in einem Satz), dann Suche,
   Graph, Verschlüsselung, **Grenzen** (was der Kern nicht kann), Zahlenwand mit Messdatum.
4. `README.de.md` im selben Commit nachziehen — Übersetzung, nicht zweite Wahrheit.
5. Bildpfade schon setzen, Dateien leer lassen, bis die Bild-Scheibe liefert.


## 8. Der öffentliche CI-Lauf und mein eigener Fehlgriff dabei

Leitung meldete Lauf `38299357104` auf `e70da08` rot: **248 mal `pfad-existiert-nicht`**, weil
Messartefakte unter `audit-2026-10-09/e2-code/…` zitiert werden — die Arbeitsmappe hat kein Fern,
ein Kunde klickt ins Leere.

**Meine erste Prüfung darauf war falsch, und ich stelle sie hier richtig hin, nicht unter den
Teppich:** ich greppte `audit-2026-10-09|Desktop|ki gehirn` und meldete „keine Out-of-Repo-Zitate in
meinen Papieren". Die Zitate standen aber da — als **nackter relativer Pfad**
(`e2-code/nacht-12-10/rohdaten/vorher-gleich-12-10.log`), ohne das Präfix, nach dem ich gesucht
hatte. Ein Muster, das den Täternamen nicht kennt, meldet „keine Täter".

**Geheilt, sechs Zitate in zwei Papieren:** `README.md:252,255` und `README.de.md:151,154` zitierten
drei Pfade außerhalb des Repos (`vorher-gleich-12-10.log`, `kleinste-scheibe-2007.log`,
`skripte/kleinste-scheibe.mts`). Jetzt verweisen sie auf `docs/belege/` mit dem Wort „Name folgt,
sobald W ihn meldet". Nachlauf: `grep -cE "e2-code|nacht-12-10|rohdaten"` → **0 in beiden**;
der Wächter zählt **0 `pfad-existiert-nicht`** in meinen Papieren.

**Eine Kante, die sich geschlossen hat — nachgemessen 12.10. 23:05, nicht geglaubt:** beim
Schreiben dieses Absatzes war `docs/belege/` nicht vorhanden (`ls -d docs/belege` → Fehler), die
sechs Zeilen verwiesen also auf ein leeres Verzeichnis. Jetzt liegt es auf der Platte, untracked,
mit den sechs Artefakten der Nacht: `docs/belege/nacht-12-10/` trägt `vorher-gleich-12-10.log.txt`,
`kleinste-scheibe-2007.log.txt`, `flaechenanteil-1441.log.txt`, `ruhe-mit-anteil-1444.log.txt`,
`welt-stufe.log.txt`, `weltdeckung-1558.log.txt`. **Ich habe die sechs Namen noch nicht eingetragen**
— du hast bis Ws Grammatik-Notiz das Heilen der Zeilen untersagt, und die Namen allein sind nicht
die Form. Notiert ist damit nur: es gibt jetzt, was die sechs Zeilen brauchen, und der Rest ist
Ws eine Zeile Syntax.

## 9. Die 54 Zahlen ohne Zitat in meinen Papieren — Liste, und was ich brauche

Alle 54 sind Klasse `pflicht-ohne-zitat`, und sie liegen auf **neun Zeilen** (27 englisch, 27
deutsch, Spiegel zueinander):

| Zeile | Zahlen | was die Zeile sagt |
|---|---|---|
| EN 143 / DE 86 | 189 MB, 19 MB | Größe zweier Bestände |
| EN 211 / DE 133 | 71 %, 78 %, 11 % | Anteile |
| EN 254 / DE 153 | 283/385/571, 427/572/817, 0,662/0,674/0,699 | echte Kante gegen Zufallspaar, Weltseiten-Verhältnis gegen die 0,8-Latte |
| EN 338 / DE 182 | 70 %, 72 %, 56 %, 66 % | Coverage-Schwellen |
| EN 339 / DE 183 | 87 %, 89 %, 74 %, 85 % | Coverage-Schwellen, zweite Gruppe |
| EN 347 / DE 191 | 46.6 ms, 87.6 ms, 276.5 ms | Latenzmedianen |
| EN 355 / DE 199 | 29.8 %, 63.8 % | Eigenanteil und Wettbewerberzahl |

**Was ich nicht raten kann:** die Grammatik des Wächters. Zeile 347 zitiert bereits
`tools/latenz/ergebnisse/` **und** `tools/latenz/bench.ts:38` und ist trotzdem beanstandet; Zeile 252
war sauber, weil sie ein Artefakt und einen Commit nennt. Der Unterschied ist ein Muster, das ich
erraten müsste — und ein erratenes Zitat ist eine erfundene Quelle. **Ich brauche von dir ein einziges
Beispielzeile, die den Wächter passiert, dann ziehe ich die neun Zeilen in einem Durchgang nach**
(oder streiche die Zahl, wo kein Beleg existiert — beides ist in einer Stunde zu machen, Raten nicht).
Ausnahme-Listen habe ich keine angefasst; das ist Ws Feder.

## 9b. Nachmessung 12.10. 23:11 — die Neun-Zeilen-Liste ist überholt, und 41 Befunde sind mein Werk

Der Wächter hat sich unter dem Papier bewegt (W ändert ihn gerade: `git diff --stat
scripts/zahlen-belege.mjs` → 109 insertionen, 25 deletionen; `pruefeDoku` steht jetzt auf
`pflicht = true` als Default, `--inventar` und `--ohne-pflicht` zählen nur noch Erfassung).
**Neuer Stand, selbst gefahren:** EXIT 1, **441 Befunde, alle `pflicht-ohne-zitat`** — verteilt auf
**346 `CHANGELOG.md`** (nicht diese Scheibe), **47 `README.md`** und **48 `README.de.md`** = **95 in
meinen beiden Papieren**, gegen 54 in Abschnitt 9. Die Überschrift des Wächters zählt mit:
„82 von 442 Behauptungen bestätigt, 330 ohne Zitat".

**Zeilen, aktuell gezählt (Klammer = Befunde auf der Zeile):**
- `README.md` — 143 (2), 211 (3), **252 (12)**, 254 (9), **255 (8)**, 338 (4), 339 (4), 347 (3), 355 (2)
- `README.de.md` — 86 (2), 133 (3), **151 (12)**, 153 (9), **154 (9)**, 182 (4), 183 (4), 191 (3), 199 (2)

**Fett sind die vier Zeilen, die ich in Abschnitt 8 geheilt habe — und sie sind jetzt der größte
Block.** 12 + 8 + 12 + 9 = **41 der 95 Befunde habe ich selbst erzeugt**, indem ich die
Out-of-Repo-Pfade durch den Verweis auf `docs/belege/` ersetzt habe. **Ein Verzeichnis ist kein
Artefakt.** Der Wächter hat recht, und die Heilung war unvollständig, nicht falsch in der Richtung:
raus damit aus dem Repo war richtig, aber die Zeile braucht den Dateinamen.

**Was Ws Grammatik-Notiz damit eigentlich beantworten muss, ist kleiner als gedacht:** ob ein
namentliches Artefakt auf der Zeile reicht (`docs/belege/nacht-12-10/vorher-gleich-12-10.log.txt`,
und die Zahl muss in der Datei stehen). Die Dateien sind da, die Zahlen darin kann ich vorprüfen,
die Form kommt von W. **Ich heile trotzdem keine Zeile, bis §10 oben steht** — nur ist die Liste
jetzt 95 statt 54, und das musst du wissen, bevor du nach dem Gate urteilst.

**`doku-check` an meinem Stand, wie du es wolltest:** EXIT 1, und zwar mit der honesten Meldung
„ICH KANN NICHT PRÜFEN — test-results/vitest.json ist älter als tests/zahlen-belege.test.ts
(Bericht 21:09:32 UTC, Testdatei 21:10:09 UTC)". Der Lauf der Leitung um 22:57 war also 37 Sekunden
älter als Ws letzte Test-Änderung. **In diesem Moment läuft ein neuer Suite-Lauf** (PID 34391, seit
23:11, `vitest run` in `~/kepta-core`), nicht von mir — ich habe in dieser Scheibe keinen Lauf
gefahren, wie befohlen. Der laufende wird den Konflikt auflösen; danach melde ich die Zahl.

## 9c. Ws Grammatik kam um 23:03 — die neun Zeilen sind geheilt, und eine verkaufte Zahl ist mitgezogen

**Was eintraf:** `docs/belege/LESEFADEN.md` (7 927 Bytes, Schreibzeit 23:03) und `docs/belege/REGISTER.md`.
Damit ist die Bedingung aus Abschnitt 9 erfüllt, und ich habe in einem Durchgang nachgezogen:
**neun Zeilen in jedem Papier, achtzehn Zeilen, beide Papiere immer zusammen.** Keine Versionszahl,
keine Ausnahme-Liste, kein git push.

**Das Ergebnis, gemessen mit `node scripts/zahlen-belege.mjs --datei=…` vor und nach dem Durchgang:**

| Papier | vorher | nachher | Klassen nachher |
|---|---|---|---|
| `README.md` | 47 (`pflicht-ohne-zitat`) | **36** | 36 × `beleg-nicht-getrackt`, **0** ohne Zitat |
| `README.de.md` | 48 (`pflicht-ohne-zitat`) | **37** | 37 × `beleg-nicht-getrackt`, **0** ohne Zitat |
| Kern gesamt | 441 | **320** | 247 CHANGELOG (Ws Seite, ist von 346 auf 247 gefallen), 73 meine |

**Der eigentliche Beweis ist die Auspackung, nicht mein Lauf.** Nach Ws Regel 6 habe ich den Baum
ohne `.git`, ohne `node_modules`, ohne `coverage/` und ohne `test-results/` nach
`/tmp/wache-beweis-r1` gepackt (6,5 MB, 220 getrackte Dateien + `docs/belege/`) und die Wache dort
laufen lassen: **`README.md` EXIT 0** (53 Messbehauptungen: 39 bestätigt, 12 Soll, 2 im Papier),
**`README.de.md` EXIT 0** (53: 40 bestätigt, 11 Soll, 2 im Papier). **Sobald `docs/belege/` committet
ist, sind meine beiden Papiere grün — die 73 Befunde sind ein Tracking-Mangel, kein Inhaltsfehler.**

**Was ich gesetzt habe, Zeile für Zeile (Regel 2: pro Zeile ein Zitat, nie geerbt):**
- **252 / 151** → `docs/belege/nacht-12-10/vorher-gleich-12-10.log.txt`. 12 Zahlen, alle im Log.
- **254 / 153** → `docs/belege/nacht-12-10/ruhe-mit-anteil-1444.log.txt`. 9 Zahlen (283/385/571,
  427/572/817, 0,662/0,674/0,699), alle im Log.
- **255 / 154** → `docs/belege/nacht-12-10/kleinste-scheibe-2007.log.txt`. Radius 10,16, Seiten
  1 321/1 775/2 759, Anteile 0,769/0,572/0,368 %, 19 684 und die 0 — alle in diesem einen Lauf.
- **338/339 / 182/183** → **keine Messung, sondern Latten.** `vitest.config.ts:97-105` hält exakt
  66/72/56/70 und 85/89/74/87, und sein Kommentar sagt „sie wandern nur nach oben". Die Zeilen lesen
  jetzt „pinned by CI" / „von der CI gepinnt" und jede Zahl steht mit **≥** da, also erkennt Regel 4
  sie als Soll (12 / 11 Treffer) statt als Behauptung. Der Sprung von 8 Befunden auf null ist eine
  Sprachänderung, keine neue Zahl.
- **347 / 191** → `tools/latenz/ergebnisse/latenz-100k-fts-2026-10-01.json` (46.62 → 46.6, 87.63 → 87.6)
  und `…/latenz-1m-fts-2026-10-01.json` (276.51 → 276.5). Beide **getrackt**, deshalb hier sofort grün.
- **355 / 199** → beide Prozente nach Regel 5 **zweiter Hand** zitiert: `tools/longmemeval/README.md`,
  **Zeile 104** (die Zeile hält 29,8 % *und* 63,8 % samt der Metrik-Warnung; die Wache öffnet das
  Papier und findet beide — Klasse „im Papier", keine Befunde). **Zuerst hatte ich Zeps 63,8 %
  gestrichen**, weil ich nur Zeile 33 kannte, und habe sie dann **zurückgeholt**: der Wert war nie
  unbelegbar, er stand die ganze Zeit in einem getrackten Papier dieses Repos. Meine erste Suche war
  zu eng (grep über `tools docs README*`, Treffer in Zeile 104 übersehen, weil ich auf „63\.8" statt
  „63,8" gegangen bin — ein Komma, das mein Muster nicht sah). Die Zeile nennt jetzt beide Zahlen und
  den Unterschied der Metriken, ohne Rangfolge.

**Zwei Zeilen konnte ich nicht zitieren, also habe ich sie selbst nachgemessen** (das ist der Auftrag,
den Ws Kurzliste mir gibt: „ein Lauf, der die Zahl druckt, ist der Beleg"):

1. **Ablation, `README.md:211` / `README.de.md:133`.** `npx tsx scripts/ablation.ts --json`, drei Läufe
   hintereinander, alle EXIT 0, **alle sechs Hit@1-Werte bytegleich** (der Lauf ist deterministisch,
   und er misst Genauigkeit, nicht Zeit — deshalb keine Ruhe-Sonde nötig). Artefakt:
   `docs/belege/r1/ablation-2326.log.txt`. Ergebnis: Volltext 71,1 % · +Graph 71,1 % (+0) · +Vektoren
   77,8 % · **alle drei 75,6 %** · Graph allein 11,1 % · Vektor allein 73,3 %.
   **Eine verkaufte Zahl hat sich bewegt:** das Papier nannte „all three **78 %**" (Nachmessung
   09.10.2026); auf dem heutigen Stand sind es **76 %**. Ich habe auf 76 gestellt und den Ehrlichkeits-
   satz um die Beobachtung erweitert, die der Lauf zeigt: die Graph-Kante **senkt** die Drei-Mischung
   gegenüber dem Paar (77,8 → 75,6), sie ist für Begriffe und für `GET /api/graph` da, nicht für den
   Sieg. **Das ist eine Änderung an einer Vertriebszahl und muss dich erreichen, bevor sie rausgeht.**
2. **Baukontext, `README.md:143` / `README.de.md:86`.** Die alten 189 MB / 19 MB halte ich nicht für
   belegbar: Docker ist auf diesem Rechner nicht im Pfad, und mein `du`/`stat`-Lauf am heutigen Stand
   (Artefakt `docs/belege/r1/kontext-groesse-2128.log.txt`) sagt **179,6 MB Baum ohne `.git`, davon
   169,3 MB `node_modules`, und 4 040 668 Bytes = 3,85 MB in 220 getrackten Dateien**. Die Zeilen
   nennen jetzt diese drei Zahlen und ihren Lauf, nicht das alte Paar. Der Kern der Warnung
   (`ERR_DLOPEN_FAILED`, „clean clone before any `npm install`", `.dockerignore`) bleibt unverändert.

**Mein eigener Methodenfehler auf dem Weg dorthin, notiert:** ich hatte mir einen eigenen
Zahl-Sucher gebaut (`audit-2026-10-09/r1-belegsuche/beleg-suche.mts`) und damit für 283/385/571 und
46.6/87.6/276.5 „KEIN ARTEFAKT" gelesen — **obwohl die Werte in den Logs stehen**. Mein Sucher
verglich Zeichenketten, die Wache rundet auf die Stellenzahl des Papiers (72,0 → 72, 46.62 → 46.6).
Eine selbst gebaute Sonde, die das Maß der Wache nicht teilt, meldet Pech statt Welt. Geheilt durch
Gegenprobe: Kandidatenzeilen in die Wache (`--datei=` auf einer Kratzdatei), nicht in meinen grep.

**Was an meinem Stand weiter offen bleibt:**
- `docs/belege/` ist **ungetrackt** (Ws sechs + meine zwei Dateien). Ohne Commit bleiben 73 Befunde
  stehen, die keiner sind. **Das ist Leitungssache, nicht meine Feder.**
- **`doku-check` kann noch nicht prüfen** (Bericht 21:15:07 UTC, `tests/zahlen-belege.test.ts`
  21:15:47 UTC — Ws Suite-Arbeit ist 40 Sekunden jünger als der letzte Lauf). Ich habe keinen eigenen
  Suite-Lauf gefahren.
- Badges verlinken ihre Zahl nicht (Marktvergleich, Abschnitt 11.2 Punkt 2) — Teil-2-Arbeit.
- Der Sprachlink fehlt: `README.md` verweist mit keinem Wort auf `README.de.md` — Teil 2, eine Zeile.

**Zwei Dinge, die ich zuerst falsch hatte und hier richtig stelle.**

*Erstens: erfundene Laufzeiten in meinem eigenen Beweis.* Ich schrieb in `ablation-2326.log.txt` für
die drei Läufe die Zeitpunkte 21:20:41Z / 21:25:12Z / 21:26:31Z — **die hatte ich nicht gemessen,
sondern gefühlt**. Ersetzt durch `stat`-mtime der JSON-Ausgaben (21:25:34Z, 21:26:27Z, 21:26:33Z) und
den Vermerk, woher die Zeiten stammen. ein Beleg, der eine unbeobachtete Uhrzeit enthält, ist genau
die Sorte Papier, wegen der diese Wachen gebaut wurden.

*Zweitens: eine zweite Wache, die ich nicht auf dem Schirm hatte, und ein Fehlschluss, den ich selbst
fast gebaut hätte.* `scripts/benchmark-belege.mjs` hängt an `tests/doku-zahlen.test.ts` und prüft
Qualitätsprozente gegen die LongMemEval-Records. Ich habe sie gegen meine Papiere gefahren, wie der
Test sie fährt: **`README.md` 0 Fehler, `README.de.md` 0 Fehler.** Beim Nachfragen, *warum* nichts
gefunden wird, schrieb ich zuerst, das Fremd-Muster treffe „LongMemEval" und übersehe deshalb unsere
eigene Zahl — **das war falsch und ich habe es Widerlegt bevor es in einen Bericht kam:** die
Fremdmarke in `scripts/benchmark-belege.mjs:59` heißt `langmem` (LangMem, ein anderes Produkt), unser
Benchmark heißt `longmem`-haltig **LongMemEval** — ein Buchstabe Unterschied, keine Lücke. Nachgemessen
drei Zeilen durch `eigeneProzente`: „Der LongMemEval-Serienwert liegt bei 61,5 %" → **61.5 gefunden**,
„29,8 % der Fragen entschied ein Wörtlich-Treffer." → **29.8 gefunden**, unsere echte Zeile 355 →
**nichts**. Der Grund ist der dritte Fall, und der ist eine echte Kante, die W und die Leitung kennen
sollten: **die Zeile nennt „Zep", und wer einen Wettbewerber nennt, dessen Zeile wird als Fremdzahl
übersprungen** — inklusive unserer eigenen 29,8 % auf derselben Zeile. Die Zahl ist dadurch nicht
ungeprüft (die Zahlen-Wache hat sie, und ich habe ihr das Papier-Zitat gegeben), aber die
Benchmark-Wache sieht sie nicht. **Gemeldet, nicht gefixt — `scripts/benchmark-belege.mjs` ist nicht
meine Feder.**




## 10. [reserviert für W — die Zitatgrammatik]

Steht hier leer. Ich habe keine der neun Zeilen aus Abschnitt 9 geheilt, auch nicht eine, obwohl
`docs/belege/` inzwischen gefüllt ist (siehe Abschnitt 8). Warten ist billiger als ein erratenes Zitat.

## 11. Der Marktvergleich — was die besten READMEs des Marktes konkret besser machen

**Stand 12.10.2026, 23:05.** Gelesen: sechs öffentliche READMEs und unsere beiden Papiere,
gemessen mit einem Zählprogramm, nicht mit dem Auge. Rohe Kopien und das Programm liegen in der
Arbeitsmappe unter audit-2026-10-09/r1-markt (rohdaten/), der Lauf ist mit
`node markt-messen.mts` wiederholbar. geladen per curl gegen raw.githubusercontent.com, alle mit
HTTP 200 außer einem (unten). Zeilenzahlen sind split an Newline gezählt — eine mehr als wc -l,
wegen des abschließenden Zeilenumbruchs; alle sieben Papiere nach derselben Zählart.

**Zwei Fetch-Funde, bevor die Tabelle steht, weil beide die Vergleichsbasis geändert haben:**
- **cli/cli hat keinen main-Zweig.** main → 404, trunk → 200. Wer den Ast verlinkt, verlinkt ins Leere.
- **letta-ai/letta ist ein Zeiger-Papier, kein Produkt-Papier.** 40 Zeilen, 1 574 Bytes, **null Bilder** —
  kein Messfehler, sondern eine Ansage: Zeile 5 verweist auf letta-ai/letta-code, Zeile 37 heißt
  „Historical source" und erklärt den archive-Zweig zum Reproduktionsstand für alte Tags. Meine erste
  Vermutung („404, kaputter Fetch") war falsch; ich habe letta-code zusätzlich geladen (146 Zeilen,
  erstes Bild Zeile 13, Mermaid-Diagramm ja) und vergleiche damit.

### 11.1 Die Messung

| Papier | Zeilen | erstes Bild | Badge-Zeilen | erster Befehl | Mermaid | Lizenz zuerst | Sprachlinks | eigene "das bin ich nicht"-Sektion |
|---|---|---|---|---|---|---|---|---|
| thedotmack/claude-mem | 463 | 7 (Logo), Produkt-GIF 90 | 13, 59–77 | 140 | nein | 58 | 32 (Zeile 19–54) | nein |
| mem0ai/mem0 | 270 | 3 (Banner) | 8, 22–37 | 95 | nein | 267 | 0 | nein, aber Ehrlichkeitsklausel 54 |
| getzep/zep | 71 | 3 (Logo) | 11, 14 | keiner im Papier | nein | nie | 0 | **ja, Zeile 19** |
| letta-ai/letta (Zeiger) | 40 | keines | keine | 12 | nein | nie | 0 | Zeile 37 "Historical source" |
| letta-ai/letta-code | 146 | 13 | 3 | 43 | ja (61) | nie | 0 | Zeile 97 "AgentFile deprecation" |
| ollama/ollama | 358 | 3 (Logo) | keine | 16 | nein | nie | 0 | nein |
| cli/cli (trunk) | 123 | 8 (Screenshot) | keine | 22 | nein | 30 | 0 | Zeile 5 Warntafel, Zeile 115 "Comparison with hub" |
| **KEPTA README.md** | 374 | **1 (nur Logo)** | 2 | 48 | ja (16) | 2 und 12 | **0** | Satz ja (367), Sektion nein |
| **KEPTA README.de.md** | 226 | **1 (nur Logo)** | 2 | 19 | ja | 10 | Verweis auf EN (Zeile 10) | nein |

**Die eine Zahl, die die Tabelle zusammenfasst:** die sechs Markt-Papiere zeigen das Produkt in
Zeile 3 bis 13. **Unsere beiden Papiere enthalten genau ein Bild: das Logo.** Gemessen mit
grep auf png, gif, mp4, webp und Bildsyntax in README.md → **kein Treffer**, README.de.md → **kein
Treffer**. Kein Screenshot, kein GIF, keine Diagramm-Grafik — das Architektur-Diagramm ist Mermaid-
Text, den GitHub rendert, aber kein Produktblick.

### 11.2 Was sie konkret besser machen — neun Übernahmen, jede mit Fundstelle

1. **Produkt in den ersten zehn Zeilen.** mem0 Banner Zeile 3, zep Logo Zeile 3, ollama Zeile 3,
   gh Screenshot Zeile 8, claude-mem Logo Zeile 7 und das Vorschau-GIF Zeile 90. Wir: Zeile 1 Logo,
   dann 46 Zeilen Text und Diagramm. **Übernahme:** ein echtes Produktbild (Screenshot oder GIF)
   auf Zeile 3–8. Kostet nur den Bildpfad, kein Text — und fällt deshalb mit der Bild-Scheibe.
2. **Jede Heldenzahl ist ein Klick auf ihr Artefakt.** claude-mem: Lizenz-Badge Zeile 58 verlinkt
   die Lizenzdatei, Versions-Badge Zeile 61–63 verlinkt package.json, Node-Badge 64–66 ebenso.
   mem0: Download-Badge Zeile 25 verlinkt pepy.tech, Paket-Badges 31–34 verlinken pypi und npm.
   **Unsere Badge-Zeile 2 nennt sieben Zahlen in sieben Badges, und kein einziges Badge hat einen
   Link auf die Datei, die die Zahl hält** (gemessen: grep auf die Anker-Lizenz- und
   package.json-Links in README.md → 0 Treffer; der einzige Anker in der Zeile ist LinkedIn).
   **Übernahme:** Anker pro Badge auf das Artefakt. Das ist unsere Zahlen-Wache in Klickform — und
   die billigste Glaubwürdigkeit, die der Markt zu verkaufen hat.
3. **"Was dies nicht ist" als eigene Sektion, früh.** zep Zeile 17–21: „This repository is **not**
   Zep's product or service. It contains **example code, framework integrations, and tools**", dann
   Zeile 31 der Hinweis auf Graphiti als das eigentliche OSS-Framework, dann Zeile 45 und 66–69, die
   legacy/ als „Deprecated … no longer supported" benennen. **Wir haben den Satz** (README.md:367
   „What this repository is — and what it is not."), **aber als letzter Absatz unter der
   Lizenz-Überschrift** — ein Leser sieht ihn erst nach 360 Zeilen. **Übernahme:** dieselbe Aussage,
   eine Überschrift, Position in den ersten 20 Zeilen.
4. **Inhaltsverzeichnis als Tabelle über jedes Verzeichnis.** zep Zeile 35–45: neun Zeilen, eine pro
   Ordner, Status im Text („unsupported"). **Übernahme:** eine „Was in diesem Repo liegt"-Tabelle
   (Kern, npm-Bündel, Python-Client, tools/latenz, tools/longmemeval, docs/belege) — sie beantwortet
   die Frage „wo ist mein Code, wenn ich ihn anfassen will", bevor der Leser sucht.
5. **Eine Zahl, ein Reproduktionsweg.** mem0 macht es vor: Tabelle Zeile 47–52 mit LoCoMo,
   LongMemEval, BEAM; Zeile 54 die Grenze der Zahl („Scores reflect Mem0's managed platform, which
   includes proprietary optimizations not available in the open-source SDK; open-source users should
   expect directionally similar gains but not identical numbers"); Zeile 63 „The evaluation framework
   is open-sourced so anyone can reproduce the numbers" mit Link; Zeile 254–265 ein BibTeX-Block zum
   Zitieren. **Wir haben den Läufer und die Messzeit in der Zeile** (README.md:252, 351), **aber
   keinen öffentlichen Läufer-Ordner, den man klicken kann.** Mit docs/belege/ (Abschnitt 8) ist das
   eine Zeile Arbeit, sobald Ws Form da ist.
6. **Support ist ein Block, nicht ein Rest.** claude-mem: Troubleshooting Zeile 394, Bug Reports
   Zeile 402 mit dem Befehl, der den Report wirklich baut (407–409), System Requirements Zeile 318,
   Support Zeile 443. mem0: „Documentation & Support" Zeile 248–252 mit Doku, Discord und einer
   **Mailsadresse** (founders@mem0.ai). gh: Zeile 5 eine datierte Warntafel im [!IMPORTANT]-Block für
   eine Betriebsumstellung (PGP-Schlüsselrotation, Stichtag 5.9.2026) und Zeile 10 der unterstützte
   Bereich. **Unsere Zeile 14 (Discussions, „Fragen, Security-Feedback oder Benchmark-Kritik") ist
   früh und gut — aber es gibt keinen Troubleshooting-Pfad, keine Systemanforderungs-Zeile und kein
   Postfach.** Übernahme: drei Zeilen Support, kein Versprechen.
7. **Sprachen sind verlinkt, nicht nur vorhanden.** claude-mem Zeile 19–54: zweiunddreißig
   Sprachlinks im Heldenteil. **Unsere deutsche Fassung ist aus dem englischen Papier mit keinem
   Link erreichbar** (gemessen: grep auf README.de, Deutsch, Language in README.md → 0 Treffer),
   während README.de.md:10 sauber auf English verweist. **Übernahme:** eine Zeile Sprachlinks. Das
   ist die billigste Änderung dieses Papiers und die einzige, die heute noch nichts blockiert.
8. **Der erste Befehl steht vor der Architektur.** ollama Zeile 11 Download, erster Befehl Zeile 16;
   letta-code 43; gh 22; mem0 95; claude-mem 140. **Unsere 48 ist gut, aber der Diagrammblock belegt
   Zeile 16–39: vierundzwanzig Zeilen Mermaid vor dem ersten Befehl** (Zäune mitgezählt).
   Übernahme: Diagramm hinter den ersten Befehl, oder auf drei
   Zeilen schrumpfen. (Der Markt zeigt: niemand liest die Architektur, bevor er etwas installiert.)
9. **Der Leser bekommt Sprunglinks.** claude-mem Zeile 120–127: sieben Anker unter dem Hero, dann
   erst die Sektionen. Bei 463 Zeilen ist das der Grund, warum das Papier trotzdem schnell ist.
   **Übernahme:** sechs Ankerlinks direkt nach der Problemsektion.

### 11.3 Was wir besser machen — vier Fundstellen, damit niemand umbaut, was schon hält

1. **Lizenzehrlichkeit im ersten Dutzend Zeilen.** README.md:12 und README.de.md:10 sagen
   source-available, kein OSI-zertifiziertes Open Source und den AGPL-Übergang, bevor der Leser
   irgendetwas installiert. mem0 nennt Apache 2.0 in Zeile 267 (Ende), claude-mem in Zeile 58 als
   Badge ohne Erklärung, zep, letta und ollama erwähnen die Lizenz im README **überhaupt nicht**.
2. **Ein echtes Terminalprotokoll im Papier.** README.md:47–78 zeigt Befehl und Antwort
   (`npx -y kepta-mcp demo`, dann die sechs Szenen). Keines der sechs Markt-Papiere zeigt eine
   tatsächliche Ausgaben-Antwort in seinem README; claude-mem zeigt ein GIF, gh einen Screenshot,
   mem0 und ollama zeigen Befehle ohne Echo.
3. **Nachprüfbarkeit ist eingebaut, nicht behauptet.** Zahlen-Wache, `scripts/zahlen-belege.mjs`,
   `docs/belege/`, Ruhe-Sonde. Zum Vergleich: claude-mem Zeile 294 schreibt „**~10x token savings**
   by filtering before fetching details" — keine Messung, kein Artefakt, kein Datum, und kein
   Wächter dieses Haushalts würde es merken. Genau dafür existiert unsere Wache; das ist ein
   Verkaufsargument, das kein Konkurrenzpapier bietet.
4. **Grenzen stehen als Eigenschaft im Text.** `KEPTA_MAX_ACTIVE` 5000, kein Schlüssel, keine Stufen
   (README.md:97). mem0 deckt die Grenze seines Open-Source-Zweigs in einer Klausel ab (Zeile 54) —
   richtig, aber der Leser muss die Klausel erst finden.

### 11.4 Material für den Vertrieb — und die Zahl, die uns drückt

- **Kein Befund:** in keinem der sechs Papiere steht ein KEPTA-Name, keine Behauptung über uns, kein
  namentlicher Vergleich (gemessen: grep -niE über alle sechs, 0 Treffer). Suchmaterial wäre nur in
  ihren Doku-Seiten und Benchmark-Tabellen zu finden, nicht in ihren READMEs; das habe ich nicht
  gelesen und melde es als offene Fläche, nicht als „nichts zu finden".
- **Mem0 behauptet LongMemEval 94,4** (eigene Tabelle Zeile 50, Research-Highlight Zeile 67,
  +27 Punkte gegenüber ihrem eigenen Altstand, Algorithmus-Stand April 2026, Papier arXiv 2504.19413).
  Dieselbe Latte, von der wir unsere Zahl zurückgezogen haben. **Ihr eigenes Zugeständnis Zeile 54
  sagt: die Zahl gilt für die Managed-Plattform, nicht für den Open-Source-SDK.** Das ist genau der
  Rückzug, den wir ehrlich gemacht haben — bei ihnen steht er als Klausel. **Ansetzpunkt nach außen:**
  wer eine Zahl nennt, muss nennen, auf welchem Produkt sie gilt. Nicht als Vergleich in unser
  Papier — eine Rangfolge brauchen wir selbst gemessen, und die haben wir nicht.
- **zep führt benchmarks/ mit LoCoMo und LongMemEval als Verzeichnis** (Zeile 43) und nennt im README
  **keine Zahl**. Der Markt zeigt die Latte, ohne zu prahlen — das ist die Haltung, die unsere
  Rohdatensatz-Zeile (README.md:351) schon hat. Nur eben ohne Zahl, die jemanden umhaut.

### 11.5 Was dieser Vergleich nicht ist

- Er misst **Form, nicht Korrektheit.** Zeilenstand, Bildposition, Badge-Anker: kein Meter sagt, ob
  ein Satz wahr ist. Dafür ist Abschnitt 4 und 9 da.
- Die Klassen "Limits", "Lizenz zuerst" und "Reproduzierbarkeit" kommen aus Regulär-Ausdrücken. Ich
  habe jeden Treffer und jede Lücke von Hand gelesen (die falschen Treffer: unsere 149 ist ein
  Shell-Kommentar im Docker-Block, keine Limitationszeile — gestrichen aus der Wertung; letta-Zeile 39
  „repro" war der Treffer auf „reproducibility" im Satz über archivierte Tags, kein Messversprechen).
- Geladen am 12.10.2026 gegen 23:05, ein Stand, ein Tag. Der Markt ändert sich; die Zahlen oben
  gelten für diesen Fetch.
- Nicht gelesen: die Doku-Seiten der sechs (docs.mem0.ai, docs.claude-mem.ai, ollama.com/docs,
  help.getzep.com, docs.letta.com, cli.github.com/manual). Die Vergleichsfrage war das README.

## 12. Öffentliche Flächen — die Site hat sich selbst widersprochen (13.10.2026, 00:0x–00:2x)

**Was falsch war, gemessen an der ausgelieferten HTML, nicht an der Datei.** Leitung meldete vier
Befunde, ich habe sie nachgemessen und die Klasse über die ganze Site gesucht
(`github.io-check/seite-zahlen-pruefen.mts`, Kanal `--lokal` und Kanal HTTP):

| Fläche | ausgeliefert war | jetzt im Auslieferungspfad |
|---|---|---|
| `trust.html:430` | „474 tests over 36 files on the current engine commit" | „982 tests over 79 files in the engine as published (npm `kepta-mcp` 3.3.0, tag `v3.3.0`, commit `7978139`, measured 2026-10-11)" |
| `vault.html:492-493` | Ziffer 474, „in 36 files … green in under twenty seconds" | Ziffer 982, „in 79 files on the engine as published (…)" — **das Tempo ist raus**, siehe unten |
| `vault.html:552` | „474 tests in 36 files, green in under twenty seconds" | „982 tests in 79 files on the engine as published (3.3.0)" |
| `og.html:141` | Chip „474 tests · rerun it" | Chip „982 tests · rerun it" |
| `index.html:780` | „…987 on the open core **as it stands today** (commit `6ae32d3`)" | „…987 on the open core **at commit `6ae32d3`**" — Zahl und Commit bleiben, nur das falsche Wort ist weg |
| `index-repariert.html`, `index-online.html` | live, crawlbar, je 2 Treffer „61.5 % on LongMemEval-S" (die zurückgezogene Zahl) plus „474 in this open core" | **aus dem Repo heraus bewogen** (nach `ki gehirn/website-entwuerfe/`), erste Zeile im File begründet den Entwurfs-Status |
| `index-flug.html` | **fünfte live-Fläche in derselben Klasse**, 8 Befunde: „474 tests" / „36 files" / „under 20 seconds" auf Zeile 2126, 2134, 2395, 2660, 2677 | **nicht angefasst** — fremde Datei (Filmscheibe), gemeldet mit Zeilen |

**Woher die 982 / 79 kommt, in einem Befehle nachfahrbar:** npm liefert `kepta-mcp` **3.3.0**
(`npm view kepta-mcp version` → `3.3.0`, gemessen 23:54). Der Tag trägt sie selbst:
`git show v3.3.0:README.md` → „**982 tests** (measured 2026-10-11)", und die Anzahl der Testdateien
nach dem glob, den der Runner benutzt (`vitest.config.ts` → `tests/**/*.test.ts`), ist
`git ls-tree -r --name-only v3.3.0 -- tests | grep -c '\.test\.ts$'` → **79**. HEAD hätte 84 Dateien —
die öffentliche Fläche nennt die **veröffentlichte** Engine, nicht den Arbeitsbaum. Der Prüfer der
Leitung hatte 79 mit `git ls-tree v3.3.0 tests/ | wc -l` gemessen; dieser Befehl zählt 68 Einträge
(Ordner als Eintrag), rekursiv 82 (auch Fixtures). **79 stimmt, aber nur über den Runner-Glob** —
wer ihn nicht angibt, kommt auf eine andere Zahl.

**Eine Zahl, die ich absichtlich nicht gesetzt habe:** „green in under twenty seconds". Für die
veröffentlichte Engine 3.3.0 existiert kein Dauer-Beleg im Haus (der letzte Laufbericht ist jünger als
der Tag und gehört dem Arbeitsbaum), und ich fahre keinen Suite-Lauf, während die Leitung misst.
Nach der Regel „lieber eine leere Stelle als eine falsche Zahl" ist der Satz ohne Tempo ausgeliefert.
**Das ist ein Verlust an Verkaufsritmus, kein Gewinn an Wahrheit** — wenn ein gemessenes Datum für
3.3.0 auftaucht, kommt die Zeit zurück.

**Beweis, nicht Absicht.** Der Schnitt gilt erst, wenn die ausgelieferte Fläche ihn trägt. Beleg des
Ist-Zustands, beide Kanäle, beide Läufe gespeichert:
`lokal-nach-dem-schnitt.txt` (vier benannte Flächen **HÄLT**, `index-flug.html` FÄLLT DURCH, beide
Entwürfe 404) und `live-vor-dem-push.txt` (**7 von 7 fallen durch**, beide Entwürfe noch 200 mit je
2 Treffern auf 61,5 %). Der Abstand zwischen den beiden Protokollen ist die Arbeit, die noch nicht
draußen ist: **nichts gepusht, nichts committet, kein Deploy** — `git status` im Seiten-Repo zeigt
`M trust.html`, `M vault.html`, `M og.html`, `M index.html`, `D index-repariert.html`,
`D index-online.html`. Nach dem Push ist `node seite-zahlen-pruefen.mts` der einzige Befehl, der
beides vergleicht; er geht nur mit 0 raus, wenn `index-flug.html` mitgezogen ist.

**Was Pages hier bedient, und warum `entwuerfe/` im Repo die Antwort nicht ist.** Das Seiten-Repo ist
`DamianTodorovic/DamianTodorovic.github.io`, Ast `main`, kein Build-Workflow, `.nojekyll` oben — also
klassisches Branch-Pages **mit dem Repo-Stamm als Web-Root**. Nachgemessen: `assets/fonts/OFL-geist-mono.txt`
→ **200 text/plain** (ein Unterordner wird bedient), `neu-a.html` und `continuum/` → **404** (ungetrackt
wird nicht bedient). **Ein Ordner `entwuerfe/` im Repo wäre also weiterhin ausgeliefert und crawlbar** —
`robots.txt` sagt nur `Allow: /`. Raus aus dem Auslieferungspfad heißt hier: raus aus dem Repo. Deshalb
liegen die zwei Entwürfe jetzt in der Arbeitsmappe (`website-entwuerfe/`), und ihre URLs im Seiten-Repo
sind als Löschungen vorgemerkt. Optional als zweite Schicht: `Disallow: /index-repariert` in der
`robots.txt` — aber das ist Politik, kein Wegnehmen.

## 12b. Die Liste war laenger: fuenfte Flaeche geheilt, und ihre Eval-Zahlen selbst gemessen (13.10. 00:2x–00:4x)

Leitung meldete zurueck: es sind **fuenf** Flaechen mit der stale Zahl, nicht drei, und jede traegt eine
zweite (die 36 Dateien). Nach meinem Schnitt, Zeile vorher → nachher, und der Nachweis aus dem
**ausgelieferten** HTML:

| Flaeche | Zeile vorher (ausgeliefert) | Zeile nachher (im Baum) | curl auf die live Seite, Stand 00:4x |
|---|---|---|---|
| `trust.html:430` | „474 tests over 36 files on the current engine commit" | „982 tests over 79 files in the engine as published (npm `kepta-mcp` 3.3.0, commit `7978139`, measured 2026-10-11)" | live nennt **weiter 474/36** — nichts gepusht |
| `vault.html:492` | Ziffernblock `474` | Ziffernblock `982` | live `474 tests` |
| `vault.html:493` | „in 36 files … green in under twenty seconds" | „in 79 files on the engine as published (…)" — Tempo weg | live `in 36 files … under twenty seconds` |
| `vault.html:552` | „474 tests in 36 files, green in under twenty seconds" | „982 tests in 79 files on the engine as published (3.3.0)" | live `474 tests in 36 files …` |
| `og.html:141` | Chip „474 tests · rerun it" | Chip „982 tests · rerun it" | live `474 tests` |
| `index-flug.html:2126` | „474 in 36 files, run by CI on every push…" | „982 in 79 files on the engine as published (… measured 2026-10-11), run by CI…" | live `474 tests in 36 files` |
| `index-flug.html:2134` | „474 tests in 36 files … green in under 20 seconds" | „982 tests in 79 files on the engine as published (…) on an M-series laptop" | live ebenso stale |
| `index-flug.html:2395` | „runs 474 tests over 36 files on the current engine commit" | „runs 982 tests over 79 files on the engine as published (3.3.0, measured 2026-10-11)" | live ebenso stale |
| `index-flug.html:2660` | „Scene 07 · Proof · 474 tests" | „Scene 07 · Proof · 982 tests" | live `474 tests` |
| `index-flug.html:2677` | „Core 474 / 36" | „Core 982 / 79" | live `474 / 36` |
| `index.html:780` | „987 … **as it stands today** (commit `6ae32d3`)" | „987 … **at commit `6ae32d3`**" (Zahl und Commit unveraendert) | live nennt das Wort noch |
| `index-repariert.html`, `index-online.html` | 200, je 2 Treffer „61.5 % on LongMemEval-S" | aus dem Repo bewogen nach `ki gehirn/website-entwuerfe/`, Begruendung als erste Zeile | **live noch 200** — loescht erst der Commit |

**Der Nachweis ist zweigeteilt, und der Unterschied ist die noch nicht geleistete Arbeit:**
`github.io-check/seite-zahlen-pruefen.mts --lokal` → **alle 7 Flaechen halten, EXIT 0**;
derselbe Pruefer gegen `https://damiantodorovic.github.io` → **7 von 7 fallen durch, EXIT 1**,
Protokolle in `lokal-nach-dem-schnitt.txt` und `live-vor-dem-push.txt`. Eine Flaeche gilt erst als
geheilt, wenn der live-Kanal 0 meldet — das kann ich nicht herbeifuehren, weil ich weder pushe noch
deploye.

**Die 79 habe ich nachgemessen, bevor ich sie gesetzt habe — und dabei eine andere Zahl bekommen als
der Befehl in deiner Notiz.** `git ls-tree v3.3.0 tests/ | wc -l` zaehlt **68** Eintraege (Ordner als
ein Eintrag), rekursiv **82** (mit Fixtures). Auf 79 kommt nur, wer den Glob des Runners benutzt:
`git ls-tree -r --name-only v3.3.0 -- tests | grep -c '\.test\.ts$'` → **79**, exakt wie
`vitest.config.ts` → `include: ["tests/**/*.test.ts"]`. **Wenn die 79 nachpruefbar dastehen soll, steht
ihr Befehl in `docs/belege/REGISTER.md`, nicht nur in meinem Papier** — sonst zaehlt der Naechste 68.

**Zusaetzlich gemessen, weil die Filmscheibe auf derselben Zeile Zahlen setzt:** `npx tsx
scripts/eval.ts` (= `npm run eval`), EXIT 0, Store in `mkdtemp`, ohne Modell und deterministisch.
v1-Baseline: Hit@1 **51.1 %**, MRR **0.559**, Recall@5 capped 62.2 %. v2-Engine: Hit@1 **71.1 %**,
MRR **0.759**, Recall@5 capped **81.1 %**. `index-flug.html:2134` nennt genau diese vier Werte —
**die Zeile haelt, was sie behauptet**, und mein Ablauf-Lauf (`r1/ablation-2326.log.txt`) bestaetigt
dasselbe BM25-Ergebnis unabhaengig. Beleg: `docs/belege/r1/eval-0037.log.txt`. Nicht gesetzt, weil die
Seite sie nicht nennt: die Recall-Zahlen.

**Was ich an meinem alten Auftrag nicht angefasst habe, wie befohlen:** die Fallzahl und das Badge im
Kern-README. Nachgemessen: `git diff README.md README.de.md` enthaelt **keine** Zeile mit
`img.shields` und keine Zahl, die Faelle zaehlt — mein fruherer Heil-Durchgang hat nur Zitate,
Latten-Wortlaut und zwei Zeitangaben geaendert. Die 1 032-Frage bleibt deine und M1s.
