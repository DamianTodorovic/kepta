# Beleg-Ordner `docs/belege/` — was hier liegt, woher es kommt, und wer es zitiert

Die Regel, die diesen Ordner gibt: **ein Beleg, den ein Kunde nicht oeffnen kann, ist kein
Beleg.** Der Kern-Repo ignoriert `*.log` (`.gitignore:22`) — deshalb liegt jede Messdatei
hier als `.log.txt`: Inhalt byte-identisch zur Quelle, nur die Endung erweitert — **mit einer
einzigen dokumentierten Ausnahme, der Kur unten**. Die Ignore-Regel bleibt intakt: eine Regel,
die Beweise verschluckt, hebelt man nicht aus, um sie zu umgehen (Leitung, 12.10.).
Zitiersprache fuer die Papiere: `LESEFADEN.md` (§10).

Ursprung aller sechs Logs + einer Textdatei: `audit-2026-10-09/e2-code/nacht-12-10/rohdaten/`
in der Arbeitsmappe — lokal, ohne Fern, auf einem Runner nicht vorhanden.

| Datei im Repo | Bytes | sha256 (16) |
|---|---|---|
| `flaechenanteil-1441.log.txt` | 465 B | `b050380cac74e5b2…` |
| `kleinste-scheibe-2007.log.txt` | 1226 B | `b243ec3e278f9b7c…` |
| `ruhe-mit-anteil-1444.log.txt` | 1946 B | `59c36f131bd9bb0e…` |
| `sockel-rig.txt` | 7820 B | `61d259be307f37eb…` |
| `vorher-gleich-12-10.log.txt` | 444 B | `2222d29a6a0ca016…` |
| `welt-stufe.log.txt` | 6787 B | `b8631e17c4dce3a3…` |
| `weltdeckung-1558.log.txt` | 373 B | `2d045af4e122e915…` |

Summe: **19061 Bytes** in 7 Dateien. Stand der Kopie: 2026-10-12 21:35 UTC; Kur: 23:5x UTC.

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
keinen Personenpfad (geprueft mit `grep -c "/Users/"` = 0 ueber alle sieben Dateien).

**Eine gemeldete Luecke, keine Kur:** `sockel-rig.txt` verweist auf weitere `sockel-halb-*.log`
(einer pro Suite-Lauf, zusammen etwa 2 MiB). Die Wache folgt verschachtelten Zitaten nicht; ob
die Einzellaeufe ins Repo gehoeren, ist eine Groessenentscheidung, keine Beweisfrage.
