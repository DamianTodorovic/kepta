# Die Aussendung und die Ablage

Stand 6.11.2026, 19:57 MEZ. Alles hier ist ein Lauf: `node docs/belege/aussendung-0611/vermessen.mjs`
schreibt `aussendung-0611.json` (die Werte, ohne Uhrzeit) und `aussendung-0611.log.txt` (dieselben
Werte mit Uhrzeit und Befehlen). Ein zweiter Lauf auf demselben Stand schrieb die JSON bytegleich —
nur der Platten-Abschnitt (7) schwankt mit der Maschine. Die Beweis-Kette der Ablage ist ihr eigner
Lauf: `beweisen-3-2-190-0611.txt`. Die GitHub-Seite ist als rohe Antwort committet
(`github-releases-0611.json`) und nur gelesen, nie geschrieben.

## 1. Der Pfad, den kein Kunde findet

Sechs Stellen in den zwei Aussendungstexten nennen einen absoluten Bundel-Pfad: eine in
`README.md`, fünf in `.github/release-notes.md`. Bis 19:52 MEZ standen sie alle auf
`/Applications/KEPTA.app` — dem Stamm vor der Marke. Gemessen am Rechner: `/Applications/KEPTA.app`
fehlt, `/Applications/K3PTA.app` vorhanden; das Programm heisst `…/Contents/MacOS/K3PTA`. Die Anleitung
im README heisst „the fastest way through, and the one that works on every macOS version" und ist damit
der eine Befehl, den ein Mensch nach dem Download eintippt, um Gatekeeper zu umgehen. Mit dem alten
Stamm antwortet er mit „No such file" — die Antwort auf genau die Frage, die der Kunde hat.

Vorher / nachher, aus dem Lauf (Abschnitt 1 der Spur):

| Datei | Pfadstellen vorher | Marke vorher | Pfadstellen nachher | Marke nachher |
|---|---|---|---|---|
| `README.md` | 1 | KEPTA | 1 | K3PTA |
| `.github/release-notes.md` | 5 | KEPTA | 5 | K3PTA |

Die Erwartung ist nicht abgeschrieben: sie kommt aus `electron-builder.json` → `productName`, und die
Wache in `tests/mac-signing.test.ts` vergleicht jeden Fund gegen diesen Wert. Ein dritter Stamm würde
heute rot. Kontrolle gegen eine taube Sonde: `ROADMAP.md` hat 0 Pfadstellen, und die Wache verlangt
`> 0` Funde pro Datei — löschte jemand die Pfade, fiele sie, nicht die Gleichheit.

Das ausgelieferte Produkt ist an dieser Stelle nicht krank: `server/router/clients.ts:22` und
`server/router/system.ts:64` bauen den MCP-Block aus `process.execPath` und `__dirname`, der Pfad
kommt also aus der laufenden App selbst. Krank waren nur die zwei Blätter, die ihn festgeschrieben haben.

## 2. Der Absatz, der Grenzen verkaufte

`.github/release-notes.md` bot in beiden Sprachen einen Mechanismus an, den es nicht mehr gibt:
„the first day after the first launch is an **unlimited day**, then it keeps working for free with daily
limits on the endpoints that matter … A signed key only removes the daily limits" (englisch) und
„Der erste Tag nach dem Erststart ist ein Tag ohne Grenzen, danach geht es kostenlos weiter mit
Tageslimiten … Ein signierter Schlüssel entfernt nur die Limiten" (deutsch). Seit 3.1.5 ist das
Preis-Werk ausgebaut — `README.md:357` beschreibt den Ausbau, `tests/keine-grenzen.test.ts` prüft die
runtime. Gemessen vor dem Schlag: 2 Zeilen mit einer Grenze in der Gegenwart; nach dem Schlag: 0.

Die neue Wache trennt Geschichte von Behauptung: ein Satz, der ein Wort des ausgebauten Werk zeugt,
darf es nur in der Vergangenheit tun (`until 3.1.4`, `was removed`, `entfernt wurde`, `stopped being
read`). README.md:357 erfüllt das und bleibt stehen; der Vorlage fällt die Gegenwart auf die Füsse.
Beide Dateien müssen es offen sagen, dass es keine Schlüssel und keine Grenzen gibt — README tat das
schon („No keys, no limits, no upgrade panel"), die Vorlage sagt es jetzt auch.

Warum das kein Formfehler ist: `.github/release-notes.md` ist der Text, der mit dem nächsten Tag auf
der Release-Seite stünde. Dass er es noch nicht ist, ist gemessen, nicht vermutet: der Koerper des
obersten oeffentlichen Releases (`app-3.2.1`, 14 Zeilen) traegt `com.apple.quarantine` 0-mal,
`Tageslimiten` 0-mal, `daily limit` 0-mal — die Vorlage war nie draussen. Sie liegt als Landmine im Baum.

## 3. Die einzige Summen-Quelle auf der Platte

`release/` hat 134 Dateien; davon sind 132 Installations-Dateien (33 Fassungen × dmg, zip und zwei
blockmaps) und 2 Masken (`latest-mac.yml`, `builder-debug.yml`). Eine SHA256SUMS-Datei liegt in
**0** von 134; die einzige Prüfumme ist `latest-mac.yml`, und die deckt **2** von 132
Installations-Dateien ab — **1,5 %**, also eine von 33 Fassungen (3.2.190). Beide ihrer Einträge sind
geprüft, nicht gelesen: Größe und sha512 stimmen gegen die Datei auf der Platte (2 von 2), die sha256
dazu sind `ce60780a7d673681…` (zip) und `1515c7cd49ef10b8…` (dmg).

Die eigne Beweis-Kette für einen Release (`node scripts/release-beweisen.mjs 3.2.190`, Exit 1, 4,5 s,
19:47 MEZ) meldet genau 6 FEHLER: das x64-Quartett fehlt, `release/mac` hat kein entpacktes Bundel,
`SHA256SUMS.txt` fehlt. Die arm64-Seite ist grün und zwar fähig geprüft: Binding gegen Electron
(NODE_MODULE_VERSION 149), Kapselstart mit eigenem HOME — „server antwortet, version 3.2.190,
verschluesselung an" — und beide Flächen-Marker im Paket.

Was die Vorlage und das README versprechen, ist also nicht erfunden, aber auch nicht gebaut:
die Datei-Tabelle nennt `K3PTA-<version>-mac-x64.dmg`, und oeffentlich gibt es das auch — über alle
9 Releases gemessen 23 x64-Assete gegen 24 arm64-Assete, 12 dmg, 5 SHA256SUMS.txt. Der Bruch ist
jünger als die Veröffentlichungen: `npm run build:mac` ist `electron-builder --mac` ohne Arch-Angabe,
und electron-builder nimmt dann die Host-Architektur. In diesem Baum befiehlt **kein Skript** einen
x64-Bau; die lokalen 33 Fassungen sind deshalb arm64-halb. Das ist keine Lüge nach aussen, aber eine
Lücke in der Kette, und sie zu schließen ist eine Bau-Entscheidung (nächster Abschnitt).

## 4. Signatur, Gatekeeper, und was hier nicht messbar ist

Gemessen am Installer-Bundel (das dmg wurde READONLY nach `/tmp/rl0611/mnt` gehängt, danach ausgeworfen)
und am installierten Bundel, mit `codesign -dvvv`, `codesign --verify --deep --strict`,
`spctl --assess --type execute -vvv`, `plutil`, `xattr`:

- `Signature=adhoc`, `flags=0x2(adhoc)`, `TeamIdentifier=not set`, **0** Authority-Zeilen. Damit kann
  das Bundel nicht notariert sein: Notarisierung setzt eine Developer-ID-Signatur voraus. Genau das
  sagt `scripts/adhoc-sign.cjs` auch, und README.md:409 sagt es dem Kunden.
- `codesign --verify --deep --strict` am Installer-Bundel: Exit 0, keine Meldung. Das dmg ist also
  nicht „beschädigt" im Sinne der Signatur — die Heilung von v2.6.9 trägt.
- `spctl --assess --type execute -vvv` sagt für **beide** Bundel `rejected`. Die installierte App läuft
  trotzdem, und die Sonde nennt den Grund: am installierten Bundel hängt **kein** `com.apple.quarantine`
  (0 Nennungen im xattr-Listenauswurf) — dieser Rechner hat die App nicht heruntergeladen.
- `CDHash` des installierten Bundels = `CDHash` des letzten Installers = `508ef0425124561c…`, 69
  versiegelte Dateien in beiden: das Ausgelieferte und das zum Download Liegende sind dasselbe Programm.
- Die Info.plist des Installer-Bundels nennt `3.2.190`, derselbe Name wie Datei und latest-mac.yml.

Was hier **nicht** gemessen ist und auch in diesem Lauf nicht gemessen werden kann: was ein Mensch auf
macOS 26 sieht, wenn er das dmg herunterlädt und öffnet. Die Prüfung dafür wäre ein erster Start eines
kopierten Bundels mit Quarantäne-Flag — und der würde Damians echtes Profil anfassen, weil `open` die
Umgebung des Anmeldebenutzters erbt. Die Behauptung in README.md:421 (“an ordinary unsigned app you can
approve, rather than a damaged one it refuses outright") bleibt damit eine Behauptung über eine
Finder-Oberfläche, die wir nicht getestet haben; ihre zwei harten Bedingungen (adhoc statt ganz
unsichtbar, keine Notarisierung) sind oben gemessen. Externe Berichte sagen für macOS 15+, dass
Rechtsklick → Öffnen als Ausweg gestrichen ist; das steht in der README schon seit längerem als
Warnung, und die Wache in `tests/mac-signing.test.ts:44` lässt nur diesen einen Hinweis zu.

## 5. Wofür zip, blockmap und latest-mac.yml da wären

Fünf Wörter, die ein Auto-Update-Verbraucher im ausgelieferten Objekt stehen müsste, gezählt mit
`grep -a -o` gegen `/Applications/K3PTA.app/Contents/Resources/app.asar` (47 MiB):

| Wort | Nennungen |
|---|---|
| `autoUpdater` | 0 |
| `electron-updater` | 0 |
| `checkForUpdates` | 0 |
| `latest-mac` | 0 |
| `differentialPackage` | 0 |
| Kontrolle: `memory_search` | 21 |

Die Kontrolle ist der Grund, warum diese Null etwas heißt. Es gibt keinen Verbraucher der
Update-Plantage; `package.json` kennt `electron-updater` nicht als Abhängigkeit. Die 66 blockmaps
(0,01 GiB) und `latest-mac.yml` sind Maschinerie für einen Updater, den das Produkt nicht hat. Die
`.zip`-Dateien dagegen sind nicht totes Gewicht: README.md:405 erklärt sie dem Mensch zu Recht als
„the same programs without an installer". Wer Platz freimachen will, muss dmg und zip zusammen
betrachten — nicht die blockmaps.

## 6. Die Ablage in Zahlen

`release/` am 6.11.2026, 19:54 MEZ: 134 Dateien, 33 Fassungen von 3.2.158 bis 3.2.190.

| Art | Stück | GiB |
|---|---|---|
| dmg | 33 | 4,94 |
| zip | 33 | 4,94 |
| dmg.blockmap | 33 | 0,01 |
| zip.blockmap | 33 | 0,01 |
| Masken (yml) | 2 | 0,00 |
| **Dateien zusammen** | **134** | **9,89** |
| entpacktes `mac-arm64/` (das Bundle des letzten Baus) | 1 Ordner | 0,37 |

Freiwillig gemerkt: `du -sk release/` sagt 10,32 GiB, die Summe der Dateien 9,89 plus 0,37 GiB. Der
Rest sind Ordner-Blöcke. Für die Kante zählt der größere Wert nicht automatisch — siehe unten.

## 7. Die Kante, und was sein Wort wert ist

Plattenstand im letzten Lauf der Spur (20:06 MEZ): **9,05 GiB frei**. Der Tausch braucht 8,53 GiB
(Kante 8 GiB + entpacktes Objekt 402 840 KiB + Spiel 0,15 GiB) — der ist offen, sobald ein gebaut Objekt
da ist. Der Bau braucht 9,9 GiB — der ist zu, um 0,85 GiB. Im Stapel `/tmp/` liegen 1,27 GiB, davon
1,15 GiB in drei Rücklagern (`K3PTA-vor-3.2.188/189/190.app`); die Ablage legt 9,89 GiB bereit. Die
Kante schwingt: derselbe Griff um 19:57 MEZ las 8,90 GiB frei.

Das sind die drei Zahlen, aus denen eine Entscheidung folgt, und ich treffe sie nicht:

1. Rücklager weg = 1,15 GiB, und der Bau geht. Verloren geht die Möglichkeit, ohne Neubau auf
   3.2.187/188/189 zurückzudrehen.
2. Ablage beschneiden = bis 9,89 GiB. Die 32 älteren Fassungen sind halb gebaut (arm64, ohne Summen)
   und werden von der Kette nicht gebraucht; die letzte (3.2.190) ist die einzige mit einer geprüften
   Prüfumme und die einzige, die dem installierten Bundel im Code-Hash gleicht.
3. Kette ergänzen = x64-Bau und SHA256SUMS.txt in die Landung aufnehmen. Kostet pro Landung einen
   zweiten Bau und rund 0,3 GiB mehr Stapel, und macht `release-beweisen.mjs` grün statt 6 rot.

Punkt 3 ist der einzige, der eine Aussage der Datei-Tabelle (Zeile 6/71 der Vorlage, Zeile 402 im
README) tatsächlich einlöst. Er braucht die Bau-Kante, also Punkt 1 oder 2 zuerst.

## 8. Was offen bleibt, mit Namen

- Die **oeffentliche** README (`~/kepta-core/README.md:83`) nennt denselben Befehl mit dem alten
  Stamm — und für ihren Leser ist das **richtig**, nicht falsch: gemessen tragen alle
  herunterladbaren dmg- und zip-Namen der 9 öffentlichen Releases (58 Assete insgesamt) den Stamm
  `KEPTA`, ihr Bundel heißt also `KEPTA.app`. Der Bruch ist ein Namens-Entschluss, kein
  Textfehler: Sobald eine Fassung mit `productName: K3PTA` veröffentlicht wird, muss diese Zeile
  mitziehen, und die neue Wache im App-Repo hält nur unsre eigne Seite. Ändern an der Kern-README
  ist lokal möglich, veröffentlichen ist Damians Wort.
- Der erste Start eines quarantäne-behafteten Bundels auf macOS 26 — siehe Abschnitt 4.
- x64 und Summen in der Landungs-Kette (Abschnitt 7, Punkt 3).
- Die 32 alten Fassungen in `release/` und die drei Rücklager: sein Wort, nicht meins.

## 9. Die Aussendung nachgezählt (Zusatzlauf 20:19 MEZ)

Ein dritter Zensus, weil P121 zwei Fehler in denselben Texten fand: wie viele Sätze nach außen
überhaupt etwas Behaupten, und wie viele davon nennen ihr Messzeug. Lauf:
`node docs/belege/aussendungsatz-0611/zaehlen.mjs` → `zaehlung-0611.json` und
`zaehlung-0611.log.txt`; die vier Texte sind `README.md`, `SECURITY.md`, `ROADMAP.md`,
`.github/release-notes.md`.

Stand des letzten Laufs (20:38 MEZ, nach allen Textänderungen dieses Schlags):

| Lesung | Nenner | mit Messzeug | ohne Messzeug |
|---|---|---|---|
| Zeuge **im selben Satz** | 131 absolute Behauptungen (aus 320 Sätzen) | **20** = 15,3 % | **111** = 84,7 % |
| Zeuge **im selben Abschnitt** | derselbe Nenner 131 | **60** = 45,8 % | **71** = 54,2 % |

Der Nenner ist genannt, weil die Zahl sonst ein Urteil wäre. Die weite Klasse trifft auch
Produktcopy („no password to type"), also die schmalere Klasse: Sätze, die ein Werkzeug widerlegen
könnte (`never`, `always`, `cannot`, `0 %`, `100 %`) — **30 von 131** (26 im README, 2 in der
Vorlage, je 1 in SECURITY und ROADMAP). Die 30 stehen als Liste im Artefakt.

Beide Lesungen teilen sich den Nenner absichtlich: würde der Satzriss pro Abschnitt neu gemacht,
zählte die eine Lesung 131 und die andere 143 — zwei Zahlen mit verschiedenen Grundgesamtheiten
sind kein Vergleich. Der Unterschied zwischen 15,3 % und 45,8 % ist die eine Frage, ob ein Zeuge
im Satz stehen muss oder im Absatz über ihm genügt; beide Antworten stehen hier, weil die Zahl
allein sonst die Entscheidung trifft, die mir nicht gehört.

Zwei davon in demselben Lauf nachgegriffen, beide halten:

- *„no screenshot of it here yet"* (Semantic-Ansicht): das README nennt **20** Bilder — 12 in
  Markdown-Form, 8 als `<img alt>` —, davon **0** mit „Semantic", und der Satz steht noch.
- *„no embedding ever travels into the view"*: **8** benannte Flächen-Dateien gelesen
  (`KnowledgeGraph.tsx`, `GraphRegal.tsx`, `graphLayout.ts`, `graphSemantik.ts`, `graphSchema.ts`,
  `graphHierarchy.ts`, `graphHerkunft.ts`, `graphTime.ts`), zusammen **0** Nennungen
  „embedding"; das Wort liegt in **34** Test-Dateien des Repos, die Fläche selbst puffert also
  nichts, was sie nicht senden dürfte.

Zwei Zählerfehler, im Lauf selbst gefunden und berichtigt: zuerst zählte das Bild-Programm nur
`alt="` und sah 8 statt 20 Bilder (Markdown-Bilder schreiben ihren Text in `![Text]`), und die
Embedding-Sonde traf zuerst vier Dateinamen, von denen drei nicht existieren — eine Null über
nicht existierenden Pfaden ist keine Messung, deshalb stehen die Dateien jetzt einzeln da und das
Artefakt meldet fehlende Pfade selbst.

## 10. Die Kette deckt Schreibwege, nicht Lesewege (P123, 20:26 MEZ)

Der riskanteste Satz aus der Queue von Abschnitt 9 stand in README.md:91: „every AI access is
written to a tamper-evident audit log you can check and export". Gemessen, nicht gegoogelt —
`tests/kette-deckt-nur-schreibwege.test.ts`, fünf Fälle, jede Zahl aus dem eignen Lauf gegen
`createApp(store)` in einer Kapsel mit eigenem HOME:

| Zugang | Ketteneintrag danach |
|---|---|
| `POST /api/memories` (Notiz schreiben) | **+1** |
| `GET /api/memories` und `GET /api/memories/search` (zwei Lesewege) | **+0** |
| `POST /api/mcp/search` (Suche durch die Agententür) | **+1** |

Der Mechanismus dazu: geschrieben wird die Kette aus zwei Quellen: der Regeltabelle in `server/router/audit.ts`
(14 Mutationen, aufgerufen an Zeile 81; Zeile 101 protokolliert den CSV-Export selbst) und **neun**
ausdrücklichen Schreibstellen in sechs Dateien — `audit.ts:81`, `audit.ts:101`, `briefing.ts:41/61/71`,
`chat.ts:86`, `clients.ts:43`, `mcp.ts:80` (die Suche durch die HTTP-Tür), `schild.ts:47`. Dazu kommt
`src/lib/mcpwache.ts:121` mit `protokolliereMcp` für jedes Ereignis durch die MCP-Tür.
`src/core/store.ts:584` hätte einen Senk für Leseereignisse — die App setzt ihn nie, der Default
ist `NOOP_SINK` (`src/core/extensions.ts:136`, `:162`). Also: **Lesen über HTTP hinterlässt nichts
in der Kette**, und der README-Satz war breiter als die Maschine.

Geheilt am Wort, nicht am Code (ein Code-Flicken wäre eine zweite ungetauschte Fassung): der Satz
nennt jetzt die Kanäle, die gemessen sind — jede Änderung an der Wissensbasis und jeder Ruf durch
die MCP-Tür, ihre Suchen eingeschlossen — und sagt offen, dass ein nackter HTTP-Leseweg keinen
Ketten-Eintrag hinterlässt. Die Wache darüber (`tests/kette-deckt-nur-schreibwege.test.ts:80-99`)
liest die vier Aussendungstexte, verlangt, dass der Satz überhaupt vorkommt (sonst ist sie taub),
und verbietet die alte Form. Vor der Heilung rot: 1 Satz; nachher grün, und „every AI access"
steht in keinem der vier Texte mehr — auch nicht im Kern-Repo (dort gemessen: 0 Funde).

Ein Zensusfehler auf dem Weg dahin, und er ist die alte Klasse: mein erster Abgleich der
dokumentierten Endpunkte gegen die Routen meldete „2 dokumentiert, aber keine Route". Beide
Stellen waren Sonden-Artefakte — das Muster `(GET|POST|…) /[a-z0-9/:_-]+` brach an dem großen „I"
von `:standId` ab und erzeugte den Geisterpfad `…/stande/:stand`, und der Treffer
`GET /api/memories/:id` stand in README.md:253 genau in dem Satz, der erklärt, dass diese Route
bewusst nicht existiert. Richtig gemessen (Parameter zu Segmenten normalisiert): 16 dokumentierte
Formen, 14 mit Route, 1 bewusste Gegenprobe, 1 Abschneider. Die Tabelle war gesund; der Zähler
krank — und hätte ich ihm geglaubt, hätte ich eine richtige Vertragszeile kaputt gemacht.

## 11. Ein Satz ohne Zeugen ist eine Behauptung (P124, 20:38 MEZ)

Von den 30 widerlegbaren Sätzen ist der kundennächste der Sperr-Satz in README.md:89: „Keys,
credentials, browser profiles, keychains and system folders are never read, and that cannot be
switched off". Nachgesehen, ob die Maschine das hält, bevor das Wort ergänzt wurde:

- Die Sperre liegt in `src/scan/regeln.ts` — `GEHEIME_ORDNER` (Zeile 20, u. a. `.ssh`, `.aws`,
  `keychains`, `1password`, `bitwarden`, `cookies`, `credentials`) und `GEHEIME_DATEIMUSTER`
  (Zeile 83, u. a. `.netrc`, `.npmrc`, `.git-credentials`, `*.keychain-db`, `passwords*`).
- Das Einstellbare ist per Bauweise enger als die Sperre: `ScanEinstellungen`
  (`src/scan/regeln.ts:132`) kennt nur `endungen`, `maxDateiBytes` und
  `zusaetzlichAusgelassen` — alles Felder, die **weiter** einschränken. Ein Schalter, der die
  Sperre öffnet, existiert nicht; gemessen mit der Muster-Suche nach
  `disable|skip|allowAll|KEPTA_*SCAN*` in `src/` und `server/`: 0 Funde.
- Der Zeuge war schon da, nur unsichtbar: `tests/scan/regeln.test.ts:190`
  („lässt sich damit NICHT zum Lesen von Geheimnissen überreden") versucht genau den Angriff —
  `.pem` freischalten, `.env` als Endung nennen, `id_rsa` unter einer whitelisteten Endung — und
  jede Antwort bleibt `geheim`.

Was fehlte, war der Verweis nach außen. Also zuerst die Wache (`tests/doku-plattform.test.ts`,
neue Sektion „README: die harte Sperre nennt ihren Zeugen", 3 Fälle): sie verlangt, dass der Satz
weiter da ist (sonst ist sie taub), dass er `tests/scan/regeln.test.ts` nennt, und dass dieser
Zeuge existiert und den Angriff wirklich probiert. Rot gesehen (1 Fall), dann der README-Satz um
die Klammer ergänzt, jetzt 13 von 13 grün. Der Zensus misst die Änderung: enge Lesung 19 → **20**
von 131.

Daneben notiert, weil es sonst als offene Arbeit stünde: der Endpunkt-Abgleich aus P123 ist **schon
bewacht** — `tests/doku-plattform.test.ts:129` („README: keine Route, die die Tür nicht hat")
vergleicht jede Methodenangabe in der Tabelle gegen die echte Routenliste und enthält schon die
Gegenprobe für den Einzelabruf.

## 12. Was daraus folgt und offen bleibt


Der Satz „die Aussendung ist geprüft" trägt nicht: 19 von 129 absoluten Behauptungen nennen ihr
Messzeug im selben Satz, und die schmalen 30 sind die Arbeit. Angefangen wird mit den beiden, die
ein Kunde beim ersten Start liest — Pfad (oben geheilt) und der Grenz-Absatz (oben geheilt); die
nächsten in der Liste sind „Private notes never reach an app or a cloud model", „Keys, credentials,
browser profiles, keychains and system folders are never read" und „every AI access is written to a
tamper-evident audit log" — die letzte ist zählbar: Zugangsstellen gegen Audit-Schreibstellen.

## Fehler in diesem Schlag, die ich selbst gefunden habe


1. `du -sk /tmp` meldete 0 GiB Stapel, weil `/tmp` ein Symlink ist; der erste Lauf schrieb diese Null.
   Berichtigt auf `du -sk /tmp/` (1,27 GiB) und in der Spur nachgemessen.
2. `execFileSync` liefert stdout, `codesign -dvvv` schreibt auf stderr — der erste Lauf las daher
   `Signature=?`. Dasselbe Loch, das `scripts/adhoc-sign.cjs:28-32` seit Wochen beschreibt. Umgestellt
   auf `spawnSync` mit beiden Röhren.
3. Meine erste Annahme zu #32 war falsch, und die Messung hat sie umgeworfen: x64 und SHA256SUMS sind
   nach aussen **keine** Lücke (23 x64-Assete, 5 Summen-Dateien über 9 Releases), sondern eine Lücke in
   der lokalen Kette. Ein Papier über „die Ablage ist unvollständig" hätte das verkauft, bevor ich die
   API gelesen hätte.
4. Die Wache, die den Pfad übersah, prüfte das Kommando und nicht den Operanden
   (`tests/mac-signing.test.ts:55-58`). Ein Test, der den Default des geprüften Werts teilt, prüft
   nichts — hier: er prüfte den Text, der noch stimmte, und ließ den Text, der nicht mehr stimmte.
5. In der ersten Fassung dieses Papiers hieß es, die öffentliche Kern-README (Zeile 83) trage
   „dieselbe falsche Pfad". Nachgemessen: für ihren Leser ist er **richtig**, weil alle
   herunterladbaren dmg- und zip-Namen der 9 öffentlichen Releases den Stamm `KEPTA` tragen. Was
   übrig bleibt, ist ein Namens-Entschluss für den Tag einer neuen Veröffentlichung, kein
   Fehlertext. Berichtigt in diesem Schlag, bevor die Zeile irgendwo zitiert wird.
6. Die zweite Zensus-Lesung (Zeuge im selben Abschnitt) schnitt die Sätze pro Abschnitt neu und
   kam dadurch auf 143, während die erste 131 zählte — zwei Anteile mit verschiedenen
   Grundgesamtheiten, also kein Vergleich. Berichtigt: beide Lesungen teilen jetzt denselben
   Satzriss, und das Artefakt weist die Nenner getrennt aus (131 und 131).
7. Die Zahl aus Abschnitt 9 war nach jedem Texteingriff eine neue (129 → 131, 19 → 20), weil das
   README während desselben Schlags verändert wurde. Der Zensus läuft deshalb jetzt als letzter
   Griff vor dem Committen, damit Papier und Artefakt denselben Stand zeigen — nicht denselben
   Lauf.
