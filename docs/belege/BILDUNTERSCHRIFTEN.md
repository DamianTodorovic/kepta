# Belegorte für Bildunterschriften — `docs/bilder/` (B1s Feder, von W1 gelegt)

**Warum diese Datei existiert:** die sechs Stücke in `docs/bilder/` liegen seit 12.10.
im Repo, **kein einziges getrackte Markdown zitiert sie** (gemessen 14.10. 18:5x MESZ:
`git ls-files '*.md'` über alle Papiere, Treffer für `bilder/` = **0 Dateien**). Ein
Bild ohne Belegort ist eine Behauptung in Pixeln. Diese Datei gibt B1 die Orte: pro
Stück die Zahl, die ihre Unterschrift nennen darf, und die Zeile in der Datei, die
sie hält.

**Regel beim Schreiben (Zitiergrammatik §10 in `docs/belege/LESEFADEN.md`):** eine Zahl
darf nur nennen, wer im selben Satz das Artefakt und seine Zeile nennt. Die Größen und
Hashes unten sind am 14.10. von mir gemessen, nicht übernommen.

## Die Stücke, wie sie im Repo liegen

Aus `docs/bilder/MANIFEST.json` (wer: Scheibe Bildregie, Stand 12.10.), Grössen und
sha256-Werte heute nachgelesen: `sha256sum docs/bilder/*` gekürzt auf 16 Zeichen. Die Grössen sind kein Artefakt-Inhalt, sondern Befehlsausgabe: `wc -c docs/bilder/*` und
`shasum -a 256 docs/bilder/*`, gefahren 14.10.2026, 18:5x MESZ — wer sie nachprüfen will,
fährt die zwei Befehle im Repo und vergleicht die Tabelle.

| Stück | Bytes | sha256 (16) |
|---|---|---|
| `kepta-graph-notiz-1600x900.png` | 38 867 | `0162a7de87ea` |
| `kepta-graph-notiz-1600x2676.png` | 160 752 | `29526ca32882` |
| `kepta-graph-konzept-1600x900.png` | 18 620 | `77fc31d56693` |
| `kepta-scheidung-960-0Paare.gif` | 190 403 | `fc9eb99c5e8a` |
| `kepta-scheidung-960-0Paare.mp4` | 726 022 | `2d8e11a7137c` |
| `kepta-architektur-1600x900.png` | 294 743 | `8bdee52aedc5` |

## Welche Zahl welche Unterschrift trägt

**Graph-Stücke** (`graph-notiz`, `graph-konzept`). Die Größenordnung, die im Bild
sichtbar ist, ist die kleinste gezeichnete Scheibe und ihr Flächenanteil an der Welt;
beides steht in `docs/belege/nacht-12-10/kleinste-scheibe-2007.log.txt` im **FALL A**
(das gelieferte Bild, Kern-Quelltext von 12.10.): Zeile 5, Zeile 6, Zeile 7 für 400,
1 500 und 3 000 Knoten. Radius dort: 10,16, Weltseite 1 321, 1 775, 2 759.

- 400 Knoten: Anteil **0,769 %** (kleinste Scheibe gegen die Weltseite) — Datei
  `docs/belege/nacht-12-10/kleinste-scheibe-2007.log.txt` Zeile 5
- 1 500 Knoten: Anteil **0,572 %** — `docs/belege/nacht-12-10/kleinste-scheibe-2007.log.txt` Zeile 6
- 3 000 Knoten: Anteil **0,368 %** — `docs/belege/nacht-12-10/kleinste-scheibe-2007.log.txt` Zeile 7
- Die drei Verhältnisse mediale Kante zu Kontrollpaar lauten **0,662 / 0,674 / 0,699**,
  gemessen in `docs/belege/nacht-12-10/ruhe-mit-anteil-1444.log.txt` (283 zu 427,
  385 zu 572, 571 zu 817)
- Die Weltdeckung derselbestands in Prozent: **16,4 % / 60,7 % / 120,4 %** vor der
  Weltgrößenänderung, danach **9,4 % / 19,3 % / 15,8 %** —
  `docs/belege/nacht-12-10/weltdeckung-1558.log.txt` Zeile 1, Zeile 2, Zeile 3

**Scheidungs-Stücke** (`scheidung-960-0Paare`, GIF und MP4 desselben Laufs). Das Bild
zeigt den Schritt von überlappenden Scheiben auf null. Die vorher-Seite und die
nachher-Seite stehen in **zwei verschiedenen** Artefakten — eine Unterschrift, die nur
eine von beiden nennt, erzählt die Hälfte.

- vorher: **7 134** eigene Paare, davon 5 236 flächig, bei 3 000 Knoten —
  `docs/belege/nacht-12-10/vorher-gleich-12-10.log.txt` Zeile 3
- nachher: **0** eigene Paare, **0** flächige, bei gleichem Bestand —
  `docs/belege/nacht-12-10/ruhe-mit-anteil-1444.log.txt` Zeile 10
- dieselbe Null, im längeren Nachbau-Lauf bestätigt: `paareEigen=0` bei 400, 1 500,
  3 000 Knoten — `docs/belege/nacht-12-10/sockel-halb-1-230627.log.txt` Zeile 9,
  Zeile 50, Zeile 152
- Bildmaß selbst: GIF **190 403 B** schlägt MP4 **726 022 B** für denselben Inhalt;
  Größen oben in dieser Datei (Gemessener Dateigrößen-Vergleich, keine Behauptung
  über Codec-Qualität)

**Architektur-Stück** (`kepta-architektur-1600x900.png`). Dieses Bild zeigt Schichten,
keine Messgröße. Die zugehörigen Zahlen (Kanten, Werkzeuge, Suite) **stammen nicht aus
den Belegen hier** — wer dafür eine Zahl in die Unterschrift schreibt, muss sie an ihrem
eigenen Artefakt belegen, sonst bleibt die Zeile eine Erfassungszahl ohne Beweis.

## Was ich geprüft habe, und was offen bleibt

- Jeder hier genannte Pfad existiert im Repo und ist **getrackt**: `git ls-files
  docs/belege` meldet 16 Dateien, `git status --short docs/belege docs/bilder` ist leer.
- Die Artefaktgrößen, die in `docs/belege/REGISTER.md` stehen, habe ich nicht
  nachgerechnet — die REGISTER-Zeilen sind Stand 12.–13.10. und eine davon
  (`ruhe-mit-anteil-1444.log.txt`) trägt die von der Leitung entschiedene Kur.
- **Offen für B1:** die Bildpfade selbst stehen in keinem Papier. Diese Datei nennt
  sie, aber sie ist nicht die Auslieferung — die Unterschriften gehören in `README.md`
  / `README.de.md`, und **deren Feder ist die README-Scheibe**. Wenn dort eine Zahl
  ohne Artefakt-Zitat auf derselben Zeile erscheint, meldet meine Wache sie als
  Befund (Pflichtdatei); das ist Absicht, nicht Ärger.
