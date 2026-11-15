# VOLLSTÄNDIGE IST-ANALYSE — K3PTA

> **Verbindliche Quelle:** Ausschließlich der lokale Projektordner `/Users/damiantodorovic/kepta-app` (Stand: Version `3.2.213`, Git-`HEAD` `8adba16706880758da53b9650cea15ce8575b644`). Keine GitHub-Remotes, keine externen Klone, kein Zugriff auf die zugefrorene Enterprise-Codebase.
> **Verifizierungsstatus in dieser Analyse-Sitzung:**
> - `npx tsc --noEmit` in `/Users/damiantodorovic/kepta-app`: **Exit 0** (frisch ausgeführt)
> - `node scripts/design-wache.mjs --leise`: **276 Messungen, 0 unter der Schwelle — Exit 0** (frisch verifiziert)
> - Gesamt-Testsuite (`npm test`): in dieser reinen Analyse- und Designphase nicht neu gestartet; laut Commit-Nachricht zu `HEAD` `8adba16` umfasst der letzte Stand `3.892` Tests *(gemeldet, nicht neu gemessen)*.

---

## 1. Produktverständnis & Produktidentität

### 1.1 Was ist K3PTA?
K3PTA (*„A central knowledge store for AI context — manage information efficiently and cut the token cost of every LLM call“*, `index.html:9`) ist eine **local-first, AES-256-verschlüsselte Wissensdatenbank und AI-Memory-Engine**. Eine einzige SQLite-/SQLCipher-Datei (`~/.kepta/kepta.db`) wird gleichzeitig über:
1. eine lokale **Desktop-Werkbank** (Electron-Shell oder lokaler Browser unter `http://127.0.0.1:<random-port>`),
2. eine **Express-5-REST- und SSE-API** (`75` Routen über `19` Router-Module) sowie
3. einen **integrierten MCP-Server** (`stdio` + HTTP `/mcp`, `8` Werkzeuge) für externe KI-Clients (`Claude Desktop`, `Cursor`, `Zed`, `Windsurf`, `VS Code`)

angesprochen. Das gesamte System benötigt weder Cloud-Konto noch Telemetrie.

### 1.2 Welches konkrete Problem löst das Produkt?
1. **Kontext-Amnesie über KI-Tools hinweg:** Wissen aus Claude Desktop, Cursor, ChatGPT/Claude-Exporten oder lokalen Dokumenten bleibt normalerweise in isolierten Chat-Silos gefangen. K3PTA bündelt alles an einem Ort mit gemeinsamer MCP-Schnittstelle.
2. **Unkontrollierte Token-Kosten & Kontext-Verdünnung:** Statt ganze Notizsammlungen in jeden Prompt zu kopieren, wählt K3PTAs 3-Bein-Retrieval-Engine (`BM25 + Vektor-KNN + Entity-Match → RRF`) gezielt relevante Notiz-Chunks innerhalb eines steuerbaren Token-Budgets (`tokenBudget`, bis 24 Notizen / budgetbegrenzt) aus.
3. **Unbemerkter Geheimnis- und PII-Abfluss an Cloud-LLMs:** Vor dem Verlassen der Maschine ersetzt der lokale `PrivacyShield` (`src/lib/schild.ts`) echte Geheimnisse und personenbezogene Daten deterministisch durch Platzhalter (`[EMAIL-1]`, `[PHONE-1]`, `[IBAN-1]`, `[CARD-1]`, `[SECRET-1]`) — inklusive Mod-97-IBAN- und Luhn-Kreditkartenprüfung — und setzt die Originalwerte nach der Modellantwort wieder ein, während `private`-Notizen lokale Grenzen nie verlassen.
4. **Fehlende Nachvollziehbarkeit:** Jeder Agenten-Lese-, Schreib-, Such-, Export- und Netzabgang landet lokal im append-only Audit-Log (`~/.kepta/audit.jsonl`, `FileAuditSink`).

### 1.3 Zielgruppe & zentrale Anwendungsfälle
- **Zielgruppe:** Entwickler, Solo-Gründer, Berater, Forscher sowie Kanzlei-/Praxis-Umgebungen (im Code explizit sichtbar über `PraxisSync`, Mandanten-Scopes und `klassifikation.ts`-Heuristiken wie `fristenkontrolle`/`besprechung`/`mandantendaten`).
- **Zentrale Anwendungsfälle:**
  1. Wissensaufnahme per Editor (`Fact`, `Event`, `How-To`, `Source`), Claim-Tripeln (`Who / Does what / Whom`), Datei-/Markdown-/Obsidian-Import, URL-Clip, ChatGPT/Claude-`conversations.json`-Import oder kontrolliertem `Machine Scan`.
  2. Hybride Sofort- und Bedeutungs-Suche (inkl. bi-temporaler Zeitreise `asOf` und `validSince`).
  3. Token-budgetierter RAG-Chat gegen 20 konfigurierbare Anbieter-Presets (lokal über Ollama / LM Studio / Custom oder über Cloud-APIs) mit Zitat-Quellen, Privacy-Shield-Status und optionalem Auto-Learn.
  4. Analyse des vernetzten Wissensgraphen in drei Modi (`Claims` / Force, `Tree` / Dendrogram, `Meaning` / Semantic), zeitlicher Filterung und Schema-/Farbregal.
  5. Synthese-Flächen: `Today` (Daily Briefing & Widerspruchsklärung), `Dossier` (Themen-Bündelung), `Activity` (Live-SSE-Protokoll von Mensch + MCP-Agenten).
  6. Verschlüsselter Geräteabgleich über unsichere Transportwege (`PraxisSync`: AES-256-GCM + `scrypt` + verkettetes SHA-256-Journal).

### 1.4 Produktidentität
K3PTA ist kein verspieltes Notiz-Toy und kein Cloud-CRM. Die Produkt-DNA ist ein **forensisch präzises, lokal-souveränes Wissensinstrument**: ruhig, faktenbasiert, mit expliziten Herkunfts-, Gültigkeits-, Konfidenz- und Provenienz-Angaben sowie kompromissloser Kontrolle darüber, was die Maschine verlässt. Kostenlose App ohne Lizenzschlüssel, ohne Tageslimits (`tests/keine-grenzen.test.ts`).

---

## 2. Technische Architektur (am lokalen Code nachgewiesen)

### 2.1 Schichten & Modul-Inventar
| Schicht | Verifizierte Dateien | Zentrale Bausteine & Technologien |
|---|---|---|
| **Desktop-Shell** | `electron.js` (`231` Zeilen) | Electron `BrowserWindow` (`1280×840`, `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: {x:14, y:14}`), `lang=en-US`, fester Zoom `100%` (`setVisualZoomLevelLimits(1, 1)`), dynamisch freier Loopback-Port, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false` |
| **HTTP- & Boot-Schicht** | `server/bootstrap.ts`, `server/app.ts`, `server/kontext.ts`, `server/router/*.ts` (**19** Router) | Express 5 (`/{*splat}` SPA-Fallback), Bindung strikt auf `127.0.0.1` (Loopback-Default), Vite-Middleware im Dev-Modus / statisches `dist/` im Build, Absturz-Log `~/.kepta/letzte-worte.log` |
| **Kern-Engine** | `src/core/*.ts` (**24** Module) | `better-sqlite3-multiple-ciphers` (`SQLCipher-4` AES-256, WAL, FTS5), OS-Keychain (`macOS security add-generic-password` ohne `-U`), `engine.ts` (3-Spur-RRF + `localRerankScore` + Oblivion Retention), `embeddings.ts` (Ollama `/api/embed` + `EmbeddingQueue`), `klassifikation.ts`, `praxissync.ts`, `mcp.ts` (**8** MCP-Tools), `extensions.ts` (`PolicyGate`, `FileAuditSink`, `KeyProvider`) |
| **UI-Logik & Bibliotheken** | `src/lib/*.ts(x)` (**55** Dateien) | `ai.ts` (**20** Provider-Presets), `schild.ts` (Privacy Shield), `prefs.ts` + `searchPrefs.ts` (DB-gespiegelte Präferenzen), `motionTokens.ts`, `ansichten.ts`, `graphLayout.ts` / `graphHierarchy.ts` / `graphSemantik.ts` / `graphTime.ts` / `graphSchema.ts` |
| **Frontend-Komponenten** | `src/components/**/*.tsx` (**27** Dateien) + CSS (`index.css`, `huelle.css`, `mockup-masse.css`) | React 19, TypeScript, Tailwind CSS Tokens (`oklch`), `motion/react` (`<MotionConfig reducedMotion="user">`), Canvas-2D-Graph (`KnowledgeGraph.tsx`, `6.867` Zeilen), globale ErrorBoundary (`Fehlerschirm.tsx`), `ThemeContext.tsx` |

### 2.2 Persistenz, State-Management & Random-Port-Besonderheit
- **Keine globale Store-Bibliothek:** Der UI-Zustand lebt primär in `Dashboard.tsx` (`2.623` Zeilen) und in typisierten `localStorage`-Helfern (`prefs.ts`, `searchPrefs.ts`, `settings.ts`, `ThemeContext.tsx`).
- **Kritisches Architekturdetail (`Random-Port-Origin`):** Da `electron.js` bei jedem Start einen freien Port (`getFreePort()`) vergibt, ändert sich der Origin `http://127.0.0.1:<port>` zwischen App-Starts. Reiner Browser-`localStorage` wäre damit bei jedem Start leer. Deshalb lädt `src/main.tsx:24` vor dem ersten React-Render `starteEinstellungen()`, während `prefs.ts` (`spiegelePrefs()` / `hydratePrefs()`) die 11 `PREF_KEYS` entprellt (`1.500ms`) in SQLite unter `/api/settings` (`ui_prefs`) spiegelt.
- **Cross-Panel-Synchronisation:** `searchPrefs.ts` nutzt zusätzlich das Custom Window-Event `kepta_such_prefs`, damit Änderungen in `Settings` (Suchtiefe `5..32`, Spuren BM25/Vektor/Graph, Ergebnislimit `5/10/20/50/100/250/0`) live in `Dashboard` und `Chat` greifen.

### 2.3 Vollständige API- & MCP-Oberfläche

#### A) 75 Express-5-Routen über 19 Router (`server/router/*.ts`)
- **`activity`**: `GET /api/activity` (SSE Live-Stream)
- **`audit`**: `GET /api/audit`, `GET /api/audit/verify`, `GET /api/audit/export.csv`, `GET /api/memories/:id/readers`
- **`briefing`**: `GET /api/briefing`, `POST /api/contradictions/resolve`, `GET /api/dossier`, `GET /api/dossier/suggestions`
- **`chat`**: `POST /api/chat/stream` (SSE), `POST /api/chat`, `GET /api/models`, `POST /api/models`, `POST /api/embed`
- **`clients`**: `GET /api/agents`, `GET /api/clients`, `POST /api/clients/:id/connect`
- **`clip`**: `POST /api/clip`
- **`importe`**: `POST /api/memories/import` (2 MB), `POST /api/import/markdown` (10 MB), `POST /api/import/chat` (40 MB ChatGPT/Claude)
- **`inbox`**: `GET /api/inbox/status`, `POST /api/inbox/scan`
- **`mcp`**: `GET /api/mcp/tools`, `GET /api/tools`, `POST /mcp`, `GET /mcp`, `POST /api/mcp/search`, `POST /api/mcp/save`
- **`memories`**: `GET /api/memories`, `POST /api/memories`, `POST /api/memory`, `DELETE /api/memories/:id`, `POST /api/memories/bulk-delete`, `POST /api/memories/reclassify`, `POST /api/memories/bulk-restore`, `POST /api/memories/:id/restore`, `GET /api/memories/gruppen`, `GET /api/memories/:id/stande`, `POST /api/memories/:id/stande/:standId/restore`, `GET /api/memories/:id/behauptungen`
- **`nachzug`**: `GET /api/graph/nachzug`, `POST /api/graph/nachzug`, `POST /api/graph/nachzug/cancel`
- **`recovery-key`**: `POST /api/recovery-key` (fordert Header `X-KEPTA-Recovery: 1`)
- **`scan`**: `GET /api/scan/config`, `PUT /api/scan/config`, `GET /api/scan/policy`, `POST /api/scan/preview`, `POST /api/scan/start`, `GET /api/scan/status`, `POST /api/scan/cancel`, `POST /api/repair/imports`
- **`schild`**: `GET /api/shield`, `PUT /api/shield`, `GET /api/policies`
- **`search`**: `GET /api/memories/search`, `POST /api/search`
- **`settings`**: `GET /api/profile`, `POST /api/profile`, `GET /api/settings`, `PUT /api/settings`
- **`sync`**: `POST /api/sync/export`, `POST /api/sync/import`, `GET /api/sync/journal`
- **`system`**: `GET /api/such-modell`, `POST /api/such-modell`, `GET /api/health`, `GET /api/storage-info`, `GET /api/graph`, `GET /api/graph/haufen`, `GET /api/graph/semantik`, `POST /api/export/markdown`, `POST /api/open`
- **`team`**: `GET /api/team`

#### B) 8 MCP-Werkzeuge (`src/core/mcp.ts`)
1. `memory_search` (hybrid + `asOf` Zeitreise + `validSince` + Scope/Tag/Type-Filter)
2. `memory_save` (Anlegen inkl. Wiki-Link-Extraktion `[[...]]` & Auto-Klassifikation)
3. `memory_update` (Titel, Inhalt, Typ, Tags, Confidence, Temporal-Felder)
4. `memory_delete` (Soft-Delete in Papierkorb oder endgültig)
5. `memory_list` (Paginierte Übersicht nach Typ/Tag/Scope)
6. `memory_graph` (Nachbarschaftsgraph — gedeckelt auf max. `500` Knoten / `2.000` Kanten in Store)
7. `memory_consolidate` (`dryRun` oder Konsolidierung erkannter Duplikate)
8. `memory_forget` (`expire` setzt `validTo=now`, `supersede` verknüpft Nachfolger, `delete` verschiebt in Papierkorb)

### 2.4 Sicherheits- & Retrieval-Kernmechanismen
- **Hybrid-Engine (`src/core/engine.ts`):** `RRF_K = 60`, `MAX_SEARCH_LIMIT = 10_000` (MCP auf `100` gekappt), Vektor-Bandpass (`VECTOR_BAND = 0.86`, `VECTOR_FLOOR = 0.58`), Entity-Teilwortsuche (`BEGRIFF_STUECKE_MAX = 4000`, bis 48 Zeichen/Wort, 4-Wort-Phrasen), lokales deterministisches Reranking (`RERANK_MAX_BOOST = 0.25`), zeitlicher Verfall/Vergessen nach Oblivion-Modell (`RETENTION_T_DAYS = 90`, `RETENTION_FLOOR = 0.2`), Abwertung für abgelaufene (`0.5`) bzw. ersetzte (`0.4`) Erinnerungen.
- **Privatsphäre & Krypto:** SQLCipher-4-Key über OS-Schlüsselbund (`app.kepta.database`), `PrivacyShield` (`secret` > `iban` > `card` > `email` > `phone`, für MCP-Apps mindestens `secret`/`iban`/`card`), `PraxisSync` mit `KDF_CURRENT` (`scrypt` `N=131072, r=8, p=1`, min. 12-Zeichen-Passphrase), `MachineScan` mit expliziter Nicht-Lesen-Liste + Key-Redaktion (`sk-…MASKIERT(43)`).

---

## 3. Bestehendes Design & Forensische Befunde (`3.2.213` / P202)

### 3.1 Bestehendes Token- & Wächter-Gerüst (`scripts/design-wache.mjs`)
Die Codebase besitzt bereits eine außergewöhnlich strenge statische Design-Wache (`scripts/design-wache.mjs`), die bei Umbauten zwingend grün bleiben muss:
- **Oberflächentreppe (`--eb-0..2`, `--feld`):** Im Light Mode müssen alle `--eb-*`-Flächen aufsteigende Luminanz `>= 0.90` besitzen, getrennt durch `--kante-flaeche` (`>= 3.0:1`). Im Dark Mode erzwingt die Wache `>= 3` Stufen mit benachbartem Luminanzsprung `>= 1.30x`, Gesamtspanne `>= 18.5x` sowie `--eb-1 / --feld >= 1.30x`.
- **Kontrastschwellen:** `--text-1..3`, `--ok`, `--warn`, `--danger`, `--accent`, `--side-*` und `--on-accent` auf `--accent-fuell` müssen `>= 4.5:1` erreichen; `--type-*` und `--type-*-hex`-Zwillinge mindestens `3.0:1` auf `--glass-panel`; Konturen `--kante-kontrolle >= 3.0`, `--kante-flaeche >= 3.0`, `--kante-stark >= 1.9`, `--kante-dekor >= 1.35`, `--fokus >= 3.0`.
- **Schriftleiter:** Maximal **8** `--fs-\d+`-Stufen (`--fs-1: 11px` bis `--fs-8: 40px`, alle `>= 11px`, plus `--fs-detail: 18px`), statische Gewichte `[300, 400, 600, 700, 800]` (kein `500`), feste Radien (`14/12/7/4/3px`), `4px`-Spacing-Leiter (`2/4/8/12/16/24/32/48px`), Mindest-Icongröße `14px`, Mindest-Zielgröße `28px` kompakt / `36px` Desktop / `44px` Mobile.
- **Totes-CSS-Wache (`css:klassen-waisen = 0`):** Jeder in `src/index.css` oder `huelle.css` definierte Selektor muss in `.tsx` tatsächlich benutzt werden.

### 3.2 Konkret nachgewiesene Mängel im Ist-Zustand (`3.2.213`)

1. **CSS-Kaskadenschuld `src/mockup-masse.css` (`177` Zeilen `!important`):**
   - `src/main.tsx:7` lädt `mockup-masse.css` nach `index.css` und bügelt Maße mit hochspezifischen Ketten (`.huelle .huelle .huelle .fenster-titelleiste`) und `!important` über das eigentliche System — Wartbarkeit und Berechenbarkeit für andere KIs leiden stark.
2. **Defektes Zweispalt-Layout in den Einstellungen (`src/components/Settings.tsx:753`):**
   - Der Container trägt `className="h-full flex flex-col min-h-0"`, während `.einstellungen-liste` (`src/index.css:1218`) als `196px` linke Spalte mit `border-right` definiert ist. Durch `flex-col` steht die Sub-Navigation über statt neben `.settings-panel-fenster`, und die rechte Trennlinie bricht mitten im Fenster ab.
3. **5 deutsche UI-Zeichenketten in der rein englischen App (`electron.js:11` erzwingt `en-US`):**
   - `SystemStatus.tsx:167, 169`: `"Arbeitet"`, `"Einrichten"`
   - `MemoryPreview.tsx:222, 226, 232`: `"Noch nie"`, `"Gelesen"`, `"Stand"`, `"Stände"`
   - `MemoryCard.tsx:148`: `"Getroffene Begriffe:"`
   - `Dashboard.tsx:1227, 1263, 1342`: `"Kernaussage"`, `"Teil"`, `"importiert"`
   - `Chat.tsx:1204`: `aria-label="Chat Eingabe"`
4. **Überladener Listen-Fuß & versteckter Treffer-Regler (`Dashboard.tsx` / `index.css:1078` / `mockup-masse.css:89`):**
   - `.listen-fuss` drängt Synchronstatus (`In sync`), Duplikat-Meldung (`31 duplicates`), Papierkorb-Knopf und Sucheinstellung auf `30px` Höhe mit `overflow: hidden` zusammen, während `suche-regler-verwahrt` den eigentlichen Slider mit `<span hidden>` ausblendet.
5. **Ergonomie-Schwächen im Chat-Regler & Sende-Knopf (`Chat.tsx` + `index.css:1201`):**
   - Der Range-Regler in `.chat-panel-regler` besitzt keinen visuell kalibrierten Track-Verlauf; der Sende-Knopf wirkt durch schwache Kontrastfüllung/Iconwahl uneindeutig.
6. **Leere rechte Hälfte in der Command Palette (`CommandPalette.tsx:116`):**
   - Der `540px`-Dialog reserviert `380px` für die Trefferliste und belässt rechts ein komplett leeres `<div className="flex-1" />` (`~160px` toter Weißraum statt Notiz-/Aktionsvorschau).
7. **Wissensgraph-Bedienleiste & Legenden-Überladung (`KnowledgeGraph.tsx:6164-6170`):**
   - Obwohl der Kommentar auf line 6164 das Panel „rechts“ beschreibt, sitzt `<aside className="graph-panel">` im JSX links bzw. engt bei kleinen Höhen die Fußknöpfe bis zum Clipping (`Exp...`) ein; unten links überlagert `.legende-graph` die Canvas mit zu viel Fließtext.
8. **Dark-Flash beim Initialstart (`index.html:2,15` vs. `ThemeContext.tsx:17-18`):**
   - `index.html` setzt statisch `<html class="dark">` und `background-color: #070708`, obwohl `ThemeContext.tsx` im Default `isDark = false` (Light Mode) startet und `.dark` erst nach React-Boot wieder entfernt.
9. **Abgegrenzte Schwächen des Vorgänger-Entwurfs `k3pta-v2.html`:**
   - Blanker Graph-Tab, stark verkürzter `MemoryEditor` (fehlende Art, Claims `Who/Does what/Whom`, Private-Schalter, Validity/Confidence, `Filed under`-Vorschau) und fehlende 80 % der `Settings`-Module (`PrivacyShield`, `SearchPrefs`, `Colors of kinds`, `SystemStatus`, `Organization`, `RecoveryKey`, `ConnectApps`, `PraxisSync`). Das neue Master-Mock-up beseitigt sämtliche Auslassungen vollständig.

---

## 4. Vollständige Bestandssicherung & Zero-Regression-Checkliste

Jede nachfolgende Funktion existiert im lokalen Stand `3.2.213` und muss nach jeder gestalterischen Überarbeitung zu **100 %** funktional, erreichbar und automatisiert testbar bleiben:

### 4.1 Globale Fenster-Architektur, Navigation & Tastaturkürzel (`Dashboard.tsx`, `Sidebar.tsx`, `FensterStatus.tsx`)
- [ ] **Titelleiste (`data-testid="fenster-titelleiste"`):** Zeigt im Browser Ampel-Dummy, im Electron `hiddenInset`-Freiraum; Titel spiegelt aktive Fläche (`FLAECHE_TITEL[currentView] — K3PTA`) bzw. Editor/Overlay (`Editor — K3PTA`, `Import — K3PTA`, `Duplicates — K3PTA`, `K3PTA einrichten`, `Knowledge — K3PTA` bei Palette).
- [ ] **Linke Sidebar:** Suchfeld oben (`⌘K` Palette-Trigger & Filter), 4 Hauptansichten (`Knowledge` `⌘1`, `Chat` `⌘2`, `Graph` `⌘3`, `Settings` `⌘4`), 3 Syntheseansichten (`Today` `⌘5`, `Dossier` `⌘6`, `Activity` `⌘7`), optional `Team`-Ansicht (nur sichtbar bei `teamVorhanden`), verbundene MCP-Apps (`appsLive`), Tag-Filterliste (Mehrfachauswahl + Clear), Setup-Button (wenn Onboarding unvollständig), Theme-Umschalter (`useTheme().toggle()`), Sidebar-Collapse/Focus-Mode (`isFocusMode`).
- [ ] **Fenster-Statusleiste (`FensterStatus.tsx`):** Unten volle Breite, deterministisch überschrieben von Overlays (`overlayZeile`) oder gemeldet von der aktiven Fläche (`flaechenStatus`), inkl. `gehirn-status` (`MCP: X tools`, Verbindungszustand, `local · private`).
- [ ] **Globale Kürzel & `?`-Overlay (`ShortcutsSheet`):** `⌘1–4`, `⌘5–7`, `⌘K` (Command Palette), `⌘N` (Neue Notiz), `?` (Shortcuts-Blatt), `Esc` (Dialog/Overlay schließen).
- [ ] **Globale ErrorBoundary (`Fehlerschirm.tsx`):** `data-testid="fehlerschirm"` + Recovery-Knopf `data-testid="fehlerschirm-weiter"` mit erhaltenem Zustand.

### 4.2 Workspace `Knowledge` (`Dashboard.tsx`, `MemoryCard.tsx`, `MemoryPreview.tsx`, `MemoryEditor.tsx`)
- [ ] **Listen-Kopf (`.listen-kopf`):** Titel `Knowledge`, Live-Zähler (`displayed of total`), Match-Badge (`All matches` / `Top K` / `X of Y matches · show all`), 3 Kopf-Werkzeuge (`Import` -> öffnet `MachineScan`, `Duplicates` -> öffnet `DuplicatesPanel`, `New` -> öffnet `MemoryEditor`).
- [ ] **Listen-Steuerung & Filter:** Gruppierung (`Chronology`, `Kinds`, `Tags`, `Sources`), Typ-Filter (`Fact`, `Event`, `How-To`, `Source`), Tag-Chips, Inline-Suche mit Ergebnislimit-Stopps (`5, 10, 20, 50, 100, 250, All` — `suche-regler-verwahrt`-Kontrakt beachten!), Paginierung via IntersectionObserver.
- [ ] **Import-Band & Papierkorb:** Datei-Dropzone / File-Picker (`.md`, `.txt`, `.json`, `.csv`, ChatGPT/Claude-Import), URL-Clipper (`/api/clip`), einblendbarer Papierkorb (`trashOpen`) mit Einzel-/Bulk-Wiederherstellung (`/api/memories/:id/restore`, `bulk-restore`).
- [ ] **Lese-Spalte (`MemoryPreview.tsx`):** Zeigt immer Detailspalte oder präzisen Leerzustand (`data-testid="detail-leer"`); bei Auswahl: Titel, Art-Badge, Tags, Konfidenz- & Scope-Angabe (`local` / `private`), Gültigkeitszeitraum (`validFrom`–`validTo`, `expired`/`superseded`-Markierung), **Claim-Tripel (`Who → Does what → Whom`)**, Versions-/Stand-Historie (`stande` mit Restore), Lesende Agenten (`/api/memories/:id/readers`), Edit/Duplicate/Delete-Aktionen (Undo-Toast via `ToastProvider`).
- [ ] **Editor-Spalte (`MemoryEditor.tsx`):** Titel, Inhalt (Markdown), Art-Auswahl (`semantic`/`episodic`/`procedural`/`reference`), Tags-Eingabe, Claim-Builder (`subject`, `predicate`, `object`), `Private`-Scope-Schalter, Zeitfenster (`validFrom`, `validTo` inkl. `en-US`-Datepicker), Confidence-Regler (`0..1`), Live-Vorschau `Filed under` (Regel-Erklärung aus `klassifikation.ts`).

### 4.3 Workspace `Chat` (`Chat.tsx`)
- [ ] **Zweispaltiges Cockpit:** Links/Mitte Stream + Quellen-Zitate + Kosten-/Token-Zeile (`data-testid="chat-cost-zeile"`) + Privacy-Shield-Badge pro Nachricht; Rechts Context Inspector (ausgewählte Kontext-Notizen nach Retrieval-Rank + Token-Budget-Regler + Such-Track-Indikator `engine` vs. `lokal`).
- [ ] **Funktionen:** SSE-Streaming (`/api/chat/stream`), Abort-Schalter (Stop mit Erhalt der Teilantwort), Export als Markdown, Auto-Learn-Hinweis & Direkt-Aktivierung, `data-testid="chat-verbindung"`, Schutz bei fehlendem Key/Modell inkl. Ausnahmeregel für lokale Endpunkte (`istLokaleAdresse`).

### 4.4 Workspace `Graph` (`KnowledgeGraph.tsx`, `GraphRegal.tsx`, `GruppenBand.tsx`)
- [ ] **Drei Ansichten (`src/lib/ansichten.ts`):** `Claims` (`force`), `Tree` (`dendrogram` inkl. Faltungs-Vorschlag `vorschlagFaltung`), `Meaning` (`semantic` semantische Projektion).
- [ ] **Canvas-Interaktionen (`data-testid="graph-canvas"`):** Zoom/Pan/Fit (`ZoomIn`, `ZoomOut`, `Maximize2`), Klick auf Knoten (Nachbarschaft + Notiz-Inspektor), Doppelklick/Pin, Kanten-Hover/Treffer (`kanteBei`), Schema-Popover (`data-testid="graph-schema"`), Kräfte-Popover (`data-testid="graph-krafte"`), Zeitreise-Regler (`asOf` / `graphTimeRange`), PNG-Export, Nachzug-/Embedding-Backfill-Fortschritt (`/api/graph/nachzug`).
- [ ] **Gruppen, Farben & Legende:** `GruppenBand` (`data-testid="graph-gruppenband"` zeigt ausschließlich real gemalte Anteile), `GraphRegal` (`data-testid="graph-regal"`), umschaltbare Legende (`data-testid="graph-legende"`, `data-testid="graph-legende-klappe"`), Synchronisation von `typFarben` in die gesamte App.

### 4.5 Workspaces `Today`, `Dossier`, `Activity`, `Team`
- [ ] **`Today` (`TodayView.tsx`):** `/api/briefing`, fällige Erinnerungen, offene Widersprüche mit Resolve-Aktion (`/api/contradictions/resolve`), zeitliche Aktivitätsübersicht.
- [ ] **`Dossier` (`DossierView.tsx`):** `/api/dossier` + `/api/dossier/suggestions`, Themen-Auswahl, automatisches strukturiertes Dossier mit Quellenverweisen und Markdown-Export.
- [ ] **`Activity` (`ActivityView.tsx`):** SSE-Live-Stream (`/api/activity`), Filter nach Akteur/Aktion, Audit-Integritätsprüfung (`/api/audit/verify`), CSV-Export (`/api/audit/export.csv`).
- [ ] **`Team` (`TeamView.tsx`):** Verwaltete Team-Scopes (`/api/team`), Rollen- und Bereichsübersicht (nur aktiv, wenn Policy vorhanden).

### 4.6 Workspace `Settings` (`Settings.tsx`) & Submodule
- [ ] **3-Tab-Seitenleiste:** `AI & data`, `MCP / API`, `Device Sync` (Reparatur auf `flex-row` Desktop / `flex-col` Mobile ohne Verlust von Tab-State).
- [ ] **Tab `AI & data`:**
  - `SystemStatus.tsx` (Health, DB-Größe, Embeddings-Status, Ollama-Check)
  - `PrivacyShield.tsx` (`data-testid="privacy-shield"`, Live-Textvorschau + Umschalter)
  - `Colours of the kinds` (`TypFarbenReihe`)
  - `Search` (`data-testid="such-modell"`, `such-modell-wechsel`, Suchtiefe `5..32`, 3 Spur-Toggles BM25/Vektor/Graph, Ergebnisregler-Parität)
  - `AI Provider` (**20** Presets aus `src/lib/ai.ts`, BaseURL, API-Key mit Safe-Hülle-Hinweis, Model-Liste & Test-Request, Extract-Model, Auto-Learn-Schalter)
  - `Organization` (`/api/policies`)
  - `Data management` (`Backup all notes` via `/api/memories?alle=1` inkl. `x-kepta-total`-Prüfung, `Import AI history` ChatGPT/Claude `.json`, Markdown-Export)
  - `RecoveryKey.tsx` (`POST /api/recovery-key` mit `X-KEPTA-Recovery: 1`)
  - `ConnectApps.tsx` (`data-testid="connect-apps"`, Ein-Klick-Verbindung für Agenten)
- [ ] **Tab `MCP / API`:** Live Tool-Katalog von `/api/mcp/tools`, fertige `mcp.json`-Snippets (App-internes `stdio` vs. `npx -y kepta-mcp` vs. gebautes Bundle), Claude-Desktop-OS-Pfade (macOS/Windows/Linux), `curl`-Quicktest, Screenreader-Quittung (`data-testid="kopier-quitte"`).
- [ ] **Tab `Device Sync` (`PraxisSync.tsx`):** Scope-Auswahl, Passphrase-Eingabe (`>= 12` Zeichen), verschlüsselter Bundle-Export/Import, SHA-256-verknüpftes Paketjournal (`/api/sync/*`).

### 4.7 Modale & Overlays
- [ ] **`CommandPalette` (`⌘K`):** Live-Filter über Befehle + Notizen, Tastaturnavigation (`↑/↓/↵/Esc`), ab Redesign mit befüllter rechter Inspektorspalte.
- [ ] **`MachineScan`:** Regelwerk-Einsicht (`niemals.ordner`, Limits), trockener `Preview`-Scan, Ordner-Ausschluss per Klick (`vorschau-ordner`), Chip-Rücknahme (`eigener-ausschluss`), **2 verpflichtende Consent-Checkboxen** vor Import-Aktivierung, `machine-scan`-Tag & Key-Maskierungsbericht (`data-testid="maskiert-meldung"`).
- [ ] **`DuplicatesPanel`:** Gruppierte Ähnlichkeitspaare, Beibehalt der reichhaltigsten Kopie („keeper = richest copy“), Einzel-/Batch-Löschen, direktes Öffnen im Editor, Dismiss-Speicher.
- [ ] **`OnboardingWizard`:** 4-Schritt-Assistent (Name/Themen/Ziel → Starter-Pack-Vorschau → Lokaler KI-Scan Ollama/LM Studio → Zusammenfassung + optionaler Machine-Scan-Wunsch + Pfad `~/.kepta/kepta.db`).

### 4.8 Test-Hook-Schutzliste (`data-testid` & kritische ARIA-Kontrakte)
Bei der späteren Umsetzung durch GLM 5.3 Flash dürfen folgende im Code verankerte Test-Selektoren **nicht umbenannt oder entfernt** werden:
`fenster-titelleiste`, `gehirn-status`, `detail-leer`, `lad-fehler`, `leerer-zustand`, `suche-fuellend`, `suche-regler-verwahrt`, `chat-verbindung`, `chat-cost-zeile`, `graph-leiste`, `graph-canvas`, `graph-legende`, `graph-legende-klappe`, `graph-schema`, `graph-krafte`, `graph-gruppenband`, `graph-regal`, `wizard-taefelchen`, `wizard-wunsch-absage`, `privacy-shield`, `connect-apps`, `such-modell`, `such-modell-wechsel`, `kopier-quitte`, `vorschau-ordner`, `eigener-ausschluss`, `links-out-ordner`, `maskiert-meldung`, `fehlerschirm`, `fehlerschirm-weiter`.
