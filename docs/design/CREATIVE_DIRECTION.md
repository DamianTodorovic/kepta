# CREATIVE DIRECTION — K3PTA („Memos / Werkbank v2 · Swiss Archival Instrument“)

> **Quelle & Geltungsbereich:** Entwickelt ausschließlich auf Basis des lokalen Codes von `/Users/damiantodorovic/kepta-app` (Version `3.2.213`, `HEAD` `8adba16`) sowie der Memos-/Werkbank-v2-Designsprache (`p201` / `p202`). Alle Token-Namen, Kontrastschwellen, Schriftstufen, Abstandsmaße und Statusregeln sind zu `scripts/design-wache.mjs`, `tests/design-tokens.test.ts` und `tests/design-vertrag.test.ts` kompatibel.

---

## 1. Bewusste Abgrenzung gegen generisches KI-/SaaS-Design (Anti-Slop-Doktrin)

K3PTA verwaltet lokal verschlüsseltes Langzeitwissen (`SQLCipher-4 AES-256`, OS-Schlüsselbund, append-only Audit-Log `~/.kepta/audit.jsonl`, Privacy Shield vor Cloud-Egress). Eine Oberfläche für dieses Produkt darf niemals wie ein austauschbares Cloud-SaaS-Template oder ein dekoratives KI-Experiment wirken.

Explizit ausgeschlossen sind in diesem Designsystem (verbotene „Vibecode“-Muster):

1. **Keine violetten/blauen Neon-Verläufe oder Glow-Effekte:** Weder auf Hintergründen noch als `box-shadow`-Corona hinter Buttons, Eingabefeldern oder Graph-Knoten. Fokus und Aktivität entstehen durch ruhige Werkbank-Grün-Kanten (`--accent-fuell`), klare weiße Memos-Blätter (`#ffffff` auf `#f7f6f3`) und hohen Luminanzkontrast.
2. **Kein dekorativer Glassmorphism:** Kein `backdrop-filter: blur(...)` über verschwommenen Farbklecksen. Die Oberfläche nutzt opake, präzise abgestufte Papier-/Mineralflächen (`#f7f6f3` Grund, `#ffffff` Karten/Panels, `#f1f0ec` Sidebar) bzw. tiefes Obsidian-Schiefer im Dark Mode (`#0d0e10`, `#141619`, `#17191d`).
3. **Keine groben UPPERCASE-HUD-Labels und 4er-KPI-Kästchenleisten:** Sektionsköpfe nutzen durchgängig ruhigen **Sentence Case** (ohne `text-transform: uppercase` und `letter-spacing: 0.08em`), und Synthese-Ansichten (`Today`, `Dossier`, `Settings`) verzichten auf generische KPI-Quadratleisten (`.index-strip`) zugunsten gruppierter Zustandstabellen (`.gruppen-tisch`, `.zustandszeile`).
4. **Kein Karopapier-Raster und kein Regenbogenbalken über dem Graph-Canvas:** Die Zeichenfläche `.graph-leinwand` bleibt reines unliniiertes Papier (`#ffffff`) bzw. reines Obsidian (`#0d0e10` / `#141619`); `.graph-gruppenband` lebt ausschließlich im `#pop-schema`-Popover statt als bunter Balken über dem Canvas.
5. **Kein Marketing-Hero innerhalb der App & keine Emojis als UI-Icons:** Ausschließlich monochromatische `1.5px`-/`1.75px`-Strich-Icons aus einem einheitlichen Raster (`Lucide` / `src/lib/icons.tsx`, Mindestgröße `--icon-min: 14px`) plus genau definierte Status- und Wissensart-Geometrien.
6. **Keine dekorativen Schein-Animationen:** Bewegung transportiert ausschließlich räumliche Orientierung (`110ms–260ms`, `cubic-bezier(0.22, 1, 0.36, 1)`) und respektiert `<MotionConfig reducedMotion="user">` sowie `@media (prefers-reduced-motion: reduce)`.

---

## 2. Drei eigenständige gestalterische Richtungen im Vergleich

### Richtung A — „Memos / Werkbank v2 · Swiss Archival Instrument“ *(Ausgewählt)*
- **Kernidee:** Ein kalibriertes Wissens- und Provenienz-Instrument nach dem Prinzip von **usememos/memos** („ungebleichtes Papier `#f7f6f3`, darauf echte weiße Blätter `#ffffff`, ein einzelnes Werkbank-Grün `#276b4f`/`#2e7d5b` und glasklare K3PTA-Dokumenttypen“).
- **Räumliche Komposition:** Kantenbündige Mehrspalten-Architektur (`36px` Titelleiste oben, `208px` Memos-Sidebar links ohne laute Großbuchstaben-Trenner, weiße `Search ⌘K`-Suchkarte oben, `Today (2)` unter `Knowledge`, wahlweise `Split View` oder `Memos Feed`-Kartenstrom, zweispaltige `Today`- und `Dossier`-Splits, `258px`-Graph-Inspektor rechts, `26px` durchgehende System-Statuszeile unten).
- **Farbsystem:** ~94 % warmes Naturpapier / reines Weiß / Haarlinien, **Werkbank-Grün** als einziger aktiver Haus-Akzent (`#276b4f` Text/Link, `#2e7d5b` Primärfüllung, `#eaf3ee` aktive Tönung im Light Mode; `#5ec498` / `#2e7d5b` im Dark Mode), **4 mineralische Pigmente** für die Wissensarten (`Fact`, `Event`, `How-To`, `Source`) sowie **strikte Weißmodus-Blau-Normierung für alle `#tags`** (`#3a6ea8` auf `#edf2f8`).
- **Stärke für K3PTA:** Verbindet hohe Informationsdichte (Graph, Claim-Tripel, Audit, MCP-Schemas, Search-Tracks) mit der ruhigen, sofort einladenden Blatt-Optik von Memos.

### Richtung B — „Warm Editorial Foliant“
- **Kernidee:** Ein publizistischer Zettelkasten nach Art eines gedruckten Almanachs mit Serif-Überschriften (`600/700`).
- **Warum für K3PTA verworfen:** Serifen verschlechtern bei technischen Konfigurations- und Graph-Leisten (`11px–13px`) die Scanbarkeit. Die Ruhe kommt stattdessen aus Papier-Haptik (`#f7f6f3` + `#ffffff`) und klaren Grotesk-/Monospace-Stufen.

### Richtung C — „Monolithic Telemetry Console“
- **Kernidee:** Eine dunkle Entwickler- und Observability-Konsole (`Dark-first`) mit signalgrünen Latenzen und rohen Metriken.
- **Warum für K3PTA verworfen:** Schränkt die Zielgruppe auf Entwickler ein und widerspricht dem Hell-als-Standard-Entscheid (`Y >= 0.9`).

**Entscheidung:** **Richtung A — „Memos / Werkbank v2“** wird für K3PTA verbindlich festgelegt.

---

## 3. Vollständige Design-System- & Token-Spezifikation

### 3.1 Oberflächentreppe (`--eb-0`, `--eb-1`, `--eb-2`, `--feld`, `--side-basis-*`)

| Ebene / Token | Rolle in der Architektur | Light Mode (`:root`, Default) | Dark Mode (`.dark`) | Regel |
|---|---|---|---|---|
| `--eb-0` (Tisch / App-Grund) | Canvas hinter weißen Karten, Listen-/Settings-/Synthesis-Grund, Statuszeile | `#f7f6f3` *(warmes ungebleichtes Papier)* | `#0d0e10` *(Obsidian-Grund)* | Light `Y >= 0.90`; Dark Basis |
| `--eb-1` (Blatt / Panel) | Weiße Notizkarten (`.notiz-karte`, `.gruppen-tisch`), Reader/Editor-Bühne, Graph-Canvas, Inspector | `#ffffff` *(Reinweiß)* | `#141619` *(Graphit-Panel)* | Klare Abhebung auf `--eb-0` |
| `--eb-2` (Modales Blatt) | Command Palette, Overlays, Karten im Vordergrund | `#ffffff` *(Reinweiß)* | `#17191d` *(erhöhte Ebene)* | Modale Fokustiefe |
| `--feld` (Vertieftes Feld) | Eingaben, Suchkarte (Weiß auf `--side-basis-1`), Code-Blöcke | `#f7f6f3` / `#ffffff` | `#0d0e10` | Klar vom umgebenden Blatt abgesetzt |
| `--side-basis-1` / `-2` | Linke Memos-/Werkbank-Sidebar (`208px`) | `#f1f0ec` *(Archiv-Steingrau)* | `#111316` | Ruhige Navigationsleiste ohne harte Kontrast-Säulen |

> **Hinweis zu `design-wache.mjs`:** Im Produktivcode (`~/kepta-app/src/index.css`) werden diese exakten sRGB-Werte als kalibrierte `oklch(...)`-Definitionen geführt, sodass Luminanzschranken (`Light Y >= 0.90`, `Dark Step >= 1.30x`) maschinell erfüllt bleiben.

### 3.2 Text- & Semantik-Tokens (Kontrastgarantie `>= 4.5:1`)

| Token | Aufgabe | Light Mode | Dark Mode |
|---|---|---|---|
| `--text-1` | Titel, primäre Labels, Body-Text, aktive Zahlen | `#1f1e1c` *(Tiefe Tusche)* | `#f2f0eb` *(Warmes Off-White)* |
| `--text-2` | Sekundärtext, Beschreibungen, Inaktive Tab-Labels | `#6f6b63` *(Gedecktes Umbra)* | `#a39e95` |
| `--text-3` | Metadaten, Zeitstempel, Pfadhinweise | `#77736b` | `#7c776e` |
| `--accent` | Links, aktive Icons, Wiki-Links (`.wiki-link`), Graph-Fokus, aktive Nav-Schrift | `#276b4f` *(Werkbank-Grün, dunkel für Text)* | `#5ec498` *(Helles Werkbank-Grün)* |
| `--accent-fuell` | Hintergrund von Primär-Buttons (`+ New`, Chat Send arrow, Wizard), aktiven Toggles, Slidern | `#2e7d5b` *(Werkbank-Grün Füllung)* | `#2e7d5b` |
| `--on-accent` | Schrift auf `--accent-fuell` | `#ffffff` | `#ffffff` |
| `--accent-soft` / `--side-auswahl` | Zarte Tönung für aktive Navigation / gewählte Zeilen | `#eaf3ee` | `rgba(94, 196, 152, 0.14)` |
| `--ok` | `Working`, Verified Audit, Connected MCP, Valid Shield | `#276b4f` | `#5ec498` |
| `--warn` | `Set up`, Kontradiktionen, Privacy-Egress | `#9a651d` | `#dfa85a` |
| `--danger` | Destruktive Löschung, fehlgeschlagener Audit/Key | `#b83c2b` | `#e07664` |

### 3.3 Wissensart-Pigmente & Weiße-Modus-Blau für `#tags`

Die vier Wissensarten bilden ein geschlossenes mineralisches Vierfarb-System — sowohl in React-DOM (`var(--type-*)`) als auch im 2D-Canvas des `KnowledgeGraph` (`var(--type-*-hex)`):

| Wissensart (`MemoryType`) | UI-Label | Semantik | Hex (Light / Canvas-Anker) | Hex (Dark) |
|---|---|---|---|---|
| `semantic` | `Fact` | Fakten, Konzepte, dauerhafte Erkenntnisse | `#3a6ea8` *(Archiv-Blau)* | `#6da4de` |
| `episodic` | `Event` | Besprechungen, Entscheidungen, datierte Ereignisse | `#a8742e` *(Messing-Ocker)* | `#dfa85a` |
| `procedural` | `How-To` | Anleitungen, Checklisten, Abläufe | `#2e7d5b` *(Kupferpatina-Grün)* | `#57b88d` |
| `reference` | `Source` | Externe Dokumente, PDFs, Logs, Tabellen | `#a4553f` *(Terrakotta-Rost)* | `#de8870` |
| `neutral` | `Concept` / Struktur | Graph-Entitäten ohne Primärtyp, Metadaten | `#464646` *(Graphit)* | `#a0a0a4` |

*(Regel aus `design-wache.mjs`: Im `:root`/`.dark`-Block dürfen Hex-Twins nur auf die vorgesehenen `--type-*-hex`-/`--side-*`-Sonderstellen bzw. als `oklch`-Übersetzung im CSS-Sheet geführt werden, niemals als verstreute Roh-Hexwerte in Komponentendateien.)*

**Tags — strukturelle K3PTA-Parität & einheitliches Weißmodus-Blau:**
- **Sidebar (`Sidebar.tsx`):** Behält die identische K3PTA-Struktur ohne Layout-Änderung — vertikale `.sidebar-tag-btn`-Zeilen (`#tag` links in `var(--type-semantic)` / `#3a6ea8` Light bzw. `#9cadc4` Dark, rechts `.seiten-plakette`-Zähler), `Reset`-Schalter, `3 more…`-Aufklapper und Footer-Hinweis `counts cover the 40 loaded notes`.
- **Reader & Editor (`MemoryPreview.tsx` `.detail-meta` unter `<h1>`, `MemoryEditor` `Filed under`):** Behalten exakt die kompakten Inline-Tag-Pills (`height: 19px`, `padding: 1px 7px`, `border-radius: 4px`, Gewicht `600`). Im **Light / White Mode** wird jedoch die bisherige 4-Farben-Rotation (`PILLE_FARBEN`: Amber/Rost/Grün/Blau) komplett auf einheitliches **K3PTA-Blau** (`--tag-color: #3a6ea8` Schrift auf `--tag-pill-bg: #edf2f8`, aktiver Sidebar-Tint `color-mix(in srgb, #3a6ea8 12%, transparent)`) normiert; im **Dark Mode** bleibt die bisherige Darstellung (`#9cadc4` auf `rgba(156, 173, 196, 0.14)`) unverändert erhalten.

**Herkunfts-Kanal (`Origin` im `KnowledgeGraph`):**
- `written` (`Written by you`): `--type-herkunft-geschrieben-hex` (`#42474c` Light / `#a7acb3` Dark)
- `file` (`From imported files`): `--type-herkunft-datei-hex` (`#693a00` Light / `#d8a25c` Dark)
- `machine` (`Derived / system`): `--type-herkunft-rechner-hex` (`#00514d` Light / `#6cb9b3` Dark)

### 3.4 Kantenhierarchie (`--kante-*` / `--border-*`)

| Token | Aufgabe | Mindestkontrast (`design-wache.mjs`) |
|---|---|---|
| `--kante-dekor` | Feine innere Listentrenner innerhalb einer Spalte | `>= 1.35:1` gegen `--eb-1` |
| `--kante-flaeche` | Spaltenwände (`Sidebar | Liste | Detail | Status`), Kartenränder | `>= 3.0:1` gegen `--eb-0` und `--eb-1` |
| `--kante-kontrolle` | Umrisse von Buttons, Inputs, Selects, Segment-Steuerungen | `>= 3.0:1` gegen `--feld` / `--eb-1` |
| `--kante-stark` | Aktive Auswahlrahmen, Tabellenköpfe, Schaltgruppen | `>= 1.9:1` |
| `--fokus` | Tastatur-Fokusring (`:focus-visible`, `2px solid` + `2px` Offset) | `>= 3.0:1` |

### 3.5 Typografie-System (`design-wache`-konforme 8-Stufen-Leiter)

- **Schriftfamilien:**
  - `--font-sans`: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif` (auf macOS nativ an Electron gekoppelt, gestochen scharfe Subpixel-Darstellung, null externes Font-Loading-Risiko offline).
  - `--font-mono`: `"SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace` — strikt für Pfade (`~/.kepta/kepta.db`), Schlüsselmasken, MCP-Toolnamen, HTTP-Methoden, Audit-Hashes und Zahlen-Codes.
- **Exakte 8 `--fs-\d+`-Stufen (`>= 11px` Boden!) plus Lese-Ausnahme:**
  - `--fs-1: 11px` (`.hud-label`, Statuszeile, Badges, Tastenkürzel, Metazeilen)
  - `--fs-2: 12px` (`.fs-2`: Untertitel, Chips, Snippets, Tool-Argumente, Segment-Buttons)
  - `--fs-3: 13px` (`.fs-3`: Listenreihen-Titel, Sidebar-Einträge, kompakte Aktionen, Tabellen-Zellen)
  - `--fs-4: 14px` (`.fs-4`: Standard-UI-Fließtext, Chat-Nachrichten, Eingabefelder, Subheadings)
  - `--fs-5: 16px` (`.fs-5`: Bereichs-Titel in Detail/Settings, numerische KPI-Zahlen in `IndexStrip`)
  - `--fs-6: 20px` (`.fs-6`: Workspace-/Karten-Köpfe in `Today`, `Dossier`, `Onboarding`)
  - `--fs-7: 28px` (`.fs-7`: Primärer Titel in `MemoryPreview` / leere Bühne)
  - `--fs-8: 40px` (`.fs-8`: Display-Zahl / Onboarding Hero-Begrüßung)
  - *(Erlaubte Detail-Lesegröße außerhalb der Zähl-Regex: `--fs-detail: 18px` / `line-height: 1.55` im `MemoryPreview`-Lesekörper)*
- **Erlaubte statische Gewichte:** ausschließlich `300` (dünn/selten), `400` (`--fw-ruhig`), `600` (`--fw-halbfest`), `700` (`--fw-fest`), `800` (Display-Ausnahme). Kein `500` oder `font-medium` (da `design-wache.mjs` feste Gewichtsleiter erzwingt).
- **Zeilenhöhen & Satzbreiten:** `--lh-dicht: 1.35`, `--lh-lesbar: 1.5`, `--lh-prosa: 1.65`; maximale Textzeilenbreite in `MemoryPreview`, `DossierView`, `TodayView` und `Chat`: `64ch–68ch`.

### 3.6 Räumliches 4px-Raster, Rundungen & Treffflächen

- **Spacing-Tokens:** `--s-fein: 2px`, `--s-1: 4px`, `--s-2: 8px`, `--s-3: 12px`, `--s-4: 16px`, `--s-5: 24px`, `--s-6: 32px`, `--s-7: 48px`.
- **Radien-Disziplin (geometrisch gestaffelt, keine Bubble-Pills):**
  - `--r-panel: 14px` (Modale Dialoge, Command Palette, Fensterrahmen im Browser-Kontext)
  - `--r-card: 12px` (Inhaltsblöcke, Briefing-/Dossier-Boxen)
  - `--r-btn: 7px` (Buttons, Listenauswahl, Eingabefelder, Sidebar-Einträge)
  - `--r-chip: 4px` (Tags, Filter-Chips, `<kbd>`-Tasten, `method-badge`)
  - `--r-badge: 3px` (Eckige `8×8px` Wissensart-Indikatoren — architektonische Markenzeichen statt runder Punkte im UI)
- **Mindest-Treffflächen:**
  - Kompakte Werkzeug-Icons (`.tap`, `.tap-reihum`): `>= 28px × 28px` auf Desktop
  - Primäre Interaktionen (`Sidebar`, Buttons, Segment-Leisten, Eingaben): `--ziel-boden: 36px` (Desktop), `44px` auf Touch/Mobile (`<= 767px`)

### 3.7 Motion-System (`src/lib/motionTokens.ts` + CSS)

- **Haus-Kurve:** `--ease-apple: cubic-bezier(0.2, 0.8, 0.2, 1)` (schneller Antritt, langes präzises Abbremsen ohne Zurückprellen).
- **Dauern:** `--dur-fast: 100ms` (Hover, Active-Quittung, Fokus), `--dur: 200ms` (`.ansicht-blende` Opazitätswechsel zwischen Hauptansichten, Tab-Übergänge), `--dur-slow: 300ms` (Modale, Drawer).
- **Framer-/Motion-Federn:** `FEDER_OVERLAY = { type: "spring", damping: 28, stiffness: 320 }` (Modale/Palette/Toasts, nahezu kritisch gedämpft `ζ ≈ 0.78`), `FEDER_SCHUBLADE = { type: "spring", damping: 25, stiffness: 200 }` (Seitliche Panel/Wizard).

### 3.8 Interaktive Zustandsmatrix

| Zustand | Visuelles Verhalten (Light & Dark konsistent) |
|---|---|
| **Hover** | Fläche wechselt subtil zu `--bg-hover` (`color-mix` +4%/-4% Luminanz); kein Versatz nach oben (`translateY`), kein Schattenwachstum |
| **Active / Pressed** | Opazität / Fläche rastet `100ms` hart auf stärkeres Inset ein; Buttons skalieren maximal `0.985` |
| **Selected (`aria-selected` / `data-on="true"`)** | `--accent-soft`-Hintergrund + `2px` linker oder oberer Indikator bzw. `--accent` Textfarbe (im Graph: vergrößerter Kontrast-Halo) |
| **Focus (`:focus-visible`)** | `2px solid var(--fokus)`, `outline-offset: 2px` — niemals `outline: none` ohne Ersatz |
| **Disabled** | `opacity: 0.45`, `cursor: not-allowed`, erklärender `title`/Hinweissatz in Fußzeile (z. B. beim `MachineScan`-Import vor den zwei Pflicht-Haken) |
| **Error / Alert** | Flacher `--warn-soft` / `--danger-soft`-Block mit `1px` Kante + präziser Handlungsanweisung (`Absage`-Kette ohne technische Ausnahmenamen) |
| **Loading / Streaming** | Unruhiges Pulse-Flimmern vermieden: feiner `1.5px`-Indikator (`Loader2` animiert nur unter aktiver Arbeit), inkrementeller Textstrom in Chat |

---

## 4. Konkrete Architekturbereinigung gegenüber Stand `3.2.213`

Diese sechs Mängel aus der Ist-Analyse werden im Master-Mock-up (und später über den GLM-Blueprint) direkt behoben:

1. **Auflösung von `src/mockup-masse.css`:** Alle `!important`-Überschreibungen wandern sauber in die Primärklassen von `src/index.css` und `src/components/huelle.css`.
2. **Reparatur `Settings`-Zweispaltigkeit (`Settings.tsx:753`):** Aus `flex-col` wird `flex-row` auf Desktop (`flex-col md:flex-row`), sodass `.einstellungen-liste` (`196px`) bündig die volle Höhe links neben `.settings-panel-fenster` einnimmt — die vertikale Trennlinie endet am Fußbalken statt in der Luft.
3. **Bereinigung der Listen-Fußzeile (`Knowledge`):** `.listen-fuss` wird auf einen sauberen, einzeiligen Instrumentenstreifen normiert (`32px` Höhe): links kompakt `In sync` / `Local` + `Dupes (31)`-Button, rechts `Trash`-Knopf + sichtbarer, benutzbarer `Top 5 / 10 / 20 / 50 / All`-Trefferregler (`suche-regler` nicht länger `hidden`).
4. **Vollwertige 2-Spalten-Command-Palette (`⌘K`):** Die leere rechte Hälfte (`160px+` Weißfläche) wird zur **Live-Vorschau-Inspektor-Spalte** — zeigt beim Markieren einer Notiz Titel, Typ-Badge, Auszug, Tags und Shortcut (`↵ Open`), bzw. bei Aktionen Beschreibung, Zielort und Tastenkombination.
5. **Komplett überarbeiteter Wissensgraph mit rechtem `View`-Panel (`KnowledgeGraph`):** Statt schwebender Topbar oder Karoraster spannt `.graph-leinwand` eine reine Papier-/Obsidian-Fläche (`#ffffff` / `#141619` ohne Hintergrundraster und ohne Regenbogenbalken am oberen Rand — `.graph-gruppenband` sitzt aufklappbar im `#pop-schema`-Popover) mit Zoom-Steuerung (`- 100% +`) oben links und kollabierbarer `.graph-legende` + `GraphRegal` unten links; rechts dockt das bündige `258px`-`.graph-panel` (`View`, `68 nodes · 157 links`, Sentence-Case-Köpfe `Layout`, `Colour`, `Depth`, `Labels`, `Now`, dynamische Typ-/Herkunfts-Farbswatches und `Fit / Export / Reset`-Footer). Auf der Canvas laufen ein deterministischer 160-Schritt-Fruchterman-Reingold-Solver (`Claims`), eine 4-Quadranten-PCA-Projektion (`Meaning`) und ein 3-stufiges Bezier-Dendrogramm (`Tree`) über **68** Domänenknoten und **157** Kanten mit Werkbank-Grün-Fokus (`#276b4f` / `#5ec498`), gestrichelten `2,4`-Erwähnungen und HUD-sicherer 3-Pass-Label-Platzierung. Ebenfalls berücksichtigt werden im Tag-System weiterhin vertikale Sidebar-Tag-Zeilen + Inline-Tag-Pills, im White Mode normiert auf K3PTA-Blau (`#3a6ea8` auf `#edf2f8`).
6. **100 % englische UI-Sprache & Initial-Theme-Gleichklang:** Beseitigung aller 5 verbliebenen deutschen UI-Zeichenketten (`"Arbeitet"`, `"Einrichten"`, `"Noch nie"`, `"Gelesen"`, `"Stand/Stände"`, `"Getroffene Begriffe:"`, `"Kernaussage"`, `"Teil"`, `"importiert"`, `aria-label="Chat Eingabe"`) sowie Angleichen des `<html class>`-Starts in `index.html` auf das tatsächliche Standard-Theme (`Light` Default, `.dark` nur bei Nutzer-Wahl).
