# DESIGN.md — der Vertrag der Fläche

Dieses Blatt ist die Verabredung, nicht die Messung. Messungen stehen in den Instrumenten
(`scripts/design-wache.mjs`, `scripts/pruefe-einstellungen-im-fenster.mjs`,
`tests/absage-statt-ausnahmewort.test.ts`); hier steht, **was gilt** und **welches Instrument es
hält**. Eine Zeile, die hier steht und deren Zahl niemand misst, ist ein Wunsch — die Wache
schlägt, wenn ein Regelname hier fehlt oder sich eine Zahl von ihrem Sitz entfernt.

Sprache der Fläche ist **Englisch** (Punkt 7). Dieses Blatt ist Deutsch, weil es niemand kauft.

---

## 1. Eine Sache, ein Wort

Jedes Ding hat einen Namen, und derselbe Name bedeutet überall dasselbe: **note** (nicht
"node", nicht "memory", nicht "item"), **knowledge base** für die Datei, **search index** für den
Index, **AI app** für den Claude/Cursor/ChatGPT-Client. Ein Fachwort ohne Erklärung an der Stelle,
die es zeigt, ist ein Fehler, kein Fachausdruck.

**Hält:** `scripts/verstaendlichkeit.mjs` (Sätze mit Fachwort ohne Grund und ohne Tätigkeit),
`tests/components/verstaendlichkeit-*.test.tsx`.

## 2. Eine Zahl nennt ihren Nenner und ihren Moment

"42 700 concepts" ohne Grundgesamtheit ist keine Auskunft. Jeder Zähler nennt, wovon: *"of
21 066 in the store"*. Jeder Messwert nennt seine Uhrzeit und seine Fassung. Ein Anteil nennt
seine Maske, seine Blende und seinen Nenner.

**Hält:** `tests/components/graph-kopf-ladezustand.test.tsx`,
`tests/components/dashboard-seiten-wache.test.ts`, die Zahlen-Wache des Registers.

## 3. Leiter und Kontrast

| Rolle | Token | gemessenes Verhältnis | Latte |
|---|---|---|---|
| Grundtext | `--text-1` | Leiter 1,02:1 über die Stufen | Stufen müssen sich unterscheiden |
| gedämpfter Text | `--text-3` | **2,26:1** gegen den Grund | unter 4,5:1 nur, wenn die Zeile keine Auskunft trägt |
| Legendenpunkte im Graph | Typfarben | **6,70 / 6,71** dunkel, **6,76 / 6,80** hell | ≥ 4,5:1, gemalt aus Pixeln, nicht gerechnet |
| Flächenkante | `--kante-flaeche` | 1,98 → **4,45** nach der Rolle | eine Kante, die man sieht, ist keine Dekoration |

Verboten: `opacity-70` (oder jede andere Deckkraft) auf Text, der eine Auskunft trägt — gemessen
16 von 16 Legendenwörtern dadurch unter 4,5:1.

**Hält:** `scripts/design-wache.mjs` (Kontrast- und Token-Sitze), die Bildstraße
`scripts/pfade-im-fenster.mjs`.

## 4. Zwei-Kanal-Regel

Gleicher Kontrast zweier Typfarben ist erlaubt — **aber dann muss ein zweiter Kanal sie
unterscheiden** (Sättigung, Form, Lage). Gemessen 16.10.: ΔL **0,0009** zwischen `semantic` und
`reference` bei gleichem Kontrast; die Fläche malte zwei Dinge, die ein Mensch nicht trennt.

**Hält:** `scripts/design-wache.mjs` (`typfarben`), das Legendenbild im Fensterlauf.

## 5. Zielgrößen-Boden

Kein treffbares Ziel unter **20 px** in beiden Achsen. Gemessen am ausgelieferten Objekt:
113 Ziele in 3 Sichten, 0 unter dem Boden, kleinstes 36 px. Ausgeblendete und nicht treffbare
Elemente zählen nicht als Ziel — ein verstecktes Steuer ist kein Steuer.

**Hält:** `scripts/pruefe-einstellungen-im-fenster.mjs`, Zyklus `tastmass`.

## 6. Stufen, nicht Einzelfälle

Radien und Größen leben in Stufen (`--r-panel`, `--r-card`, `--r-btn`, `--r-chip`, `--r-badge`).
Eine neue Stufe für einen Einzelfall ist verboten; der Einzelfall irrt, die Stufe bleibt.
Rundung wird am Token gerundet, nicht an der Zeile.

**Hält:** `scripts/design-wache.mjs` (`css:klassen-waisen`, `schrift:größen-fremd`,
`schrift:gewichte-fremd`, `icons:groesse-fremd`, `icons:name-fremd`), Zyklus `radien` im Fensterläufer.

## 7. Was eine Klappe verdecken darf

Eine zugeklappte Legende deckt bei 390 px **höchstens 25 %** der Leinwand. Gemessen vor der
Latte: 33,4 % bei 600 Notizen, 41,7 % am echten Bestand. Zuerst fallen die zwei Zustandszeilen
hinter die Klappe, nicht der Inhalt, den ein Mensch beim ersten Blick braucht.

**Hält:** `scripts/legende-hoehe.mjs` (`--breite --hoehe --saat`).

## 8. Der Graph malt, was er weiß

Titel nur nach Zoom (Etat aus der Leinwand, nicht aus der Laune), Waisen nicht versteckt
(`showOrphans`), Lesbarkeitsboden als gemalte Kante, und ein Bild, das ohne die Engine nicht
entstehen kann, sagt das in der Kopfzeile. Keine Überlappung zweier Scheiben im Ruhezustand —
gemessen null Paare bei 400, 1 500 und 3 000 Notizen, vor und nach einem Zug.

**Hält:** `tests/lib/graphLayout.test.ts`, `scripts/fps-laeufer.mjs` (Zieh-Geometrie und
Bild-Quittungen).

## 9. Fehlerpfade nennen Herkunft und Grund

Ein Fehler, der auf die Fläche darf, sagt **was** nicht geschah, und dahinter den Grund, wenn
unsere eigene Tür ihn geschrieben hat. Alles, was ein Browser, eine Laufzeit oder eine
Bibliothek wirft, bleibt im Protokoll.

| Fall | Satz auf der Fläche |
|---|---|
| die Tür antwortete und lehnte ab | `… refused it (HTTP 413)` oder ihr Satz in der Klammer |
| niemand antwortete | `… did not answer` — ohne Klammer, ohne Zahl |
| eine 200 ohne lesbaren Text | `… arrived without readable text` |
| ein Zähler, der nicht gelesen wurde | "nicht gelesen", **nicht** 0 |
| die Engine lehnte die Frage ab | "the search index refused (HTTP 500)", nicht "did not answer" |

Verboten: roher Ausnahmewortlaut, ein Pfad des Rechners, eine Zahl ohne Grund, ein `undefined`
in einem booleschen Feld, und ein Grund, den kein Leser sieht (Buchführung ist keine Auskunft).

**Hält:** `tests/absage-statt-ausnahmewort.test.ts` (Erlaubnisliste ist leer und wird als Tripwire
geprüft), `tests/lib/store-herkunft.test.ts`, Zyklus `healthgrund` im Fensterläufer.

## 10. Verboten, weil gemundet

`min-h-screen` und `min-h-[100dvh]` (skaliert mit Zoom), `overflow-hidden` als Beweis für
Überlauf, ein zweiter Titel für dasselbe Steuer, ein Tooltip als einziger Träger einer Auskunft,
und eine Regel in CSS, die niemand ruft (Sitz: 0 tote Regeln -- die 18 Sitze vom 14.10. sind am 5.11. geloescht, siehe Wache).

## 11. Abnahme vor jeder Unterschrift

1. Wer führt auf genau dieser Achse, und wer von uns liegt vorn — Zahl aus eigenem Lauf.
2. Ist das in der Gratisversion sichtbar erreichbar — ohne Schlüssel, ohne Schranke, ohne "bald".
3. Habe ich es im echten Fenster gesehen, bei 1440 und bei 390, und das Bild selbst angesehen?
4. Was ist der nächste Punkt, an dem wir noch schlechter sind? Kann ich ihn nicht benennen,
   habe ich nicht gesucht.
