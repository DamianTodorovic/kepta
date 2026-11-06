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
`src/components/Settings.tsx:831`, `spur.example` eine Beispiel-URL in einem Kommentar
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
Regel lebte nur im Baum (`src/components/Dashboard.tsx:1405-1419`), kein Fall fuhr sie. Gebaut:
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
