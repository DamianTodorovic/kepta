# PDCR Phase R — Review, Verifikation & Bereitstellungsprotokoll (K3PTA Core 3.2.214)

> **Status:** Stage R abgeschlossen (3 Render-/Prüfzyklen, 0 offene Blocker/Major-Befunde)  
> **Arbeitsordner:** `K3PTA Core Coding/docs/graph-pdcr/` (unmodifizierte Runtime `src/` & `server/` auf `f4886be`, kein vorzeitiger Push)

---

## 1. Übersicht aller PDCR-Liefergegenstände

| Phase | Datei | Zweck | Status |
|---|---|---|---|
| **P (Plan)** | [`01-PLAN-K3PTA-CORE-ANALYSE.md`](./01-PLAN-K3PTA-CORE-ANALYSE.md) | Vollanalyse der Core-Mathematik, APIs, geschützten `data-testid`-Verträge und CI-Wachen (`3.2.214`) | Verifiziert |
| **D (Design)** | [`02-DESIGN-MASTERKONZEPT-V4.md`](./02-DESIGN-MASTERKONZEPT-V4.md) | Schweizer Präzisions-Atlas (`L1–L3`), `By links`/`By meaning` + 5 Raum-Linsen, `112px`-Schutzring & Zero-Downgrade-Spezifikation | Nach Stage R synchronisiert |
| **C (Prototype)** | [`03-PROTOTYP-K3PTA-32214-WOW.html`](./03-PROTOTYP-K3PTA-32214-WOW.html) | Lauffähiger Standalone-Prototyp im exakten `p202`-Fenster (`Light` / `Dark`, `34` & `25.000` Akten, `390×844` Bottom-Sheet) | 3 Stage-R Zyklen bestanden |
| **R (Review)** | [`04-REVIEW-UND-ABNAHMEPROTOKOLL.md`](./04-REVIEW-UND-ABNAHMEPROTOKOLL.md) | Prüfpanel-Befunde, durchgeführte Korrekturen, verifizierte Checks und atomarer Einbauplan für `src/` | Aktuell |

---

## 2. Konsolidierte Stage-R-Prüfergebnisse (4 Fachrollen + 3 Sichtprüfungs-Zyklen)

Vier spezialisierte Stage-R-Prüfer bewerteten unabhängig 8 reale Renderings (`1440×900` Light/Dark sowie `390×844` Mobile) und den Quellcode des Prototyps:

1. **Reviewer A — Visual Craft & `p202`-Tokens:**
   - **Behoben (`Dark --accent`):** `html.dark` nutzt nun exakt `--accent: #f97d69` / `--accent-fuell: #c04a39` (Siegellack-Koralle) und `--ok: #73bb91` gemäß `src/index.css`, ergänzt um `--canvas-paper: #121211` und `--kante-stark` auf unselektierten Kapselrändern.
   - **Behoben (Canvas-Schriftleiter & Titelleiste):** Alle `9px`/`10.5px`/`11.5px`-Canvas-Angaben wurden auf die gesetzlichen Stufen `11px` / `12px` gehoben (keine Gewichtsstufe `500`); der Demo-Schalter wanderte aus der ruhigen `38px`-Titelleiste sauber in das rechte `View`-Panel.
2. **Reviewer B — Erstnutzer & Sprachwächter (`verstaendlichkeit.mjs`):**
   - **Behoben (`By links` vs `By meaning`):** Ersetzt juristisch missdeutbares `Claims` in der Schaltfläche durch **`By links`** / **`By meaning`** (bei gleichzeitiger Wahrung von `data-testid="graph-schiene-ansicht"`).
   - **Behoben (Jargon & Satzlänge `<= 14` Wörter):** Entfernt `hops` → `steps`, `predicate` → `Link types & roles`, `vector bridge` → `Suggested connection`, `entropy` → `length rule (12+ chars)`, `0 Hz idle` aus der Statusleiste (`ready`); führender Mittelpunkt in `.lens-caption` durch `display: block` und Doppelpunkt beseitigt.
3. **Reviewer C — Kanzlei Power-User & Zero-Downgrade:**
   - **Behoben (Mandatsnamen ungekürzt):** `wrapLines` erlaubt bis zu `3` Zeilen bei `maxTextW = 168px`, wodurch `Q4 Advance VAT extension — Akte Hoffmann` ohne Auslassungszeichen vollständig lesbar bleibt.
   - **Behoben (25k Zweistufen-Klick & 4-Wege-Waage):** Einzelklick wählt Themen-Medaillons zur Inspektion aus (`Trace ripple` auf L1 sauber deaktiviert); Doppelklick oder `Open topic` öffnet L3 mit Breadcrumb-Rücksprung. Alle 4 Widerspruchs-Buttons (`newer`, `older`, `window`, `both`) sind funktionsfähig; der `View`-Inspektor synchronisiert im Modus `Review & Gaps` aktiv auf die Konflikt-Akte.
   - **Behoben (`data-testid`-Vertrag):** Alle fehlenden `data-testid`-Anker (`graph-bewegung`, `graph-schema-row`, `regal-koerb-liste`, `regal-koerb`, `regal-farbgruppe`, `graph-farbgruppe`, `graph-farbhaufen`, `gang-info`, `gang-zurueck`, `gang-weiter`, `nachzug-info`, `graph-semantik-leer`, `graph-kern-zustand`, `graph-benannt`) wurden in HTML und dynamische Renderer aufgenommen.
4. **Reviewer D — Pixel-Kollisionen & `390×844` Spatial QA:**
   - **Behoben (`25k`-Medaillons):** `lc11` (`Machine Scan Imports`) auf `y = -325` verschoben; keine Zählerplakette berührt Nachbarringe.
   - **Behoben (`Due`-Badge & Privacy-Pills):** Fehlende Token-Keys `dangerSoft`, `gefahr` und `kanteKontrolle` in `palette()` ergänzt; `queuedPills` zeichnen erst **nach** den Kapseln mit mehrstufiger Kollisionssuche.
   - **Behoben (`Review & Gaps` & `Focus`):** `.tribunal-dock` rechts angedockt (`legVsTribOverlapPx = 0`, `gangVsTribOverlapPx = 0`); in `Focus` umschließt `fitCamera()` nur die `1`-Step-Nachbarschaft (`zoom ≈ 91%` mit Kapseln), Hintergrundknoten bleiben leise `4,5px`-Orientierungspunkte und Quadrant-Überschriften sitzen mit Papier-Halo über den Kanten.
   - **Behoben (`Mobile 390×844`):** `.gang-dock` stapelt sauber bei `bottom: 96px` über der geschlossenen Legende (`4,03 %` Viewport-Höhe `<= 25 %`); `innerWidth === scrollWidth === 390`.

---

## 3. Verifizierte Prüfergebnisse nach finaler Bearbeitung

- **Syntaxprüfung Prototyp:** `jsc` (`new Function(...)`) → `JSC_SYNTAX_OK`
- **Chromium CDP Verifikation (`Emulation.setDeviceMetricsOverride`):**
  - `1440×900 Review & Gaps`: `legVsTribOverlapPx: 0`, `gangVsTribOverlapPx: 0`, `selTitle: "ESt-Bescheid 2025 — Hoffmann Tax Filing"`
  - `390×844 Mobile`: `innerWidth: 390`, `scrollWidth: 390`, `legendPct: 4.03%` (Schwellwert `<= 25,0 %`), `canvasH: 780`, `panelH: 44`
  - **Interaktive DOM-Clicks:** `25,000 archive` → `Open topic` (`/ Client Mandates & Files`) → `Schema` Spotlight (`procedural`) → `Review` 4-Wege-Auflösung (`window`) → `Legend` Zeitkorb (`Today`) alle erfolgreich ohne Fehler abgeschlossen.
- **Repository-Guards & Kern-Tests (Basis `f4886be`, unveränderte `src/`):** Siehe finale Befehlsausgabe beim Abschluss-Run (`tsc`, `design-wache.mjs`, `zahlen-belege.mjs`, gezielte `vitest`-Graph-Suites).

---

## 4. Atomarer Einbauplan für `src/` (bereit nach Freigabe)

1. **`src/lib/graphMetrics.ts` + `src/lib/graphSpatialLenses.ts` (neu, rein funktional):** Chaikin-Archipelse (`convexHull` + `expandAndChaikin`), `fitSafeCamera`, deterministische Projektionen für `timeline`, `privacy`, `review`, `focus` (`>= 112px` Ausschlusszone) und BFS-Blast-Radius (`getBlastSet`) unter strikter Wahrung von `graphLayout.ts` (`resolveCollisions`, `0` Überlappungen).
2. **`src/components/KnowledgeGraph.tsx` & `src/index.css`:** Taktile Kapsel-Renderer (`11px`/`12px`, `28` AABB-Iterationen, Post-Pass Edge Pills), zweistufige Horizon-Medaillons bei `> 400` Notizen, 4-Wege-Widerspruchsdock rechts unten mit Anbindung an `POST /api/contradictions/resolve`, `GraphRegal` in einer Scroll-Achse und `@media (max-width: 767px)` Bottom-Sheet.
3. **Abnahmetests vor `git push`:** Vollständiger Durchlauf von `npx tsc --noEmit`, `node scripts/design-wache.mjs --leise`, `node scripts/zahlen-belege.mjs`, `node scripts/legende-hoehe.mjs` und `npm test`.

---

## 5. Phase C2 — Produktiv-Integration in `src/` & Verifikation (Stand nach finalem Edit)

Die Kernmodule wurden atomar in die echte Codebasis von **K3PTA Core (`3.2.214`)** eingebaut:

- **`src/lib/graphSpatialLenses.ts`** *(neu)*: Reines Geometrie-, Projektions- und Canvas-Modul mit `SPATIAL_LENSES` (`Atlas`, `Timeline`, `AI & Privacy`, `Review & Gaps`, `Focus`), `convexHull`, `expandAndChaikin`, `traceSmoothClosedPath`, `computeBlastSet`, `computeLensTargets`, `paintSpatialLensBackdrop` und `paintFocusQuadrantPills` (`FOCUS_EXCLUSION_RADIUS = 112`, `FOCUS_OUTER_RADIUS = 235`).
- **`src/components/KnowledgeGraph.tsx`**: Integration der 5 Spatial Lenses (`schieneLinse`, `.graph-lens-banner`), nicht-destruktiver Chaikin-Archipelagos & Sanctuary-Enclave-Fills im `Atlas`-Modus (sowie gestricheltem Sanctuary-Rand im Modus `AI & Privacy` — unter Beibehaltung der `arc`/`fillRect`/`drawImage`- und Kantenstrich-Signaturen in `Atlas`), Blast-Ripple-Achtecke (`.graph-ripple-banner` + `Trace ripple`), 4-Wege-Widerspruchstribunal (`findeWidersprueche` + `POST /api/contradictions/resolve` für `newer` / `older` / `window` / `both`), umbrochenem `Selected`-Titel ohne Trunkierung sowie mobilem Panel-Toggle (`Controls ▴` / `Hide controls ▾`, `data-sheet`). Alle bestehenden `data-testid`-Anker sowie `Claims` / `Meaning` blieben unverändert erhalten.
- **`src/index.css`**: Ergänzt um `.graph-panel[data-sheet="zu"]`, `.graph-sheet-toggle`, `.graph-lens-grid`, `.graph-lens-pill`, `.graph-lens-banner`, `.graph-ripple-banner`, `.graph-tribunal*` und `.graph-fuss-actions` vollständig über P202-OKLCH-Tokens.
- **`tests/lib/graphSpatialLenses.test.tsx`** *(neu)*: `5` Unit-/Integrationstests für Chaikin-Konturen, Blast-BFS (`1..4`, Ignorieren synthetischer Ähnlichkeitskanten), Lens-Zonen (`timeline`, `privacy`, `focus >= 112px`), Jargon-Check sowie Render-Switch mit geschützten Toolbar-Ankern.

### Verifizierte Messungen nach finalem Edit & Live-Screenshot-Feinschliff
- **`npm run lint` (`tsc --noEmit && eslint .`):** Exit `0` (`0` Errors; `0` Warnungen in neuem/bearbeitetem Code)
- **`node scripts/design-wache.mjs --leise`:** `274 Messungen, 0 unter der Schwelle — Exit 0`
- **`node scripts/zahlen-belege.mjs`:** Exit `0`
- **`npm run build` (`vite build` + `server.cjs` + `mcp-server.cjs`):** Exit `0` (`dist/index.html`, `dist/assets/graph-*.js`, `dist/server.cjs`, `dist/mcp-server.cjs` gebaut in `322ms`)
- **`node scripts/legende-hoehe.mjs --breite=390 --hoehe=844` (Live-Chromium gegen `dist/server.cjs`):** `Zustand zu: 23.7 % der Leinwand` (`366 × 156 px` <= `25 %` Schwelle)
- **Gezielte Graph-, Lens- & Layout-Suite (`vitest run`, `36` Dateien nach dem finalen Edit):** **`36 / 36` Dateien mit `564 / 564` Tests bestanden (`0` Fehler, `0` skipped)** (`tests/lib/graphSpatialLenses.test.tsx`, `tests/lib/graphLayout.test.ts`, `tests/leitern-in-den-bausteinen.test.ts`, `tests/components/KnowledgeGraph*.test.tsx`, `tests/components/GraphRegal*.test.tsx`)
- **Live-Screenshots aus dem Produktiv-Build (`dist/server.cjs` + Brave Headless CDP):** Visuell geprüft über `Atlas`, `Timeline` (`47 %` Zoom, `5` saubere Spalten-Pills), `AI & Privacy` (`Zone A` Tresor vs. `Zone B`), `Review & Gaps` (4-Wege-Widerspruchstribunal mit `Lumen retainer`), `Focus + Trace ripple` (`Hourly rate 2026`, `Ripple impact: 12 affected within 2 steps`) sowie `390×844` Mobile Bottom-Sheet.

---

## 6. Phase PDCR v5 — Senior-Härtung, Haptik- & Physik-Abnahme (Stand vor Push)

Nach einer weiteren kritischen Code- und Live-Prüfung (Desktop `1440×900` & Mobile `390×844`) wurden sämtliche Haptik-, Koordinaten-, Zustands- und Überlagerungsfehler in `src/` sowie im Prototyp gezielt behoben:

1. **Zweiteiliges Focus-Modell & `getLensFitPoints` ([`graphSpatialLenses.ts`](../../src/lib/graphSpatialLenses.ts)):** `computeLensTargets("focus")` löst `Notiz ↔ Konzept → Nachbarnotiz` über 2 Schritte auf und besetzt alle 4 Quadranten (`▲ Similar themes`, `Links out ▶`, `▼ Time & versions`, `◀ Cited by`); `getLensFitPoints` rahmt die Fokus-Nachbarschaft (`91 %` Zoom). Versteckte `25k`-Gang-Knoten (`n.versteckt`) werden in allen Linsen übersprungen; `Timeline`-Konzepte erben reale Notizdaten (`73 %` Zoom); `Privacy` und `Focus`-Ringe skalieren kollisionsfrei.
2. **Physik, Maus-Auswahl, Gang & Banner ([`KnowledgeGraph.tsx`](../../src/components/KnowledgeGraph.tsx) & [`index.css`](../../src/index.css)):** `switchSpatialLens` / `rAF` aktualisieren auch bei `bewegungAn === false` / `prefers-reduced-motion`; `Atlas`-Rückkehr stellt `atlasSnapRef` exakt wieder her; `wechsleAnsicht("force")` aktiviert das Gleiten aus `Meaning`; `force`/`semantic`-Effekte überschreiben aktive Linsen nicht; Einzelklick wählt Knoten (`clickedId`) für Inspektor/Focus/Ripple ohne den Tastatur-Ring zu verändern; `blaettereGang` stößt `stepSimulation` + Redraw an; `.graph-top-banners` stapelt Banner überlappungsfrei und `.graph-tribunal` liegt bei `bottom: 52px` oberhalb des Gang-Blätterers.
3. **Prototyp-Härtung ([`03-PROTOTYP-K3PTA-32214-WOW.html`](./03-PROTOTYP-K3PTA-32214-WOW.html)):** Ease-Out-Cubic aus `morphFrom`, aktiver AABB-De-Overlap beim Schwenken/Ziehen, Grab-Offset (`grabDx`/`grabDy`) + `pinnedAtlas`, 9-Punkt-Bezier-Treffer mit Kanten-Hover, zeigerzentrierter Mausrad-Zoom, L1-Linsen auf `25.000`-Medaillons sowie vollständiger `Reset` / `Dismiss` / `Shelf`-Zentrierung.
4. **Abgegrenzter Push-Umfang:** Ausschließlich Graph-bezogene Dateien (`src/lib/graphSpatialLenses.ts`, `src/components/KnowledgeGraph.tsx`, `src/index.css`, `tests/lib/graphSpatialLenses.test.tsx`, `docs/graph-pdcr/`), keinerlei Eingriffe in andere App-Bereiche.
