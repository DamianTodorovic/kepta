# GLM 5.3 FLASH & MULTI-AI IMPLEMENTATION BLUEPRINT — K3PTA

> **Zweck dieses Dokuments:** Präzise, atomare Schritt-für-Schritt-Bauanleitung zur Übertragung des Master-Mock-ups (`docs/design/mockups/k3pta-master-mockup.html`) und der Creative Direction (`docs/design/CREATIVE_DIRECTION.md`) in den Produktivcode von `/Users/damiantodorovic/kepta-app` — optimiert für eine schnelle, deterministische Ausführung durch KIs wie **GLM 5.3 Flash** ohne Funktionsverlust oder Regressionen.

---

## 0. Unverrückbare Schutzregeln (VOR JEDEM EDIT LESEN)

1. **Quellen- & Repo-Grenze:** Arbeite ausschließlich in `/Users/damiantodorovic/kepta-app`. Fasse `~/kepta-enterprise` niemals an. Pushe nichts und tagge nichts.
2. **Strenge Gates nach jedem Teilschritt:**
   - `npx tsc --noEmit` -> muss **Exit 0** liefern.
   - `node scripts/design-wache.mjs` -> muss **Exit 0** („0 unter der Schwelle“) liefern.
   - `npm test` -> gesamte Test-Suite muss grün bleiben (`tests/keine-grenzen.test.ts`, `tests/design-wache.test.ts`, `tests/design-tokens.test.ts`, `tests/design-vertrag.test.ts`).
3. **Regeln der statischen Wache (`scripts/design-wache.mjs`):**
   - **Keine rohen `#hex`-Farben** in `.tsx` oder neuen `.css`-Regeln; Farben leben ausschließlich über CSS-Tokens (`var(--...)`), Hex-Twins nur an den vorgesehenen `--type-*-hex`-/`--side-*`-Variablen.
   - **Schriftleiter:** Maximal **8** `--fs-\d+` Stufen (`--fs-1: 11px` bis `--fs-8: 40px`, plus `--fs-detail: 18px`). **Niemals** Schriftgrößen `< 11px` oder beliebige Tailwind-Arbitrary-Größen wie `text-[10px]` einführen.
   - **Erlaubte Schriftgewichte:** Ausschließlich `300`, `400`, `600`, `700`, `800`. **Niemals** `font-medium` (`500`) benutzen.
   - **Totes CSS verboten (`css:klassen-waisen = 0`):** Füge in `src/index.css` oder `huelle.css` nur CSS-Klassen hinzu, die auch tatsächlich im JSX (`.tsx`) referenziert werden; lösche verwaiste Klassen sauber.
   - **Light-/Dark-Kontraste:** `--eb-0..2` im Light Mode müssen Luminanz `Y >= 0.90` behalten; im Dark Mode muss jede benachbarte Stufe mindestens `1.30x` Luminanzabstand haben (Gesamtspanne `>= 18.5x`), und alle Texte müssen `>= 4.5:1` bzw. Typfarben `>= 3.0:1` erfüllen.
4. **Geschützte Test-Hooks (`data-testid` — niemals entfernen oder umbenennen):**
   `fenster-titelleiste`, `gehirn-status`, `detail-leer`, `lad-fehler`, `leerer-zustand`, `suche-fuellend`, `suche-regler-verwahrt`, `chat-verbindung`, `chat-cost-zeile`, `graph-leiste`, `graph-canvas`, `graph-legende`, `graph-legende-klappe`, `graph-schema`, `graph-krafte`, `graph-krafte-reset`, `graph-fit`, `graph-export`, `graph-suche`, `graph-search-count`, `graph-schiene-ansicht`, `graph-schiene-kanal`, `graph-schiene-tiefe`, `graph-schiene-namen`, `graph-bewegung`, `graph-nur-mit-verbindungen`, `graph-tag-filter`, `graph-verbindungsdicke`, `graph-verbindungsdicke-wert`, `graph-kante-tooltip`, `graph-gruppenband`, `graph-regal`, `wizard-taefelchen`, `wizard-wunsch-absage`, `privacy-shield`, `connect-apps`, `such-modell`, `such-modell-wechsel`, `kopier-quitte`, `vorschau-ordner`, `eigener-ausschluss`, `links-out-ordner`, `maskiert-meldung`, `fehlerschirm`, `fehlerschirm-weiter`.
5. **Tastaturkürzel erhalten (`Dashboard.tsx`):**
   `⌘K` (Command Palette), `⌘N` (Neue Notiz), `⌘1–4` (`Knowledge`, `Chat`, `Graph`, `Settings`), `⌘5–7` (`Today`, `Dossier`, `Activity`), `?` (ShortcutsSheet), `Esc` (Dialog schließen).

---

## 1. 1:1 Komponentenzuordnung (Mock-up → Produktivcode)

| Mock-up Element / ID (`k3pta-master-mockup.html`) | Produktivdatei in `/Users/damiantodorovic/kepta-app` | Hinweis zur Implementierung |
|---|---|---|
| `.fenster-titelleiste` | `src/components/Dashboard.tsx:1659` & `src/components/huelle.css` | `38px` Titelleiste mit Electron-`hiddenInset`-Aussparung (`electron.js:56-57`) + `?`-Knopf rechts. |
| `.sidebar` | `src/components/Sidebar.tsx` | `208px` Memos-/Werkbank-Sidebar (`#f1f0ec` Light / `#111316` Dark): weiße `Search ⌘K`-Suchkarte oben, flache Navigation ohne Großbuchstaben-HUD-Trenner, `Today` mit Zähler `2` direkt unter `Knowledge`, `TAGS`-Block strukturell 1:1 erhalten (vertikale `.sidebar-tag-btn`-Zeilen `#tag` + `.seiten-plakette`, `Reset`, `X more…`, `counts cover the X loaded notes`) mit K3PTA-Blau (`#3a6ea8`) im Light/White Mode und `#9cadc4` im Dark Mode, ruhiges `K`-Monogramm-Footer mit `MCP ready · 8 tools`. |
| `.listen-spalte` / `.listen-kopf` / `.memos-feed-shell` | `src/components/Dashboard.tsx:1802-1849` & `src/index.css` | Einzeilige `34px`-Fußzeile (`.listen-fuss`) ohne Umbruch/Clipping; sichtbarer Top-K-Selektor unter Erhalt des Test-Hooks `suche-regler-verwahrt`; Header trägt Umschalter zwischen **Split View** und **Memos Feed Stream** (`.notiz-karte` Papierkarten) sowie grünen `+ New`-Knopf (`#2e7d5b`). |
| `#knowledge-detail-pane` (Preview) | `src/components/MemoryPreview.tsx` | Gruppierte Memos-/Werkbank-Tabellen (`.gruppen-tisch`, `.zustandszeile`) für `Validity`, `Revisions`, `Read by` und `Claims` (`Subject → Predicate → Object`), grüne interaktive `.wiki-link`s, 68ch Lesemaß; inline `#tag`-Pills in `.detail-meta` direkt unter `<h1>` im Light/White Mode einheitlich blau (`#3a6ea8` auf `#edf2f8`) statt 4-Farben-Rotation `PILLE_FARBEN` (Dark Mode `#9cadc4` beibehalten). |
| `#knowledge-detail-pane` (Editor) | `src/components/MemoryEditor.tsx` | Randlos ruhiger Titel-Input (`.editor-title-input`), interaktiver Kind-Segment-Schalter, Content, Tags (`Filed under` im Light/White Mode ebenfalls einheitlich blau `#3a6ea8` auf `#edf2f8`), Confidence-Slider, `validFrom`/`validTo`, Claims-Builder, `Private`-Toggle in `.gruppen-tisch`. |
| `#view-chat` & `.chat-inspector` | `src/components/Chat.tsx` | `Look for a local model`-Button oben rechts, runde/ruhige Nachrichtenblasen mit Haar-Kante, `cite-badge`, Privacy-Shield-Status, Kostenzeile `chat-cost-zeile`, grüner Pfeil-Senden-Button (`#2e7d5b`), rechter `Context`-Inspektor mit `Budget`- & `Results`-`.arch-range`-Reglern. |
| `#view-graph` & `.graph-panel` | `src/components/KnowledgeGraph.tsx:6164-6844`, `GraphRegal.tsx`, `GruppenBand.tsx` | Reines Papier-/Obsidian-Canvas (`.graph-leinwand` `#ffffff` / `#141619` **ohne** 40px-Hintergrundraster und **ohne** Regenbogenbalken am oberen Canvas-Rand — `GruppenBand` sitzt im `#pop-schema`-Popover). 68 Knoten & 157 Kanten (`Claims`, `Meaning`, `Tree`, `Type`/`Origin`), **Werkbank-Grün (`#276b4f` / `#5ec498`)** für aktive Fokus-Kanten/Halos & gewählte Node-Pills, gestrichelte `2,4`-Erwähnungskanten, kollabierbare `.graph-legende` + `GraphRegal` unten links; rechts `258px`-`.graph-panel` (`View`) in Sentence Case (`Layout`, `Colour`, `Depth`, `Labels`, `Now`) + `Fit / Export / Reset`. |
| `#view-settings` / `.settings-shell` | `src/components/Settings.tsx:753` | Root von `flex-col` auf `flex-col md:flex-row` korrigieren; Sektionen als `.settings-sec-head` + weiße `.gruppen-tisch`-Karten (`Working` in `#276b4f` Grün, `Set up` in Amber `#9a651d`); alle Sub-Komponenten (`SystemStatus`, `PrivacyShield`, `TypFarbenReihe`, `SearchPrefs`, 20 Provider, `RecoveryKey`, `ConnectApps`, `PraxisSync`) bleiben 1:1 aktiv. |
| `#view-today`, `#view-dossier`, `#view-activity`, `#view-team` | `TodayView.tsx`, `DossierView.tsx`, `ActivityView.tsx`, `TeamView.tsx` | **`TodayView`:** 2-Spalten-Split (`What changed` + grüner `Time window`-Regler links; `Sunday, 15 November` + `Open to-dos`, `Contradictions to resolve`, `Due for review`, `Your AI apps` in `.gruppen-tisch` rechts — **ohne** `.index-strip`-KPI-Boxen!). **`DossierView`:** 2-Spalten-Split (6 Dossiers links; aktives Dossier mit `Key points`, `Timeline`, `Claims`, `Open to-dos` rechts). **`ActivityView`:** `Live \| Audit log`-`.seg`-Schalter + `Connect your AI apps` (8 Tools). |
| `#ov-palette` | `src/components/CommandPalette.tsx:116` | Rechtes leeres `<div className="flex-1" />` durch Live-Vorschau-Inspektor (Titel, Art, Auszug, Tags, Confidence bzw. Aktionsbeschreibung) ersetzen. |
| `#ov-scan`, `#ov-duplicates`, `#ov-setup` | `MachineScan.tsx`, `DuplicatesPanel.tsx`, `OnboardingWizard.tsx` | Footer fixiert, sodass die 2 Pflicht-Checkboxen in `MachineScan` ohne Konflikt zugänglich bleiben und „keeper = richest copy“ klar erkennbar ist. |
| `.flaechen-status` | `src/components/ui/FensterStatus.tsx` & `Dashboard.tsx:2530` | Fenster-Slot unten volle Breite, Overlay überschreibt Fläche deterministisch. |

---

## 2. Sequenzielle Umbau-Anleitung (6 isolierte Pakete)

### Paket 1: Token-Synchronisation, Initial-Theme & Bereinigung von `src/mockup-masse.css`
- **Ziel-Dateien:** `index.html`, `src/contexts/ThemeContext.tsx`, `src/index.css`, `src/main.tsx`, (Abschaffung `src/mockup-masse.css`).
- **Aktionen:**
  1. In `index.html:2`: Entferne statisches `class="dark"` und passe den Inline-Pre-Paint-Style an das Standard-Theme an (`#f7f6f3` / `#1f1e1c`), ergänze ein minimales synchrones `<script>` im `<head>`, das bei `localStorage.getItem('theme-werkbank') === 'dark'` sofort `.dark` setzt — damit verschwindet der Dark-Flash beim Kaltstart.
  2. Übernehme die finalen Light-/Dark-`oklch`-Tokens aus `CREATIVE_DIRECTION.md` §3 in `src/index.css` und falte alle noch benötigten Maße aus `src/mockup-masse.css` ohne `!important` sauber in die Primärklassen in `src/index.css` und `src/components/huelle.css`.
  3. Ergänze die einheitliche Range-Regler-Klasse (`.arch-range`) in `src/index.css` und entferne `import './mockup-masse.css'` aus `src/main.tsx:7` (erst löschen/leeren, wenn keine Regel mehr gebraucht wird).
- **Verifikation:** `npx tsc --noEmit` und `node scripts/design-wache.mjs` -> `Exit 0`.

### Paket 2: Beseitigung der 5 deutschen UI-Zeichenketten
- **Ziel-Dateien & exakte Zeilen (gemessen an `3.2.213`):**
  1. `src/components/SystemStatus.tsx:167, 169`: `"Arbeitet"` -> `"Working"`, `"Einrichten"` -> `"Set up"`.
  2. `src/components/MemoryPreview.tsx:222, 226, 232`: `"Noch nie"` -> `"Never"`, `"Gelesen"` -> `"Read by"`, `"Stand"` / `"Stände"` -> `"Revision"` / `"Revisions"`.
  3. `src/components/MemoryCard.tsx:148`: `"Getroffene Begriffe:"` -> `"Matched terms:"`.
  4. `src/components/Dashboard.tsx:1227, 1263, 1342`: `"Kernaussage"` -> `"Claim"`, `"Teil"` -> `"Part"`, `"importiert"` -> `"imported"`.
  5. `src/components/Chat.tsx:1204`: `aria-label="Chat Eingabe"` -> `aria-label="Chat input"`.
- **Verifikation:** Bestehende Komponententests in `npm test` prüfen; deutsche Begriffe dürfen nur noch in Code-Kommentaren stehen, nicht in JSX-UI-Strings.

### Paket 3: Reparatur des Settings-Two-Column-Splits (`Settings.tsx`)
- **Ziel-Datei:** `src/components/Settings.tsx:753` + `src/index.css:1218-1249`.
- **Aktion:**
  1. Ändere Zeile 753 von `className="h-full flex flex-col min-h-0"` auf `className="h-full flex flex-col md:flex-row min-h-0"`.
  2. Stelle in `src/index.css` sicher, dass unter `< 768px` `.einstellungen-liste` als horizontale Tab-Leiste (`width: 100%; border-right: none; border-bottom: 1px solid var(--border-subtle); flex-direction: row; overflow-x: auto`) umbricht und auf Desktop (`>= 768px`) `width: 196px` volle Höhe einnimmt.
  3. Achte darauf, dass `.settings-panel-fenster` in `.settings-inner` auf `max-width: 680px` ausgerichtet bleibt und keine horizontalen Scrollbalken bei `390px` erzeugt.

### Paket 4: Command Palette (`CommandPalette.tsx`) & Listen-Fuß (`Dashboard.tsx`)
- **Ziel-Dateien:** `src/components/CommandPalette.tsx:116` & `src/components/Dashboard.tsx` (Listen-Fuß um Zeile ~2267).
- **Aktionen:**
  1. In `CommandPalette.tsx`: Ersetze die ungenutzte rechte Fläche (`flex-1`) durch die `.palette-preview`-Inspektorspalte. Render-Logik:
     - Wenn aktiver Eintrag eine Notiz ist: Art-Chip, ID (`mono`), Titel, Auszug, Tags, Scope & Confidence.
     - Wenn aktiver Eintrag eine Aktion ist: Kategorie-Label, Titel, Kurzbeschreibung & Tastaturkürzel.
     - Auf `< 768px` (`.hidden md:flex`) ausblenden, sodass die Trefferliste auf Mobile die volle Breite nutzt.
  2. In `Dashboard.tsx`: Formatiere `.listen-fuss` als einzeiligen `34px`-Balken (`flex-nowrap items-center justify-between`). Halte Status (`In sync`), kompakten Duplikat-Knopf, Papierkorb-Knopf und das Result-Limit-Steuerelement sichtbar nebeneinander ohne Wrapping. Behalte `data-testid="suche-regler-verwahrt"` exakt so bei, wie die dazugehörigen Unit-Tests es abfragen (prüfe `tests/*suche*` vor Umbau!).

### Paket 5: Knowledge Graph Überarbeitung & Tag-Blau-Normierung im White Mode (`KnowledgeGraph.tsx`, `MemoryPreview.tsx`, `Sidebar.tsx`)
- **Ziel-Dateien:** `src/components/KnowledgeGraph.tsx:6164-6844`, `src/components/MemoryPreview.tsx:52-57` (und Editor `Filed under`), `src/components/Sidebar.tsx:140-210`, `src/index.css`.
- **Aktionen Tags (minimalinvasiv — Struktur 1:1 erhalten, nur White-Mode-Farbe auf Blau vereinheitlichen):**
  1. **In `Sidebar.tsx:140-210` nichts am Markup umbauen:** Vertikale `.sidebar-tag-btn`-Liste (`#tag` in `var(--type-semantic)` + `.seiten-plakette`, `Reset`, `X more…`, `counts cover the X loaded notes`) exakt beibehalten.
  2. **In `MemoryPreview.tsx:52-57` (und `MemoryEditor` `Filed under`):** Entferne im Light / White Mode die 4-Farben-Rotation `PILLE_FARBEN` (`--type-semantic` / `--type-episodic` / `--type-reference` / `--type-procedural`) und führe Tag-Pills einheitlich über K3PTA-Blau (`--tag-color: #3a6ea8` auf `--tag-pill-bg: #edf2f8`, aktiver Sidebar-Tint `color-mix(in srgb, var(--tag-color) 12%, transparent)`). Im `.dark`-Block bleibt das bestehende Dark-Mode-Tag-Token (`#9cadc4` auf `rgba(156, 173, 196, 0.14)`) unverändert.
- **Aktionen Knowledge Graph (`KnowledgeGraph.tsx`):**
  1. **Reines Papier-/Obsidian-Canvas + `258px`-`.graph-panel` rechts:** `.graph-stage` rendert links die `.graph-leinwand` (`#ffffff` Light / `#141619` Dark, ohne 40px-Karoraster und ohne Regenbogenbalken am oberen Canvas-Rand — `.graph-gruppenband` liegt im `#pop-schema`-Popover), Zoom-Leiste (`- 100% +`) oben links, ein-/ausblendbarem PCA-Hinweis oben rechts (`Meaning`), kollabierbarer `.graph-legende` + `GraphRegal` unten links sowie `#pop-schema` (`graph-schema`) & `#pop-forces` (`graph-krafte`) als schwebende Popovers; rechts dockt `<aside className="graph-panel">` (`258px`, `data-testid="graph-leiste"`) mit scrollbarer `.graph-panel-korper`-Bedienleiste (`graph-suche`, `Claims`/`Meaning`/`Tree`, `Type`/`Origin`, `Depth 1–3`, `Labels Key/All/Off`, `Now`-Slider, dynamischer `.legende-graph`, `Direction`/`Similar`/`Schema`/`Forces`/`Motion`/`Connected`, Tag-Filter, `Thickness`) und unbeschnittenem `.graph-panel-fuss` (`Fit`, `Export`, `Reset`). Fokus-Kanten, Halos und gewählte Knoten-Pills nutzen Werkbank-Grün (`#276b4f` / `#5ec498`).
  2. **Canvas-Rendering & Kollisionsvermeidung:** Gradabhängige Knotenradien + radiale Hub-Auren, weiße Konturringe im White Mode bzw. Flat-Glass-Highlights im Dark Mode, epist. Ringcodierung (gefüllt = aktiv, hohler Ring = Konzept, gestrichelt = ersetzt), `+N`-Hub-Badges und strikte 3-Pass-Platzierung mit HUD-Schutzzonen: (A) Hub-/Fokus-Pills inkl. Kanten-Clamping & Ausweichpositionen, (B) Prädikat-Pills auf Claim-Kanten, (C) Sekundär-Labels.
  3. **Farbkanalwechsel `Type ↔ Origin` & Range-Slider:** Klick auf `Origin` (`graph-schiene-kanal`) schaltet Knotenfarben auf Herkunfts-Tokens (`--type-herkunft-geschrieben`, `-datei`, `-rechner`) sowie `.legende-graph` auf die entsprechenden Herkunfts-Zeilen (`Written by you`, `From imported files`, `Derived / system`) mit Live-Zählern um. Alle Slider (`Now`, `Thickness`, `Forces`) nutzen `.arch-range`.
  4. **Geschützte `data-testid`-Anker unverändert lassen:** `graph-leiste`, `graph-canvas`, `graph-legende`, `graph-legende-klappe`, `graph-schema`, `graph-krafte`, `graph-krafte-reset`, `graph-fit`, `graph-export`, `graph-suche`, `graph-search-count`, `graph-schiene-ansicht`, `graph-schiene-kanal`, `graph-schiene-tiefe`, `graph-schiene-namen`, `graph-bewegung`, `graph-nur-mit-verbindungen`, `graph-tag-filter`, `graph-verbindungsdicke`, `graph-verbindungsdicke-wert`, `graph-kante-tooltip`, `graph-gruppenband`, `graph-regal`.
- **Verifikation:** `npm test` (alle Graph-Tests inkl. `graph-bewegungsruhe.test.tsx`, `graph-leiste-vertrag.test.ts` etc.), Light/Dark-Tag-Prüfung (`#3a6ea8` auf `#edf2f8` im Light Mode vs `#9cadc4` im Dark Mode) und Headless-Screenshot für `Claims`, `Meaning` & `Tree` (0 abgeschnittene Pills/Buttons, 0 Überlappungen).

### Paket 6: Mobile Responsivität (`390×844`) & Konsistentes Detail-Switching
- **Ziel-Dateien:** `src/components/Dashboard.tsx`, `src/index.css`.
- **Aktionen:**
  1. Stelle sicher, dass auf schmalen Viewports (`<= 767px`) in `Knowledge` beim Auswählen einer Notiz die `.detail-spalte` mit klarer `← Knowledge`-Zurück-Taste erscheint und nicht gleichzeitig Liste + Detail gequetscht werden.
  2. Prüfe alle Header (`.chat-head`, `.graph-topbar`, `.detail-kopf`) auf sauberes Wrapping ohne horizontales Overflow (`document.documentElement.scrollWidth <= clientWidth`).

---

## 3. Verbindliches Abnahme-Protokoll nach Umsetzung

Nach Abschluss aller 6 Pakete in `/Users/damiantodorovic/kepta-app` muss die umsetzende KI folgende Nachweise erbringen:

1. **Statik & Typen:** `npx tsc --noEmit` -> Exit 0.
2. **Design-Wache:** `node scripts/design-wache.mjs` -> 0 Messungen unter der Schwelle, Exit 0.
3. **Automatisierte Tests:** `npm test` -> alle Tests grün, keine übersprungenen Assertions.
4. **Echte Browser-Verifikation (Headless Chrome CDP):**
   - Rendere mindestens `Knowledge` (Reader + Editor), `Chat`, `Graph` (`Claims`/`Tree`/`Meaning`), `Settings` (`AI & data`, `MCP/API`, `Device Sync`), `Today`, `Dossier`, `Activity` und `CommandPalette` in `1440×900` (Light & Dark) sowie `390×844` (Mobile).
   - Verifiziere programmatisch:
     - `scrollWidth <= clientWidth` auf jedem Viewport.
     - Keine überlappenden oder abgeschnittenen Buttons (insb. `.listen-fuss`, `.graph-panel-fuss`, `.dialog-foot`).
     - Kein deutscher UI-Resttext in der gerenderten DOM-Oberfläche.
