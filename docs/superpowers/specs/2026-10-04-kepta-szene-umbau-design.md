# K3PTA · Umbau der Landingpage in die Sprache der Referenz-Filme

Stand 4.10.2026 · Entwurfsvertrag für den Build · Arbeitsmappe, kein Git-Repo (kein Commit möglich)

## Bezug

Fünf Screen-Recordings in `/Users/damiantodorovic/Desktop/kurz/` zeigen ein Reel
(wearebrand.io, „Websites in 2026") mit fünf Preisträger-Sites. Katalogisiert und
ausgeleuchtet in `web-qa/refframes/v1…v5/` (137 Einzelbilder) und
`web-qa/refsheets/*.png` (14 Kontaktbögen).

| Film | Site | Signatur |
|---|---|---|
| v1 | ORBIT | ein Produkt auf ausgeleuchteter Bühne, Typo klein am Rand |
| v2 | Pear makes you appear | gemalte Welt, ein Satz pro Szene, winzig, oben links |
| v3 | Bergarchitektur | Sturz durch Wolken, Fokus-Zieher, Bauplan über dem Foto |
| v4 | EVEREST – the ascent | 3D-Gelände, gezogene Route, Glas-Akte links, HUD unten rechts |
| v5 | 100 · Iglu | High-Key-Weiß mit Bloom, Objekt baut sich aus Drahtgitter auf, löst zu Partikeln |

## Die Grammatik, die alle fünf teilen

1. Der Viewport **ist** die Welt. Kein gestapeltes Dokument mit Bild dahinter.
2. Scrollen ist **Kamerazeit**, nicht Seitenhöhe. Kapitelübergänge sind
   Linsen-Ereignisse: Fokus-Zieher, Bewegungsunschärfe, Partikel-Auflösung, Bloom.
3. **Ein** Objekt trägt die Seite: beleuchtet, mit Boden, im Zustandswechsel.
4. Typo ist knapp: Wortmarke, ein Satz pro Szene, Micro-Labels in den Ecken.
   Absätze stehen in einem **Panel am Rand**, nie auf der Welt.
5. Kein Menü, ein **HUD**: Schritt, Route, Zahl.

## Was die Seite heute tut und warum das der Bruch ist

`github.io/index.html` fliegt eine Kamera durch eine WebGL2-Welt — aber der Inhalt
ist ein Dokument aus 13 `<section>`-Elementen mit der Welt *dahinter*, durch
`clearMask`-Löcher freigeschnitten. Das ist Punkt 1 und 4 in ihr Gegenteil verkehrt.

## Beschlossen

- **Objekt:** das Leben einer einzigen Erinnerung.
- **Hell:** High-Key-Elfenbein mit Bloom, Dunst und Schärfentiefe.
- **Zwei Akte:** Akt 1 ist Szene, Akt 2 ist Papier. (Von Damian nicht ausdrücklich
  gewählt; als Default gesetzt und im Build sichtbar.)

## Akt 1 — sieben Szenen

Jede Szene ist eine Kamerabewegung über demselben Objekt. Scroll-Fortschritt u in
[0,1] wird in Szenenzeit übersetzt; Szenengrenzen sind die Übergänge.

| # | Szene | u | Kamera | Zustandswechsel des Objekts | Behauptung |
|---|---|---|---|---|---|
| 1 | Ankommen | 0.00–0.10 | Sturz aus der Leere, Einfangen | ein Knoten zündet aus Nichts | etwas wird gespeichert, auf dem eigenen Rechner |
| 2 | Verdrahtet | 0.10–0.24 | Umkreisung, Annäherung | Kanten wachsen aus dem Knoten, Hub-Namen erscheinen als Ortsnamen | es ist ein Geflecht, kein Ordner |
| 3 | Gefunden | 0.24–0.38 | Suchlicht fährt durch die Masse | getroffene Knoten heben sich in Rangfolge | Rangfolge statt Volltext-Treffer |
| 4 | Gültigkeit | 0.38–0.50 | Kreis um einen Knoten, Zeitring schließt | Farbe dämpft, Ring datiert | Wissen hat ein Verfallsdatum |
| 5 | Ersetzt | 0.50–0.62 | Neue Version schiebt sich vor die alte | alte wird Drahtkontur, bleibt sichtbar | nichts verschwindet still |
| 6 | Wiedersehen | 0.62–0.80 | großer Rückzug bis zur Gesamtgestalt | ein Faden leuchtet über die Distanz | nach Monaten wieder gefunden |
| 7 | Beweis | 0.80–0.92 | Einfrieren, Licht wird flach | Welt wird Bauplan, Bauplan wird Papier | Zahlen, Belege, Preis |

Szene 6 trägt den Playground: die Eingabe ist die Laterne, mit der man durch die
Gestalt leuchtet; die Antwort ist Bewegung in der Welt, nicht Liste im Karton.

## Gesetz pro Szene (gilt für alle sieben)

- Viewport randlos Welt; kein Hintergrund-Pattern, kein Kartenrahmen.
- **Satz:** links unten, eine Zeile im Umbruch bis 1.200 px, Display-Schnitt,
  maximal 14 Wörter, erscheint mit Fokus-Zieher.
- **Akte** (nur wo Substanz nötig): Glas-Panel links, 22 vw breit,
  Micro-Zeile · Titel · Trennlinie · zwei Absätze · Beleg-Link. Sie steht *neben*
  der Welt und verdeckt sie nicht.
- **In-der-Welt-Labels:** Merksatz-Text am Knoten, Datums-Pills mit Zuleitung.
- **HUD:** unten Mitte eckige Schrittanzeige `[ RETAINER ] 3/7`, unten rechts die
  Zahl, die die Welt wirklich misst, unten links die sieben Kapitelstriche.
- **Übergang:** ausgehendes Objekt löst in Partikel auf, eingehendes zieht aus
  Unschärfe scharf, beides mit Geschwindigkeits-Unschärfe an den Bildrändern.

## Akt 2 — Papier

Ab Ende von Szene 7: die Welt fährt auf ein stehendes Wasserzeichen zurück, der
Rest der Seite ist ein echtes, lesbares Dokument auf Elfenbein. Unverändert erhalten
bleiben: Produkt-Screens, Kern, Preise, FAQ, Recht, Kontakt, `trust.html`.
Begründung: ein Käufer von Enterprise-Speicher verlangt Schwarz auf Weiß, und jede
Zahl muss auf einen Commit zeigen können.

## Was technisch neu gebaut wird

| Bauteil | Vertrag |
|---|---|
| Bloom-Pass | Hellkanthelligkeit + separable Kurzfaltung in halber Auflösung, additiv vor dem Ziel-Puffer; darf die 60 Bilder nicht kosten und im dunklen Theme nicht das Papier waschen |
| Partikel-Auflösung | Punktewolke, die den Körper eines Knotens auflöst und wieder zu ihm findet; getrieben von Szenenzeit, nicht von Zeit |
| Fokus-Zieher | KoK-/Unschärfe-Grad je Szene als Uniform; Schärfenebene folgt dem Objekt der Szene |
| Geschwindigkeits-Unschärfe | radiale Unschärfe an den Bildrändern, nur während einer Bewegung, Stärke aus Kamerageschwindigkeit |
| Hoch-Ton-Palette | Elfenbein bis fast weiß, Wachs-Kanten leuchten, Dunst in der Tiefe, Schatten weich |
| Akte + HUD + Satz | Markup und CSS, Projektion der Labels in die Welt, Blenden gegen die Welt gemessen |
| Szenenregie | Kameraschlüssel je Szene, Szenenzeit aus u, Übergangs-Choreografie |

Bleiben: der raymarchte Kern, `uCur`-Dämpfung, `clearMask` (für Akt 2 und für die
Satz-Zonen), Route-Rail, adaptive Qualität, die drei Auswege ohne WebGL2, ohne
Bewegung, ohne JavaScript.

## Bauordnung

**Eine Hand schreibt an `github.io/index.html`.** Sub-Agenten liefern in eigene
Dateien unter `web-qa/build/` und `web-qa/`, Integration und jede Änderung am
Auslieferungs-Dokument geschehen durch die Haupt-Agentur. Begründung: zwei Schreiber
an einer 244-kB-Datei erzeugen Verlust, keinen Konflikt.

| Rolle | liefert | Datei |
|---|---|---|
| Engine | Bloom, Partikel, Fokus, Tempo-Unschärfe als GLSL/JS-Blöcke mit Einfügevertrag | `web-qa/build/engine-*.js` |
| Regie | Szenenzeiten, Kameraschlüssel, Übergangs-Tabelle als Datenblock | `web-qa/build/scenes.js` |
| Typo | Akte, HUD, Satz, Hoch-Ton-Palette als CSS/Markup-Block | `web-qa/build/type.css`, `type.html` |
| Inhalt | sieben Sätze, Akten-Texte, jede Zahl mit Commit-Beleg | `web-qa/build/fakten.md` |
| QA | Sonden je Szene: Kontrast über Welt, Bloom-Überstrahlen, Bilder pro Sekunde im Übergang, Auswege | `web-qa/scenegate.js` |

## Abnahmekriterien

1. Sieben Szenen, bei jedem u eine gesetzte Kamera, kein u ohne Bild.
2. Kein Absatz der Welt liegt auf der Welt; Akten stehen am Rand.
3. Kontrast jeder Schrift über der abfotografierten Szene in beiden Themes ≥ Marke.
4. Bloom wäscht im hellen Theme kein Papier und im dunklen nicht die Körper.
5. 60 Bilder pro Sekunde auf dem Messrechner, saubere Herabstufung darunter.
6. Alle drei Auswege liefern ein vollständiges, lesbares Dokument.
7. Jede Zahl in einer Akte zeigt auf einen Commit; die Zahlen-Wache bleibt grün.
8. Nichts wird gepusht oder veröffentlicht.
