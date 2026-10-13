# Beleg-Ordner `docs/belege/` — was hier liegt, woher es kommt, und wer es zitiert

Die Regel, die diesen Ordner gibt: **ein Beleg, den ein Kunde nicht oeffnen kann, ist kein
Beleg.** Der Kern-Repo ignoriert `*.log` (`.gitignore:22`) — deshalb liegt jede Messdatei
hier als `.log.txt`: Inhalt byte-identisch zur Quelle, nur die Endung erweitert — **mit den
unten dokumentierten Ausnahmen** (zwei Kuren und ein Papier-Auszug, der kein Lauf ist). Die
Ignore-Regel bleibt intakt: eine Regel,
die Beweise verschluckt, hebelt man nicht aus, um sie zu umgehen (Leitung, 12.10.).
Zitiersprache fuer die Papiere: `LESEFADEN.md` (§10).

Ursprung der Logs und Textdateien in `nacht-12-10/`: `audit-2026-10-09/e2-code/nacht-12-10/rohdaten/`
in der Arbeitsmappe — lokal, ohne Fern, auf einem Runner nicht vorhanden. Die eine Datei in
`nacht-11-10/` kommt nicht daher: sie ist ein ueberlebendes Papier, kein Lauf (unten).

| Datei im Repo | Bytes | sha256 (16) |
|---|---|---|
| `flaechenanteil-1441.log.txt` | 465 B | `b050380cac74e5b2…` |
| `kleinste-scheibe-2007.log.txt` | 1226 B | `b243ec3e278f9b7c…` |
| `ruhe-mit-anteil-1444.log.txt` | 1946 B | `59c36f131bd9bb0e…` |
| `sockel-halb-1-230627.log.txt` | 50235 B | `cbc66681fc20968e…` |
| `sockel-rig.txt` | 7820 B | `61d259be307f37eb…` |
| `vorher-gleich-12-10.log.txt` | 444 B | `2222d29a6a0ca016…` |
| `welt-stufe.log.txt` | 6787 B | `b8631e17c4dce3a3…` |
| `weltdeckung-1558.log.txt` | 373 B | `2d045af4e122e915…` |
| `nacht-11-10/e2-weltdeckung-kueche-11-10.auszug.txt` | 1841 B | `a6601418cc1fa72e…` |
| `r1/ablation-2326.log.txt` | 3213 B | `8cafcf22fe06dd67…` |
| `r1/eval-0037.log.txt` | 1493 B | `031c0443bc413d18…` |
| `r1/kontext-groesse-2128.log.txt` | 1835 B | `204e65256c2503b4…` |
| `nacht-13-10/sockel-nachbau-1357.log.txt` | 1359 B | `85fa18ab82409dfb…` |

Summe: **79037 Bytes** in 13 Dateien, Stand der letzten Kopie: 2026-10-13 11:57 UTC; Kuren:
23:5x UTC (12.10.) und 13.10. Die drei `r1/`-Laeufe sind jetzt mit Zeilen eingetragen — der
Satz, der sie als offene Luecke nannte, ist damit gegenstandslos.

Die eine Datei, die sich von allen anderen unterscheidet: `nacht-13-10/sockel-nachbau-1357.log.txt`
stammt aus `scripts/nachbau-sockel.mjs` (`a85be354f55696c7…`), und das Skript **liegt im Repo**.
Jeder kann den Nachbau auf seinem Rechner selbst fuehren (`node scripts/nachbau-sockel.mjs`) —
die Zeilen sind also nicht nur ein Protokoll von diesem Schreibtisch, sondern eine Behauptung
ueber Socket-Ordnung, die nachpruefbar ist. Was sie sagt, in einem Satz: ein Horcher ohne Host
bindet `::` (IPv6-Wildcard), und ein spaeterer ausdruecklicher v4-Hoerer auf derselben Zahl
gewinnt die Demux und beantwortet die Anfragen, die fuer unseren Server gedacht waren (FALL 3
und 4, je `401 text/plain`). Das ist die Signatur der beiden Roetungen `401 {}` und `404 {}`
in dieser Suite — geheilt durch `tests/helfer/hoerer.ts`: ein Horcher je Datei, auf
`127.0.0.1` ausdruecklich (FALL 5: ein zweiter v4-Bind auf derselben Zahl scheitert dann mit
`EADDRINUSE` statt still daneben zulauern), Port aus dem Fenster unterhalb der ephemeren
Untergrenze dieses Rechners (`49152`).

## Die Kur an `ruhe-mit-anteil-1444.log.txt` — entschieden von der Leitung, gefahren von W

| Was | Angabe |
|---|---|
| Entfernte Zeile | **Zeile 2** der Quelle: ` RUN  v4.1.11 /Users/damiantodorovic/kepta-core` |
| Warum | eine Personalkennung ist kein Messwert; der Pfad gehoert nicht in ein oeffentliches Repo (Leitung, 12.10. 23:5x: „Redigieren, ja — aber so, dass der Beweis heil bleibt") |
| Umfang | **nur** die vitest-Kopfzeile ueber die Maschine. Keine Messzeile, keine Ergebniszeile, keine `stdout`-Marke angefasst |
| Messzeilen | Quelle 5 / 8 / 11 → jetzt **4 / 7 / 10** (`[ruhe] knoten=400 …`, `knoten=1500 …`, `knoten=3000 …`); Inhalt unveraendert |
| Groesse | 2043 → 1946 Bytes (−97 B = eine Zeile), 21 → 20 Zeilen |
| Beweis der Kur | `diff <(sed '2d' <quelle>) <datei>` → **EXIT 0**, also identisch in jeder Zeile ausser der geschnittenen |
| sha256 | vorher `98956a77bb764988…`, nachher `59c36f131bd9bb0e…` |

Damit gilt fuer diese Datei nicht „bytegleich zur Quelle", sondern **„bytegleich in allen
Messzeilen"** — und der Unterschied steht hier sichtbar, nicht als Stillschweigen.
`sockel-rig.txt` wurde nicht geschnitten: seine `Duration`-Zeilen nennen keine Maschine und
keinen Personenpfad (geprueft mit `grep -c "/Users/"` ueber jeder Datei dieses Ordners; die
einzige Nennung steht in diesem REGISTER als Zitat der geschnittenen Zeile).

## Die Kur an `sockel-halb-1-230627.log.txt` — gefahren 13.10.2026, Zahlen-Scheibe

| Was | Angabe |
|---|---|
| Quelle | `audit-2026-10-09/e2-code/nacht-12-10/rohdaten/sockel-halb-1-230627.log` — der erste der fuenf Sockel-Rig-Laeufe, den `sockel-rig.txt` selbst nennt |
| Warum ins Repo | `CHANGELOG.md` zitiert genau diesen Lauf als Beweis fuer den einen fremden Fall in Nacht (`tests/herkunft.test.ts` antwortet 404 statt <300, nur in Pass 1). Ein Zitat, das nur auf einem Schreibtisch existiert, ist fuer jeden Runner und jeden Kunden ein toter Link — die Wache meldet das als `beleg-nicht-im-repo`, und auf einem Runner meldete sie es als `pfad-existiert-nicht` |
| Entfernte Zeilen | **Zeile 6** (die vitest-Kopfzeile mit dem Maschinenpfad) und **Zeile 529** (die Meldung, wohin vitest seinen JSON-Bericht schrieb) — mehr nicht |
| Umfang | beide Zeilen nennen den Heimordner des Rechners, keine Messung. Keine Messzeile, keine Ergebniszeile, keine `stdout`-Marke angefasst; die Zeilen 1 bis 5 bleiben, Zeile 7 bis 528 bleiben, Inhalt unveraendert |
| Zeilennummern | weil Zeile 6 faellt, numeriert die Kopie ab dort eine tiefer: der FAIL der Quelle auf 408 steht in der Kopie auf **407**, der Fall der Quelle auf 410 dort auf **409** — die Doku nennt die Zahlen der Kopie und sagt das dazu |
| Groesse | 50 414 → 50 235 Bytes, zwei Zeilen weniger |
| Beweis der Kur | `diff <(sed '6d;529d' <quelle>) <datei>` → **EXIT 0**, also identisch in jeder Zeile ausser den beiden geschnittenen |
| sha256 | Quelle `6c445b7139a8609d…`, Kopie `cbc66681fc20968e…` |

## Der Auszug `nacht-11-10/e2-weltdeckung-kueche-11-10.auszug.txt` — Papier, kein Lauf

Diese Datei ist **kein Mess-Artefakt**. Sie ist der wortgleich uebernommene Ausschnitt aus dem
Scheiben-Bericht `E2-GRAPH-FLAEche.md` (Arbeitsmappe, Ordner `audit-2026-10-09`), und zwar
Zeile 1144 bis 1160 jener Datei — Tafel der Weltdeckung am Kuechenbestand samt ihrem eigenen
Kanal-Hinweis. Uebernommen, weil das veroeffentlichte 3.3.0 in genau dieser Tafel eine
Weltdeckung von 118 % nennt (sie steht im uebernommenen Block, `nacht-11-10/e2-weltdeckung-kueche-11-10.auszug.txt`),
und die zugehoerigen JSON-Rohdaten
zusammen mit `/tmp/kepta-kollision-gf/` verloren sind: der Auszug ist, was von dieser Messung
uebrig ist, und er sagt das in sich selbst.

| Was | Angabe |
|---|---|
| Beweis des Wortlauts | `diff <(sed '1144,1160p' <quelle>) <datei>` ueber den Block zwischen den zwei Marke-Zeilen → **EXIT 0** |
| Kopf des Auszugs | sechs Zeilen Prosa von dieser Scheibe, als solche gekennzeichnet: „ueberlebendes Papier, KEIN Maschinenlog", plus der Verweis auf `docs/belege/nacht-12-10/weltdeckung-1558.log.txt` — den Maschinenlauf zu derselben Rechnung, gemessen an dem Feld, das heute im Repo liegt |
| Groesse | 1841 Bytes |
| sha256 | `a6601418cc1fa72e…` |

Wer eine Zahl in einer Doku findet, die auf diese Datei zeigt, bekommt also: ueberlebendes
Papier zweiter Hand, benannt als solches, und den Hinweis auf den Maschinenlauf, der sie
nicht mehr kann. Fuer neue Zitate bleibt die Regel: **Log zuerst.**

**Eine gemeldete Luecke, keine Kur:** `sockel-rig.txt` verweist auf weitere `sockel-halb-*.log`
(einer pro Suite-Lauf, zusammen etwa 2 MiB). Die Wache folgt verschachtelten Zitaten nicht.
Pass 1 liegt jetzt hier (er ist in der Doku zitiert); die vier andern Laeufe bleiben in der
Arbeitsmappe, weil kein Papier des Kerns eine Zahl an ihnen misst — die Doku sagt das an der
Stelle, die sie nennt.
