# PDCR Phase D — Master-Konzept v4: „Schweizer Präzisions-Atlas & Lebendige Kartografie“ für K3PTA Core

> **Status:** Verbindliche Detail-Spezifikation (PDCR Phase D) für K3PTA Core `3.2.214+`  
> **Grundprinzip:** 100 % Treue zu K3PTAs `p202`-Fensterarchitektur und Design-Tokens **PLUS** kartografische Exzellenz, taktile Semantik, echte Raumlogik je Blickwinkel und sofort spürbarer Kanzlei-/Praxis-Mehrwert — bei **0 % Funktionsverlust**.

---

## 1. Leitidee: Vom „Punkte-Spinnennetz“ zum Schweizer Wissens-Atlas

Klassische Wissensgraphen (Obsidian, Standard-D3) begehen zwei Fehler: Sie zerreißen Punkt und Beschriftung in anonyme Kügelchen mit schwebenden Ellipsen, und sie verlangen vom Nutzer, dass er ein wirres Spinnennetz selbst entziffert.

Unser K3PTA-Graph verwandelt dieselben SQLite-/SQLCipher-Daten in eine **ruhige, taktile Schweizer Informationslandschaft** auf ungebleichtem Archivpapier (`--eb-1` / `#ffffff` hell, `#141619` / `#252526` dunkel):

1. **Sofort-Verständlichkeit in 3 Sekunden (Kleinbestand `10–60 Notizen`):** Statt 12 nackter Punkte im leeren Raum erscheinen Notizen als **taktile Notiz-Kapseln** innerhalb sanfter **Chaikin-Themeninseln**. Jede Kante endet respektvoll vor der Kapsel-Schutzzone (**Typografische Zurückhaltung**) und überquert fremde Linien mit einem sauberen **Viadukt-Halo**.
2. **Beherrschung im Großbestand (`400 – 25.000+ Notizen`):** Über aggregierte **Horizon-Medaillons** (geschlossener Präzisionsring mit Anteils-Skala nach Notizarten, klar umbrochenem 2-Zeilen-Titel und integriertem Zähler) sowie organisches **L1 → L2 → L3-Zoomen** verliert ein Partner mit 25.000 Akten niemals die Übersicht.
3. **Echter Mehrwert gegenüber Listen (`Knowledge`, `Today`):** Fünf komplementäre Raumprojektionen (*Atlas*, *Bedeutung*, *Zeitfluss*, *KI & Schutz*, *Prüfstand*) sowie kausale **Folgewirkung (Blast Radius)**, **4-Wege-Widerspruchs-Waage**, **fehlende Brücken** und **Dossier-Übergabe** lösen reale Arbeitsfragen, die in einer flachen Liste unsichtbar bleiben.

---

## 2. Rahmen & Token-Parität mit K3PTA `3.2.214` (`p202`)

Der Graph sitzt nahtlos im exakt spezifizierten `p202`-Fenster ohne eigene Fremdfarben:
- **Fensterrahmen:** `38px` Titelleiste (`hiddenInset`-kompatibel), `208px` linke Memos-Navigation (`Sidebar.tsx`), rechte **`258px` `View`-Steuerleiste** (`.graph-panel`, auf Mobile `< 768px` als ausziehbares Bottom-Sheet statt quetschendem Split), `26px` globale Statuszeile (`FensterStatus.tsx`).
- **Canvas-Substrat:** Reines, unliniertes Papier (`#ffffff` Canvas-Blatt) im Light-Mode; tiefes, neutrales Obsidian (`#121211` / `--eb-2` `#38383a`) im Dark-Mode. **Strikt kein Punktraster, kein Neon-Glow, keine Glas-Schlieren.**
- **Mineralische Farb-Tokens direkt aus `src/index.css`:**
  - `Fact` (`semantic`): `--type-semantic-hex` (`#3a6ea8` Light / `#9cadc4` Dark) — Buchstabe **`F`**
  - `Event` (`episodic`): `--type-episodic-hex` (`#a8742e` Light / `#c6a1ba` Dark) — Buchstabe **`E`**
  - `How-To` (`procedural`): `--type-procedural-hex` (`#2e7d5b` Light / `#8fb89a` Dark) — Buchstabe **`H`**
  - `Source` (`reference`): `--type-reference-hex` (`#a4553f` Light / `#c6a687` Dark) — Buchstabe **`S`**
  - `Concept` (`neutral`): `--type-neutral-hex` (`#464646` Light / `#acacac` Dark) — Doppelring-Hub **`C`**
  - `Active / Focus`: `--accent` (`#276b4f` Light / `#f97d69` Dark), `--accent-soft`, `--ok` (`#2d6749` Light / `#73bb91` Dark), `--warn` (`#684d00` Light / `#c49c3f` Dark), `--danger` (`#7e2a22` Light / `#c96556` Dark).
- **Sprach- und Design-Wache-Garantie:**
  - Alle sichtbaren UI-Strings strikt **Englisch (`en-US`)** im ruhigen **Sentence Case**.
  - Das Wort **`"node"` / `"nodes"` wird restlos eliminiert** (`"note"` / `"notes"` für Inhalte, `"dot"` / `"card"` für die Grafik-Marke, `"Untitled"` als Fallback).
  - Ausschließlich statische Gewichte `[300, 400, 600, 700, 800]` (kein `500` / `font-medium`), feste Schriftstufen `--fs-1..8`, Radien `--r-panel/card/btn/chip/badge`, Textkontrast `>= 4,5:1` ohne `opacity-*`-Tricks.

---

## 3. Das 3-stufige Visuelle Grammatiksystem (`30 → 25.000+ Notizen`)

| Stufe (LOD) | Wann aktiv? | Geometrie & Typografie | Kollisions- & Budget-Schutz |
|---|---|---|---|
| **L1 — Horizon Medaillons** | Großbestand (`> 400` Notizen beim Start / L1-Themenansicht aus `haufen` oder weit herausgezoomt `k < 0.42`) | Geschlossener Präzisions-Kreisring (`R = 44–70px`, **keine** abgerissenen Bogenstummel!), feine 4-Quadranten-Skalenstriche, Kalibrierungs-Anteilsbogen in den 4 Artfarben, sauber umbrochener 2-Zeilen-Titel + integrierte `N notes`-Plakette. | Maximal `24–32` Hauptinseln; 0 Überlappungen; Klick/Doppelklick taucht per `340ms` Hermite-Morph in das Viertel / Cluster ein. |
| **L2 — Chaikin-Archipelse** | Mittlere Zoom-Stufe (`0.42 <= k < 0.72`) oder Cluster-Übersicht kleiner/mittlerer Bestände | Monotone-Chain-Konvexhülle je Louvain-Gemeinschaft (`gemeinschaftenBaue`), um `28px` aufgepolstert und mit **2 Chaikin-Schnitten** organisch geglättet (`< 1,2ms`). Zarte Papier-Tönung (`4–6 %`) + zwei Imhof-Höhenlinien (`0,75px` & `1,25px`). | Rein dekorative Hintergrund-Schicht: verändert keine Knoten-Koordinaten, erhält `resolveCollisions` (`0` Paare) unverändert. |
| **L3 — Taktile Notiz-Kapseln** | Nahansicht (`k >= 0.72` und `<= 90` sichtbare Elemente im Bildausschnitt) — Standard-Einstieg bei Kleinbeständen (`10–60`) | Abgerundetes Archivblatt (`--r-btn = 7px`, `132–178px × 28–40px`), mineralischer Perlen-Badge (`F`/`E`/`H`/`S` als Zweitkanal), 1–2 Zeilen sauber umbrochener Titel ohne Wortabbruch. Aktive Auswahl nutzt identische `Today`-Optik (`--accent-soft` + `2px`-Leiste). | **Zweistufiger Schutz:** 1) Weltkoordinaten bleiben durch `graphLayout.ts` überlappungsfrei; 2) AABB-Verdrängung im Bildschirmraum hält Kapseln auseinander. Ab `> 90` sichtbaren Elementen weicher Rückfall auf Mineral-Perlen + `< 2.5px` Batched-Punkte (`fps-laeufer` `< 16.67ms`). |

### Kartografische Kanten-Präzision (Typografische Zurückhaltung & Viadukte)
1. **Halos um Text & Karten:** Jede Kante endet `8px` **vor** der Kapsel-/Kartenkontur bzw. wird über eine `8px`-Papiermaske ausgeblendet. Keine Linie durchschneidet jemals einen Titel oder einen Badge.
2. **Viadukt-Überführungen:** Kreuzende Kanten zeichnen unter der oberen Linie einen `width + 4px` breiten Hintergrund-Casing-Strich (im Farbton der Leinwand), sodass Kreuzungen sofort lesbar bleiben statt einen Knoten zu bilden.
3. **Kanten-Sprache (5 klare Bedeutungen):**
   - **Claim (`--accent`, 1.8–2.8px durchgezogen):** Bewusste Verknüpfung + optionaler Richtungs-Chevron bei `t = 0.62` + schwebende Prädikat-Kapsel bei Hover/Fokus (`Zoom >= 0.90`).
   - **Mention (`--text-1` 38%, 1.0px gepunktet `[2, 4]`):** Gemeinsamer Begriff oder automatische Erwähnung.
   - **Superseded / Expired (`--text-3`, gestrichelt `[4, 4]`):** Zeitlich abgelaufene oder abgelöste Beziehung.
   - **Suggested Semantic Bridge (`--accent` 70%, locker gestrichelt `[5, 5]`):** Hohe Vektor-Ähnlichkeit (`>= 0.82`) ohne expliziten Claim — klickbar zum sofortigen Verknüpfen.
   - **Conflict (`--danger`, 2.4px durchgezogen + `!`-Waage):** Widersprüchliche Aussagen, die Klärung verlangen.

---

## 4. Aufbau der rechten `View`-Leiste (`258px`) & Schutz der Zeichenfläche

### 4.1 Entrümpelung der 18 linearen Steuerelemente ohne Feature-Verlust
Das bisherige `KnowledgeGraph.tsx`-Panel kippte 18 Kontrollen unstrukturiert übereinander und schnitt unten Titel nach 18 Zeichen (`slice(0, 18)`) sowie Export-Knöpfe ab. Die neue `258px`-Leiste (`.graph-panel`) gliedert alles nach kognitiver Wichtigkeit in **4 klare Bereiche**:

1. **Kopf + Suchfeld (`data-testid="graph-suche"`):** Suche mit Live-Trefferzähler (`graph-search-count`) und `Enter`/`Shift+Enter`-Kamera-Sprung.
2. **Primäre Ansicht & Fokus-Linse (`data-testid="graph-schiene-ansicht"`):**
   - Haupt-Reiter (Stage-R geschärft für Erstnutzer-Klarheit, interne `mode`-Werte `"force"` / `"semantic"` unverändert für Tests): **`By links`** (`force`) | **`By meaning`** (`semantic`)
   - Darunter kompakte Task-Linsen-Pillen (**kein** Moduswechsel auf leere Doppelung, sondern gezielte räumliche Projektionen):
     `Atlas` (Standard) · `Timeline` · `AI & Privacy` · `Review & Gaps` · `Focus`
3. **Wesentliche Sofort-Werkzeuge (immer griffbereit):**
   - **Farbkanal (`graph-schiene-kanal`):** `Type` | `Provenance` (+ Umschalter `Groups` / `Communities`) mit kompakten Swatches & Klick-Spotlight.
   - **Zeit-Regler (`TodayView`-konformer grüner `--gleis`-Slider + Datum):** `graph-zeitstand`, `+N later`, `Today`-Reset, `<input type="date" data-testid="graph-datum">`.
4. **Ruhige Akkordeons (standardmäßig aufgeräumt, 1 Klick zum Öffnen):**
   - *Display & labels:* `Labels` (`None` / `Few` / `Many` / `All` -> `graph-schiene-namen`), `Network depth (steps)` (`1` / `2` / `3` / `4` -> `graph-schiene-tiefe`), `Line weight` (`graph-verbindungsdicke`).
   - *Filters & rules:* `Connected`, `Direction`, `Similar`, `Tag`-Auswahl sowie die Popover-Trigger **`Schema`** (`graph-schema` inkl. `GruppenBand`) und **`Forces`** (`graph-krafte` / `graph-bewegung`).
5. **Fixierte Inspektions-Fußzeile (unbeschnitten, mehrzeilig):**
   - Vollständiger Notiz-Titel (**1–3 Zeilen umbrochen bis `208px` Breite, niemals nach 18 Zeichen abgehackt!**) + Verbindungs- und Herkunftsbilanz (im `Review & Gaps`-Modus live auf Konflikt-Status synchronisiert).
   - Kontext-Aktionen: `Open note` (bzw. `Open topic` bei selektiertem L1-Medaillon), `Focus` und **`Trace ripple`** (*Blast Radius*, bei L1-Aggregat deaktiviert).
   - Saubere Utility-Reihe: `Fit` · `Export PNG` · `Reset` (+ `Release N pinned`, sobald Knoten in `src/` gepinnt sind).

### 4.2 Lösung für `.graph-legende` (<= 25 % auf Mobile) & „Der Gang“
- **Eingeklappt (`data-legende="zu"`, Standard auf allen Breiten):** Eine einzige ruhige `34px`-Fußzeile unten links (`4,03 %` Höhe bei `390×844` — massiv unter der `25,0 %`-Grenze von `legende-hoehe.mjs`) mit den 4 Art-Punkten, der ehrlichen Bestandsbilanz (`graph-im-bild`, z. B. `34 notes · 4 hubs · 34 links`) und dem echten `<button data-testid="graph-legende-klappe">` (*Legend ▾*).
- **Aufgeklappt (`data-legende="auf"`):** Öffnet eine sauber begrenzte Karte (`width: min(360px, calc(100% - 24px))`, `max-height: calc(100% - 76px)`, eine einzelne innere Scroll-Achse — keine verschachtelten Scrollbars!), die Erklärung (`graph-zustaende`, `<= 14` Wörter) sowie `GraphRegal` (*Last updated*-Körbe `regal-koerb-liste` / `regal-koerb`, Quellen-Balken `regal-farbgruppe`) sauber beherbergt. Durch Rechts-Docking der Widerspruchs-Waage (`.tribunal-dock`, `right: 12px`) gibt es auch bei aufgeklappter Legende `0 px` Überlappung.
- **„Der Gang“ (Isolierte Notizen):** Statt einsame Punkte unter kleine Bestände zu kleben, erscheint bei unverbundenen Notizen unten rechts ein diskretes Regal-Dock (`data-testid="gang-blaetterer"`, mit `gang-info`, `gang-zurueck` `‹`, `gang-weiter` `›` und kompaktem Mobil-Stacking `bottom: 96px` über der Legende).

---

## 5. Echte Raumlogik je Linse & Kanzlei-Superkräfte

Alle Linsen wechseln per **Hermite-Interpolation (`340 ms`, `3t² − 2t³`)** zwischen deterministischen Zielkoordinaten — und fallen unmittelbar danach wieder auf **exakt 0 Hz Idle** zurück (`prefers-reduced-motion` schaltet sofort in `0 ms` um):

1. **`By links` → `Atlas` (Topologische Übersicht):** Kraftfeld nach `graphLayout.ts` + organische Chaikin-Archipelse nach Cluster-Inseln (`gemeinschaftenBaue`) + Taktile Kapseln (bzw. zweistufig klickbare Horizon-Medaillons ab `> 400` Notizen: Einzelklick selektiert, Doppelklick / `Open topic` öffnet L3).
2. **`By meaning` (Topografische Bedeutungskarte):** Deterministisches FNV-PCA (`/api/graph/semantik`) mit Eduard-Imhof-Höhenringen um dichte Themenbecken statt vier starrer Ovale. Zeigt **vorgeschlagene Verbindungen** (`89 % similar`, gestrichelte Akzent-Brücken zwischen inhaltlich nahen Notizen ohne manuelle Verknüpfung -> `Link notes`-Aktion legt über `POST /api/memories` echte Beziehung an) und `Synthesize Dossier` (`onSelectConcept`).
3. **`Timeline` (Chronologischer Wissensstrom):** Transformiert X in deterministische Zeitbänder (`240`-px-Spalten: **Older (>90d) → Last 90 days → Last 30 days → Last 7 days → Today**) und Y in Themen-Stapel. Macht Alterung (`expired`), Ablösungsketten (`→ replaced by`) und akute Fristen sofort sichtbar; direkt mit dem `Now`-Slider & Datumsfeld synchronisiert.
4. **`AI & Privacy` (Sovereign Air-Gap-Schleuse):** Teilt den Raum physisch durch eine senkrechte Sicherheitsgrenze:
   - **Zone A (Links) — Locked Private Vault (§ 203 StGB):** Ausschließlich Notizen mit `scope === "private"`, geschützt durch einen bernsteinfarbenen Sanctuary-Rahmen mit `Lock`-Kennzeichnung. Beweist visuell und prüfbar (`mcp.ts` Privacy Floor): *Zero external AI access*.
   - **Zone B (Rechts) — AI-Readable & Local Notes:** Gruppiert nach echten MCP-Clients aus `/api/activity` & `/api/memories/:id/readers` (`Claude Code`, `Claude Desktop`, `Cursor`) — **ohne** jemals eine von KI gelesene Notiz fälschlich in eine „Protected Zone“-Box einzuschließen! Blockierte Zugriffe enden optisch an der Grenze (`Blocked by Privacy Shield`).
5. **`Review & Gaps` (4-Wege-Widerspruchs-Waage & Lücken-Triage):** Zentriert widersprüchliche Notizpaare (`widersprueche.ts`) oberhalb einer kompakt rechts angedockten Vergleichswaage — mit Synchronisation auf den `View`-Inspektor (`Deadline conflict`) und **4 rechtssicheren Optionen** an `POST /api/contradictions/resolve`:
   - `Keep newer note (marks older superseded)`
   - `Keep older statutory note (supersede newer)` *(schützt z. B. Steuerbescheid/Gesetz gegen versehentlichen KI-Eintrag!)*
   - `Both hold — close older valid-to date` (`window: true`)
   - `Both hold simultaneously as valid exceptions` (`both: true`)
6. **`Focus` (Kollisionsfreies 4-Quadranten-Sonnensystem + Blast Radius):** Ein Doppelklick (oder Button `Focus`) zentriert die gewählte Notiz hinter einer strikten **112px-Schutzzone**. Die Nachbarn sortieren sich als taktile Kapseln in vier klare Sektoren (`Cited by` links, `Links out` rechts, `Time & versions` unten, `Similar themes` oben; übrige Notizen bleiben als leise `4,5px`-Orientierungspunkte am Außenring). Mit **`Trace ripple`** (*Blast Radius*) färbt ein deterministischer BFS über abhängige Kanten alle betroffenen Folge-Akten bis zur gewählten Tiefe (`1–4` steps).

---

## 6. Verbindliche Verbotsliste („Kill-List“) & Ziel-Architektur für den Einbau in `src/`

### Die 12 absoluten Verbote (Stage-R Abnahmegate)
1. **Kein Neon / Glow / Glas-Blur** über Buntem (`#FFFFFF` / `#121211` Canvas nur; keine Sub-`11px` Canvas-Schriften).
2. **Kein Punktraster** oder Karomuster auf der Leinwand.
3. **Kein bunter Regenbogenbalken** (`GruppenBand`) über der Zeichenfläche.
4. **Keine getrennten Punkt+Kasten-Gebilde** in der Nahansicht — einheitliche Notiz-Kapseln!
5. **Keine zerrissenen Bogen-Stummel** am Rand großer Cluster — geschlossene Horizon-Medaillons!
6. **Keine Titel-Abhackung nach 18 Zeichen** (`slice(0, 18)`) im Inspektor.
7. **Keine Legendenerweiterung über > 25 %** auf `390×844` und keine verschachtelten Scrollbars.
8. **Keine unstrukturierte 18er-Steuerliste** im rechten Panel.
9. **Kein gefährlicher 1-Wege-Knopf** („Neuere gewinnt“) bei Widersprüchen.
10. **Keine Dauer-Animation im Leerlauf** (`0 Hz` nach Auspendeln, max. 1x Impuls beim Hovern/Klicken).
11. **Keine Kanten durch Text oder Badges** (immer 8px Halo-Aussparung + Viadukt-Maske).
12. **Niemals das Wort `"node"` / `"nodes"`** irgendwo auf der sichtbaren Oberfläche.

### Reine TypeScript-Erweiterungsmodule für die spätere `src/`-Integration
- `src/lib/cartography/chaikinArchipelago.ts`: Monotone-Chain + Chaikin-Glättung für Louvain-Inseln & Private-Sanctuary-Konturen (`< 1,2 ms`).
- `src/lib/cartography/tactileCapsule.ts`: Kapsel-Messung (`F/E/H/S`-Badge + Umbruch), Typografische Zurückhaltung (`8 px`-Stopp), Bildschirmraum-AABB-Entzerrung bei Erhalt von `resolveCollisions`.
- `src/lib/cartography/horizonMedallion.ts`: L1-Cluster-Medaillons mit geschlossenem Instrumentenring und gemessenen Art-Anteilsbögen.
- `src/lib/cartography/spatialProjections.ts`: Deterministische Zielkoordinaten für *Timeline*, *AI & Privacy* (mit `scope === "private"`-Mauer) und *Review & Gaps*.
- `src/lib/cartography/solarSystemLayout.ts`: 4-Quadranten-Anordnung um eine unantastbare `95 px`-Zentrumsschutzzone.
- `src/lib/cartography/blastRadius.ts`: Gerichtete kausale BFS-Folgeabschätzung inkl. Fristen-Markierung (`validTo`).
- **Integration in `src/components/KnowledgeGraph.tsx`:** Schrittweise Verdrahtung unter Beibehaltung aller 5 `KnowledgeGraphProps` und sämtlicher `data-testid`-Verträge aus Dokument `01`, anschließend Vollprüfung via `npx tsc --noEmit`, `node scripts/design-wache.mjs`, `npm run test:cov` (alle 41 Graph-Suites + Gesamt-Suite), `scripts/legende-hoehe.mjs` und `scripts/fps-laeufer.mjs`.
