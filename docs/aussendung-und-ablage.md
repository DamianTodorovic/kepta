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

Stand des letzten Laufs **unter dem alten Riss** (21:33:13 MEZ, nach allen Textänderungen dieses
Tages, Exit 0). Abschnitt 16 ist der stehende Stand: seine Zahlen gelten, diese hier sind die
Vorlauf-Grössen desselben Bestands.

| Lesung | Nenner | mit Messzeug | ohne Messzeug |
|---|---|---|---|
| Zeuge **im selben Satz** | 132 absolute Behauptungen (aus 321 Sätzen) | **23** = 17,4 % | **109** = 82,6 % |
| Zeuge **im selben Abschnitt** | derselbe Nenner 132 | **61** = 46,2 % | **71** = 53,8 % |

Der Nenner ist genannt, weil die Zahl sonst ein Urteil wäre. Die weite Klasse trifft auch
Produktcopy („no password to type"), also die schmalere Klasse: Sätze, die ein Werkzeug widerlegen
könnte (`never`, `always`, `cannot`, `0 %`, `100 %`) — **30 von 132** (26 im README, 2 in der
Vorlage, je 1 in SECURITY und ROADMAP). Seit P126 **steht die Liste im Artefakt**, nicht
nur ihre Länge: 30 Zeilen in Lesereihenfolge, jede mit dem Marker, ob derselbe Satz schon ein
Messzeug nennt. Nachgezählt: **7 von 30 nennen es, 23 sind die Arbeit.** Vorher sagte das Artefakt
nur „30" und das Papier behauptete, die Liste stehe darin — ein Satz über ein Blatt, das ihn nicht
trug (unten, Fehler 8).

Beide Lesungen teilen sich den Nenner absichtlich: würde der Satzriss pro Abschnitt neu gemacht,
zählte die eine Lesung 131 und die andere 143 — zwei Zahlen mit verschiedenen Grundgesamtheiten
sind kein Vergleich. Der Unterschied zwischen 17,4 % und 46,2 % ist die eine Frage, ob ein Zeuge
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

**Die Einheit des Zensus ist nicht überall ein Satz, und das ist seit diesem Schlag benannt.** Der
Riss geht über `(?<=[.!?])\s+` und übersieht, dass Markdown-Aufzählungen keinen Punkt kennen:
gemessen 21:19:19 MEZ sind **32 von 132** als „absolute Behauptung" gezählten Einheiten gar keine
Sätze, sondern Blöcke aus mehreren Aufzählungszeilen (längste Einheit 3 364 Zeichen), also 24,2 % des
Nenners. Was der Riss zusammenzieht, kann ein Messzeug nicht mehr auseinanderhalten — deshalb zählt
er P125's bewaffneten Privat-Satz in README.md:103 in einer Block-Einheit mit, während derselbe
Wortlaut in README.md:180 als eigner Satz dasteht und ohne Zeuge ist. Solange die Zahl **mit**
diesem Grund genannt wird, ist sie brauchbar; ein markdown-fester Riss ist Arbeit für einen eignen
Schnitt, weil er jeden der Werte in diesem Abschnitt bewegt.

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
ausdrücklichen Schreibstellen in sechs Dateien — `server/router/audit.ts:81`, `:101`,
`server/router/briefing.ts:41`, `:61`, `:71`, `server/router/chat.ts:86`,
`server/router/clients.ts:43`, `server/router/mcp.ts:80` (die Suche durch die HTTP-Tür),
`server/router/schild.ts:47`. Dazu kommt
`src/lib/mcpwache.ts:121` mit `protokolliereMcp` für jedes Ereignis durch die MCP-Tür.
`src/core/store.ts:584` hätte einen Senk für Leseereignisse — die App setzt ihn nie, der Default
ist `NOOP_SINK` (`src/core/extensions.ts:136`, `:162`). Also: **Lesen über HTTP hinterlässt nichts
in der Kette**, und der README-Satz war breiter als die Maschine.

Geheilt am Wort, nicht am Code (ein Code-Flicken wäre eine zweite ungetauschte Fassung): der Satz
nennt jetzt die Kanäle, die gemessen sind — jede Änderung an der Wissensbasis und jeder Ruf durch
die MCP-Tür, ihre Suchen eingeschlossen — und sagt offen, dass ein nackter HTTP-Leseweg keinen
Ketten-Eintrag hinterlässt. Die Wache darüber (`tests/kette-deckt-nur-schreibwege.test.ts:100-119`)
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

## 12. Die Privatzusage nennt jetzt beide Zeugen (P125, 20:48 MEZ)

README.md:103 verspricht, eine private Notiz werde „never shown to an AI app and never sent to a
cloud model — in the app *and* in the source-available core". Beides war schon bewiesen; keiner
der Beweise stand im Satz:

- Agentenseite: `tests/mcp.test.ts:119` — „Privatheits-Floor: private Notizen verlassen K3PTA nie
  über MCP — auch nicht per scope-Anfrage".
- Wolken-Seite: `tests/enterprise-api.test.ts:160-175` liest den **Absendeprompt** der Cloud und
  verlangt dreifach: die Notiz fehlt, `[EMAIL-1]` steht drin, das Ereignis meldet
  `privateNotes: 1`; dazu der Audit-Eintrag „cloud chat".
- Kern-Seite: die eigne Suite des Engine-Repos trägt denselben Floor und mehr — `tests/mcp.test.ts`
  dort mit :124 (Floor), :420 (Graphkanten aus privaten Notizen), :457 (Dupletten), :481
  (Update/Delete/Forget sehen sie nicht), :519 (supersedeBy wird verweigert).

Wache zuerst: neue Sektion in `tests/doku-plattform.test.ts` („README: die Privatzusage nennt ihre
Zeugen", 4 Fälle) — der Satz muss da sein (taub-Kontrolle), er muss beide App-Zeugen nennen, die
Zeugen müssen die versprochenen Prüfungen wirklich enthalten, und der Kern-Teil muss als Kern
ortbar bleiben. Gesehen: 1 Fall rot (keine Zeugen genannt), 16 grün; nach dem Nachtrag 17 von 17.

Der Zensus zählt die Änderung: enge Lesung 20 → **21** von 131 (16,0 %), Abschnittslesung bleibt
60 — der Bulle war im selben Abschnitt bereits belegt. Die Zahl der maschinell widerlegbaren
Sätze bleibt 30: derselbe Satz, jetzt mit Zeuge. (Stand damals; der letzte Lauf, Abschnitt 9, zählt
22 von 132, und Abschnitt 14 nennt den zweiten Träger desselben Wortlauts, den dieser Schnitt
nicht angefasst hat.)

## 13. „No telemetry" ist jetzt eine Zählung (P126, 21:16 MEZ)

Der Satz in README.md:266 — „No account, no telemetry, no phone-home" — stand in der breiten Klasse
der absoluten Behauptungen und nannte, wie 110 andere, kein Messzeug. Ihn zu beweisen ist nicht die
Abwesenheit eines Pakets (ein `package.json` ohne Sentry sagt nichts über einen Handshake im Code),
sondern die Anwesenheit einer **Adressliste**: jede ferne Adresse, die ein ausgeliefertes File
kennt, muss erklärbar sein.

Neue Wache `tests/keine-telemetrie.test.ts`, neun Fälle, grün in den Suite-Läufen ab 21:02:36 MEZ
(3 717 Fälle) und ab 21:10:55 MEZ (3 718 Fälle; einer rot — die Testzahl in README.md war noch die
des Vorlaufs). Die Verteilung unten ist gemessen 21:13:43 MEZ mit einer Wegwerf-Sonde über
dieselben Dateien wie die Wache, und die Wache pinnt ihre Summe selbst:

| Gelesen | Adressen | Hosts | Erklärung |
|---|---|---|---|
| 148 Dateien unter `src/`, `server/`, `main.ts` | **26** | **20** | 16 Modell-Vorgaben aus `src/lib/ai.ts`, 4 benannte Ausnahmen |

Die 16 Vorgaben sind die Provider, die ein Nutzer selbst aus den Presets wählt (openai 5 Adressen,
anthropic 3, dann 14 Hosts je 1-mal: groq, mistral, deepseek, cohere, perplexity, together,
fireworks, cerebras, novita, x.ai, openrouter, huggingface-inference, azure-inference,
generativelanguage). Die vier Ausnahmen stehen mit Grund in der Wache: `www.w3.org` ist der
SVG-Namensraum in `src/components/KeptaMark.tsx`, `api.example.com` ein Platzhalter in
`src/components/Settings.tsx:997`, `spur.example` eine Beispiel-URL in einem Kommentar
(`src/lib/bild-politik.ts:7`), `kepta.local` ein User-Agent-Text in `server/router/clip.ts:31`.
localhost-Ziele (2 der 18 `baseUrl`-Zeilen in `src/lib/ai.ts`) sind nicht fern und werden nicht
mitgezählt.

Drei Dinge daran sind Messung, nicht Behauptung:

1. **Die Zahl ist gepinnt**: `expect(FUND.length).toBe(26)` und die Host-Grundgesamtheit
   `expect(...size).toBe(20)`, dazu `expect(ALLE.length).toBeGreaterThan(140)` als Kontrolle, dass
   der Leser überhaupt Dateien sieht. Eine neue ferne Adresse macht die Wache rot, auch wenn sie
   einem Provider gehört.
2. **Die Biss-Kontrolle fährt mit**: der fünfte der neun Fälle pflanzt
   `fetch("https://telemetry.example.org/v1/event")` in eine Probe-Datei und verlangt, dass die
   Sonde den Host sieht — eine Wache, die nichts fände, wäre hier grün und lügt.
3. **Die README-Zeile nennt jetzt die Zählung selbst**: README.md:266 sagt „finds 26 external
   addresses across 20 hosts, and each one is either a provider you chose … or a named
   placeholder … — a planted `https://telemetry…` address would fail the test". Der Zensus zählt
   diesen Satz als Behauptung **mit** Messzeug: 21 → 22 von 131 → 132, der Nenner wuchs um
   denselben einen Satz.

Was die Wache **nicht** deckt, steht in ihrem Quelltext: README.md:181 verspricht dasselbe Wort für
die Enterprise-Konsole. Die ist auf Damians Wort vom 5.11. 13:24 MEZ zugefroren, also wird dort
auch kein Text angefasst, und die Zeile bleibt ohne Zeugen — benannt, nicht verschwiegen.

## 14. Was daraus folgt und offen bleibt

Stand nach P126: Der Satz „die Aussendung ist geprüft" trägt nicht — 22 von 132 absoluten
Behauptungen nannten ihr Messzeug im selben Satz, und von den schmalen 30 nennen 6 es, 24 sind die
Arbeit. Fünf Sätze hatte die Welle abgearbeitet (P121 Pfad, P121 Grenz-Absatz, P123 Audit-Kette,
P124 Sperr-Zusage, P125 Privat-Zusage, P126 Telemetrie-Zusage). Der nächste Stand nach P127 steht
in Abschnitt 9 (23 von 132, 7 von 30, 23 Arbeit).

**Was dabei aufgefallen ist — und was P127 daraus gemacht hat.** Die Liste der 30 zeigte die
Privat-Zusage **zweimal**: README.md:103 (der Aufzählungs-Punkt, seit P125 mit drei Zeugen) und
README.md:180, der Privacy-shield-Punkt der Funktions-Straße, endete auf „Private notes never
reach an app or a cloud model." — derselbe Wortlaut, gleiche Klasse, **kein** Messzeug. Genau die
Klasse, die ich einmal heile und einmal stehen lasse, ist der Grund, warum die 30 als Liste im
Artefakt stehen: eine Zahl ohne ihre Zeilen verschluckt den zweiten Träger. P127 (unten,
Abschnitt 15) hat diese Zeile bewaffnet und die Wache von P125 auf **beide** Träger gedehnt.

**Der Rückstand hat jetzt ein eignes Messzeug.** Im Suite-Lauf ab 21:02:36 MEZ fiel
`tests/punkt7-fachwort-traegt-grund.test.ts` mit „die Gleichung verwirft 1 Flaeche-Saetze". Root
cause, gemessen 21:08:05 MEZ: der Satz ist die Fuge aus `4e1e378` (**3.2.191**), das ausgelieferte
Objekt ist **3.2.190** (`Info.plist`), sein `app.asar` (49 197 020 B) trägt „picture - no zoom"
1-mal und „picture; no zoom" 0-mal. Die Latte ist nicht weicher geworden: sie erlaubt genau diese
eine Fundstelle, und nur wenn alle vier Messungen zusammenkommen (Versionspaar ungleich, alte Fuge
im Objekt, neue Fuge nicht im Objekt, neue Fuge im Baum); eine **zweite** Fundstelle macht sie rot,
auch bei offenem Rückstand — bewiesen mit einer geplotzten Zeile (`Flaeche 2` fällt) und drei
Gegenproben in `rueckstandDerFuge`. Wenn 3.2.191 landet, verschwindet die Ausnahme von selbst, weil
die Zahl auf 0 fällt.

## 15. Dieselbe Zusage, ein zweiter Träger: README.md:180 (P127, 21:33 MEZ)

P125 hatte README.md:103 bewaffnet und die Wache auf genau diesen Wortlaut gelegt
(`private note is never shown to an AI app`). Die Liste der schmalen Klasse aus P126 zeigte einen
zweiten Träger desselben Versprechens, in anderer Sprache: **README.md:180**, der
Privacy-shield-Punkt der Funktions-Straße, endet auf „Private notes never reach an app or a cloud
model." — und die alte Wache sah ihn nicht, weil sie nach dem Wort suchte statt nach der
Behauptung.

Gemessen mit einem wortlaut-offenen Muster über allen vier Aussendungstexten: **genau zwei
Träger** — README.md:103 und README.md:180, nach der Heilung beide mit Zeuge (21:35:00 MEZ, die
Sonde meldet `README.md:103 zeug=true` und `README.md:180 zeug=true`). Vor der Heilung meldete
dasselbe Muster für :180 `zeug=false`, und die Wache selbst sah es um 21:26:27 MEZ als Rotfall.
`ROADMAP.md:82` und `README.md:28` erwähnen private Notizen, behaupten aber kein „never" und fallen
damit nicht in die Klasse.

Zwei neue Fälle in `tests/doku-plattform.test.ts` (Sektion „die Privatzusage hat zwei Träger"):
der erste verlangt, dass die Sonde **beide** Orte sieht — sonst ist sie taub und meldet Erfolg;
der zweite verlangt in jedem Träger-Satz dasselbe Messzeug. Rot zuerst gesehen, 21:26:27 MEZ:
`× jeder Traeger nennt im selben Satz ein Messzeug` — 1 Fall rot, 18 grün. Dann README.md:180
bewaffnet mit den zwei App-Zeugen, die die Zusage wirklich halten: `tests/mcp.test.ts:119`
(Privatheits-Floor über die MCP-Tür, auch auf Nachfrage per scope) und
`tests/enterprise-api.test.ts:142-170` — der Fall fängt den **tatsächlich gesendeten Körper** ab
(`init.body` des gestubbten fetch) und verlangt dreifach: Absender-Mail fehlt, IBAN fehlt, die
private Notiz fehlt, `[EMAIL-1]` steht drin, und das Schild meldet `privateNotes: 1`. Danach 19 von
19 grün (21:26 MEZ, zwischen dem roten Fall und der Messung um 21:26:57).

Der Zensus danach (21:33:13 MEZ, Exit 0): enge Lesung **23 von 132** (17,4 %), ohne Messzeug 109;
die schmale Klasse bleibt 30, davon nennen **7** ihr Messzeug — **23 sind die Arbeit**. Suite:
Messung ab 21:26:57 MEZ (3 720 Fälle, 1 rot: der Zahlenträger), Prüfung 21:29:46–21:32:13 MEZ
**3 720 / 0 rot**, Kette Exit 0, doku-check beglaubigt dieselbe Zahl.

**Ein dritter Träger bleibt, mit Grund:** README.md:181 — „No license server, no phone-home, no
extra infrastructure — one file" — ist dieselbe Klasse in der Enterprise-Zeile. Die ist auf
Damians Wort vom 5.11. 13:24 MEZ zugefroren, und das gilt auch für ihren Text. Sie steht damit
weiter in den 109 ohne Messzeug, und die Wache von P126 sieht sie absichtlich nicht.

## 16. Der Riss wird markdown-fest, und die Zahl wird schlechter (P128, 21:44 MEZ)

Abschnitt 9 nannte den Grund, warum dieser Schnitt fällig war: der Zensus-Riss
(`(?<=[.!?])\s+` über den ganzen Text) hält Markdown-Blöcke für einen Satz. Gemessen in
`tests/aussendungs-riss.test.ts` (21:42 MEZ, der rote Lauf vor der Heilung, sein `Start at` ist nicht notiert): **45 Einheiten** trugen noch Block-Struktur —
Aufzähler, Tabellenzeilen, `<summary>`-Kapseln; die eigene Kontrolle des Zählers meldete 43 unter
der zeilenweisen Naivfassung (21:43 MEZ). Folge nicht nur der Länge: **ein Messzeug in Bulle A
deckte die Behauptung in Bulle B**, weil beide in derselben „Einheit" standen. Die enge Lesung war
dadum zu gut.

Neu: `docs/belege/aussendungsatz-0611/satz-riss.mjs` — ein Blatt für den Riss, damit die Suite ihn
fahren kann, ohne den Zähler zu laufen (ein Test, der ein Skript importiert, das beim Import die
Platte beschreibt, ist kein Test). Regeln, entschieden, weil ein Mensch sie so liest:

- Ein `- **Etikett**` beginnt eine neue Einheit, **auch mitten in der Zeile** (die
  Funktions-Straße des README schreibt mehrere Bulle in eine physische Zeile).
- Getrennt wird erst **vor** dem Entfernen des `**`, sonst frisst ein nackter Bindestrich die
  Grenze — genau P109s Strich; ein eigner Fall verlangt, dass
  „keeps its place - and settles" **ein** Satz bleibt.
- `<details>`, `<summary>`, `<img …>`, Fetzung und Backticks stehen nicht in einer Einheit;
  Tabellenzeilen bleiben eine Einheit, eine Zeile pro Zeile.

Der Lauf damit, 21:44:08 MEZ, Exit 0 — und nach den Zahlen-Trägern erneut gefahren
(21:50:15 MEZ): dieselben Werte, also kein Lauf-Artefakt.

| Lesung | Nenner | mit Messzeug | ohne Messzeug |
|---|---|---|---|
| Zeuge **im selben Satz** | **172** absolute Behauptungen (aus **617** Einheiten) | **16** = 9,3 % | **156** = 90,7 % |
| Zeuge **im selben Abschnitt** | derselbe Nenner 172 | **46** = 26,7 % | **126** = 73,3 % |

Die schmale Klasse bleibt **30** Sätze — jetzt aber 30 von 172, und von ihnen nennen **4** ihr
Messzeug statt 7: **26 sind die Arbeit.** Nachgelesen, welche vier: die Sperre
(`… cannot be switched off (tests/…)`) aus P124, beide Privat-Zusagen aus P125 und P127, und die
GET-Zeile. P126's Telemetrie-Satz zählt in die breite Klasse mit Zeuge (er nennt kein
`never/always/cannot`, also nicht in die schmale), P123's Audit-Satz ebenso.

**Was das für die Behauptung heißt.** Die Aussendung nennt ihr Messzeug in **9,3 %** der
absoluten Behauptungen, nicht in 17,4 %. Die Zahl ist schlechter geworden, weil das Messzeug
ehrlicher geworden ist; alles andere wäre eine Latte gewesen, die den Erfolg nicht sieht. Die
Vorlauf-Größen (321 / 132 / 23) stehen weiter in Abschnitt 9 und 14, jetzt als das, was sie sind:
ein Stand unter einem Riss, der Blöcke zusammenzog.

**Biss der neuen Selbstkontrolle.** `zaehlen.mjs` zählt jetzt jede Einheit mit Block-Struktur und
verweigert den Exit 0, wenn eine einzige bleibt. Gegenprobe gefahren (21:43 MEZ): die
Markup-Trennung in `satz-riss.mjs` ausgeschaltet → `FEHLER: 43 Einheiten tragen noch
Block-Struktur`, Exit 2; danach per Edit zurückgebaut und mit `cmp` bytegleich gegen die vorher
kopierte Fassung geprüft, Zensus-Lauf wieder Exit 0 mit denselben Zahlen.

## 17. Der Wortschatz des Zeugen: `vitest.config.ts` war unsichtbar (P129, 21:57 MEZ)

P128 meldete 16 von 172 (9,3 %). Nachgelesen, welche Sätze in den 156 ohne Messzeug standen:
**sechs nannten ihr Werkzeug wohl**, und der Zähler sah den Namen nicht. Fünf davon sind die
Zeilen der Coverage-Tabelle, die auf ihre Schwellen verweisen, eine ist die Release-Vorlage, die
auf ihr Plattform-Ziel verweist. Das alte Muster kannte nur `tests/`, `scripts/`,
`docs/belege/`, `.mjs`, `.py`, eine `:Zeile` und Artefakt-Endungen.

**Das heißt für die Zahl aus P128: die Richtung war richtig, die Größe nicht.** 9,3 % war ein
Verdacht, gemessen unter einem zu engen Wortschatz. Die Schwellen, die jene Tabelle nennt, sind
nachgelesen in vitest.config.ts, Zeilen 62 bis 110 (gesehen 21:57:43 und 21:57:54 MEZ): gesamt
89 % Linien und 82 % Funktionen, `src/core` 97 und 100, `src/scan` 98 und 100, `src/lib` 92 Linien
und 90 Funktionen, `src/components` 84 Linien mit 80 Aussagen, 72 Funktionen und 71 Zweigen.
Mit der Erweiterung, gemessen 21:57:19 MEZ und erneut nach den
Zahlen-Trägern 22:01:26 MEZ (beide Exit 0, beide dieselben Werte):

(Stand dieses Laufs; Abschnitt 18 ist der stehende, weil dort ein Zeilenumbruch-Fund die
Grundgesamtheit noch einmal bewegte.)

| Lesung | Nenner | mit Messzeug | ohne Messzeug |
|---|---|---|---|
| Zeuge **im selben Satz** | 172 absolute Behauptungen (aus 617 Einheiten) | **22** = 12,8 % | **150** = 87,2 % |
| Zeuge **im selben Abschnitt** | derselbe Nenner 172 | **46** = 26,7 % | **126** = 73,3 % |

Die schmale Klasse bleibt 30 Sätze, davon nennen jetzt **5** ihr Messzeug (statt 4) — **25 sind
die Arbeit.** Von den sechs gewonnenen Zeilen liegt nur eine in der schmalen Klasse; die übrigen
fünf gehören der breiten, weil sie Zahlen mit Einheiten nennen statt `never/always/cannot`.

**Was daran Regel ist, nicht Gefühl.** Der Wortschatz ist jetzt ein Blatt:
`docs/belege/aussendungsatz-0611/messregel.mjs` trägt `absolut`, `zeug`, `maschine`, und
`zaehlen.mjs` importiert sie — dasselbe Gesetz wie in P128: eine Suite, die die Regel nachbaut,
wird bei jeder Regeländerung still grün. Vier neue Fälle in
`tests/aussendungs-riss.test.ts` (Sektion „P129, der Wortschatz"): `vitest.config.ts` zählt (und
die Zeile fällt vorher aus `absolut`, dann wäre der Fall hohl), `electron-builder.json` zählt, und
**die Gegenkontrolle gegen ein Zu-viel**: „the pipeline is configured carefully and every build
always works" darf **kein** Messzeug sein, weil kein Instrument benannt ist. Der vierte Fall pinnt
den Bestand: Nenner 172, mit Messzeug 22, und der Anteil > 0,12 — mit dem Nenner im Text, weil
eine Prozentzahl ohne Grundgesamtheit ein Urteil ist.

Rot zuerst gesehen (21:57:08 MEZ): 3 Faelle rot — die beiden Namens-Faelle und der Bestand
(meldete 16 statt 22). Grün nach der Erweiterung: **10 von 10** (21:57:19 MEZ).

## 18. Drei Sätze bewaffnet — und der eigne Riss zerschnitt Sätze an Zeilenumbrüchen (P130, 22:18 MEZ)

Die Queue aus Abschnitt 17 war die Arbeit; drei Sätze sind hier abgearbeitet, und der dritte hat
einen Defekt in meinem eignen Messzeug aufgedeckt.

**1) „Expired entries are marked, never quietly hidden" (README.md:105).** Der Zeuge existierte
längst: `tests/engine.test.ts:78-83` fragt nach einer abgelaufenen Notiz, bekommt sie mit
`expired: true` zurück und sieht sie niedriger gerankt als die frische — nicht fehlend. Der Satz
nennt ihn jetzt im selben Satz.

**2) „*Load more* never cuts a group in half" (README.md:230).** Hier gab es **keinen** Zeugen: die
Regel lebte nur im Baum (`src/components/Dashboard.tsx:1411-1414`), kein Fall fuhr sie. Gebaut:
`src/lib/gruppenfenster.ts` mit derselben Regel (Gruppe, die beginnt, wird ganz aufgenommen —
`laufend >= fenster` bricht, nicht `laufend + groesse > fenster`), die Fläche ruft die Funktion,
und `tests/lib/gruppenfenster.test.ts` (6 Faelle) faehrt sie. Rot zuerst gesehen: die ersten zwei
Faelle fielen gegen eine absichtlich naive Fassung (`[ 'a' ]` statt `[ 'a', 'b' ]`; eine
500-teilige erste Gruppe verschwand ganz), gruen nach der Regel. Die drei restlichen Faelle —
exaktes Fenster, Fenster groesser als der Bestand, leere Liste, Reihenfolge — blieben grün und
hindern die Regel daran, generös zu werden.

**3) „It never leaves the keychain on its own" (SECURITY.md:50).** Bewaffnet mit
`tests/core/schluessel.test.ts:111` (argv jeder Ausführung gelesen, der Schlüssel darin nicht
gefunden — er geht in die Umgebung des Kindes) und `tests/keine-telemetrie.test.ts` (26 Adressen
über 20 Hosts, jede eine gewählte Vorgabe oder ein benannter Platzhalter). **Zuerst schrieb ich
„the key itself goes to none of them" — das war nicht gemessen** und ist zurückgenommen: kein Fall
prüft die request bodies eines gewählten Providers auf den Datenbank-Schlüssel. Was dasteht, sind
die zwei Prüfungen, die existieren.

**Der Fund beim dritten Satz.** Beim Nachmessen meldete die Wache den Satz weiter als ohne
Messzeug, obwohl das Messzeug in ihm stand. Der Riss aus P128 trennte **pro Zeile**, und ein Mensch
bricht Zeilen mitten im Satz: die Behauptung stand in Zeile eins, ihr Zeugnis in Zeile zwei, zwei
Einheiten, keine mit Zeuge. Rot gesehen 22:13:14 MEZ („der Umbruch zerlegte den Satz in 2
Einheiten"), dann `bloesche()` in `satz-riss.mjs`: Zeilen werden zu Absätzen gefügt, bevor
überhaupt geschnitten wird — ein Block beginnt nur, wo `- `, `#`, `|`, `1.` oder `<` steht.
Nebenwirkung gemessen: Einheiten 617 → **565** (52 Fragmente waren keine Sätze), Nenner 172 → 170.

**Der Zensus danach** (22:13:47 und 22:17:59 MEZ, beide Exit 0, beide dieselben Werte):

| Lesung | Nenner | mit Messzeug | ohne Messzeug |
|---|---|---|---|
| Zeuge **im selben Satz** | 170 absolute Behauptungen (aus 565 Einheiten) | **25** = 14,7 % | **145** = 85,3 % |
| Zeuge **im selben Abschnitt** | derselbe Nenner 170 | **50** = 29,4 % | **120** = 70,6 % |

Die schmale Klasse ist 30 Sätze, davon nennen **8** ihr Messzeug, **22 sind die Arbeit**
(P129: 5 von 30; P128: 4; P127: 7 unter dem alten Riss).

**Was an diesem Schnitt nicht im Browser geprüft ist, und warum.** `src/` wurde geändert
(Hilfsfunktion ausgelagert, Fläche ruft sie). Das ausgelieferte Objekt ist 3.2.190 und kann nicht
neu gebaut werden (Platte 22:18:32 MEZ: 8,24 GiB gegen 9,90 GiB Gate), also wäre ein Browser-Blick
ein Blick auf alte Bytes gewesen. Gehalten wird der Schnitt statt dessen durch: die Regel ist
Zeile für Zeile dieselbe wie zuvor, `npx tsc --noEmit` Exit 0, und die Dashboard-Flächentests
laufen in der Suite grün (Suite 3737, ein Rot nur am Zahlenträger). Beim nächsten Bau ist die
Fläche dann am Objekt geprüft, nicht nur im Baum.

## 19. Drei weitere Sätze: Zeugen existierten, nur niemand nannte sie (P131, 22:26 MEZ)

Kein neues Messzeug, dreimal ein Verweis — die billige, ehrliche Arbeit aus der Queue. Jeder
Zeuge ist vorher **gelesen**, nicht aus einem Keyword-Suchlauf übernommen (der erste Triage-Lauf
hatte für „Settings can only narrow what is read" `tests/zielgroesse.test.ts` vorgeschlagen —
beim Nachlesen ist das die Tastengröße-Latte, kein Zeuge; das Muster blieb 22:25 MEZ ohne Kandidat,
bis die richtigen Fälle gefunden waren).

| Satz | Wo | Zeuge, nachgelesen |
|---|---|---|
| „Settings can only narrow what is read, never widen it" | README.md:229 | `tests/scan/regeln.test.ts:190` (redet der Sperre das Lesen von Geheimnissen über die Dateiarten nicht an) und `:199` (kleinere Größengrenze ja, größere nein) |
| „A backup of the old file sits right next to it, every other entry stays, and a file that is not plain JSON is never touched" | README.md:177 | `tests/lib/einrichtung.test.ts:42` (Sicherung daneben, Nachbareinträge bleiben) und `:61` (eine Datei mit Kommentaren wird nicht umgeschrieben, sondern abgelehnt) |
| „There is nothing to activate and nothing to buy inside the window, so the app also never asks for it" | README.md:355 | `tests/keine-grenzen.test.ts:102-116` (Lizenzroute antwortet nicht, kein Zähler wird geschrieben, keine Oberfläche ruft sie) |

Zensus 22:25:56 MEZ, Exit 0: Nenner bleibt **170** absolute Behauptungen aus 565 Einheiten,
mit Messzeug **28** = 16,5 %, ohne Messzeug **142** = 83,5 %; Abschnittslesung 49 = 28,8 % gegen
121 = 71,2 %. Die schmale Klasse bleibt 30 Sätze, davon nennen **11** ihr Messzeug — **19 sind die
Arbeit** (P130: 8/22; P129: 5/25; P128: 4/26; P127: 7/24). Der Fall
`tests/aussendungs-riss.test.ts` („am echten Bestand") ist auf 170/28 gehoben und bleibt grün.

Was an den drei Sätzen **nicht** behauptet wird: dass die Zeugen die ganze Welt abdecken.
`einrichtung.test.ts` fährt die Connector-Routine im App-Repo; die Datei-Bytes einer
Kommentar-JSON werden dort nicht nach dem Versuch verglichen, sondern der Connector verweigert
vor dem Schreiben — die Verweigerung ist gemessen, ein Bitvergleich der Fremddatei nicht. Und
`keine-grenzen.test.ts` beweist das Verschwinden der Schließfächer in dieser App, nicht in der
Enterprise-Konsole (README.md:181, zugefroren auf Damians Wort vom 5.11. 13:24 MEZ).

## 20. P132 — Ein Satz braucht ein Werkzeug, zwei Sätze brauchten nur ihren Namen (6.11. 22:46 MEZ)

Drei Sätze aus der Queue von P131. Die Verteilung ist die eigentliche Nachricht dieses
Abschnitts: **zwei von drei Behauptungen waren bereits gemessen** — nur nannte kein Satz den
Zeugen. Der dritte brauchte einen neuen Fall, und der ist der einzige, der Code kostet.

| Satz | Wo | Zeuge | neu gebaut? |
|---|---|---|---|
| „no network, always on" über den Reranker | README.md:123 | `tests/core/lokaler-rerank.test.ts:41,50,58,67` | **ja** — 4 Fälle |
| „no embedding ever travels into the view" | README.md:142 | `tests/rest-semantik.test.ts:70` (Zeile 84: das rohe HTTP-Blatt darf kein `embedding`, `vektor`, `vector` enthalten) | nein — Zitat fehlte |
| „Both are right (never asked again)" | README.md:169 | `tests/enterprise-api.test.ts:227` (Paar gesetzt, Liste danach leer, `supersededBy` bleibt `null`) | nein — Zitat fehlte |

### Der neue Fall und sein Biss

`localRerankScore` (src/core/engine.ts:75-113) ist die einzige Stelle, die `rerankScore` erzeugt.
Vor P132 prüfte die Suite ihre *Spanne* (0..1) und ihre *Reihenfolge*
(`tests/engine.test.ts:448-467`) — nicht die Bedingungen, unter denen sie entsteht. Der Satz nach
aussen behauptet aber genau die: kein Netz, immer an, deterministisch.

Vier Fälle: Zahl trotz abstürzendem Embedding-Dienst (41), **null** Netzaufrufe während der
Berechnung (50), zweimal dieselbe Frage = auf die Stelle derselbe Wert (58), und ein Fall, der
`Date.now` und `Math.random` zwischen zwei Messungen weiterlaufen lässt und Gleichheit verlangt (67)
— derselbe Reranker, derselbe Fall, andere Frage.

Der Biss ist gefahren, nicht behauptet. Sicherungskopie von `src/core/engine.ts` nach
`/tmp/p132-riss-sicherung/`, dann zwei Sonden in die Funktion: ein `fetch`-Aufruf und ein
`Math.random()`-Jitter, dazu `Date.now() * 0` im Rückgabeweg. Lauf 22:42:30 MEZ:
**3 von 4 rot** (Netzaufruf, Wiederholbarkeit, Uhr/Zufall), der erste Fall bleibt grün — er prüft
die Abhängigkeit vom Dienst, und die nahm die Sonde nicht. Zurückgebaut per Kopie aus der
Sicherung, `cmp` meldet bytegleich, `git diff src/core/engine.ts` ist leer. Danach 4 von 4 grün
(22:42:36 MEZ).

### Die Zählung danach

Zensus 22:47:52 MEZ, Exit 0 — derselbe Stand der Zählung wie im Lauf 22:43:11 MEZ, nachdem
README.md seine Fallzahl bekommen hatte. Nenner unverändert 565 Einheiten / 170 absolute
Behauptungen:

| Lesung | mit Messzeug | ohne Messzeug |
|---|---|---|
| Zeuge **im selben Satz** | **31** = 18,2 % | 139 = 81,8 % |
| Zeuge **im selben Abschnitt** | 52 = 30,6 % | 118 |

Die schmale Klasse bleibt 30 Sätze, davon nennen jetzt **14** ihr Messzeug — **16** sind Arbeit.
Ihre Reihe über die fünf Schläge: 4, 5, 8, 11, 14. Die Corpus-Pinne in
`tests/aussendungs-riss.test.ts:110-125` steht auf 31 von 170, die Anteilskante auf > 0,18.

### Was die zwei Lei-Zeugen *nicht* sagen

`rest-semantik.test.ts:70` beweist, dass über **diese eine Route** kein Wort vorkommt, aus dem sich
ein Vektor bauen ließe — gemessen am rohen Blatt, nicht am Objektbaum. Er beweist nicht, dass der
Renderer niemals Vektoren bekommt: ein zweiter Endpunkt könnte es trotzdem tun. Und
`enterprise-api.test.ts:227` setzt das Paar in *einem* Lauf; dass die Entscheidung beim nächsten
Start des Programms noch gilt, prüft die Datei an der Stelle nicht (sie hält den Speicher offen).
Beides steht so nicht im README-Satz — der sagt „never asked again" über die Frage, und die Frage
ist in diesem Lauf beantwortet. Wer die Neustart-Festigkeit behaupten will, braucht einen zweiten
Zeugen.

## 21. P133 — Der Zensus erwischt eine falsche Aussage, nicht nur eine nackte (6.11. 23:02 MEZ)

P132 hatte die Regel gesetzt: erst die vorhandenen Wachen durchsuchen, dann bauen. Die Queue
lieferte damit einen Satz, der gar kein Instrument brauchte (README.md:180, Prüfziffern), einen
neuen Fallblock (README.md:450) — und **eine Behauptung, die falsch war**.

### Der Fund

README.md:450 sagte nach aussen: *"the only exclusion is the bootstrap, which binds a port and never
runs in a unit test"*. `vitest.config.ts` tut das nicht. Gemessen an der Datei (Zeilen 40-61):

- `exclude:` enthält **drei** Einträge: `src/**/types.ts`, `**/*.d.ts`, `src/lib/pdfText.ts`.
- Der Bootstrap `server.ts` steht in `include:` — er wird also **mitgezählt**, nicht ausgenommen.

Ein Satz, der eine Liste beschreibt, ohne sie zu lesen, war hier seit unbekannter Zeit falsch. Der
Zensus hat ihn gefunden, weil er zur schmalen Klasse gehört (`never runs in a unit test`) und keinen
Zeugen nannte; die Suche nach dem Zeugen war die Korrektur.

### Die Wache, damit er nicht zurückkehrt

Neu: `tests/doku-deckung.test.ts`, sechs Fälle. Sie liest `include:` und `exclude:` **aus der
Konfiguration** (nicht aus dem README) und verlangt in beide Richtungen:

- jede Ausnahme, die die Konfiguration macht, steht beim Namen im Satz (`:47`);
- kein Pfad, den der Ausnahmeteil in Backticks als Ausnahme zeigt, fehlt in der Liste (`:54`) —
  Verweise auf `tests/`, `scripts/`, `docs/` und auf `vitest.config.ts` selbst sind keine
  behaupteten Ausnahmen, alles andere muss in der Liste stehen;
- `server.ts` steht in der mitzählenden Liste, und der Satz behauptet keine "only exclusion" (`:73`);
- Biss-Kontrolle: eine vierte Ausnahme, in die Konfigurationskopie gesetzt, wird vom Leser gezählt
  (`:80`); eine leere gelesene Liste ist kein Prüfgrund (`:87`).

Rot zuerst gesehen, dreifach und aus dem richtigen Grund: 22:56:23 MEZ meldete die Wache
"die Konfiguration lässt `src/**/types.ts` aus, der README-Satz kennt den Namen nicht" und
"der Satz behauptet weiter eine einzige Ausnahme". Zwei eigene Fehler auf dem Weg: der Leser griff
auf das **erste** `include:` der Datei zu (das ist der Test-Glob, nicht die Rechnung) und ließ ein
`[` als Eintrag durch; ein `ReferenceError` aus einer umbenannten Variable wurde zweimal
hingerichtet, bevor ich die Datei las. Danach: grün (22:57:59 MEZ, 6 von 6).

### Der zweite Fund: die Konfiguration kommentiert sich zu gut

Der Ausnahmekommentar in `vitest.config.ts` (Zeile 59, zur Ausnahme auf Zeile 60) behauptet, `src/lib/pdfText.ts` werde "indirekt
über den Dashboard-PDF-Import-Test gedeckt". Die Datei tut das nicht:
`tests/components/Dashboard.test.tsx:17` **mockt** `src/lib/pdfText` weg. Der README-Satz sagt jetzt
die schwächere, wahre Dinge — jsdom treibt keinen Worker und keine CMap-URL, und der eine Test, der
den Importpfad berührt, mockt das Modul, "so that the glue is honestly outside the count rather than
covered from behind". Der Kommentar in der Konfigurationsdatei bleibt stehen, weil er eine Absicht
beschreibt und kein Messzeug ist; dass er zu weit ging, steht hier.

### Der Satz, der nichts kostete

README.md:180 ("Card numbers must pass the Luhn check and IBANs the mod-97 check; dates are never
taken for phone numbers") war schon gemessen: `tests/lib/schild.test.ts:39` hält beide Prüfziffern
head-on (eine verschobene IBAN-Ziffer und eine Nullenkarte fallen durch) und `:34` legt Datum, Uhrzeit,
Version, Bestellnummer und eine Karte mit falscher Endziffer vor — und findet nichts. Kosten: ein
Klammerzusatz. Die Zeitzahlen habe ich **vor** dem Schreiben nachgesehen; der erste Entwurf nannte
:31/:36, die Fällen sitzen auf :34/:39.

### Die Zählung danach

Nenner bewegt: 566 Einheiten, **169** absolute Behauptungen (eine weniger — der alte Satzteil
"never runs in a unit test" war die eine, und er ist weg), 32 mit Messzeug im selben Satz = 18,9 %.
Abschnittslesung 51 = 30,2 %. Schmale Klasse 29, davon 15 mit Messzeug → **14 Arbeit**.
Die Reihe über sechs Schläge: 4, 5, 8, 11, 14, 15.

Ein Anteil, der steigt, während der Nenner fällt, ist kein Fortschrittsbeweis — beide Zahlen stehen
oben, und die Pinne in `tests/aussendungs-riss.test.ts` hält 32 von 169 fest.


## 22. P134 — Der Zensus findet eine zweite Über-behauptung, und sie widerspricht einem andern Satz desselben Blatts (6.11. 23:09 MEZ)

Drei Sätze geprüft, nicht drei Sätze bewaffnet. **Zwei von ihnen waren zu stark.**

### README.md:297 — „the memory store is never synced anywhere"

Das Blatt bietet auf Zeile 355 ausdrücklich *Device Sync* als Werkzeug an, das ohne Grenzen läuft.
Ein Satz, der Sync verbietet und ein Satz, der Sync zeigt, können nicht beide wahr sein. Die Datei
sagt, was gilt: `server/router/sync.ts:40` antwortet dem Fenster mit einem AES-256-GCM-Bundle und
**postet es nirgendwohin** — der Weg auf das zweite Gerät ist des Nutzers Hand (USB, Ordner, Mail),
steht so im Kopfkommentar der Datei (Zeilen 1-5). Der Satz nach aussen heißt jetzt die schwächere,
wahre Dinge: nichts geht von selbst hinaus; das Bundle hält keinen Klartext und weist falsche
Passphrase wie Manipulation zurück (`tests/praxissync.test.ts:101`); ein Voll-Export trägt *alle*
Notizen und nicht eine Seite davon (`:60`, über 100 Stück hinweg gepinnt).

### README.md:145 — „fit-to-view that always frames the whole graph"

Bei Telefonbreite entscheidet der **Lesbarkeits-Boden** über die Größe, nicht der Rahmen — genau
dafür existiert `tests/components/graph-fit-390-keine-verlust.test.tsx:73`: er verlangt für 34 Notizen,
dass ein Druck *nie weniger* zeigt als die Ansicht vorher, und er fährt nur, wenn der Knopf-titel in
diesem Lauf den Boden als Entscheider nennt (`:88` ist die Drift-Kontrolle, die Zahl und Bild an
derselben Weltlage liest). „always frames" war also falsch, „never gives notes back" ist gemessen.
Der Satz nennt jetzt beides: den Boden als möglichen Entscheider und die eine Zusicherung, die beide
Fälle übersteht.

### README.md:190 — das Gate, nichts gebaut

„Without a reachable local LLM it always degrades to ADD — the gate can never block you" war bereits
gemessen: `tests/engine.test.ts:333` fährt das Gate bei 503 des Einbettdienstes und landet auf ADD,
**ohne das Modell zu fragen**; `:360` füttert ihm ein Nicht-JSON und eine unbekannte Entscheidung —
beide degradieren auf ADD. Kosten: ein Klammerzusatz.

### Die Zählung

Zensus 23:09:08 MEZ, Exit 0: 568 Einheiten, 169 absolute Behauptungen, **35 mit Messzeug im selben
Satz = 20,7 %** (vorher 32 = 18,9 %), 134 ohne = 79,3 %. Abschnittslesung 56 = 33,1 %. Schmale Klasse
29, davon **18** mit Messzeug → **11 Arbeit**. Die Reihe über sieben Schläge: 4, 5, 8, 11, 14, 15, 18.

Erstmals übersteigt der Anteil 20 %, und die Kante in `tests/aussendungs-riss.test.ts` ist auf
> 0,20 gehoben — eine Latte, die ein Rückschritt jetzt meldet. Der Nenner selbst ist über die Linie gewandert: 129 (P122) → 132 (P127, P128) → 172 (P129) →
170 (P130-P132) → 169 (P133, P134). Das ist keine Verbesserung der Lage, sondern die Korrektur
eines zu engen Risses — eine Anteilzahl ohne ihren Nenner wäre hier nicht lesbar gewesen.

### Warum das keine Kleinarbeit ist

P132 hatte die Regel gesetzt: erst die vorhandenen Wachen durchsuchen. P133 fand damit eine falsche
Zahl, P134 findet zwei über-strichene Zusagen — eine davon im Widerspruch zu einem anderen Satz
desselben Blatts. Eine Behauptung, die niemand prüft, altert in beide Richtungen: sie kann falscher
werden als die Maschine und unvereinbar mit dem eigenen Text.

## 23. P135 — Drei Sätze, null neue Fälle: die Wachenliste trägt (6.11. 23:19 MEZ)

Die Regel aus P132 — erst suchen, dann bauen — läuft jetzt ohne Reibung. Drei Sätze bewaffnet,
**kein einziger neuer Fall**, weil jede Prüfung schon existierte:

| Satz | Wo | Zeuge | Was er wirklich hält |
|---|---|---|---|
| „markup scaffolding, repeated table rows — never becomes a note" | README.md:229 | `tests/core/klassifikation.test.ts:112`, `:83`, `:78` | Skript/Stil/Auszeichnung werden Text; eine Tabelle nur gleicher Zeilen wird abgewiesen; nackte HTML-Zeilennummern ebenso |
| „The data is never hostage" **und** „There is no key that could revoke it" | README.md:360 | `tests/keine-grenzen.test.ts:102-116`, `tests/server.test.ts:327` | die Lizenz-Route antwortet nicht (lesend wie schreibend), nichts in der Fläche fragt sie, und der Bestand geht als Markdown nach draußen — beide Sätze mit eignem Zeugen |
| „the other is marked as replaced, never deleted" | README.md:169 (zweite Hälfte) | `tests/enterprise-api.test.ts:215`, `tests/engine.test.ts:167` | die ersetzte Notiz liest sich zurück mit `supersededBy` — sie ist noch da; nach einer Konsolidierung zählen weiter beide als aktiv |

Der dritte Satz zählte schon vorher als gedeckt (P132 hat die *Both-are-right*-Hälfte bewaffnet). Die
Zählung bewegt sich für ihn also **nicht** — die Hälfte „never deleted" war die Lücke, und sie ist
jetzt mit Zeugen gefüllt, ohne dass die Zahl schöner wird. Das ist der Fall, in dem ich die Zahl
zurückweisen muss, wenn sie mir jemand als Fortschritt verkaufen will.

### Der Fund nebenbei, aus dem Quelltext

`src/core/klassifikation.ts:367-372` begründet den HTML-Weg mit einem echten Bestand: bevor
`htmlZuText` vorgeschaltet war, standen **448 Notizen** in der Wissensbasis, die nur aus
`<a name='L420'></a><a href='#L420'>420</a>` bestanden — die Randspalte einer Quelltextansicht, ohne
ein inhaltliches Wort. Der Pfad hängt heute an `server/helfer/text.ts:73`, also am Lese- und Importweg,
den README.md:229 beschreibt. Die Zahl 448 stammt aus dem Kommentar, nicht von einer Nachmessung; sie
steht hier als Grund, nicht als Kennzahl.

### Die Zählung

Zensus 23:26:38 MEZ, Exit 0: 568 Einheiten, 169 absolute Behauptungen, **38 mit Messzeug im selben
Satz = 22,5 %** (vor dem Schlag 35 = 20,7 %), 131 ohne. Schmale Klasse 29, davon **20** mit Messzeug →
**9 Arbeit**. Reihe über acht Schläge: 4, 5, 8, 11, 14, 15, 18, 20.

Die Korrektur mitten im Schlag: ich setzte den Zeugen hinter *„There is no key that could revoke it"*
und meldete damit auch *„The data is never hostage"* als gedeckt — zwei Einheiten, ein Zeuge. Die Zahl
stieg deshalb zunächst nur auf 37, und erst die Liste im Artefakt zeigte, dass die Fett-Zeile blind
blieb. Seither steht der Zeuge in beiden Sätzen (gemessen 38). Der Zensus zählt Sätze, nicht Absätze —
wer eine Zeile bewaffnet, bewaffnet nicht das, was drunter steht.

Die Abschnittslesung ist dabei von 56 auf **55 (32,5 %)** gefallen. Grund: der umgeschriebene
Sync-Absatz aus P134 steht jetzt anders im Blatt, und ein Zeuge, vorher im Nachbarabschnitt, liegt
nicht mehr im selben. Das ist keine Verschlechterung der Texte, sondern eine Bewegung der Grundgesamtheit —
und der Grund, warum beide Lesungen immer zusammen angegeben werden. Die Anteilskante ist auf **> 0,21**
gehoben.

## 24. P136 — Dritte falsche Aussage: der Trichter schloss in dem Satz siebzig Schritte zu früh (6.11. 23:37 MEZ)

Drei Sätze aus der Queue, **wieder kein neuer Fall** — und wieder eine Behauptung, die die Maschine
nicht hergibt.

### README.md:37 — „0 by step 310"

Der Satz versprach, `tests/lib/graphLayout.test.ts` pinne den Trichter „at ≤ 40 pairs by step 250 and
**0 by step 310**". Die Datei tut das nicht. Die drei Latten (:2455-2458) sind:

```
spur.get(250) <= 40
spur.get(310) <= 40
spur.get(380) === 0
```

Nichts wird bei 310 auf null geprüft, und der eigne Kommentar derselben Datei (Zeilen 2434-2444) hält
die gemessene Flugkurve fest: `250 → 14`, `310 → 1`, `380 → 0`. **Der Satz war um siebzig Schritte zu
früh fertig** — und zwar in die sichere Richtung: er behauptete eine strengere Latte, als die Wache
fährt. Genau diese Art von Großzügigkeit nach aussen ist die gefährlichere, weil ein grüner Test sie
nicht meldet.

Berichtigt auf die drei echten Latten, mit Datei und Zeilenbereich im Satz.

### README.md:131 — die zwei Nenner

„`npm run ablation` divides by 5 … two metrics, two names, never comparable" war gemessen:
`tests/eval-metrik.test.ts:37` pinnt den gekappten Nenner des Eval (`min(5, relevante)`), `:55` pinnt
die Division durch 5 und den P@5-Namen, und `:48` wirft jedes Werkzeug raus, das *Präzision* sagt,
während es *Recall* rechnet. Kosten: ein Klammerzusatz.

### README.md:148 — der zweite Kanal

„switches itself off with the reason … it never paints everything grey" war gemessen:
`tests/components/KnowledgeGraph.render.test.tsx:3537` findet den Provenance-Knopf deaktiviert vor und
verlangt von seinem Titel, dass er die eine Ankunft nennt *und* „nothing to tell apart" sagt; `:3546`
gibt den Kanal bei zwei Herkünften zurück und liest beide Farben von der Leinwand.

### Die Zählung

Zensus 23:36:48 MEZ, Exit 0: 568 Einheiten, 169 absolute Behauptungen, **41 mit Messzeug im selben
Satz = 24,3 %** (vorher 38 = 22,5 %), 128 ohne. Abschnittslesung unverändert 55 = 32,5 % — zum ersten
Mal seit P132 bewegt sich eine Lesung nicht mit der anderen. Schmale Klasse 29, davon **23** mit
Messzeug → **6 Arbeit**. Reihe über neun Schläge: 4, 5, 8, 11, 14, 15, 18, 20, 23.

Anteilskante auf **> 0,24** gehoben, Pinne auf 41 von 169.

### Was die sechs Verbleibenden sind — Zeilen nachgesehen, nicht geschätzt

| Wo | Satz | Warum er offen bleibt |
|---|---|---|
| README.md:181 | „IT deploys one managed-settings.json (the macOS MDM path, since the app ships macOS only)" | die MDM-Ablage ist nicht auf diesem Rechner entscheidbar; und der Absatz gehört zur Enterprise-Konsole, die auf Damians Wort vom 5.11. 13:24 MEZ zugefroren ist |
| README.md:357 | „It was never a lock — but it was counting, and counting needed places to hide the tally" | Geschichte über einen früheren Stand, nicht über diesen Baum; ein Zeuge müsste den alten Stand fahren |
| README.md:427 | „built from this source and never published here, so they are untested against a real installer download" | von diesem Rechner aus **nicht** entscheidbar — Windows/Linux-Installers laufen hier nicht. Ehrliche Tat: als Quellbau benennen, nicht als geprüft verkaufen |
| ROADMAP.md (asOf-Zeile) | „time-travelled queries never count as access" | eine Zusage an eine Tür, die die App nicht hat — ROADMAP ist Absage, nicht Befund |
| .github/release-notes.md (englisch) | „A signed key is an artefact of a K3PTA Enterprise agreement, never something sold off a shelf" | Enterprise-Papier, zugefroren — nur meldbar |
| .github/release-notes.md (deutsch) | derselbe Satz in Deutsch | Träger-Zensus: zwei Träger, eine Aussage (P132-Lektion aus dem Oktober: erst die Träger zählen, dann ziehen) |

Die schmale Klasse ist damit fast leer, und **die letzten sechs sind keine Arbeit mehr, sondern
drei Wände**: zwei Damians Wort (Enterprise, MDM-Ablage) und eine physische Grenze dieses Rechners
(Windows/Linux). Das ist ein ehrlicherer Endzustand als eine Prozentzahl, die nach zwei weiteren
Schlägen „100 %" melden würde.

## 25. P137 — ROADMAP geöffnet: drei Zeilen, die hielten, und eine vierte falsche, die nicht kam (6.11. 23:47 MEZ)

ROADMAP.md hatte 16 absolute Behauptungen und **keine einzige** mit Messzeug. Die Zeile war der
verdächtigste Ort im Blatt — und die Prüfung fiel anders aus als erwartet.

**Drei Zeilen hielten, alle drei waren schon gemessen:**

| Zeile | Was sie verspricht | Der Zeuge, den sie nicht nannte |
|---|---|---|
| ROADMAP.md:60 | ganzes File verschlüsselt, Suche intakt | `tests/core/store-verschluesselung.test.ts:76` liest die Rohdatei ab der ersten Seite (WAL mit) und `:163` findet nach dem Wiederöffnen Notizen, Suche und Einstellungen unverändert |
| ROADMAP.md:62 | Umbau nur unter Vierhand, Kopie → Verschlüsselung → Prüfung → Austausch, alte Datei mit Nullen | `tests/core/store-verschluesselung.test.ts:180` lässt eine Datei, die ein anderes Programm hält, im Klartext; `:210` lässt beim scheiternden Austausch das Original heil und die Kopie verschwinden; `:196` findet in der alten Datei nur Nullen |
| ROADMAP.md:84 | fremde `Host`-Köpfe und Schreibversuche von Webseiten abgewiesen | `tests/herkunft.test.ts:76` liest hinter einem fremden Host nichts mehr, auch nicht im Live-Stream; `:101` lässt ein Netzwerk-Host nur gelten, wenn `KEPTA_HOST` ihn ruft |

**Die vierte falsche Aussage fiel aus, bevor ich sie schrieb.** ROADMAP.md:62 endete mit „overwrite
the old file with zeros". Ich hielt das für einen aspirativen Satz — `grep` über `src/`, `server/`,
`scripts/` fand kein zweites Wort dazu. Es existiert doch: `src/core/store.ts:2151` `ersetzeUndNulle`
schreibt 64-KiB-Blöcke Nullen über die alte Datei und `:2163` markiert das als Zugabe, weil die
verschlüsselte Datei schon liegt. Und der Fall `:196` prüft ihn — mit `skipIf(win32)`, weil der
Windows-Weg schließt und ersetzt statt zu nullen. **Der Satz war also wahr, aber plattformlos**:
er galt ohne Einschränkung, während die Wache selbst ihre Grenze nennt. Berichtigt, indem die
Zeile jetzt die Plattformkante dazusagt.

## Die Zählung

Zensus 23:47:09 MEZ, Exit 0: 568 Einheiten, 169 absolute Behauptungen, **44 mit Messzeug = 26,0 %**
(vorher 41 = 24,3 %), 125 ohne. Abschnittslesung unverändert 55 = 32,5 %. Schmale Klasse bleibt 29
mit **23** Zeugen → **6 Arbeit** (die drei ROADMAP-Zeilen gehören nicht zur maschinen-widerlegbaren
Klasse — „fully intact" und „only when" treffen das Muster nicht). Kante auf > 0,25.

Der Weg der letzten vier Schläge in derselben Klasse: 14, 15, 18, 20, 23. Die sechs Verbleibenden
sind nachgesehen und gehören zu drei Wänden (Damians Wort: Enterprise und MDM; die Grenze dieses
Rechners: Windows/Linux; ein früherer Stand: README.md:357; eine ROADMAP-Absage: asOf).

## 26. P138 — Die blinde Masse spricht zurück: drei Zeilen gehalten, und eine meiner eignen Sortierungen war falsch (6.11. 23:55 MEZ)

125 absolute Behauptungen standen ohne Messzeug. Mit dem Wortfilter (Route, Datei, Schlüssel, Host,
Sync, Prozent) blieben 57 Maschinen-Sätze — und die Prüfung der obersten drei gab drei Zeugen, **keinen
neuen Fall**, dafür einen Fehler von mir.

| Satz | Wo | Zeuge |
|---|---|---|
| „Whoever holds only the file holds nothing readable" | README.md:73 | `tests/core/store-verschluesselung.test.ts:102` (falscher Schlüssel: zwei Wege benannt, nichts auf der Platte verändert), `:149` (kein leeres Gehirn über einer verschlüsselten Datei) |
| „without the content ever being readable in transit" | README.md:114 (Device Sync) | `tests/praxissync.test.ts:101` (kein Klartext im Bundle, falsche Passphrase und Manipulation fliegen), `:120` (jede Zeile verkettet die Vorgängerin) |
| „time-travelled queries never count as access" | ROADMAP.md:38 | `tests/engine.test.ts:254` (die alte Notiz gilt zum gefragten Moment, die neue nicht), `:271` (`accessCount` bleibt 0 nach der Zeitreise, steigt nach einer normalen Suche) |

### Mein Fehler, zuerst notiert

P136 hatte ROADMAP:38 in die Schublade **„Zusage an eine Tür, die die App nicht hat"** gesteckt und die
sechs Restlichen als „drei Wände" verkauft. Das war falsch, und die Widerlegung war eine Minute Arbeit:
`server/router/search.ts:75` nimmt `asOf` an, `src/core/mcp.ts:99` wirbt dafür, `src/core/mcp.ts:326`
weist Nicht-Ganzzahlen ab, und zwei Fälle in `tests/engine.test.ts` fahren es. Ich hatte das Wort
ROADMAP-Zeile gelesen als „Plan" und nicht als „Zeile in einer Tabelle" — **eine Sortierung, die ich
nicht gegen den Baum prüfe, ist eine Vermutung mit Aktenzeichen.**

### Die Zählung

Zensus 23:55:07 MEZ, Exit 0: 568 Einheiten, 169 absolute Behauptungen, **47 mit Messzeug = 27,8 %**
(vorher 44 = 26,0 %), 122 ohne. Abschnittslesung 57 = 33,7 % (zwei mehr). Schmale Klasse 29, davon
**24** mit Messzeug → **5 Arbeit**. Reihe über zehn Schläge: 4, 5, 8, 11, 14, 15, 18, 20, 23, 24.

Die „drei Wände" von P136 sind damit auf vier Sätze geschrumpft, und einer davon (README.md:427,
Windows/Linux-Quellbau) ist die einzige Grenze, die diese Maschine wirklich zieht. Der Rest ist
Damians Wort (README.md:181, release-notes zweimal) oder ein früherer Stand (README.md:357).

## 27. P139 — SECURITY.md: drei Sätze, und der Nenner wächst, weil ich ihn bewaffe (7.11. 00:04 MEZ)

SECURITY.md trug sechs absolute Behauptungen ohne Messzeug. Drei sind jetzt gedeckt — und beim
Schreiben fiel eine Grenze auf, die ich vorher nicht benannt hatte.

| Satz | Wo | Zeuge |
|---|---|---|
| „refuses requests whose `Host` header does not name this machine … and requests from other websites that would change anything" | SECURITY.md:9 | `tests/herkunft.test.ts:66` (Notiz aus einem Sandbox-Frame einschleusen — nichts landet), `:76` (fremder Host → nichts lesbar, Live-Stream mit), `:85` (Fenster, Dev-Server, Skripte, MCP arbeiten weiter), `:101` (Netzwerk-Host nur mit `KEPTA_HOST`) |
| „AES-256 for every page, an HMAC-SHA512 over every page, a random 256-bit key" | SECURITY.md:15-17 | `tests/core/store-verschluesselung.test.ts:76` (Rohdatei: ab Seite eins Chiffre, WAL mit), `:91` (genau 256 Bit — ein kürzerer Schlüssel öffnet nichts) |
| „stored in the system keychain: macOS … Windows DPAPI … Secret Service on Linux" | SECURITY.md:17-21 | `tests/core/schluessel.test.ts:101` (Windows-Eintrag über den eingespritzten Aufrufer, Pfad in der Umgebung), `:111` (der Schlüssel steht in keiner Argumentliste), `:152` (`win32` bekommt „Windows DPAPI" zugewiesen) |

### Was die drei Fälle *nicht* beweisen — und jetzt dabeisteht

`schluessel.test.ts` **ersetzt das Systemkommando**. Bewiesen ist K3PTAs eigene Seite des Aufrufs:
Leseweg, Schreibweg ohne Argumentliste, Auswahl der Plattform. Der Round-Trip gegen eine echte
Keychain, eine echte DPAPI-Umgebung oder `secret-tool` läuft nur auf diesem Betriebssystem. Der Satz
nach aussen sagt das jetzt selbst, statt es als Beweis auszugeben — dieselbe Lektion wie P136 beim
Fit-Knopf und P137 bei „zeros": **eine Wache, die eine Grenze zieht, gehört mit der Grenze zitiert.**

### Die Zählung — der Nenner wächst mit der Bewaffnung

Zensus 00:03:54 MEZ, Exit 0: **570** Einheiten, **171** absolute Behauptungen, **50** mit Messzeug im
selben Satz = **29,2 %**, 121 ohne. Abschnittslesung 59 = 34,5 %. Schmale Klasse 30, davon 25 mit
Zeugen → **5 Arbeit**.

Der Nenner ist von 169 auf 171 gestiegen, und die schmale Klasse von 29 auf 30: **meine eignen
Zusätze enthalten absolute Wörter** („nothing lands", „only once"). Wer Zeugen einschreibt, schreibt
neue Behauptungen — die Anteilzahl steigt deshalb langsamer als die Anzahl der Zeugen (47 → 50 bei
gleichzeitig 169 → 171). Beide Zahlen stehen darum immer zusammen da; die Pinne hält 50 von 171, die
Kante > 0,28.

## 28. P140 — Der fünfte Fund: README und SECURITY.md widersprachen sich selbst über den Schlüssel (7.11. 00:14 MEZ)

Fünf falsche oder zu starke Aussagen seit P133 — und diese hier war die erste, die **innerhalb des
eignen Blatts** stritt.

### README.md:74 gegen SECURITY.md:19

README führte den Begriff *Keychain* so ein: **„no password to type, no key on the disk."**
SECURITY.md schreibt zwei Zeilen tiefer, was Windows tut: `database-key.dpapi` **liegt im Datenordner**
(von DPAPI nur für dasselbe Konto lesbar gemacht), und ein Headless-Aufbau mit `KEPTA_DB_KEY` hält den
Schlüssel **in der Prozessumgebung** — SECURITY.md nennt das selbst „weaker". Beides ist ein Ort auf
der Platte beziehungsweise im Prozess. Der README-Satz war also auf macOS wahr und als allgemeine
Aussage falsch, und die Berichtigung stand bereits im Haus: dieselbe Datei, anderes Blatt.

Jetzt steht da: kein Passwort zu tippen; auf macOS der Schlüssel nie in einer Datei; auf Windows die
DPAPI-versiegelte Datei im Datenordner, nur für dasselbe Konto lesbar; headless die Umgebung — und der
Verweis auf SECURITY.md, das die Unterschiede ausschreibt, plus `tests/core/schluessel.test.ts:152`
als Zeuge dafür, welches System welchen Bund bekommt. **Ein Sicherheitswort in einem Glossar ist keine
Zusammenfassung der Sicherheitsdatei.**

### README.md:91 — die Kette, jetzt mit Zeugen

| Teilsatz | Zeuge |
|---|---|
| „Every change … and every call through the MCP door, its searches included — is written to a tamper-evident audit log" | `tests/kette-deckt-nur-schreibwege.test.ts:55` (HTTP-Schreibweg hinterlässt den Eintrag), `:72` (Suche durch die MCP-Tuer schreibt die Kette) |
| „A plain HTTP read leaves no chain entry" | `:62` (Leseweg ohne Eintrag) — dieselbe Datei, die den Unterschied erst erfunden hat |

Die Wache heißt `kette-deckt-nur-schreibwege` und trägt fünf Fälle; README:91 war seit P123 teilweise
bewaffnet, aber genau diese beiden Sätze nannten sie nicht.

### Die Zählung

Zensus 00:13:40 MEZ, Exit 0: 571 Einheiten, **172** absolute Behauptungen, **53** mit Messzeug = 30,8 %
(vorher 50 von 171 = 29,2 %), 119 ohne. Abschnittslesung 59 = 34,3 %. Schmale Klasse 31, davon 26 mit
Zeugen → **5 Arbeit**.

Der Nenner wächst weiter mit der Arbeit (171 → 172, Klasse 30 → 31), weil **meine Berichtigung selbst
ein absolutes Wort enthält** („never sits in a file"). Die Korrektur einer Über-behauptung schreibt die
nächste in dieselbe Zeile — der Zensus meldet das, statt es zu glätten. Anteil und Nenner stehen
darum immer zusammen; die Pinne hält 53 von 172, Kante > 0,30.

## 29. P141 — Der Regler, dessen sieben Stufen niemand zählte (7.11. 00:26 MEZ)

README.md:128 nannte sieben Zahlen — „the result slider runs 5 · 10 · 20 · 50 · 100 · 250 · **All**".
Die Gegenprobe in der Suite war leer: `grep -rln "RESULT_STOPS" tests/` meldete keine einzige Datei,
und der eine Regler-Fall (`tests/components/Dashboard.test.tsx:206`) prüfte `Number(regler.max) > 0`.
Das ist die Anwesenheit eines Reglers, nicht seine Skala. Ein Instrument, das sieben Stufen nicht von
vier unterscheidet, lässt die Doku grün, wenn die Hälfte der Stufen verschwindet.

**Erstes Instrument: `tests/lib/treffer-stufen.test.ts`, sieben Fälle.** `:47` zählt die Liste selbst
(fünf, zehn, zwanzig, fünfzig, hundert, zweihundertfünfzig, und die null als „alles"); `:56` hält jede
der sieben Werte gegen das Normalisieren; `:67` die Rundung nach oben (1→5, 6→10, 11→20, 21→50,
51→100, 101→250); `:76` die Richtung für alles, was keine Stufe ist — 251, 5000, −3, NaN, ±Infinity
fallen auf **fünf**, nie auf „alles". Die Richtung ist der Grund, dass der Fall existiert: eine Grenze,
die niemand gesetzt hat, darf nicht in „zeige alles" kippen. `:88` dreht den Speicher um (geschrieben
und gelesen ist dieselbe Stufe), `:98` fängt eine Zahl, die keine Stufe ist (eine 7 im localStorage
würde dem Regler den Boden unter den Füssen wegziehen: `indexOf` = −1, Etikett „5", Schnitt 7), `:110`
das Fenster-Event, mit dem die zweite Fläche nachzieht.

**Zweites Instrument: die Fläche gefahren.** `:206` ersetzt den kahlen Fall statt ihn zu duplizieren:
`fireEvent.change` auf jede der sieben Positionen, nach jeder Bewegung das Etikett gelesen — 5, 10,
20, 50, 100, 250, All — dazu min 0, max 6, step 1 und der Rückweg. `:234` ist neu und zeugt die
zweite Hälfte des Satzes: die Tür schickt drei Treffer und sagt total 7, der Streifen muss „3 of 7
hits" nennen (`src/components/Dashboard.tsx:1857`; der Defekt, gegen den das schreibt, steht im
Quelltext bei `:1805` — dort führte die Fläche zwei Zahlen für dieselbe Sache).

**Biss, beide Male an der Produktion, beide Male zurückgebaut.** Patch: `250` aus `RESULT_STOPS`.
Fenster 1,5 s, dann `cp` aus der eigenen Sicherung, `cmp` meldet bytegleich, `git diff` dazu leer.

| Lauf | Zeit | Ergebnis |
|---|---|---|
| lib-Datei, erste Fassung | 00:27:15 | 2 rot, 5 grün — **zu wenig** |
| lib-Datei, nach meinem Umbau | 00:27:40 | 3 rot, 4 grün (`:47`, `:56`, `:67`) |
| Flächen-Fall | 00:30:43 | 1 rot: `expected 5 to be 6` — der Regler verliert eine Position |

Der erste Bisslauf war der Fund, nicht das Ergebnis: `:56` hatte über `RESULT_STOPS` selbst
geschleift, und eine Schleife über die Liste, die sie prüft, kann ein entferntes Fach nicht vermissen.
Deshalb stehen die sieben Werte jetzt als Zahlen im Fall. Das ist die Lehre „Wache: ableiten statt
abschreiben" in der Gegenrichtung: **eine Wache darf ihre Grundgesamtheit nicht aus dem Prüfling
nehmen.**

**Die Zählung danach** — Zensus 00:31:24 MEZ, Exit 0: 572 Einheiten, **173** absolute Behauptungen,
**55** mit Messzeug = 31,8 % (vorher 53 von 172 = 30,8 %), 118 ohne. Abschnittslesung 59 = 34,1 %.
Schmale Klasse **32**, davon **27** mit Zeugen → **5 Arbeit**, unverändert; die fünf sind
wandgebunden (MDM/Enterprise, ein früherer Stand, Windows/Linux-Bau, ROADMAP asOf, zwei
Release-Notes-Sätze).

Der Nenner wuchs um eins, der Zähler um eins, und das ist die Berichtigung, nicht ein Nebenprodukt:
README.md:128 war **ein** Satz, der **zwei** Behauptungen trug — die Stufen des Reglers und die
Gesamtzahl der Treffer. Ein Zeuge, der eine davon stützt, darf nicht die ganze Zeile bedecken (das
war mein Fehler 27 in P135). Jetzt sind es zwei Sätze, und der erste nennt drei Messzeuge, der zweite
eines. Die hintere Hälfte war nicht widerlegt, aber **ungenau bezeichnet**: „the index says how many
notes match in total" schreibt dem Index eine Auskunft zu, die der Streifen über der Liste gibt
(`src/components/Dashboard.tsx:1857`), und was dort steht, ist ein Paar (gezeigt / insgesamt), nicht
eine Totalzahl. Die Fläche sagt „3 of 7 hits", und so steht es jetzt da.

## 30. P142 — „Every memory carries a validity window": zwei Drittel stimmen, eines nicht (7.11. 00:43 MEZ)

Der sechste Fund, dass eine nach außen getragene Behauptung **zu stark** war — nicht falsch im
Sinne von Lüge, sondern falsch im Sinne von „die Maschine sagt etwas anderes". README.md:86:

    Every memory carries a type, a validity window and a confidence score.

Die Ordnung (`src/core/store.ts:280-286`) hat für `type` und `confidence` ein `NOT NULL` mit
Default, für `valid_from` und `valid_to` **keins** — die Spalten sind nullbar, und der Schreibweg
(`:828`) schreibt ausdrücklich null, wenn niemand ein Fenster gesetzt hat. Was die Behauptung
tatsächlich deckt, ist eine Leseregel: `src/core/engine.ts:475` macht in der Zeitreise aus einem
fehlenden Anfang das Anlegedatum, `:477` lässt ein fehlendes Ende nie verjähren. „carries a
validity window" verkauft also eine Zeile, die kein Feld enthält, als ein Feld mit offener Flanke.

**Und die Suite hatte dazu nichts.** Kein Fall in `tests/` bewies die Klammer des Vertrauens, die
Typentscheidung im Schreibweg, oder was eine Zeitreise mit einem fehlenden Anfang tut. Neu:
`tests/core/notiz-drei-felder.test.ts`, sechs Fälle — `:53` Typ aus den Regeln (nicht
Spalten-Default), `:67` Vertrauen: ohne Angabe 1, außerhalb 0..1 zurückgeholt, `:75` die beiden
anderen Felder sind in jeder Zeile und das Fenster nicht, `:87` fehlender Anfang = Anlegedatum,
`:102` offenes Ende verjährt nie gegen ein gesetztes, das als abgelaufen gemeldet wird, `:121` die
Zeitreise blendet nach einem gesetzten Ende aus.

**Sechs Sonden, jede Datei danach bytegleich** (`cp` aus der eignen Sicherung, `cmp`,
`git status` leer):

| Sonde | Uhr | Rot |
|---|---|---|
| `clampConfidence` → `return 0.5` | 00:45:38 | 1 von 6 (Fall :67) |
| Regeltyp → `"semantic"` | 00:45:44 | 1 von 6 (Fall :53) |
| `?? r.createdAt` → `?? 0` (`engine.ts:475`) | 00:45:50 | 1 von 6 (Fall :87) |
| `expired` → `false` (`engine.ts:629`) | 00:46:02 | 1 von 6 (Fall :102) |
| Zeitreise-Ende → `if (false)` (`engine.ts:477`) | 00:46:02 | 1 von 6 (Fall :121) |
| `validFrom ?? null` → `?? 0` (Schreibweg) | 00:46:09 | 2 von 6 (Fälle :75, :87) |

**Nach außen** ist der Bullet jetzt drei Sätze, jeder mit eignem Zeugen; der mittlere ist die
Berichtigung („the row then holds null, and the reader decides"), der dritte nennt die beiden
Flächenzeichen (`tests/components/MemoryCard.test.tsx:47`, `:52`) und das Suchzeichen
(`tests/engine.test.ts:268`).

### Die Zählung

Zensus 00:47:11 MEZ, Exit 0: 573 Einheiten, **175** absolute Behauptungen, **58** mit Messzeug
= **33,1 %** (vorher 55 von 173 = 31,8 %), 117 ohne. Schmale Klasse **34**, davon **29** mit
Zeugen → **5 Arbeit**, unverändert.

Dabei ein Fund am Muster selbst, und meine erste Reparatur war falsch: die Zahlen-Einheitensuche
`\d[\d., ]*(%|ms|MiB|GiB|notes|queries|of|von)` begrenzt „of" nicht nach hinten, also zählt
mein eignes Zitat „…:268 off the search hit" als Zahlenbehauptung (Gegenprobe: „off" → „beside",
und der Satz ist nicht mehr absolut; gemessen 00:48:43). Die erste Annahme „`\b` hinter die ganze
Alternation" ist widerlegt: nachgezählt mit einer Vorsonde warft sie **8** Sätze aus dem Nenner
(175 → 167), davon **6** echte Prozentbehauptungen („97 % of lines", „100, 115 or 130 %",
„Hit@1 71 %"), weil `%` an einem Leerzeichen keine Wortgrenze findet. Der richtige Kandidat
begrenzt nur die Wörter (`of\b|von\b|ms\b|…`, `%` ohne Kante) und wirft genau einen Satz:
meinen. P143 fährt das als eigne Arbeit — gemeldet, nicht heimlich gezogen, weil die 175 sonst
eine Zahl enthielte, deren Grund ein Fehler im Muster ist.

## 31. P143 — Das „of" in „off" war eine Zahlen-Einheit: die Regel bekommt Wortgrenzen (7.11. 00:56 MEZ)

Der Zensus zählt absolute Behauptungen mit
`/…|(\d[\d., ]*(%|ms|MiB|GiB|notes|queries|of|von))/i`. Die Wort-Einheiten waren nach hinten
unbegrenzt, also traf „of" in „…:268 **of**f the search hit" und in „3 **of**fice links". Ein Satz
galt als Zahlenbehauptung, ohne eine zu enthalten — und der Satz war meiner aus P142.

**Die beiden Kandidaten, vor der Änderung gefahren** (`/tmp/p143-vorsonde.mjs`):

| Kandidat | Uhr | Nenner | Verworfen weil |
|---|---|---|---|
| A: ein nacktes `\b` hinter der ganzen Alternation | 00:49:15 | 175 → **167** (8 raus) | 6 davon echte Prozentangaben („97 % of lines", „100, 115 or 130 %", „Hit@1 71 %") — `%` findet vor einem Leerzeichen keine Wortgrenze |
| B: nur die Wörter begrenzt, `%` ohne Kante | 00:49:32 | 175 → **174** (1 raus) | — das ist der eine, und er ist meiner |

**Test zuerst.** Vier Fälle in `tests/aussendungs-riss.test.ts:143`, vor der Änderung gefahren:
00:56:05 **2 rot, 13 grün**. Der zweite rote war beim Schreiben des Tests gefunden, nicht geplant:
ich wollte eine Negativ-Kontrolle („3 office links") bauen und baute einen weiteren Treffer
derselben Art — die einzige Kontrolle, die den Fehler zeigt, ist die, die ihn selbst erwischt.
Positiv-Kontrollen bleiben grün: „175 of 573 sentences" und „58 of 175 claims" zählen weiter, denn
ein `of` als eignes Wort hinter einer Zahl ist genau die Behauptung, die der Zensus sucht.

**Die Änderung** ist eine Zeile in `docs/belege/aussendungsatz-0611/messregel.mjs`:
`(%|ms\b|MiB\b|GiB\b|notes\b|queries\b|of\b|von\b)` — Wörter mit Kante, Prozent ohne. Danach
15 von 15 grün (00:57:03).

### Die Zählung

Zensus 00:56:45 MEZ, Exit 0: 573 Einheiten, **174** absolute Behauptungen, **57** mit Messzeug
= **32,8 %** (vorher 58 von 175 = 33,1 %), 117 ohne. Schmale Klasse **34**, davon **29** mit
Zeugen → **5 Arbeit**, unverändert. Pinne 174 / 57, Kante > 0,30 (gemessen 0,3276).

Nenner −1, Zähler −1: der Satz, der fälschlich zählte, war bewaffnet. Eine Regel, die zu weit
greift, zeichnet die Quote schlechter, als sie ist — ihre Korrektur macht sie nicht besser, sie
macht sie wahr. Das ist die Richtung, die hier gemeldet werden muss, nicht eine Quote, die steigt.

## 32. P144 — „mere similarity dashed": der Strich war versprochen, aber keine Sonde las ihn (7.11. 01:10 MEZ)

README.md:17 trägt die Kantensprache in einem Satz: *real connections drawn solid, mere
similarity dashed*. Die einzige Sonde der Suite, die `setLineDash` las
(`tests/components/KnowledgeGraph.render.test.tsx:746`), las den abgelaufenen Notiz-Ring, nicht
eine Kante. Der Satz nannte also kein Messzeug, und die Produktion entschied an
`KnowledgeGraph.tsx:3807` (`!e.real` → Art `vermutung`) und `:3898-3903` (Dash-Muster nach Art).

### Was die Leinwand hergibt, und was nicht

Die Atrappe sammelt Aufrufe, keine Pixel. Ein `setLineDash` ohne folgenden `stroke()` malt
nichts, also zählt der neue Helfer den Zug, nicht den Setz-Aufruf. Vier Messungen haben den Test
umgebaut (je ein Scratch-Patch an `:3898-3903`, danach `cp` aus der eignen Sicherung, `cmp`
bytegleich):

- 01:12:57 — der ruhende letzte Rahmen enthält 0 `stroke`-Aufrufe: die Bildschleife malt nur,
  solange sich etwas bewegt (`:5058`). Wer hier nicht nachschösst, misst eine Schleife, die
  nichts mehr malt, und hält ein leeres Bild für eine Aussage (wieder 01:18:35 und 01:18:56).
- 01:17:09 — Vermutung ohne Strich gemalt → Fall 2 fällt. Der Fall hat Biss.
- 01:17:39 — **auch die echten Kanten mit Strich gemalt → beide Fälle bleiben grün.** Die
  echten Verbindungen liegen als gefüllte Bänder im Bild; ihr Strich-Zustand erreicht keinen
  `stroke()`-Aufruf. „solid" ist damit eine Aussage über das Bild, die diese Sonde nicht
  prüfen *kann*.

Der erste Ansatz wollte „solid" über die Akzent-Farbe messen und fiel viermal genau daran
(01:12:10, 01:14:04, 01:14:38, 01:16:57): für gefüllte Bänder setzt die Produktion nie
`strokeStyle`. Farbe ist hier kein Beweismittel. Also prüft der Fall die Kehrseite, die die
Leinwand wirklich hergibt — solange niemand Aehnlichkeiten ruft, trägt das Bild überhaupt
keinen Strich; und wenn sie gerufen werden, trägt jeder Strich dasselbe Muster — und der Test
sagt, dass er die eine Hälfte nicht prüft, statt zu tun, als täte er es.

Neu `tests/components/KnowledgeGraph.kanten-strich.test.tsx`, 2 Fälle, Biss: 01:19:58 Vermutung
ohne Strich → Fall 2 rot; 01:20:00 auch echte Kanten gestrichelt → Fall 1 rot; 01:19:47
ungepatcht 2 von 2 grün.

### Bewaffnung und Zählung

Der Satz nennt jetzt seine zwei Zeilen und was sie zählen (`:121` ohne Aehnlichkeits-Ruf,
`:132` mit einem). Zensus 01:24:50 MEZ, Exit 0: 573 Einheiten, **174** absolute Behauptungen,
**58** mit Messzeug = **33,3 %** (vorher 57 von 174 = 32,8 %), 116 ohne. Zweite Lesung
(Zeuge im selben Abschnitt) 60 von 174 = 34,5 %. Schmale Klasse unverändert **34**, davon
**29** mit Zeugen → **5** bleiben an der Wand. Pinne 174 / 58, Kante > 0,30 (gemessen 0,3333);
vor der Korrektur war der Pin-Fall rot, wie er sein musste (01:25:05: „erwartet war 57",
erhalten 58).

### Am ausgelieferten Stück

Kein ausgeliefertes Byte ändert sich, also keine Versionszahl und kein Bau (P141 bis P143 sind
derselbe Fall). Die Aussage, die der Satz neu beglaubigt, war aber schon in 3.2.190 ausgeliefert,
und das ist am Objekt nachgelesen, nicht am Quelltext — Grep durch den Bundle-Leib von
`/Applications/K3PTA.app/Contents/Resources/app.asar` (Stand 6.11. 18:16:38):

```
setLineDash(m==="abgelaufen"?[4/jt,3/jt]:m==="vermutung"?[3/jt,5/jt]:[])
```

### Zwei neue offene Punkte, aus diesem Schlag geboren

1. **„solid" bleibt ungeprüft.** Die eine Hälfte des Satzes hat keinen Zeugen, den diese
   Leinwand liefern kann. Prüfbar wäre sie erst mit einer Bildstraße (echter Viewport, Pixel).
2. **Ein Siegel, das niemand prüft.** `docs/belege/REGISTER.md` führt zu jedem Artefakt Bytes
   und sha256, und kein Leser kontrolliert sie: dieser Lauf schrieb die zwei Zensus-Artefakte um
   (01:24:50), die Registerzeilen blieben zehn Minuten alt, und `node scripts/zahlen-belege.mjs`
   meldete dazu grün (01:33:43) — die Wache öffnet jedes zitierte Artefakt und verlangt *die
   Zahl* dort, nicht das Siegel. Nachgezogen vor dem Commit; die Wache danach erneut grün
   (01:35:11). Und der Ausweis selbst, den ich damals hinschrieb, war kurz darauf wieder falsch:
   der nächste Zensuslauf 01:43:48 schrieb die Log-Datei um (nur die Zeitstempelzeile, Länge
   gleich 16 008 B), und das Siegel heißt seitdem `912200af764b0cab…`. Das ist P145.


## 33. P145 — Das Siegel des Beleg-Registers hatte keinen Prüfer (7.11. 01:39 MEZ)

`docs/belege/REGISTER.md` weist zu jedem Artefakt Bytes und sha256(16) aus. Kontrolliert wurde
keins von beiden: die Zahlen-Wache öffnet jedes zitierte Artefakt und verlangt die *Zahl* darin.
Sonde vor der Änderung (01:39:50 MEZ): **126** Siegel-Zeilen, **2** falsch —
`tag-0311/eval-bge-m3-1404.log.txt` (6144 B ausgewiesen, 6199 B auf der Platte) und
`tag-0311/sprachuebergriff-bge-m3-1406.log.txt` (2631 B gegen 2720 B), in beiden Fällen auch der
Hash, und die ausgewiesenen Hashes passen zu **keiner** Datei im Ordner.

Die Wurzel ist nicht Verfall, sondern Zeitpunkt: beide Dateien *und* beide Zeilen stammen aus
demselben Commit (`4895aa9`, 3.2.126, 3.11.). Der Ausweis wurde vor dem letzten Lauf des Zählers
geschrieben und danach nie nachgemessen — ein Artefakt bezeugt nur den Stand, den es selbst trägt.
Die Substanz war nie verloren: die Zahlen in diesen Artefakten prüft die Zahlen-Wache unabhängig,
und sie meldete auch vorher grün.

Neu `scripts/helfer/belege-siegel.mjs` (`siegelZeilen`, `siegelPruefen`) und
`tests/belege-siegel.test.ts` (6 Fälle). Die Regel wohnt an einem Ort, der Fall importiert sie —
P124 und P129: ein Fall, der die Regel nachbaut, wird bei jeder Änderung still grün.

    01:41:20  Modul fehlt            -> "no tests" (Fehler, kein Urteil)
    01:41:33  Rumpf meldet nur leer  -> 5 rot, 1 grün
    01:42:07  Regel steht            -> 2 rot: mein eigner Fixture und das echte Register (4 Befunde)
    01:42:57  Zeilen berichtigt      -> 6 von 6 grün

Der Biss läuft auf Kratzerschicht: der ganze Beleg-Ordner nach `/tmp/p145-belege-kopie` kopiert,
der Prüfer gegen die Kopie, das Register-Blatt wortgleich aus dem Repo gelesen (01:43:30).
Grundstand leer; ein angehängtes Byte meldet Größe *und* sha; ein Byte an Ort und Stelle gewechselt
(gleiche Länge) meldet **nur** sha; die Datei gelöscht meldet „fehlt auf der Platte"; Grundstand
danach wieder leer, und „Repo unangetastet: true" per Bytevergleich — kein git-Rückweg.

Der Prüfer biss noch am selben Abend an mir selbst: der Zensuslauf 01:43:48 schrieb die Log-Datei
um (nur die Zeitstempelzeile), 01:43:57 meldete der Fall den neuen gegen den ausgewiesenen Hash.
Seitdem steht im Register als Arbeitsfolge: **wer einen Zähler fährt, setzt in demselben Schritt
die Siegel-Zeile neu.**

Zahlen dieses Schlages: zwei Zeilen auf die gemessenen Bytes und Hashes gesetzt, Census
unverändert (01:43:48: 174 absolute, 58 mit Messzeug = 33,3 %, schmale Klasse 34), README-Zähler
3767 → **3773** (neue Fälle 6, Dateien 350 → 351), keine Versionszahl und kein Bau — Register und
Suite leben nicht im Bündel.

*Entschieden, weil:* `scripts/zahlen-belege.mjs` habe ich nicht angefasst, obwohl dort die Wache
wohnt — das Blatt ist byte-identisch zum Kern (`docs/belege/REGISTER.md:6`), und jede Änderung
daran zieht die Kern-Zwillinge nach, die seit W0-12K als eigene offene Liste laufen. Ein neuer
Prüfer gehört an einen eigenen Ort und in die Suite, die ohnehin jedes Gate fährt.

*Offen:* Das Register-Blatt ist kaputt gebaut. Ab Zeile 190 laufen Siegel-Zeilen (drei Zellen)
unter einer Ergebnistabelle mit vier Zellen weiter (Kopf bei `:186`), also in Markdown in
derselben Tabelle: ein Leser sieht Hashes als Trefferquoten. Der Prüfer liest deshalb nach Bauart,
nicht nach Überschrift — die Überschneidung ist geheilt, das Blatt nicht. Umbauen wären ~120
Zeilen, ein eigener Schlag.

## 34. P146 — Vier Sätze der schmalen Klasse bewaffnet, und der erste war eine falsche Zusage (7.11. 01:56 MEZ)

P145 hinterließ eine Liste: von 34 Sätzen, die ein Werkzeug widerlegen könnte, nennen 29 keins —
fünf. Fünf sind die teuerste Blindheit: eine Behauptung über eine Maschine, die niemand mit der
Maschine prüft.

**Der Fund beim Bewaffnen:** README.md:181 versprach, die Verwaltungsdatei trage die Lizenz
vor und sie werde "validated offline as always" weitergeprüft. Drei Griffe widerlegen das:
`grep -rln core/lizenz src/` ist **leer** (02:03:20 MEZ — kein Laufzeitpfad importiert das
Signaturmodul), `src/lib/richtlinien.ts:86` lässt genau drei Schlüssel durch, und der Kopf
desselben Blatts (`:10-13`) sagt seit dem 9.10., dass es kein Schlüsselsystem mehr gibt. Die
Zeugen dafür waren seit dem 9.10. im Baum (`tests/richtlinien.test.ts:106`, `:122`) — es fehlte
nur der Satz, der sie nannte. Berichtigt, nicht bewaffnet: eine Lizenzangabe in der Datei wird
ignoriert. Dasselbe Loch an der zweiten Stelle: `SECURITY-ENTERPRISE.md:61` sagte es für die
Beschaffungs-Doku.

**Nebeneffekt auf die Klasse:** Das Wort, das README.md:181 in die schmale Klasse hielt, war
"as always". Nach der Berichtigung verlässt er sie — 34 → **33**. Ein Satz kann eine Klasse
verlassen, ohne zu verschwinden.

**Neue Zeugen, die die Maschine fährt:** `tests/richtlinien.test.ts:197` ruft denselben Leser
dreimal mit `process.platform` als Setting (darwin, linux, win32) und verlangt in jedem Lauf
seinen eignen Zweig bis zur selben Datei; der Benutzerprofil-Pfad wird herausgehalten, sonst
wäre „mindestens ein Pfad" auch ohne jeden Zweig erfüllt. `:220` misst `PROGRAMDATA` und seinen
Default. Biss 01:57:49 MEZ: Linux-Zweig aus `src/lib/richtlinien.ts:52` entfernt → Fall rot
(„der Linux-Zweig fehlt"), zurück per `cp` aus `/tmp/p146-richtlinien-original.ts`, `cmp`
bytegleich. `tests/ci-publish.test.ts` (4 Fälle) liest `.github/workflows/build.yml`:
**drei** Builder-Aufrufe (`:111`, `:204`, `:310`), alle mit `--publish never`; sein Biss sitzt
im Blatt selbst (ein Aufruf ohne `never` und einer mit `always` müssen als Veröffentlichung
gelten, derselbe Text mit `never` gilt als sauber), und ein Fall hält die deutschsprachigen
Release-Notes an ihre eigne Nennung von `release-windows` (`:284`) und `release-linux` (`:173`).

**Die Schlüssel-Zeile zweisprachig.** `.github/release-notes.md:12` und `:75` nennen jetzt
`tests/keine-grenzen.test.ts:102` (die Lizenz-Route antwortet weder lesend noch schreibend) und
`:116` (keine Fläche ruft sie).

**Zählung.** Zensus 02:00:59 MEZ, Exit 0: 573 Einheiten, 174 absolute, **62 mit Messzeug =
35,6 %** (vorher 58 von 174 = 32,8 %), **112** ohne; zweite Lesung 67 von 174 = 38,5 %; schmale
Klasse 33, davon 32 mit Zeugen → **1** bleibt. Pinne 174 / 62, Kante > 0,30 (gemessen 0,3563);
vorher rot, wie es sein musste (02:01:47: „erwartet war 58", erhalten 62). README-Zähler
3773 → **3779**, Dateien 351 → 352. Keine Versionszahl, kein Bau.

**Und P145 hielt, was es versprach:** nach der Zählung 02:00:59 waren die Siegel-Zeilen der
beiden Zensus-Artefakte abermals zu alt (30 586 B / 15 870 B auf der Platte gegen 31 388 B /
16 008 B ausgewiesen — die unbewaffnete Liste ist um vier Zeilen kürzer), und
`tests/belege-siegel.test.ts:112` meldete es 02:02:21 MEZ, bevor irgendwer danach suchte.

**Offen:** README.md:357 bleibt der letzte Satz der schmalen Klasse — eine Aussage über die Zeit
vor 3.1.5, deren Zeuge kein Test ist, sondern ein Beleg aus der Historie (in diesem Repo gibt es
keine v3.1.x-Tags, 0 Treffer, gemessen 02:04:32 MEZ). Und der Linux-Pfad streitet mit seinem
eignen Kommentar: `src/lib/richtlinien.ts:4` verspricht `/etc/kepta/…`, der Code liefert
`/etc/KEPTA/…`; der neue Fall hält den Code fest, nicht den Kommentar — die Heilung ist eine
Zeile, braucht aber einen Bau.

## 35. P147 — Der letzte Satz der schmalen Klasse: ein Zeuge aus der Historie (7.11. 02:10 MEZ)

README.md:357 sprach über die Zeit vor 3.1.5 — „it was counting, and counting needed places to
hide the tally". Ein Test auf dem heutigen Baum kann das nicht prüfen; der einzige zulässige Zeuge
ist der Quelltext von damals. `git tag | grep -cE '^v?3\.1\.[0-9]'` = **0** (02:04:32 MEZ), also
führt der Weg über Commits: gelesener Stand ist `113093c`, der Eltern-Commit von `c7cde55`
(09.10.2026 01:41, „3.1.5: die app zählt nicht mehr — kein schlüssel, keine grenzen, kein
upgrade-panel").

`node docs/belege/p147-0711/zeugen.mjs` schreibt `zaehler-vor-3-1-5.log.txt` (4 963 B,
sha256(16) `6d04606d49ac2e28…`) und zeigt die drei Verstecke mit Blob-Zeilen — in der von P154
verlangten Form `Commit:Datei:Zeile`, damit der Leser sie öffnen kann: AES-256-GCM-Blob in
den Einstellungen (`113093c:server/helfer/planzustand.ts:101`, `:133`, `:165`), der
Schlüsselbund-Anker `app.kepta.plan` mit den Konten `kepta` und `probetag`
(`113093c:server/helfer/planzustand.ts:32-33`), sein Lesen und Schreiben im macOS-Bund
(`113093c:server/helfer/plan-schluesselbund.ts:38`, `:48`) und im Linux-Bund (`:68`, `:79`), und die
`trial-anchor`-Datei in einem Benutzerordner, den der Finder ausblendet
(`113093c:server/helfer/planzustand.ts:183-185`, geschrieben mit Flag `wx`, `:218`).
Dasselbe Blatt nennt die neun Dateien, die `c7cde55` löschte, sortiert nach Größe (376 Zeilen
`planzustand.ts` bis 31 Zeilen `probetag.ts`).

Der Satz heißt jetzt schärfer und nennt den Beleg im selben Satz: *an AES-256-GCM blob in the
store's settings, two keychain entries under `app.kepta.plan`, and a `trial-anchor` file in a
per-user directory that the finder hides … in `docs/belege/p147-0711/zaehler-vor-3-1-5.log.txt`.*

**Zählung.** Zensus 02:13:17 MEZ, Exit 0: 573 Einheiten, 174 absolute, **63** mit Messzeug =
**36,2 %** (vorher 174/62 = 35,6 %), **111** ohne; zweite Lesung 67 von 174. Schmale Klasse **33**,
davon **33 mit Zeugen → null.** Das ist der Punkt, an dem die Klasse, in der ein Werkzeug die
Behauptung widerlegen könnte, zum ersten Mal vollständig beglaubigt ist (P122 zählte sie am 13.10.
mit 30 von 129 ohne Zeugen). Pinne 174/63 und Siegel-Grundgesamtheit 126 → **128**; beide waren
erst rot, wie sie sein mussten (02:14:13 MEZ), dann grün (02:14:30, 21 von 21).

Keine neuen Fälle, also bleibt der README-Zähler bei **3779** und die Dateizahl bei 352 —
bestätigt vom Lauf, nicht gefühlt: Messung 02:15:58→02:18:30 (3779 ausgeführt, 1 rot mit Namen: der
Bericht war älter als `tests/`, Exit 1), Prüfung 02:19:00→02:21:30 = **3779 von 3779 grün, 352
Dateien, Exit 0**, doku-check beglaubigt Stand 2026-11-07 01:21:29 UTC. Lint 0 Fehler (02:22:13),
Zahlen-Belege Exit 0 (953 Messbehauptungen). Keine Versionszahl, kein Bau.

*Offen und benannt:* Der Beleg ist der erste, der absichtlich nicht byte-stabil ist (Zeile 1 nennt
die Uhrzeit des Zuges), also gilt „wer einen Zähler fährt, setzt die Siegel-Zeile neu" jetzt auch
für `docs/belege/p147-0711/`. Und 111 absolute Behauptungen nennen weiterhin kein Messzeug; welche
davon als nächste dran sind, wird in P148 zuerst gezählt, nicht vermutet.


## 36. P148 — Zahl ohne Nenner: eine Sonde, drei Funde, zwei berichtigt (7.11. 02:24 MEZ)

P147 ließ 111 absolute Behauptungen ohne Messzeug. Die naive Fortsetzung („dann bewaffne eben
fünf") wirft eine Frage vorher auf: *welche tragen eine Zahl, deren Nenner in einem andern Blatt
steht?* Eine Prozentzahl ohne Grundgesamtheit ist kein Messzeug, auch wenn sie eines nennt.

Sonde (Wegwerf, `/tmp/p148-sonde.mjs`, 02:25:00 MEZ) über `ohne_zeug` des Zensus-JSON:
**222** Einheiten (zwei Lesungen über 111 Sätze), davon **38** mit einer Zahl, und **3** führen
einen Bruch oder ein Prozent ohne Nenner-Kuelsenwort im selben Satz.

| Fund | Urteil |
|---|---|
| README.md:231 „Text size — 100, 115 or 130 %" | **schon ausgenommen, im Satz selbst** („not a measurement") — die Sonde flaggt trotzdem: ihr Raster kennt die Ausnahmedeklaration nicht. Kein Befund, ein Regel-Fehler |
| README.md:230 „which part it is … a label like `2/5`" | **UI-Beispielzahl, nicht verständlich gemacht** — berichtigt zu „a label like `2/5`, where the 5 is the number of parts that one file was split into, not a share of the store" |
| README.md:458 „The status panel quotes the 71 %" | **die eigentliche Lücke** — 71 % ohne Maß und Grundgesamtheit im selben Satz. Jetzt: „Hit@1, 41 of the 45 queries of that corpus, drawn in `docs/belege/tag-13-10/ablation-beine-1144.log.txt:10`" |

Die 71 % sind am Artefakt nachgelesen, nicht aus dem README zitiert (`grep`, 02:26:17 MEZ):
`BM25 allein 71 % 21 % 0.76 41/45` und `Alle drei (RRF) 76 % … 45/45`. Zwei Zeilen führen 71 %
(`BM25 allein` und `BM25 + Graph`) — deshalb nennt der README jetzt die Zeile `:10`, nicht nur die
Datei. Und `41/45` ist zugleich der Beweis für „leaves four unanswered".

**Warum die Regel nicht in den Census einzieht.** Ein dritter Reading hätte einen von drei Funden
aus einer Textstelle geholt, die sich selbst ausnimmt: eine Regel, die mehr Lügen malt, als sie
findet. Dieselbe Lehre wie P143 (ein Muster, das die Welt nicht so schreibt, wie man es denkt) und
P138 (eine Liste blinder Sätze ist keine Liste falscher Sätze). Bleibt sie ein Werkzeug für diesen
Schlag, dann gehört ihr eine Ausnahme, die *pro Satz* gepflegt wird — nicht ein Kuelsenwort-Raster.

**Zählung danach.** Zensus 02:26:48 MEZ, Exit 0: 174 absolute, **64 mit Messzeug = 36,8 %**
(vorher 63 von 174 = 36,2 %), **110** ohne; schmale Klasse unverändert 33, davon 33 mit Zeugen.
Pinne 174/64, Kante > 0,30 (gemessen 0,3678). Beide Guards erst rot (02:26:58: „erwartet war 63",
erhalten 64; und vier Siegel-Befunde, weil der neue Zensuslauf beide Artefakte umschrieb —
30 378 B / 16 036 B, `2540a646de1b76e4…` und `fb8f905cd1bbd6aa…`), nach dem Nachziehen 21 von 21
grün (02:27 MEZ). Keine neuen Fälle: README bleibt 3779, Dateien 352.


## 37. P149 — Die Messstelle nennt ihre Verteilung, und drei Faelle halten sie (7.11. 02:36 MEZ)

README.md:458 beschreibt `npm run eval` mit drei Zahlen — „58 notes, 45 queries, five
categories". Kein Fall sah den Korpus, also konnte jede kuenftige Aenderung an
`scripts/eval-corpus.ts` die README-Zahl still luegen machen.

**Zuerst gemessen** (tsx-Sonde, 02:36:46 und 02:37:05 MEZ): 58 Notizen, eindeutige ids, 45
Anfragen, fuenf Kategorien, Verteilung `lexikalisch=25, umschreibung=10, ablenkung=4, graph=3,
temporal=3`, 56 relevante Zeiger, **0** ins Leere. Der Satz stimmt. Was er verschweigt, ist die
Duennheit: **von 45 Anfragen pruefen drei den Graphen und drei die Gueltigkeit** — genau die zwei
Faehigkeiten, die unsre Verkauftszeile am lautesten nennt.

**Neu** `tests/eval-korpus.test.ts` (3 Faelle): die Zaehlungen und die Zeiger-Intigritaet (`:15`),
die Verteilung mit ihrer Summenkontrolle (`:27`), und die Duennheitsschwelle samt der
Kategorie-Namen selbst (`:44`). Der erste Anlauf war gruen (02:37:44) — der Satz stimmte ja, also
beweist gruene ohne Biss nichts. Drei Bisse an der Produktion (`cp` nach
`/tmp/p149-korpus-original.ts`, zurueck per `cp`, `cmp` bytegleich, `git status` meldet die Datei
unangetastet):

    Biss A  eine lexikalische Anfrage entfernt  -> 2 rot (44 gegen 45; Verteilung 24 statt 25)
    Biss B  eine temporal-Anfrage umgetauft     -> 2 rot (Verteilung; „temporal traegt nur 2")
    Biss C  ein Zeiger auf m990                 -> 1 rot („Anfragen zeigen auf Notizen, die es nicht gibt: m990")

Biss B ist der lehrreichste: die *Summenkontrolle bleibt gruen*, weil 44 + 1 = 45. Eine Umbenennung
aendert die Summe nicht — deshalb prueft Fall 3 die Namen und die Schwelle, nicht nur die Zahl.

**Der Satz nennt jetzt, was er meint:** „58 notes, 45 queries and five categories — a split of 25
lexical, 10 paraphrase, 4 distractor, 3 graph and 3 temporal, held by
`tests/eval-korpus.test.ts:15` and `:27` — in three legs …".

**Zaehlung.** Zensus 02:38:57 MEZ, Exit 0: 573 Einheiten, 174 absolute, **65 mit Messzeug =
37,4 %** (174/64 vorher), **109** ohne; schmale Klasse unveraendert 33 mit 33 Zeugen. Pinne
174/65, Kante > 0,30 (gemessen 0,3736); Guard erst rot (02:39:06), Siegel meldete drei Befunde
(der JSON mit Groesse und Hash, die Log nur mit Hash — die Liste der unbewaffneten Saetze wurde um
einen kuerzer, ihre Zeilenzahl blieb 16 036 B). Nach dem Nachziehen 24 von 24 gruen (02:39:27).
README-Zaehler 3779 → **3782**, Dateien 352 → 353.

**Der Produktbefund hinter der Doku-Arbeit:** unsre Gueltigkeits- und Graph-Faehigkeit haengt an
sechs von 45 Anfragen. Mehr Anfragen in diesen beiden Kategorien ist ein Korpus-Wechsel, der jede
Vergleichszahl neu gelten macht (58/45, die 76 %, die mem0- und chroma-Laeufe) — ein eigner Schlag
mit eigenem Lauf, nicht eine Zahl, die man nachstellt.


## 38. P150 — Das Blatt, das seinen Lesern Hashes als Trefferquoten zeigte, hat jetzt eine Kopfzeile und zwei Wachen (7.11. 02:59 MEZ)

**Die Frage vor der Arbeit.** P145 meldete den Defekt und lies ihn offen: `docs/belege/REGISTER.md`
wies zu 128 Artefakten Bytes und sha256(16) aus, aber die letzten 83 dieser Zeilen standen ohne
eigne Kopfzeile direkt unter einer Ergebnistabelle mit vier Zellen (Sprachuebergriff-Lauf,
Kopf bei Zeile 190). In Markdown ist das **dieselbe Tabelle** — ein Kunde, der das Siegel-Blatt
oeffnet, sieht in einer Spalte, deren Kopf „englisch Hit@1" heisst, einen Hash stehen. P145 heilte
die *Ueberschneidung im Pruefer* (Lesart nach BAUART), nicht das Blatt.

**Zuerst gemessen, was das Blatt wirklich hergibt** (node auf den Helfer, 02:57:57 MEZ): 128
Siegel-Zeilen in **zwei** Bloecken — Block 1 ab Zeile 40 unter seinem Kopf (Zeile 38), Block 2 ab
Zeile 194 ohne Kopf. Der Fliesstext des Blatts an Zeile 12 nannte dem Leser damals **126**
Siegel-Zeilen: die Zahl stammte aus P145s erstem Lauf (01:39:50) und wurde von P147 nie nachgezogen,
nachdem der Historien-Beleg und sein Generierer einzogen. Ein Blatt, das sich selbst beziffert, ist
genau so vertrauenswuerdig wie seine letzte Zaehlung.

**Zwei Wachen, test-first, beide erst rot gesehen.**
1. `tests/belege-siegel.test.ts:121` — *der Satz, der auf den Pruefer verweist, nennt die gemessene
   Grundgesamtheit*. Rot um 02:56:59: „das Blatt schreibt 126 Siegel-Zeilen, der Lauf haelt 128".
   Berichtigt im Blatt: „Grundgesamtheit: 128 Siegel-Zeilen, gemessen 02:57:57 MEZ von demselben
   Fall; zuvor 126 um 01:39:50". Die fruehere Zaehlung bleibt stehen, mit ihrem Moment — was neu
   ist, ist dass die **operative** Zahl jetzt an einer Maschine haengt statt an meiner Erinnerung.
2. `blockKopfFunde()` im Helfer, gefaehrt von `tests/belege-siegel.test.ts:137` (nachgebaute
   Ueberschneidung), `:152` (saubere Bloecke), `:165` (am echten Blatt) und `:170` (Block hinter
   Fliesstext, ohne jeden Kopf). Rot um 02:56:59 mit der stub-Regel („Ueberschneidung blieb
   ungemeldet"), nach der Implementierung rot am echten Blatt: „Zeile 194: Siegelblock beginnt
   unter Zeile 190: Kopf bei Zeile 190 mit 4 Zellen". Der Befund ist damit nicht nur gemeldet,
   sondern **benannt** — Zeile, Kopf, Zellzahl.

**Die Heilung des Blatts.** Vor die Siegel-Zeilen ab Zeile 194 gesetzt: ein Absatz, der sagt, dass
diese Liste die Fortsetzung des Siegels von oben ist und **nicht** Teil der Tabelle darueber, dazu
ihr eigner dreizelliger Kopf und die Trennzeile. Damit steht jeder der zwei Bloecke unter seinem
Kopf, `blockKopfFunde` meldet nichts mehr, und die 128 Zeilen sind unveraendert viele (ein Kopf ist
kein Siegel — die Form-Lesart des Helfers laesst ihn fallen, was `:99` seit P145 haelt).

**Fuenf Bisse an der Produktion, nicht am Fixture** (cp nach /tmp/p150-biss, patchen, rot sehen,
zurueck-cp, cmp bytegleich):

    A   fremde Tabelle nur bei 4 Zellen erkannt   -> 1 rot: der Befund fiel in die falsche Meldung („unter Fliesstext")
    A2  blockKopfFunde ganz abgeschaltet           -> 1 rot: „Ueberschneidung blieb ungemeldet: []"
    C   das Blatt schreibt 127                     -> 1 rot: „expected 127 to be 128"
    D   ein dreizelliger Kopf gilt nicht als Kopf  -> 2 rot: die sauberen Bloecke MELDEN etwas
    E   der Kopf-lose Block wird nicht gemeldet    -> 1 rot: „Block ohne Kopf blieb ungemeldet"

Biss A war kein Biss im geplanten Sinn: die Regel meldete weiter, nur mit einer **falschen
Begruendung** — „direkt unter Fliesstext", waehrend der Vorgaenger eine Tabellenzeile war. Das ist
ein Befund ueber meine Meldung, nicht ueber meine Sonde, also zwei Aenderungen: der Fall `:170`
(Kopf-lose Liste hinter Prosa) und eine Meldung, die ihren Vorgaenger benennt (Tabellenzeile mit N
Zellen oder Fliesstext). Ohne Biss A haette ich diese Luecke nicht gefunden — ein Biss, der etwas
anderes bricht als erwartet, ist auch eine Auskunft.

**Zaehlung und Laeufe.** Neue Faelle 5 (6 → 11 im Blatt, 3782 → **3787** ausgefuehrt), Dateien
353 unveraendert (der Helfer lebt in `scripts/`, keine neue Testdatei). Messung 03:01:20→03:03:50:
genau ein rot, mit Namen — `tests/doku-zahlen.test.ts:52`, „Bericht 01:45:01 UTC, tests/belege-
siegel.test.ts 02:00:17 UTC", Exit 1. Pruefung 03:04:26→03:06:56: **3787 von 3787 gruen, 353
Testdateien, Exit 0**, doku-check beglaubigt ebendiesen Lauf. Lint 0 Fehler, 82 Warnungen
(03:07:07). Zahlen-Belege Exit 0: 22 Markdown-Dateien, 965 Messbehauptungen, keine Pflicht-Zahl ohne
Zitat.

**Zensus 03:07:45 MEZ, Exit 0:** 573 Einheiten, 174 absolute, 65 mit Messzeug = 37,4 %, 109 ohne,
33 maschinell widerlegbar mit 33 Zeugen — unveraendert seit P149, weil dieser Schlag keine
Aussendung-Zahl bewegt. Der Lauf schrieb `zaehlung-0611.log.txt` um (16 036 B, sha
`6369c24f5cb0dbf7`), die JSON blieb bytegleich (30 131 B, sha `a1e3428d77ab9bcd`). Die Siegel-Zeile des Logs
stand noch auf `fcd9223a74e88cfe` — der **fünfte** Riss dieser Nacht, diesmal von mir vor dem Guard
gesehen und im selben Schritt nachgezogen; die Regel „wer einen Zaehler faehrt, setzt in demselben
Schritt die Siegel-Zeile neu" ist damit erstmals vor dem Befund angewandt, nicht nach ihm.


## 39. P151 — Erst die Klassen gezählt, dann drei Sätze bewaffnet: 68 von 174 (39,1 %), und die Klientenliste ist jetzt eine Parität zwischen Papier und Code (7.11. 03:14 MEZ)

**Die Frage vor der Arbeit.** P150 hinterließ **109** absolute Behauptungen ohne Messzeug. Die alte
Fehlpraxis war: sechs davon aussuchen und bewaffnen. Diesmal zuerst die Frage, welche dieser 109
überhaupt eine Maschine betreffen — ein Satz über eine UI-Emotion ist mit keinem Test der Welt zu
halten, und ihn zu „bewaffnen" hieße, eine Reimwort-Kette als Beweis zu verkaufen.

**Was die Maschine wirklich meldet** (Zensus-JSON, Felder `pruefbar_liste` und `ohne_zeug`,
03:26:40 MEZ): von den **33** Sätzen, die ein Werkzeug widerlegen könnte, stehen **0** in der Liste
ohne Messzeug. Die schmale Klasse ist seit P147 leer — „bewaffne die maschinellen" ist erledigt, es
bleibt die weite Klasse. Also Zweitmessung, und dabei ein Befund, den niemand suchte: **29 der 109
nennen ihr Messzeug wohl, aber im falschen Satz** — im *gleichen* Absatz, in einem anderen Satz. Die
Regel des Zensus liest pro Satz (seit P122 mit Grund), das Blatt schreibt pro Absatz. Ein Kunde, der
den ersten Satz liest, sieht eine Behauptung ohne Beleg; der Beleg steht zwei Sätze weiter, ohne
Bindestrich zur Behauptung.

**Die drei bewaffneten Sätze, alle aus dieser Klasse:**

- README.md:177, erster Satz — „K3PTA finds the AI apps already installed (Claude Desktop, Claude
  Code, Cursor, Windsurf, VS Code, Gemini CLI, Cline, Roo Code)". Nichts hielt diese Acht-Namen-Liste.
- README.md:177, zweiter Satz — „Zed, Codex CLI, Continue and every other MCP client get the exact
  snippet to paste".
- README.md:355 — „Every tool in the app runs without bound: chat, clipper, machine scan, dossiers,
  briefings, audit, Device Sync, all eight MCP tools". Die Acht war behauptet, nicht gezählt.

**Neue Fälle, und ihr Rot war ein Rot der andern Art.** `tests/lib/einrichtung.test.ts:140`
(Zwölf Klienten, id für id und name für name), `:159` (die vier Schnipsel-Klienten bieten nie einen
Klick an, die acht andern haben eine Zieldatei) und `:169` (*liest README.md:177 und gleicht die
Namen in beide Richtungen ab*). Diese drei Fälle waren im ersten Anlauf **grün** — sie prüfen ja
eine bestehende Wahrheit. Grün ohne Biss ist kein Beweis, also drei Bisse an der Produktion
(`cp` nach `/tmp/p150-biss/`, patchen, rot, `cp` zurück, `cmp` bytegleich):

    B1  Maschine nennt "Roo Code" nur noch "Roo"        -> 2 rot: Namensliste und „README nennt Roo Code, die Maschine kennt es nicht"
    B2  Zed bietet plötzlich einen Klick an             -> 2 rot: „Zed bietet einen Klick an, obwohl es nur einen Schnipsel hat"
    B3  das Blatt nennt eine neunte App (Perplexity)    -> 1 rot: „das Blatt nennt 9 Apps, versprochen waren acht"

B3 ist der Fall, um dessentwillen dieser Schlag geschrieben wurde: **eine Lüge im Papier allein**
macht die Suite rot. Vorher konnte `src/lib/einrichtung.ts` einen Klienten verlieren oder gewinnen
und README.md:177 blieb unbewacht stehen.

**Zensus, Pinne, Siegel.** Zensus 03:19:28 MEZ, Exit 0: 573 Einheiten, 174 absolute, **68** mit
Messzeug = **39,1 %** (vorher 65 = 37,4 %), **106** ohne; die schmale Klasse unverändert 33 mit 33
Zeugen. Pin `tests/aussendungs-riss.test.ts:132` erst rot gesehen (03:19:57: „68 von 174 nennen ein
Messzeug — erwartet war 65"), dann nachgezogen. Der Lauf schrieb **beide** Artefakte neu und
kleiner: JSON 30 131 → 29 550 B (sha `68ddf1c2b0b5d5f1`), Log 16 036 → 15 992 B (sha
`0297efe63877d5db`) — die Siegel-Zeilen im selben Schritt gesetzt, zum sechsten Mal in dieser Nacht
und zum zweiten Mal, bevor der Guard rief.

**Zwei Läufe.** Messung 03:20:46 → 03:23:16: 3790 ausgeführt, 353 Dateien, genau ein rot mit Namen
(`tests/doku-zahlen.test.ts:52`, „Bericht 02:06:56 UTC, tests/aussendungs-riss.test.ts 02:20:09
UTC"), Exit 1. Prüfung 03:23:22 → 03:25:51 = **3790 von 3790 grün, 353 Dateien, Exit 0**, doku-check
beglaubigt ebendiesen Lauf. README-Zähler an drei Trägern 3787 → **3790**. Lint 0 Fehler, 82
Warnungen. Zahlen-Belege Exit 0: 970 Messbehauptungen im Endstand dieses Schlages
(der Lauf von 03:26:17 MEZ meldete 967 und zog nach, als dieses Blatt selbst Zahlen schrieb).

**Keine Versionszahl, kein Bau:** an ausgelieferten Bytes ändert dieser Schlag nichts; die Parität
lebt in der Suite, nicht im Bündel.

## 40. P152 — "One brain for every AI tool" war eine Behauptung über zwei Türen, die keine Maschine zusammen sah (7.11. 03:34 MEZ)

**Die Frage vor der Arbeit.** P151 ließ 106 Sätze ohne Messzeug und einen Hinweis zurück: README.md:85
verspricht mehr als eine Route — *"anything that speaks MCP shares the same encrypted knowledge base,
plus anything that only speaks HTTP through the REST API. What one assistant learns, the next already
knows."* Ich suchte den Zeugen und fand **keinen für die Datenseite**: die Suite hatte
`tests/mcp-behauptungen.test.ts:193` (dieselbe Absage an beiden Türen — ein Vertrag) und `:175` (die
HTTP-Agententür `/api/mcp/save` mit einer Liste danach), aber niemand hatte je eine Notiz durch die
eine Tür hineingeschickt und durch die andere **gefunden**. Der Verkaufssatz und die Maschine hatten
sich nie berührt.

**Beweis vor Behauptung.** Neu `tests/mcp-rest-paritaet.test.ts`, vier Fälle an **einem** Store, zwei
Türen:
- `:66` — `memory_save` durch MCP, danach HTTP-Liste und HTTP-Suche: beide müssen die Notiz zeigen.
- `:80` — `POST /api/memories` durch REST, danach `memory_search`: der Agent muss sie finden.
- `:93` — Kontrolle: ein **zweiter, getrennter** Bestand darf die Notiz *nicht* zeigen.
- `:116` — Kontrolle der Kontrolle: zwei Stores auf **demselben Pfad** müssen sie zeigen.

Der vierte Fall ist kein Schmuck. Ohne ihn wäre `:93` ein Blindgang: "nicht enthalten" bleibt auch
dann true, wenn das Lesen aus einem ganz andern Grund nichts zurückgibt (Route tot, Filter zu eng,
Titel vertippt). Erst `:116` macht die Negativprobe zur Aussage.

Die drei Fälle waren im ersten Anlauf grün (03:34:35 MEZ, 3 von 3; nach dem vierten 4 von 4) — sie
prüfen bestehende Wahrheit. Also ein Biss an der Produktion (`cp` nach /tmp/p150-biss, patchen, rot,
zurück-cp, `cmp` bytegleich):

    Biss A  createApp ignores the handed store and opens its own second DB
            -> 3 rot: "die Agenten-Notiz fehlt in der HTTP-Liste",
               "der Agent sieht die REST-Notiz nicht",
               "zwei Stores auf demselben Pfad sehen sich nicht — dann verliert der
                Negativ-Fall seine Beweiskraft"
            (der Kontrollfall :93 bleibt grün — er behauptet ja die Trennung)

Der dritte rote Fall ist die teeth-Demonstration für `:93`: genau der Fall, der die Negativprobe
absichert, fällt, wenn das Lesen vom gereichten Leib abgekoppelt wird.

**Satz und Zensus.** README.md:85 nennt jetzt in *einem* Satz beide Richtungen und beide Kontrollen
(`:66`, `:80`, `:93`, `:116`) und — weil der Satz "encrypted" sagt, meine Fälle aber mit
`KEPTA_ENCRYPTION=off` fahren — die Verschluesselungs-Hälfte ist sauber getrennt bezeugt:
`tests/nebendateien.test.ts:22` (kein Klartext auf der Platte) und `:41` (falscher Schlüssel liest
nichts, Manipulation fliegt auf). Das ist die Unterscheidung, die P142 und P134 lehrten: ein Wort wie
"encrypted" darf nicht an einem Fall hängen, der die Verschlüsselung abschaltet.

Zensus 03:36:00 MEZ, Exit 0: **574** Einheiten (573 -> 574, der umgebaute Satz wurde beim Umbau
zwei), 174 absolute, **69** mit Messzeug = **39,7 %** (vorher 68 = 39,1 %), **105** ohne; schmale
Klasse unverändert 33 mit 33 Zeugen (nachgemessen: 0 maschinell Widerlegbare stehen ohne Zeugen).
Pin `tests/aussendungs-riss.test.ts:132` erst rot (03:36:11: "69 von 174 — erwartet war 68"), dann
nachgezogen. Beide Artefakte kleiner: JSON 29 550 → 29 325 B (sha `e220d07e31057498`), Log 15 992 →
15 967 B (sha `02d44f8e3f8ef82c`); Siegel-Zeilen im selben Schritt — siebter Zahlen-Lauf der Nacht,
dritter ohne Guard-Ruf.

**Zwei Läufe.** Messung 03:37:06 → 03:39:35: ein rot mit Namen (`tests/doku-zahlen.test.ts:52`,
Bericht älter als `tests/`), Exit 1. Prüfung 03:39:41 → 03:42:04 = **3794 von 3794 grün, 354
Testdateien, Exit 0** (353 → 354, eine neue Datei), doku-check beglaubigt diesen Lauf
(02:42:03 UTC). Lint 03:42:33: 0 Fehler. Zahlen-Belege Exit 0: 970 Messbehauptungen. README-Zähler
3790 → **3794**.

**Keine Versionszahl, kein Bau:** an ausgelieferten Bytes ändert dieser Schlag nichts; die Parität
lebt in der Suite.

## 41. P153 — "no cap on the endpoints" war falsch: die App deckelt chat bei 20/min, clipper bei 12/min, Suche bei 240/min, Schreiben bei 600/min (7.11. 03:48 MEZ)

**Die Frage vor der Arbeit.** P152 ließ 105 absolute Behauptungen ohne Messzeug und eine Liste von 26,
deren Zeuge im *Nachbar*-Satz steht. Die ersten zwei Treffer dieser Liste waren Sätze, die ich selbst
in P151 bewaffnet hatte — README.md:355 und `.github/release-notes.md:12/:75`. Beim Nachlesen der
Nachbarn fiel etwas anderes auf: diese Sätze sind **als Aussage falsch**.

**Der Befund, gemessen am Quelltext** (`server/helfer/limiter.ts:56-68`, 03:46:41 MEZ): die App hat
Schutzkanten, und sie sind klein genug, dass ein Kunde sie spürt — `chat` max **20/min**, `clip` max
**12/min**, `SCHREIB_KANTE` **600/min**, `SUCH_KAPPE` **240/min**, `DATEN_KANTE` **600/min** global vor
`/api` und `/mcp`. Der Satz in der Aussendung hieß bis heute:

    74f2269:README.md:355                   "Every tool in the app runs without bound — chat, clipper, …"
    74f2269:.github/release-notes.md:12 (EN) "nothing in it is metered: no day count, no cap on the endpoints, …"
    74f2269:.github/release-notes.md:75 (DE) "nichts darin ist begrenzt: kein Tageszähler, keine Kappe an den Endpunkten, …"

"keine Kappe an den Endpunkten" ist widerlegt durch einen Endpunkt, der bei 20/min mit 429 antwortet.
Das ist genau die Klasse, die P134 und P142 als die teurere ausgewiesen haben: nicht ein Satz ohne
Beleg, sondern ein Satz, dessen Beleg eine Lüge ist — und P151 hatte ihn sogar bewaffnet, ohne ihn zu
prüfen. **Mein eigener Arm von vor einer Stunde saß auf einer Ueber-behauptung.**

**Guard zuerst, rot gesehen** (03:48:32 MEZ, vier rote Faelle in `tests/keine-grenzen.test.ts`):
- *jede Kante des Limiters mit ihrer Minute-Zahl* — die Zahlen werden aus `limiter.ts` **abgeleitet**
  (Regel auf den Quelltext), nicht nachgebaut; beide Aussendungs-Blaetter muessen sie nennen.
- *Grenzenlosigkeit behauptet nur, wer dieselbe Stelle die Kante nennt* — Absatz-Kontrolle: ein
  Absatz mit "runs without bound"/"no cap on the endpoints"/"nichts darin ist begrenzt" muss
  Rate-Limit-Wort **und** Minute-Zahl im selben Absatz tragen.

Drei Bisse danach: **D1** README nennt Suche 120/min -> 1 rot ("README.md verschweigt die
Schutzkante: such=240"); **D2** `SUCH_KAPPE` auf 300 gesetzt, Papier bleibt bei 240 -> **2 rot**
(beide Blaetter) — das ist die Paritaet, nicht ein Lesetest; beide Production-Dateien danach per
`cmp` bytegleich zurueckgebaut.

**Die Heilung, in allen drei Stellen, EN und DE symmetrisch.** Nicht "die App hat Grenzen", sondern
die Unterscheidung, die der Kunde braucht: keine **Lizenz**-Grenze, und eine **Schutz**-Kante, deren
Zahlen da stehen und die weit über normaler Arbeit am eignen Rechner liegen. README.md:355 sagt jetzt
"runs without bound **by a licence**: … The one bound that remains is local protection, not commerce —
chat 20/min, clipper 12/min, searches 240/min, writes 600/min, read off `server/helfer/limiter.ts:63-68`
and checked by `tests/keine-grenzen.test.ts:140`". Die release-notes nennen dasselbe in beiden
Sprachen, mit dem Zusatz, dass `:72`/`:85` zwolf Chat-Nachrichten und einundzwanzig
Profil-Speicherungen in einer Minute durch die Tuer schicken, ohne Halt — also: die Kante ist für
einen Menschen unter normaler Arbeit nicht erreichbar, und wer sie trotzdem erreicht, sieht eine
Absage, die ihre Zahl nennt.

**Zaehlung — und der ehrliche Satz dazu.** Zensus 03:50:51 MEZ, Exit 0: **577** Einheiten
(574 -> 577), **177** absolute (174 -> 177), **72** mit Messzeug (69 -> 72), **105** ohne
(105 -> 105). Die Berichtigung hat also **drei neue absolute Behauptungen erzeugt und drei alte
bewaffnet**: der Zähler der Blinden *sinkt nicht*. Das ist kein Misserfolg, sondern die Wahrheit —
ein Satz, der vorher "no cap" log und jetzt "20/min, 12/min, 240/min, 600/min" sagt, bringt drei
Zahlen in die Welt, die gehalten werden müssen. Der Wert dieses Schlages liegt in der Wahrheit der
Sätze und in einer Wache, die beide Seiten zusammenhält, nicht in einer Deckungszahl.

Pin `tests/aussendungs-riss.test.ts` zuerst rot (03:51:04: "der Nenner ist nicht mehr 174 — expected
177"), dann auf 177/72 nachgezogen, mit der Begruendung im Kommentar. Artefakte: JSON 29 413 B
(sha 1f9baa6d94b4ec92), Log 15 967 B (sha ade26747a68f9d89) — Siegel im selben Schritt.

**Laeufe.** Suite 3794 -> **3798** (vier neue it.each-Faelle, Dateien 354 unveraendert). Messung
03:51:39 -> 03:54:08 = ein rot mit Namen (`tests/doku-zahlen.test.ts:52`, Bericht 02:42:03 UTC aelter
als tests/ 02:51:15 UTC), Exit 1. Pruefung 03:54:14 -> 03:56:37 = **3798 von 3798 gruen, 354 Dateien,
Exit 0**, doku-check beglaubigt diesen Lauf (02:56:37 UTC). Lint 0 Fehler, 82 Warnungen.
Zahlen-Belege Exit 0: 972 Messbehauptungen, keine Pflicht-Zahl ohne Zitat.

**Nachschlag 09:38–09:39 MEZ, zwei Funde an eignem Werk.** Beim Nachprüfen der Anker, die dieser
Schlag gesetzt hatte, zeigte sich: mein eigner Kommentarzug in `tests/aussendungs-riss.test.ts` hatte
die Zeilenzahl verschoben, die *andere* Dateien nennen — `docs/belege/aussendungsatz-0611/messregel.mjs:15`
wies auf `:143`, der describe sitzt jetzt auf `:158` (09:38:47 berichtigt). Und weil das Siegel-Blatt
auch `messregel.mjs` selbst versiegelt (Zeile 284), meldete der Guard kurz danach sha
8d6ea53a42a2f825 gegen ausgewiesenes 2954f0bcd52e83ab — der **siebte** Siegel-Riss dieser Nacht, zum
ersten Mal verursacht durch einen Kommentar statt durch einen Zahl-Lauf. Beides heilte im selben Zug;
der Guard steht wieder 11 von 11 grün (09:39:38 MEZ). Die Zensus-Zahlen sind unverändert (577
Einheiten, 177 absolute, 72 mit Messzeug, 105 ohne), nur die Log-Zeile hatte einen neuen Stand
(15 967 B, sha ac94246b4c559bf0), weil der Zensus zweimal fuhr — die Siegel-Zeile des JSON blieb, wie
gemessen, gültig (29 413 B, sha 1f9baa6d94b4ec92). Beide Dokument-Gates danach neu gefahren:
doku-check nennt 3798 Faelle aus dem Lauf 02:56:37 UTC, Zahlen-Belege Exit 0 (972 Messbehauptungen)
um 09:39:56 MEZ.


**Keine Versionszahl, kein Bau** — README.md und `.github/release-notes.md` sind nicht im Buendel; sie
gehen mit dem naechsten Release nach außen, und die Sätze sind jetzt so, dass ich sie vertreten kann.

## 42. P154 — die Anker-Wache: 404 `Datei:Zeile`-Zeugen der sechs Blätter, zuerst 22 Befunde, zuletzt null (7.11. 10:39 MEZ)

**Die Frage vor der Arbeit.** Sechs Nächte lang war der häufigste eigne Fehler der Zeiger, nicht
die Heilung: P151 schrieb `:158` statt :137/:165, P152 :131 statt :132, P153 heilte einen Anker und
verschob durch seinen eignen Kommentarzug einen andern. P153 hatte die Fläche in seiner offenen
Liste vorbenannt (Abschnitt 8, Punkt 2); gebaut wurde sie jetzt.

**Was die Maschine hält.** Neu: `scripts/helfer/anker.mjs` und `tests/anker-wache.test.ts` (9
Fälle, describe auf Zeile 73; die drei Halter für die blinden Kurzformen sitzen auf Zeile 197,
204 und 205. Gelesen werden README.md, SECURITY.md, ROADMAP.md, `.github/release-notes.md`,
`docs/belege/REGISTER.md`, `docs/aussendung-und-ablage.md`. Gefordert wird je Anker: Datei im Baum,
Zeile innerhalb der Länge (ein abschließender Umbruch zählt nicht), Inhalt auf der getroffenen
Zeile — keine Leerzeile, kein nackter Schluss-Strich. Drei Formen: Baum-Anker `pfad:Zeile`,
Kurzform `:Zeile` (erbt das Vorbild derselben Blattzeile, wenn das eine Zeile nannte, höchstens 120
Zeichen entfernt und durch kein `|` getrennt), Blob-Anker `Commit:pfad:Zeile` (geprüft mit
`git show`). Bereich: der Anfang gilt, das Ende darf den Block schließen.

**Der erste Fund, und ein Fehler daran.** 22 Befunde über 404 Ankern, zuletzt 0 über 420. Aber der
allererste Blob-Lauf meldete **nichts als Befunde, die meine eigne Software erfand**: `blobText`
las `${ennung}` statt `${nennung}`, der ReferenceError lief in ein `catch { return null }`, und
die Wache verwandelte ihren eigenen Bruch in die Aussage „diesen Blob gibt es in diesem Baum
nicht". Zweimal an Kopien nachgemessen: 10:38:30 MEZ = 20 Blob-Befunde von 20 Befunden;
10:41:26 MEZ = 22 von 23, und der eine echte zeigte in `src/components/Dashboard.tsx` auf eine
Leerzeile (Zeile 1405). Mit dem
neuen Fangzweig wirft die Kopie, statt zu urteilen; am berichtigten Stand meldet die Wache 0.
Sie trennt jetzt git's eigne Absage (Exit-Code plus stderr → Befund) von einem eignen Fehler
(wirft). Eine Wache, die ihren Crash als Urteil ausgibt, ist schädlicher als keine.

**Die Heilung in den Blättern.** README.md:145 heißt jetzt `.test.tsx` (:73 und :88).
README.md:261 verankert die Verschlüsselung an diesem Baum: `281f5a1:src/core/store.ts:992`
(Erstcommit dieses Baums, per `git show` gemessen) und `src/core/store.ts:1929` heute; die
Behauptung, der *Kern*-Erstcommit `2c942be` trage `package.json` 2.11.0, ist aus dem Satz
herausgezogen — im Kern-Repo nachgemessen wahr (dessen Erstcommit `2c942be` trägt in
`package.json` auf Zeile 3 die Version 2.11.0 und das Pragma auf Blob-Zeile 959), aber für einen
Leser dieses Repos nicht zu öffnen, und ein Beleg, den ein Kunde
nicht öffnen kann, ist keiner. README.md:265 nennt Helmet (`server/app.ts:200`), den globalen
Limit (`:208`), die Schreibroute (`server/router/memories.ts:130`) und das 1mb-Limit
(`server/app.ts:251`). Die sechs Historien-Zeugen in REGISTER und Ledger stehen in der Blob-Form
`113093c:server/helfer/…`; der `trial-anchor`-Beleg (:183-185, Flag `wx` auf :218) gehört zu
`planzustand.ts`, nicht zu `plan-schluesselbund.ts` (98 Zeilen, konnte :183 nicht liefern).
Drei nackte Basenames im Ledger heißen jetzt vollständig, und der Bereich
`src/components/Dashboard.tsx:1411-1414` — vorher begann er zwei Zeilen höher, auf einer Leerzeile.

**Die Grenze, die kein Fall hält.** Mein eigner neuer Absatz verschob alle README-Zeilen ab 432
um zwei; die Ledger-Zeugen `README.md:448` und `README.md:456` trafen dadurch Inhalt — aber den
falschen. Die Wache prüft Existenz und Inhalt, nicht Sinn. Per Hand nachgemessen (10:26 MEZ),
geheilt auf :450 und :458. Größenordnung, zuletzt gemessen 10:55:28 MEZ: 96 der 420 Anker zeigen
Zeilen. P155: der Fall, der ein wörtlich zitiertes Satzstück gegen die genannte Zeile prüft.

**Bisse.** Fünf Mutationen an der Helferkopie, einzeln, danach per `cmp` bytegleich
zurückgebaut (10:16 MEZ): Erbschaft aus → 4 Fälle rot; Bereichsende meldend → 2 rot; Blob-Zweig
tot → 2 rot; Leerzeile mitgezählt → 1 rot; Zellgrenze ignoriert → 1 rot. Für die drei Halter
der blinden Kurzformen ebenfalls gebissen (10:46 MEZ): Decke 29 → auf 28 gesetzt, Anteil
0,44 → auf 0,43, Gesamtdeckel 158 → auf 157; je ein Fall rot, Helfer und Fall danach
bytegleich.
tot → 2 rot; Leerzeile mitgezählt → 1 rot; Zellgrenze ignoriert → 1 rot.

**Zählung.** Fälle 3798 → **3807** (neun neue), Testdateien 354 → 355. Zensus
577/177/72/105 → **582/181/76/105** (zuletzt gemessen 10:53:35 MEZ): der neue Anker-Absatz bringt
drei absolute Sätze, alle drei mit Messzeug, und die Umformulierung der Prozentzahl einen
vierten — ohne Messzeug bleiben 105. Siegel nachgezogen, und der Prüfer meldete es selbst:
`zaehlung-0611.json` 29 678 B sha b21f5aee04af7901, `zaehlung-0611.log.txt` 16 187 B
sha 57b6afe916cc9178 (gesetzt 10:54:04 MEZ). Das sind der **achte, neunte und zehnte**
Siegel-Riss dieser Nacht, gemeldet 10:17:29, 10:24:07 und 10:46:28 MEZ, alle drei von mir selbst
verursacht, jeder durch einen Zensus-Lauf nach einer Wortkorrektur. Die Hausregel gilt weiter:
wer einen Zähler fährt, setzt in demselben Schritt die Siegel-Zeile neu.

**Läufe.** Messung 10:18:20 → 10:20:49 MEZ = 3806 von 3807 (ein rot: doku-zahlen meldet den
Bericht älter als den neuen Fall — Absicht). Messung 10:24:27 → 10:26:55 = ebenso. Prüfung
10:26:55 → 10:29:24 = **3807 von 3807 grün, 355 Testdateien**. Nach den Wortkorrekturen: Messung
10:32:53 → 10:35:21 (rot auf Veralterung), Prüfung 10:35:30 → 10:37:50 = **3807 von 3807 grün**,
doku-check nennt dieselbe Zahl und denselben Stand. Lint zuerst 10:38:08 mit **2 Fehlern in meinem
eignen Helfer** (zwei unbenutzte Variablen in `kurzformVerwaisungen`), berichtigt, Lint 10:39:22
MEZ Exit 0 mit 0 Fehlern.


**Zweiter Nachtrag, aus den Berichtsdateien gelesen (11:02:23 MEZ).** Messung 10:57:07 →
10:59:36 MEZ = 3806 von 3807 grün, ein rot — doku-zahlen meldet den Bericht älter als die Fälle,
die ich gerade umgestellt habe; das ist die Absicht des Falles, nicht ein Fehler. Prüfung
10:59:40 → 11:02:05 = **3807 von 3807 grün, 355 Testdateien, Exit 0**, und doku-check nennt
dieselbe Zahl aus dem Bericht 10:02:05 UTC. Lint 11:02:17 Exit 0, 0 Fehler bei 83 Warnungen.
Zahlen-Belege 11:02:23 Exit 0: 980 Messbehauptungen über 22 Markdown-Dateien, 30 bestätigt,
keine Pflichtzahl ohne Zitat.

Dieser Nachtrag setzt bewusst keinen neuen Anker: die Stunden stehen aus den Berichtsdateien ge-
lesen da, und ein Zeiger, den niemand gemessen hat, wäre genau der Fehler, den P154 abstellt.

**Keine Versionszahl, kein Bau.** An ausgelieferten Bytes ändert dieser Schlag nichts — Blätter,
Wachen und ein Helfer; README.md und `.github/release-notes.md` sind nicht im Bündel und gehen
mit dem nächsten Release nach außen, und die Sätze sind jetzt so, dass ich jeden ihrer Zeiger
belegen kann.
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
8. **„Die 30 stehen als Liste im Artefakt" war falsch**, und zwar in beiden Blättern: das Artefakt
   kannte nur die Zahl 30 und ihre Verteilung (26/1/1/2), die Liste selbst fehlte. Ein Satz über ein
   Blatt, das ihn nicht trägt, ist dieselbe Klasse wie der falsche xattr-Pfad aus P121. Berichtigt
   im Messzeug, nicht im Satz: `zaehlen.mjs` schreibt jetzt 30 Zeilen in json und log, jede mit dem
   Marker, ob derselbe Satz schon ein Messzeug nennt, und mit einer Kreuzkontrolle über die zwei
   unabhängigen Satzrisse des Programms. Gegenprobe gefahren (21:16:18 MEZ): ein eingebauter
   zweiter Riss, der mit `**` beginnende Aufzählungszeilen überspringt, meldet „die schmale Klasse aus dem ersten
   Satzriss ist 30, aus dem zweiten 29" und Exit 2; danach per Edit zurückgebaut und bytegleich
   gegen die vorher kopierte Fassung geprüft.
9. **Eine Selbstkontrolle, die nicht verlieren kann, ist keine.** Die erste Fassung derselben
   Kreuzkontrolle verglich die Liste mit der Summe, die aus derselben Schleife kam — immer gleich,
   also grün durch Bauweise. Ersetzt durch den Vergleich zweier getrennter Satzrisse, bevor der
   Text irgendwo stand.
10. **Der erste Reflex bei „Flaeche 1" war die Latte.** Ein Fall, der 0 verlangt und 1 misst, ist
     in zwei Minuten auf `<= 1` gestellt — hier war das falsch: die Messung an `Info.plist`,
     `package.json` und den asar-Bytes (21:08:05 MEZ) zeigte, dass das Objekt die alte Fuge trägt
     und der Baum die neue, also ist die Fundstelle der Rückstand selbst. Die Latte bleibt bei 0
     und bekommt eine Maschine, die den einen Grund prüft; die Gegenproben (gleiche Version,
     neue Fuge im Objekt, keine Fuge im Objekt, `Flaeche 2`) stehen als eigne Fälle in
     `tests/punkt7-fachwort-traegt-grund.test.ts`.
11. Zwei Anker in meinem eignen Papier waren falsch, bevor sie irgendwer las: `clip.ts` gibt es
    unter `src/lib/` nicht (es ist `server/router/clip.ts:31`), und die Biss-Kontrolle der
    Telemetrie-Wache ist der fünfte von neun Fällen, nicht der siebte. Beide Zeilen erst gemessen,
    dann geschrieben — und trotzdem zuerst falsch notiert, weil ich sie aus dem Kopf zitierte.
12. **Eine strukturelle Null in eigner Sonde, in P126 gesehen, in P127 berichtigt.** Ich wollte
    prüfen, ob der Telemetrie-Satz die Liste der ohne-Zeugen verlassen hat, und las dafür
    `x.text` — das Artefakt schreibt seine Sätze aber unter `satz`. Alle Vergleiche trafen also
    nichts, und die Meldung war ein verdientes 0, das nichts über die Welt sagte. Die Gegenprüfung
    mit dem richtigen Schlüssel zeigte: ja, der Satz ist raus; **nein**, die Zahl war nie ein
    Beweis. Erst der Schlüssel wird gelesen, dann die Zahl.
13. **Zwei Uhrzeiten aus dem Gefühl.** Im P127-Entwurf standen „21:25:58 MEZ" für den
    Träger-Probelauf und „21:26:44 MEZ" für den grünen Datei-Lauf, ohne dass ein `date` in diesen
    Befehlen lief. Beide sind ersetzt: der Träger-Lauf ist jetzt selbst gemessen (21:35:00 MEZ,
    derselbe Lauf, der die Heilung zeigt), und der Datei-Lauf steht als „21:26 MEZ, zwischen dem
    roten Fall um 21:26:27 und der Messung um 21:26:57" — eine Spanne, die ich belegen kann, statt
    einer Sekunde, die ich nicht hatte.
14. **Ein chinesisches Wort in meinem eignen Papier.** In Abschnitt 16 stand an einer Stelle
    ein chinesisches Wort für „Einheit" (U+5355 U+5143) statt des deutschen Wortes — ein
    Rutsch aus der Schreibbewegung, nicht aus einer Quelle. Ich schreibe den Fehler hier
    mit seinen Codepoints, nicht mit dem Zeichen: ein geliefertes Blatt darf es nicht tragen. Beim Nachlesen gesehen, ersetzt
    durch „**ein** Satz bleibt"; der Sweep danach meldet 0 CJK und 0 unsichtbare Zeichen. Genau
    dieser Klasse wegen wird nach der letzten Schreibbewegung gefegt, nicht vorher.
15. **Die Biss-Kontrolle prüfte den Riss, wo sie den Marker prüfen wollte.** Der erste
    „Kontrolle gegen grünen Leerlauf"-Fall fütterte einen Block durch `satzeAusMarkdown` und
    verlangte, dass eine Einheit den Marker trägt. Nachdem der Riss heilte, fiel genau dieser Fall
    rot (1 rot / 5 grün, 21:42 MEZ) — die Heilung hatte die Kontrolle wertlos gemacht. Jetzt prüft
    der Fall den Marker allein und in beide Richtungen: ein Block wird gesehen, ein nackter Satz
    nicht.
16. **Die Ordnung war umgekehrt, und ich habe sie umgedreht.** Ich legte `satz-riss.mjs` mit der
    markdown-festen Teilung an, *bevor* ein roter Fall lief. Korrigiert im selben Schlag: die
    Rückstufe (die alte Teilung, Satzende + Leerraum) wurde eingebaut, der rote Lauf gesehen
    (4 rot / 1 grün, 21:41 MEZ), erst dann die Heilung gesetzt und gemessen (6 grün, Start
    21:42:34 MEZ). Die Rückstufe stand als Kommentar im Blatt, damit der Trick sichtbar bleibt,
    und ist jetzt wieder aus dem Tree.
17. **Die Zahlen-Wache erwischte meinen eignen Beleg.** Ich schrieb „89 % Linien" in einen Absatz,
    in dem auch `electron-builder.json` stand, und zitierte `vitest.config.ts:62-110` in
    Backticks mit Zeilenbereich — die Wache las den nächsten Dateinamen, öffnete die Vorlage und
    meldete „2 Werte, keiner davon 89" (Exit 1). Berichtigt: die Zahl steht jetzt direkt hinter
    ihrem Beleg in der Form `vitest.config.ts, Zeilen 62 bis 110`, und die Wache sagt Exit 0. Eine
    Zahl, die ihren Beleg nur *in der Nähe* hat, ist nicht belegt.
18. **Ein Edit nach Zeilennummer hat mir den Satz zerrissen.** Ich setzte drei Zeilen an Index 497
    — mitten in eine Klammer, die noch lief. Der Absatz las sich danach „… plus die / nachgelesen
    in … / Plattform-Ziele." Entdeckt beim Nachlesen (nicht durch ein Werkzeug): die Stelle wurde
    einmal ganz neu geschrieben, und der Fehler steht hier, weil ein Edit, dessen Anker größer ist
    als die Änderung, Zeilen still verschiebt — dieselbe Lehre wie 19.10. im Wachbuch.
19. **Eine Behauptung, die ich zu weit schrieb.** In SECURITY.md sollte der Schlüssel „to none of
   them" gehen — kein Fall prüft die Request-Bodies eines gewählten Providers auf den
   Datenbank-Schlüssel. Der Halbsatz war nach dem Schreiben da und vor dem Committen weg; was
   jetzt steht, sind die zwei Prüfungen, die existieren (argv, Adresszählung).
20. **Der eigne Riss war der Fund.** Dass ich einen Satz bewaffnete und die Wache ihn trotzdem
    ohne Zeugen meldete, war kein Fehler im Text, sondern in meinem Messzeug aus P128: pro Zeile
    geschnitten, und ein Mensch bricht Zeilen mitten im Satz. 52 Einheiten waren Fragmente
    (617 → 565). Behoben mit `bloesche()`, und der Fall zuerst rot
    (22:13:14 MEZ). Ein Instrument, das nur die Welt prüft, die es selbst schon versteht, ist
    kein Messzeug, sondern ein Spiegel — und der dritte Rutscher dieser Klasse im selben Abend, weshalb der Sweep jetzt zwischen den Schreiben laeuft, nicht nur am Ende.
21. **Eine Plattenzeit falsch gepaart.** Ich schrieb „22:14 MEZ: 8,36 GiB", obwohl 8,36 GiB um
    21:58:17 MEZ gemessen war und die Platte um 22:18:32 MEZ 8,24 GiB frei hatte. Zahl und Uhr
    gehören demselben Befehl; berichtigt.
22. **Das Artefakt zitierte eine Zahl aus einer Runde, die es nicht mehr fährt.** Im Kopf von
    `zaehlung-0611.log.txt` standen seit P128 „45 Einheiten … gemessen 21:42 MEZ in
    `tests/aussendungs-riss.test.ts`" und „43 unter dem zeilenweisen Naivling". Keines davon ist
    eine Prüfung, die die Suite heute enthält: 45 war ein Lesedurchgang durch den alten Riss, der
    nur in der Rückstufe lebte, und 43 war die *Gegenprobe* von P128 (Markup-Trennung
    ausgeschaltet) — im Kopf fälschlich als zweiter Naivling ausgegeben. Ein Artefakt, das eine
    Zahl trägt, muss die Zahl selbst hergeben. Jetzt rechnet `zaehlen.mjs` beide Naivlinge in
    jedem Lauf neu: auf diesem Stand sind es **51** unter dem Punkt-Naivling und **116** unter dem
    zeilenweisen (gemessen 22:29:05 MEZ, Exit 0). Die Nenner der Zaehlung blieben unberührt
    (565 Einheiten, 170 Behauptungen, 28 mit Messzeug) — der Kopf maß eine andere Größe.
23. **Mein Edit verschluckte eine Überschrift.** Ich setzte §20 vor die Liste der eignen Fehler
    und gab die Überschrift dieser Liste als Anker mit — sie war danach weg, und die Nummerierung
    stand kopflos im Blatt. Entdeckt beim Nachlesen der Grenze (nicht durch ein Werkzeug, die Wache
    prüft keine Überschriften), wiederhergestellt und hier vermerkt: ein Anker, der größer ist als
    die Änderung, ist genau die Falle aus 18. — dieselbe Klasse, dritter Auftritt.
24. **Dieselbe Falle, zweiter Auftritt, zwei Stunden später.** Ich setzte §21 und gab erneut die
    Überschrift der Fehlerliste als Anker — sie war wieder weg. Diesmal fiel es mir im selben Zug auf
    (der Text endete mitten in der Nummerierung), weil 23. zwei Stunden vorher steht. Eine Klasse,
    zweimal in einem Abend, ist kein Versehen mehr: ein Anker, der eine Überschrift enthält, wird
    künftig *unter* der Überschrift gesetzt.
25. **Zwei Zeitziffern geraten, statt gelesen.** Der erste Entwurf der Schild-Zitate nannte
    `schild.test.ts:31` und `:36`; die Fällen sitzen auf :34 und :39. Vor dem Committen nachgesehen —
    die Berichtigung steht im Text, nicht im Commit.
26. **Eine Zahlenreihe aus dem Kopf statt aus den Papieren.** Ich schrieb die Nenner-Folge
    „129 → 132 → 172 → 172 → 170 → 169 → 169" — die 172 zweimal, weil ich Schläge miteinander
    verwechselte. Vor dem Committen berichtigt auf die tatsächlich gemessenen Stände (129 / 132 /
    172 / 170 / 169) mit ihren Schlagsnummern. Derselbe Grund wie 16.10. im Wachbuch: eine Reihe,
    die ich nicht nachgezählt habe, ist keine Messung, sondern ein Gedächtnis.
27. **Ein eigner Bericht war zu weit.** Im P135-Text (und im Commit) hieß es, README.md:360 sei mit
    dem einen Klammerzusatz gedeckt. Der Zensus zählt Sätze: die Fett-Zeile „The data is never
    hostage" blieb blind, nur der Satz darunter war gedeckt. Aus der Artefaktliste gelesen, beide
    Sätze bewaffnet, Zahl und Papier nachgezogen (37 → 38). Ein Zeuge in einer Zeile bewaffnet nicht,
    was in derselben Zeile noch steht.
28. **Eine Sortierung ohne Gegenprüfung.** Ich legte ROADMAP:38 („time-travelled queries never count
    as access") in „Zusage an eine Tür, die die App nicht hat" und verkaufte die Restlichen als drei
    Wände. Die Funktion ist gebaut und geprüft (`server/router/search.ts:75`, `src/core/mcp.ts:99`,
    `tests/engine.test.ts:254`, `:271`). Ein Satz aus einer Tabellenzeile ist kein Status — erst der
    Baum sagt, ob eine Zeile Plan oder Befund ist.
29. **Ein eigner Fall war taub, und nur der Bisslauf hat es gesagt.** `:56` der neuen lib-Datei
    schleifte über `RESULT_STOPS` selbst — über die Liste, die er prüfte. Derselbe Patch, der zwei
    Gegenprüfungslauf hätte ich einen Fall committed, der das Verschwinden einer Stufe nicht bemerkt.
30. **Nicht-ASCII in meinem eignen Mappe-Papier — und hierher zurückgeschrieben.**
    `P141-REGLER-STUFEN-0711.md` hatte nach dem ersten Schreiben drei Nicht-ASCII-Zeilen: ein
    CJK-Wort (U+7269 U+7406) mitten in `verliert…isch`, in einem Satz, der den Bisslauf beschreibt;
    `Der Leser fängt` (Umlaut); `aus demPruefling` (zusammengeklebt). Alle drei vor dem Committen
    berichtigt, der Sweep danach meldet 0. **Der dritte Fund ist dieser Satz selbst:** beim
    Aufschreiben des Fehlers kopierte ich die beiden Codepunkte in dieses Repo-Papier, statt sie zu
    benennen. Die Hausregel seit 21.10. — eigne Zeichen umschreiben, nie kopieren — gilt also auch
    für den Bericht über ihre Verletzung. Das Trennzeichen `·` in einem
    README-Zitat habe ich nicht still entfernt, sondern in demselben Satz als ersetzt ausgewiesen.
31. **Die erste Reparatur einer eignen Lücke war ein Workaround.** Im neuen Flächen-Fall brauchte ich
    `container`; statt die Rückgabe des Harness zu benutzen, schrieb ich
    `const { container } = { container: document.body }`. Das ist dasselbe Blatt, das der Fall gerade
    nicht prüft. In demselben Zug zurückgebaut auf `const { container } = await zeige(drei)`.
32. **Drei Fälle ohne `await`.** `searchMemories` ist ein Versprechen; der erste Lauf 00:45:04 fiel
    mit `TypeError: Cannot read properties of undefined (reading 'map')`. Das war kein Urteil,
    sondern ein Gebrauchfehler — und nach der Regel hätte ich ihn erst reparieren und dann neu
    messen dürfen, nicht „schnell weiter". Nach dem `await`: 6 von 6 grün.
33. **Ein Biss-Abschnitt stand im Datei-Kopf, bevor die Sonden gefahren waren.** Ich schrieb
    „macht Fall 2 rot; Fall 1 rot; Fall 3 rot" in die Kommentarzeilen und fuhr die Sonden danach.
    Zwei Zuordnungen stimmten, eine nicht: der `?? 0`-Patch an `engine.ts:475` macht Fall `:87`
    rot, nicht Fall `:75`. Dasselbe Gesetz, das ich in P141 für Zahlen gelten ließ (eine Zahl, die
    ein Artefakt trägt, muss von dem Artefakt hergestellt werden), galt hier für Fall-Nummern — und
    ich hatte es an demselben Abend schon zweimal gebrochen.
34. **Vier Nicht-ASCII-Zeilen in meinem eignen Papier, eine davon im Satz über den Fehler.** Ein
    CJK-Wort (U+51C6 U+5907) mitten in „vorbereitet", dreimal ein Umlaut, wo eine Umschreibung
    stehen sollte — einer davon in dem Satz, der einen Umlautfehler meldet. Der Sweep nach jedem
    Schreibgriff fand alle vier, bevor irgendetwas committet war. Es ist der fünfte CJK-
    Gleiter dieses Abends, und alle fünf stehen in Sätzen, in denen ich ein deutsches Wort
    umschreibe, das ich eben auf Englisch gedacht hatte.
35. **Meine erste Reparatur des „of"-Musters war gefühlt, nicht nachgerechnet.** „Dann einfach
    `\b` hinter die ganze Alternation" — damit wirft die Vorsonde 8 Sätze aus dem Nenner, davon 6
    echte Prozentbehauptungen, weil `%` an einem Leerzeichen keine Wortgrenze findet. Richtig ist
    die Begrenzung nur für die Wörter; gemessen wirft sie genau einen Satz. Der Fund bleibt in
    Abschnitt 30 stehen und wird P143, statt dass ich die Zahl still verbessere.
36. **Sechs doppelte Backslash-Zeichen in eignen Code-Spannen.** In Abschnitt 30 schrieb ich die
    Regelstellen mit je zwei statt einem Backslash — das Papier zeigte also eine Regel, die keine
    Maschine so liest. Beim Schreiben von Abschnitt 31 aufgefallen, mit einem Zusatzlauf gezählt
    (sechs Stellen), auf null gebracht; die Regel selbst steht jetzt in Abschnitt 31 mit je einem
    Zeichen. Solche Stellen bleiben besser in Worten als in Escape-Folgen, wenn sie berichtet
    werden — der Bericht darf nicht der Fehler sein.
37. **Eine Zeilenangabe vor dem Messen geschrieben.** Im neuen Regelkommentar ließ ich die neuen
    Fälle auf `aussendungs-riss.test.ts:131` zeigen; der `describe` sitzt auf `:143`. Vor dem
    ersten Commit berichtigt — dasselbe Gesetz wie die Zahlen: ein Anker heißt erst, nachdem die
    Datei ihn zeigt.
38. **Drei Umlaute in meinem eignen Mappe-Papier** („grün", „zählte", „Gegenstück"), gefunden vom
    Sweep nach dem Schreiben, alle drei vor dem Commit. Es sind der sechste bis achte
    Zeichen-Gleiter dieses Abends; der Sweep ist die Reparatur, nicht das Aufpassen.
39. **Meine Negativ-Kontrolle war selbst ein Treffer.** Der Fall „The panel shows 250 note-headers
    and 3 office links" sollte beweisen, dass ein Nicht-Einheiten-Wort nicht zählt — und zählte
    über das „of" in „office". Das ist kein Fehler am Test, sondern der beste Beweis, den die
    Regel kriegen kann: der Fall fiel rot, bevor die Regel geändert war.
40. **Der Datumskanal war wieder falsch — diesmal in die andere Richtung.** Beim Nachziehen der
    drei README-Zähler setzte ich „measured" auf 2026-11-07, weil die UTC-Uhr des Berichts bald
    Mitternacht überschreitet, und rechnete damit richtig über die Zeitzone — aber falsch darüber,
    *welcher* Lauf der Prüfungsmeldung unterliegt. Der Prüfungslauf 01:00:06 → 01:02:40 MEZ fiel
    deshalb rot: „nennt einen Messstand in der Zukunft (2026-11-07) — beglaubigt ist der Lauf vom
    2026-11-06". Gelesen in `scripts/test-bericht.mjs:240-267`: ein Stempel darf nicht *nach* dem
    Lauf liegen, älter sein ist erlaubt (die Untergrenze wurde am 12.10. absichtlich entfernt,
    weil ein Prüfer, der um Mitternacht fällt, ein Los ist, keine Regel). Und der Lauf, den der
    Fall beim Laufen liest, ist der auf der Platte — also der vorherige. Zurück auf 2026-11-06,
    dritter Lauf als Prüfung. Zweite Instanz desselben Grundes wie P141-Fehler 5: eine Zahl nennt
    ihren Kanal, und ihr Kanal ist das Artefakt, nicht mein Gefühl für die Uhr.

41. **„solid" mit dem falschen Werkzeug gemessen.** Der erste Ansatz wollte die echten
    Verbindungen an ihrer Akzent-Farbe erkennen und brauchte vier Läufe, um fallen gelassen zu
    werden (01:12:10, 01:14:04, 01:14:38, 01:16:57), obwohl der erste schon meldete, dass die
    Kopfzeile keine echte Verbindung nennt — der Fixture-Stummel war aus einem andern Fall
    kopiert und passte von Anfang an nicht. Fünfte Instanz derselben Lehre: die Frage ist nicht
    „was behaupte ich", sondern „was kann mein Messzeug überhaupt sehen".
42. **Drei Läufe auf eigne Tippfehler, nicht auf Befunde:** `kopfZahlen is not defined`
    (01:15:01), `ahmen is not defined` (01:16:26), `kopf is not defined` zweimal (01:19:12 und
    01:19:22) — der letzte, weil ich den halben Helfer geflickt hatte. Gebrauchfehler, kein
    Urteil; aber jeder dieser Läufe sah aus wie ein Messergebnis.
43. **Die Sonde las ein leeres Bild und hielt es für eine Aussage.** Zweimal (01:13:00 und
    01:18:35/01:18:56) maß sie den ruhenden Rahmen, obwohl die Bildschleife nur malt, solange
    sich etwas bewegt (`KnowledgeGraph.tsx:5058`). Ohne den Nachschuss hätte der Fall grün
    werden können, weil nichts gemalt wurde — dieselbe Sorte grün ohne Beweis wie ein Zähler,
    der über einer leeren Liste läuft.
44. **Ein Siegel, das niemand prüft, ist kein Siegel.** Die REGISTER-Zeilen der zwei
    Zensus-Artefakte waren nach meinem Lauf um 01:24:50 zehn Minuten alt, und
    `node scripts/zahlen-belege.mjs` meldete dazu grün (01:33:43): die Wache öffnet zwar jedes
    zitierte Artefakt, aber sie vergleicht weder Bytes noch sha256 mit der Spalte, die sie
    ausweist. Ich habe die Zeilen von Hand nachgezogen, bevor ich es meldete — die Lücke selbst
    steht als offener Punkt über §32 und ist der Kandidat für den nächsten Schlag.

45. **Mein Groessen-Fall baute zwei Driften und erwartete einen Befund.** Ich wies im Fixture eine
   fremde Bytezahl *und* den Hash eines fremden Inhalts aus — der Prüfer meldete korrekt zwei
   Befunde, der Fall erwartete einen (01:42:07). Der Fall hat mich belehrt, was die Wirklichkeit
   tut: jede Größen-Drift ist zugleich eine Inhalts-Drift. Seither prüft der Größen-Fall nur seinen
   eignen Befund, und der reine Inhalts-Befund (gleiche Länge, anderer Inhalt) steht in einem
   eignen Fall — 01:42:57, 6 von 6 grün.
46. **Ich schrieb ein Siegel in ein Papier, das der nächste Lauf unleserlich machte.** In §32
   stehen Bytes und sha zweier Zensus-Artefakte als Beweis; der Zensuslauf 01:43:48 schrieb die Log
   um, und der Satz behauptete damit einen Ausweis, den es nicht mehr gab — dieselbe Klasse wie der
   Fund selbst, nur in meiner eignen Prosa. Jetzt steht in §32 nur noch, *dass* der Ausweis zog und
   wie er heute heißt, und im Register steht die Arbeitsfolge: wer einen Zähler fährt, setzt in
   demselben Schritt die Siegel-Zeile neu.
47. **Ein CJK-Fragment in meiner eignen Überschrift, und mein erster Reparaturversuch traf die
   falschen Zeichen.** Im Mappe-Papier P145 stand ein Fragment, das ich selbst geschrieben
   hatte: U+52A8 U+4E86, mitten in der Überschrift „Was sich … Zahlen dieses Laufs". Mein
   Ersetzungsversuch schrieb U+52D5 U+4E86 — geraten statt gelesen, also ging die Reparatur
   still ins Leere und ließ das Fragment stehen. Geheilt durch Ersetzen **nach Zeilenindex**, nicht
   nach kopierten oder erratenen Zeichen; der Sweep danach meldet 0 Nicht-ASCII. Fünfte Instanz
   der Zeichen-Regel, neue Form: auch ein erratener Codepunkt ist ein Kopieren.
48. **Ein Edit, dessen Anker größer war als die Änderung, löschte eine Überschrift.** Beim Anhängen
   von §32 an `docs/aussendung-und-ablage.md` ersetzte ich die Zeile „## Fehler in diesem Schlag,
   die ich selbst gefunden habe" durch den neuen Abschnitt und vergaß sie zurückzuschreiben — die
   Fehlerliste hing damit ohne Kopf unter §32. Gesehen durch den Struktur-Griff nach dem Schreiben
   (`grep -n '^## ' …`), Kopf wieder eingesetzt, Zeile 1300. Das ist dieselbe Warnung, die schon
   über dem Zurücklesen steht: die getroffene Region zurücklesen, nicht nur die neue.

49. **Eine falsche Zusage, gefunden beim Bewaffnen.** README.md:181 versprach, die
   Verwaltungsdatei trage die Lizenz vor und sie werde "validated offline as always" geprüft.
   Kein Laufzeitpfad importiert das Schlüsselmodul (`grep -rln core/lizenz src/` leer, gemessen
   02:03:20 MEZ), der Leser lässt genau drei Schlüssel durch (`src/lib/richtlinien.ts:86`), und
   der Kopf desselben Blatts sagt seit dem 9.10., dass es kein Schlüsselsystem mehr gibt. Ich
   hätte den Satz bewaffnen *und damit stehen lassen* können — der Census meldet Zeugen, keine
   Wahrheit. Dass die Zeugen schon seit dem 9.10. im Baum lagen, macht es schlimmer, nicht
   besser. Zweite Stelle desselben Lochs: `SECURITY-ENTERPRISE.md:61`.
50. **Zwei Entwürfe, die nichts gemessen hätten — beim Lesen gefunden, nicht beim Laufen.**
   Erstens: „jeder Plattform-Zweig liefert mindestens einen Pfad" — der Benutzerprofil-Pfad
   (`os.homedir()/.config`, auf jeder Plattform gesetzt) hätte die Bedingung auch ohne jeden
   Zweig erfüllt. Zweitens: mein Helfer rief `kandidatenPfade()` ohne vorher `process.platform`
   zu setzen, also wären alle drei Prüfungen auf der Runner-Plattform gelaufen und hätten dieselbe
   Antwort gesehen. Beides fiel vor dem ersten Lauf auf, aber *vor dem Lauf* ist die schwächere
   Beweiskategorie: ein Fall, den ich nicht rot gesehen habe, ist ein Fall, den ich nicht geprüft
   habe. Der Biss 01:57:49 MEZ (Linux-Zweig entfernt → „der Linux-Zweig fehlt") ist der eigentliche
   Beweis, und der gilt erst, nachdem beide Entwürfe umgeschrieben waren.
51. **Ein Anker aus dem Kopf.** Für den Job `release-linux` schrieb ich `build.yml:177`; gemessen
   steht er auf `:173` (`release-windows` auf `:284`). Nachgezogen, bevor der Commit lief.
   Vierte Instanz derselben Warnung, die über jeder Zeilenangabe steht: ein Anker heißt erst,
   nachdem die Datei ihn zeigt.
52. **Ein Umlaut in meinem eignen Mappe-Papier** („müssen" in §3 des P146-Blatts), gefunden vom
   Zeichen-Sweep nach dem Schreiben, vor dem Commit ersetzt. Und ein Anker, den ich aus einer
   frühen Messung zitierte (`git tag` um 01:01 MEZ), wurde durch die spätere, klare Messung
   ersetzt (0 Treffer, 02:04:32 MEZ) — eine Zahl, die ihren Moment nennt, muss den Moment haben,
   der sie trägt.

53. **Zwei eslint-Fehler in meinem eignen Generierer, gefunden vom Gate, nicht von mir.**
   `docs/belege/p147-0711/zeugen.mjs` destructurete `i` (Zeile 32) und `zu` (Zeile 46) und
   benutzte sie nicht — `npm run lint` meldete 02:14:57 zum ersten Mal seit P141 wieder Fehler
   (2 statt 0). Ich hatte die Suite und die Zahlen-Wache gefahren, aber den Lint vor dem Census
   nicht. Nach dem Fix (02:15:44) änderte sich die Bytezahl des Generierers, also musste seine
   Siegel-Zeile ein zweites Mal nachgezogen werden (`8b5907643da5094d…`) — der P145-Prüfer hat
   auch das erwischt, bevor jemand danach suchte.
54. **Ein Beleg, der eine leere Sektion ausgab.** Mein first filter suchte Löschungen mit
   `startsWith("-\t")` in `--numstat`; dieses Format schreibt eine Löschung als `0\t<zahl>\t<pfad>`,
   also war die Löschliste im ersten Zug leer. Sichtbar wurde das nicht an einer roten Zahl, sondern
   daran, dass das geschriebene Blatt eine Überschrift ohne Zeilen hatte. Nachgemessen am Format
   (`git show --numstat c7cde55 | awk '$1=="0"'`) und berichtigt auf `zu === "0" && weg > 0` —
   jetzt stehen neun Dateien mit ihren Zeilenzahlen im Beleg.
55. **Eine eigne Fehlermeldung, die ich zurücknehmen musste.** Im P147-Papier schrieb ich zuerst,
   ich hätte „geza ehlt" gehackt; der grep traf nur „Werkzeg". Die Fehlerliste ist eine Behauptung
   wie jede andere und wird nur gemeldet, was die Sonde findet — die Berichtigung steht im Papier.

56. **Die Zahl-ohne-Nenner-Regel flaggte ihre eigne Ausnahme.** README.md:231 sagt im Satz selbst,
   die drei Prozente seien Slider-Werte und *not a measurement* — meine Sonde kannte nur
   Nenner-Kuelsenwoerter (`of|von|in|aus` plus Ziffer) und meldete den Satz trotzdem. Ein Fund, der
   sich selbst widerlegt, ist eine Regel, die noch nicht ins Gate darf. Haette ich die Regel in den
   Census eingezogen, waere seine Grundgesamtheit um eine Luege reicher gewesen.
57. **Meine erste Sonde riet die Form des JSON-Feldes.** `ohne_zeug` ist ein Array aus
   `{datei, satz}`-Eintraegen und enthaelt beide Lesungen — 222 fuer 111 Saetze. Wer das Feld
   nach Namen liest (ohne_zeug = "nach Datei gruppiert"), zaehlt die doppelte Grundgesamtheit und
   wuerde 222 Saetze melden. Geheilt, indem ich zuerst die Form fragte
   (`node -e "…typeof, erste Eintraege"`), dann die Regel.
58. **Vierter Siegel-Riss an diesem Abend, wieder vom Guard gemeldet, nicht von mir.** Nach dem
   Zensuslauf 02:26:48 standen die zwei Registerzeilen abermals zu alt da (02:26:58, vier Befunde).
   Der Grund ist strukturell, nicht fluchtig: jeder Zaehler-Lauf schreibt beide Artefakte um, weil
   Zeile 1 die Uhrzeit traegt und die Listen sich mit dem Text aendern. Deshalb steht die
   Arbeitsfolge jetzt im Register, nicht nur in meinem Vorsatz — und P149 prueft, ob der Zaehler
   die Siegel-Zeilen im selben Zug mitziehen kann, ohne zum Artefakt-Schreiber beim Import zu
   werden (P129).

59. **Ich fuhr `doku-check` mitten in einen laufenden Suite-Lauf.** 02:31:44, waehrend die
   Pruefung (02:31:08→02:33:38) ihren Bericht gerade schrieb: die Wache verweigerte mit dem
   Hinweis auf fremde Last, und ihr Text war richtig — meine Reihenfolge war falsch. Die Zahl war
   nie in Frage (3779 ausgefuehrte Faelle), aber ein Gate, das waehrend des Schreibens gelesen
   wird, ist kein Urteil. Der ruhige gruen Befund kam vier Minuten spaeter aus dem Lauf selbst.

60. **Mein erster Biss war ein falscher Biss.** Der Python-Flicken suchte `  {\n    query: `;
   die Anfragen stehen einzeilig, also fand der Schnitt nichts, mein `assert` brach vor dem
   Schreiben, **die Datei wurde nie gepatcht** — und der direkt danach gerufte Testlauf meldete
   3 von 3 gruen, als haette der Biss nichts gefunden (02:37:54). Ein gruen nach einer Tat, die
   nicht stattfand, ist kein Beweis; der Beweis war, dass *keine* Roette kam. Berichtigt mit
   Biss A, B und C (02:38 MEZ), jeweils mit Meldung und Zahl.
61. **Die Sonde riet ein Feld.** `q.category` existiert nicht — das Feld heisst `kategorie`
   (`scripts/eval-corpus.ts:13-31`). Die erste Sonde meldete „kategorien: 1" mit leerem Namen, und
   das sah aus wie ein Befund ueber den Korpus, war aber ein Befund ueber mein Raten. Zweite
   Sonde nach dem Lesen der Schnittstelle: 5.
62. **Zwei zerhackte Woerter im neuen Fall-Blatt** („Aenderoerung", „duemner"), gefunden vom
   Sweep vor dem ersten Lauf, ersetzt, bevor sie jemand zitierte. Und im Mappe-Papier standen
   zwei Gedankenstriche (U+2014) im ASCII-Pflichtbereich — der Sweep nach dem Schreiben fand sie,
   ersetzt durch die ASCII-Form mit einem Satz, der den Unterschied benennt.
63. **P147 zog zwei Siegel-Zeilen ein und vergass die Zahl, die das Blatt darüber stehen hat.**
    `9bd6c62:docs/belege/REGISTER.md:12` schrieb dem Leser bis heute „Grundgesamtheit: 126 Siegel-Zeilen" —
    gemessen 01:39:50, also vor P147. Die operative Zahl lebte nur in meinem Kopf und in einer
    Zahl-Klammer eines Blatts, das niemand nachrechnet. Gesehen von `tests/belege-siegel.test.ts:121`
    (02:56:59, rot: „126 gegen 128"), berichtigt mit ihrer Messzeit daneben. Lehre: **eine Zahl, die
    ein Blatt über sich selbst nennt, braucht denselben Träger wie jede andere Zahl.**
64. **Ein Biss, der nichts ändert, ist kein Biss — und ich hatte einen als Biss gezählt.** Biss B
    („die Zellzahl des Kopfs ist dem Prüfer egal") ließ die Suite grün (10 von 10), weil die
    Mutation an der nachgebauten Ueberschneidung nichts am Verhalten änderte: der Zweig mit dem
    Kopf-Vergleich war von dieser Teststelle gar nicht erreichbar. Ich hätte „vier Bisse" gemeldet;
    es sind **fünf**, und einer davon war blind. Ersetzt durch Biss D (Kopf muss 4 Zellen haben →
    2 rot) und Biss E (Kopf-lose Liste wird nicht gemeldet → 1 rot).
65. **Zwei Anker aus dem Kopf geschrieben, dann nachgemessen.** Ich setzte
    `tests/belege-siegel.test.ts:158` ins Blatt; die Fälle sitzen bei `:137` und `:165`. Dasselbe
    Loch zum dritten Mal in drei Nächten (`build.yml:177` → 173, P146). Der Anker-Lauf gehört vor
    den Buchschlag, nicht in den Text.
66. **Ein Edit, dessen Anker eine Überschrift war, löschte sie.** Beim Einfügen von §38 verschwand
    die Zeile „## Fehler in diesem Schlag, die ich selbst gefunden habe" — exakt der Fehler aus
    P145, den ich dort selbst aufgeschrieben habe. Gesehen durch `grep -n '^## '` direkt nach dem
    Schreiben, Überschrift zurückgesetzt und die doppelten Leerzeilen mit ihr bereinigt.
67. **Biss A meldete den rechten Fund mit der falschen Begründung.** Nach der Mutation hieß der
    Befund „Siegelblock ohne Kopfzeile direkt unter Fliesstext", obwohl die Vorgängerzeile eine
    Tabellenzeile war. Ein Befund, der den Grund verwechselt, ist halb so wertvoll wie einer, der
    ihn nennt — die Meldung benennt jetzt ihren Vorgänger (Tabellenzeile mit N Zellen oder
    Fließtext), und `:170` hält den Fall, dass eine Liste wirklich hinter Prosa beginnt.
68. **Die Mappe trägt einen Tippfehler in ihrer Botschaft.** cbbeae4b nennt die App-Scheibe
    „App-Scheidung" statt „App-Schnitt". Behoben wird das hier, nicht mit `--amend`: ein Commit, der
    schon gesetzt ist, bleibt gesetzt, und die Chronik nennt die richtige Zahl.
69. **Eine Sonde meldete „0 von 109 nennen ein Werkzeug in Backticks" — und das war ein Befund über
    meinen Riss, nicht über die Sätze.** Der Zensus-Riss (`satz-riss.mjs`) nimmt den Text aus
    Markdown heraus und wirft die Zeichen mit weg; in `ohne_zeug` steht darum nie ein Backtick. Erst
    das Lesen eines JSON-Eintrags zeigte es. Die Zahl 0 war richtig und bedeutungslos — eine Zahl aus
    einer Sonde, deren Form die Welt nicht durchlässt, ist kein Maß. Berichtigt: Klassifizierung nach
    Wörtern (`maschine`-Regel des Zensus, eigens nachgelesen), nicht nach Zeichen.
70. **Drei Fälle waren im ersten Anlauf grün — und das ist die Form, in der eine Parität wohnt.**
    `:140`, `:159` und `:169` prüfen bestehende Wahrheit, also kein Rot vor der Tat. Ohne die drei
    Bisse in der Produktion (B1, B2, B3) hätte ich Regeln "geprüft", die nicht scheitern können. Der
    Fall, der das Blatt allein betrifft (B3: neunte App im README) ist der einzige der Nacht, der eine
    Lüge *im Papier* erwischt — vorher war das Blatt unbewacht.
71. **Der sechste Zahlen-Lauf, der Siegel-Zeilen verschob — diesmal ohne Guard-Ruf.** Zensus
    03:19:28 schrieb JSON *und* Log kleiner; beide Siegel-Zeilen setzte ich im selben Schritt
    (`68ddf1c2b0b5d5f1`, `0297efe63877d5db`). Die P145-Regel wirkt jetzt vor dem Befund. Der
    Unterschied zu den vier Fällen davor ist nicht Sorgfalt, sondern Reihenfolge: ich fuhr den Zensus,
    bevor ich das Blatt schrieb.
72. **Die 29-Funde sind ein Befund über die Regel, nicht über das Blatt.** Der Zensus verlangt den
    Zeugen *im selben Satz* (seit P122, mit Grund). Zwanzig Sätze mehr als erwartet nannten ihr
    Werkzeug im Nachbar-Satz — formal blind, für einen Leser aber belegt. Ich habe die Regel nicht
    aufgeweicht (das wäre der verführerische Fehler gewesen: Zähler steigt, Beweiskraft sinkt),
    sondern drei Sätze so umgebaut, dass der Beleg in ihrem Satz steht. Die andern 26 bleiben in der
    offenen Liste und sind eine Arbeit nach Kaufwirkung, nicht nach Zählerstand.
73. **Mappe-Commit f880072b wiederholt denselben Buchstaben-Fehler und macht daraus einen Satz mit
    Selbstkorrektur.** „Scheibe zur App-Scheidung… nein: Scheibe zum App-Schnitt" — ein Satz, der sich
    im selben Atemzug berichtigt, ist kein Satz, und „Scheidung" ist nicht das Wort. Beim nächsten
    Mappe-Commit schreibe ich den Botschaftstext, bevor ich ihn einsetze, und prüfe ihn gegen
    `git log -1` wie ein Artefakt.
74. **Ich hatte "keine Faelle" gesucht, ohne die Datei zu lesen, die den Vertrag schon hält.**
    `tests/mcp-behauptungen.test.ts:175` schreibt durch die HTTP-Agententür und liest danach die
    REST-Liste — das *ist* ein Stueck Paritaet. Mein Bericht hätte also lauten müssen: die
    Gegenrichtung und die Suche fehlen, nicht "alles". Berichtigt im Papier P152 (Abschnitt 1 nennt
    beide Nachbarn), und die Kontrolle der Kontrolle (`:116`) ist die neue Substanz.
75. **Ein Wort, das mein Fall abschaltet, darf nicht an diesem Fall haengen.** README.md:85 sagt
    "encrypted knowledge base"; meine neuen Fälle setzen `KEPTA_ENCRYPTION=off` (wie die
    Server-Suite seit dem Keychain-Lernfall). Hätte ich die Paritaets-Faelle als Zeugen fuer das
    Wort "encrypted" hingeschrieben, wäre eine falsche Behauptung mit einem wahren Fall belegt
    worden. Also: Paritaet an `tests/mcp-rest-paritaet.test.ts:66/:80`, Verschlüsselung an
    `tests/nebendateien.test.ts:22/:41`, und der Satz nennt beide getrennt.
76. **Ich hatte eine Ueber-behauptung bewaffnet, statt sie zu pruefen.** P151 setzte Zeugen in
   README.md:355 und ließ den Satz "Every tool in the app runs without bound" stehen — während
   `server/helfer/limiter.ts:63` den Chat bei 20/min deckelt. Ein Beleg an einem falschen Satz ist
   kein Beweis, sondern ein falsch beglaubigter Satz (P134, P142). Gesehen beim Lesen der
   Nachbar-Zeugen-Liste in P153, nicht beim Schreiben.
77. **Zwei Anker in der neuen Wache waren zu eng geraten, bevor sie gruen wurden.** Die erste Fassung
   schrieb `windowMs: \d+` gegen einen Quelltext mit `60_000` — die Sonde warf ("der Limiter nennt
   seine chat-Kante nicht im Quelltext") statt zu prüfen, und ein zweiter Fall war als Blindgänger
   gebaut (`it.each(datei => datei)`), weil ich das Ende des Blocks aus dem Kopf schrieb. Beides vor
   dem ersten gruen gesehen und ersetzt: `[\d_]+`, und der zweite Fall liest jetzt Absätze statt
   Zeilen. Eine Wache, die wirft, ist keine Wache; eine, die ins Leere prüft, ist schlimmer.
78. **Die Platte ist nicht mein Verdienst.** 8,46 GiB frei um 03:43:59 MEZ, 8,17 GiB um 03:45:36 —
   die Bau-Kante von 9,90 GiB bleibt zu, und die 10,30 GiB im `release/`-Ordner sind Damians Wort,
   nicht mein Räumgang.

79. **Ein Edit aus dem Kopf setzte meinen eignen Tippfehler zurück.** Beim Einbau der
   `stdio`-Röhre schrieb ich `nennung` in den `old_string` und `ennung` in den `new_string`; der
   Helfer war danach schlechter als vorher, und der nächste Lauf meldete „diesen Blob gibt es in
   diesem Baum nicht" für einen Blob, der da war. Gegen Anker aus dem Kopf habe ich ein Werkzeug
   gebaut; Quelltext aus dem Kopf schreibe ich weiter.
80. **Ein `catch` verschluckte einen eignen Bruch und verkaufte ihn als Befund über ein Blatt.**
   Zweimal an Kopien nachgemessen (10:38:30 und 10:41:26 MEZ): 20 von 20 Befunden erfunden, dann
   22 von 23. Mit dem neuen Zweig wirft die Kopie. Eine Wache, die ihren Crash als Urteil ausgibt,
   ist schädlicher als keine.
81. **Mein eigner neuer Absatz verschob Zeilen und machte zwei Fremdanker falsch.**
   `README.md:448` und `README.md:456` im Ledger trafen nach dem Eintragen Inhalt — aber den
   falschen (Tabelle statt Ausnahmetext, Einleitung statt eval-Zahl). Die Wache kann das nicht
   sehen: Existenz und Inhalt, nicht Sinn. Per Hand gefunden (10:26 MEZ), geheilt auf :450 und
   :458; P155 ist der Fall, der ein wörtlich zitiertes Satzstück gegen die genannte Zeile prüft.
82. **Ein Python-Splice rechnete mit den Zeilen vor eigner Einfügung** und überschrieb zwei
   Kommentarzeilen des Riss-Falls, darunter den Hinweis auf README.md:181, und ließ zwei
   erwartet-Zeilen übereinander stehen (179/74 unter 180/75). Gesehen, weil ich nach dem Schreiben
   die getroffene Region zurücklas; Block neu gesetzt, Fall danach 15 von 15 grün.
83. **Zwei Zahlen nannten die falsche Stunde.** Ich schrieb „09:22:48 MEZ", wo die Maschine
   10:22:48 MEZ meldete — der Sitzungs-Stempel ist UTC, die Platte läuft CET. Berichtigt, und die
   Uhr der Platte ist jetzt die einzige, die in meinen Sätzen steht.
84. **Der erste Deckel war eine Zahl aus der halben Arbeit: 135.** Gezählt wurden 137, dann 152
   verwaiste Kurzformen — mein eigner README-Absatz und mein eigner Ledger-Absatz brachten 15
   davon mit. Der Fall wurde rot und lehrte mich, genau wie gedacht
   (`tests/anker-wache.test.ts:205`).
85. **Der zweite Satz über die Fundzahl war eine Über-behauptung: „two dead witnesses".** Der
   erste echte Lauf fand vier Anker, mit der Kurzform sechs. Nachgemessen in den Läufen 09:49 und
   10:11 MEZ, berichtigt im README-Absatz und im Papier.
86. **Zwei Minuten nach dem Bauen der Anker-Wache setzte ich wieder einen Anker aus dem Kopf.**
   Der Ledger-Satz nannte „:44 bis :196" für den neuen Fall; gemessen beginnt der describe auf
   :73 und der letzte Fall schließt auf :194. Und mein eigner §42-Text zitierte beim Beschreiben
   des Fehlers zwei tote Zeugen: einen Blob-Anker ins
   Kern-Repo (`2c942be` in `package.json`, dort Zeile 3) und einen Bereich in
   `src/components/Dashboard.tsx`, der bei Zeile 1405 anfing — die Wache fing beide, weil sie auch
   das Blatt liest, das von ihr erzählt.
   liest, das von ihr erzählt. Daraus die Regel für alle künftigen Fehlerberichte: eine tote Zeile, über die
   berichtet wird, nennt man im Prosatext ("Zeile 1405"), nicht als Anker — sonst meldet die
   Wache den Bericht, der von ihr handelt. Das Werkzeug hält die Fläche, nicht meinen Griff.
