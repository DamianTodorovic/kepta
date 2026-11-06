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

- Die **oeffentliche** README (`~/kepta-core/README.md:83`) trägt denselben falschen Pfad
  `/Applications/KEPTA.app` und ist bereits veröffentlicht. Ich habe sie nicht angefasst: ändern ist lokal
  möglich, veröffentlichen ist Damians Wort, und der Kern-Baum hat seine eigne Taktung. Eine Zeile,
  drei Wörter.
- Der erste Start eines quarantäne-behafteten Bundels auf macOS 26 — siehe Abschnitt 4.
- x64 und Summen in der Landungs-Kette (Abschnitt 7, Punkt 3).
- Die 32 alten Fassungen in `release/` und die drei Rücklager: sein Wort, nicht meins.

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
