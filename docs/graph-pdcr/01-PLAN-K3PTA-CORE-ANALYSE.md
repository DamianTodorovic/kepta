# PDCR Phase P — Forensische Analyse von K3PTA Core (v3.2.214)

> **Arbeitsordner & Stand:** `/Users/emilwagner/.gemini/antigravity/scratch/K3PTA Core Coding` · Git `HEAD`: `f4886be` (`app-3.2.214`, `/Applications/K3PTA.app`)  
> **Ziel dieser Analyse:** Vollständige Bestandsaufnahme aller für den Wissensgraphen entscheidenden Schichten (Datenbank, Retrieval-Engine, MCP-Provenienz, REST-APIs, reine TypeScript-Graph-Mathematik, `p202`-Designsystem, CI-Wachen und Testverträge), sodass das finale Graph-Redesign sich **ohne jeden Funktions- oder Testverlust (0 % Downgrade)** in K3PTA einfügt.

---

## 1. Warum der Graph in `3.2.214` (und `p202`) neu gedacht werden muss

Ein Vergleich der bestehenden Live-App ([graph.png](../../fotos/p202-nachher/graph.png)) und der `p202`-Referenz ([graph-mockup.png](../../fotos/p202-pixel/graph-mockup.png), [graph-force.png](../design/mockups/renders/graph-force.png), [graph-meaning.png](../design/mockups/renders/graph-meaning.png)) zeigt zweierlei:
1. Die übrigen App-Flächen (*Knowledge, Today, Chat, Dossier, Activity, Settings*) wurden im Rahmen von `p202` bereits auf eine ruhige, taktile Schweizer Papier- und Werkbank-Optik umgestellt; beim Graph wurde der Umbau explizit zurückgestellt (*Commit `efb305e`: „der Graph ausgenommen — Damian baut ihn neu“*).
2. Selbst die vorhandenen Mockup-Renders (`graph-force.png`, `graph-meaning.png`) lösen zwar den äußeren Rahmen (`258px`-View-Leiste rechts, sauberes `--eb-1`/`--eb-0`-Papier), zeigen im Inneren der Zeichenfläche aber weiterhin klassische **„Punkte-und-Stäbe“-Streudiagramme**:
   - **Isolierte Mini-Kugeln ohne Inhalt:** Notizen erscheinen beim ersten Blick als anonyme 11px-Punkte mit losen Textschildern, die bei Dichte oder Kanten abreißen oder am Wortstumpf enden (`slice(0, 18)` im Inspektor).
   - **Visuelle Überladung & Verdeckung:** In `KnowledgeGraph.tsx` wächst die schwebende Legende (`data-testid="graph-legende"`) beim Aufklappen inklusive `GraphRegal` auf bis zu `849 px` (Desktop) bzw. `1.053 px` (390 px Mobile), überlagert den Graph-Canvas und erzeugt verschachtelte Scrollleisten.
   - **Monolithisches Raumlayout:** `Claims` und `Meaning` (und potenzielle weitere Fragen an das eigene Wissen) nutzen überwiegend unruhige Streuwolken oder vier starre gestrichelte Ovale statt aussagekräftiger räumlicher Projektionen (*Zeitfluss*, *Tresor-vs-KI-Grenze*, *Widerspruchs-Abgleich*, *Kollisionsfreier 4-Quadranten-Fokus*).
   - **Ungehobene Praxis-Power:** K3PTA Core besitzt bereits echte Claims, bi-temporale Gültigkeit (`valid_from` / `valid_to` / `superseded_by`), `agent_activity` / `/api/memories/:id/readers`, `widersprueche.ts` und `/api/contradictions/resolve` sowie `Dossier` — im Graph waren diese Trümpfe bisher kaum visuell erlebbar und handhabbar.

---

## 2. Backend, SQLite-Schema & API-Verträge (Verifizierte Datenquellen)

### 2.1 SQLite-/SQLCipher-Fundament (`src/core/store.ts`)
- **`memories`:** `id`, `scope` (`local` | `private` | team), `type` (`semantic` | `episodic` | `procedural` | `reference`), `title`, `content`, `tags` (JSON), `confidence`, `valid_from`, `valid_to`, `superseded_by`, `created_at`, `updated_at`, `deleted_at`, `last_access_at`, `access_count`, `utility`.
- **`memory_stande`:** Vollständige Revisionshistorie je Notiz (inkl. Wiederherstellung).
- **`entities` & `memory_entities`:** Automatische Begriffs-Extraktion aus Überschriften (`## ...`) und `[[Wiki-Links]]` (`src/core/begiffe.ts`), beschleunigt über `idx_memory_entities_entity`.
- **`relations`:** Kanten mit `source_id`, `target_id`, `relation` (`mentions`, `co-mentions`, `related` als Systemwörter vs. max. 20 menschliche Claims pro Notiz nach `src/core/wortschatz.ts`), `valid_from`, `valid_to`, `memory_id`.
- **`chunks`:** Embeddings (`Float32Array`-BLOB, Default `nomic-embed-text` / konfigurierbar wie `bge-m3`), virtuelle Spalte `embedding_hat`.
- **`agent_activity` & `audit_log`:** Echte MCP-Client-Protokollierung (`client`, `tool`, `memory_id`, `at`) und per SHA-256 verketteter Revisionsnachweis (`src/lib/pruefprotokoll.ts`).

### 2.2 Relevante REST- & SSE-Endpunkte
| Route | Zweck & gelieferte Wahrheit | Wichtig für den Graph |
|---|---|---|
| `GET /api/graph?entity=&depth=1..4` | `entities`, `relations` (inkl. `memoryId`, `validFrom`, `validTo`), `memoriesByEntity`, `bestand`, `deckung`, `ausriss` | Strenge Invarianten: `kantenVerworfen === 0`; `ausriss.hinweis` ohne Tausender-Kommas (`tests/server-graph-zahl.test.ts`). |
| `GET /api/graph/haufen` | Vollbestand-Louvain-Cluster über 100 % der DB | Privacy-Canary-Schutz (`tests/server-graph-haufen.test.ts`): darf niemals Titel/Inhalte/IDs leaken; `REGAL_DECKEL_PROZENT = 10`. |
| `GET /api/graph/semantik` | Deterministische 2D-PCA-Projektion (`punkte`, `getragen`, `gesamt`, `gekappt`, `anteil`) | Grundlage der *Meaning*-Landschaft + Erkennung fehlender semantischer Brücken. |
| `GET/POST /api/graph/nachzug` | Hintergrund-Fortschritt fehlender Vektoren | Speist den 3px-Fortschrittsbalken (`nachzug-info`). |
| `GET /api/memories?alle=1` | Vollständiger Notiz-Bestand jenseits der 100er-Listen-Seite | Speist Notiz-Kapseln, Zeitachse, `GraphRegal`, `Widersprüche`. |
| `POST /api/contradictions/resolve` | `{ keep, drop, both?, window? }` | Ermöglicht sichere **4-Wege-Konfliktlösung** statt gefährlicher 1-Knopf-Überschreibung. |
| `GET /api/memories/:id/readers` & `GET /api/activity` | Echte Lese-/Schreibspur je MCP-Agent + SSE Live-Events | Grundlage der *AI & Privacy*-Schleuse ohne erfundene Telemetrie. |
| `POST /api/memories` (`beziehungen`) | Atomares Speichern neuer Claim-Tripel (`{ quelle, ziel, wort }`) | Ermöglicht 1-Klick-Verknüpfung fehlender semantischer Brücken direkt aus dem Graph. |

### 2.3 Sicherheits- und MCP-Schutzgrenzen
- `src/lib/herkunft.ts`: Loopback-Only-Schutz (`nurDieserRechner` als erste Middleware in `server/app.ts`).
- `src/core/mcp.ts` & `src/lib/mcpwache.ts`: `scope === "private"` ist für alle MCP-Werkzeuge hart gesperrt (`Memory search`, `list`, `graph`, `consolidate` filtern strikt, `supersededBy` auf private Notizen wird maskiert); `PrivacyShield` (`src/lib/schild.ts`) maskiert E-Mail, Telefon, Mod-97-IBAN, Luhn-Kreditkarten und Keys deterministisch lokal.

---

## 3. Reine TypeScript-Graph-Mathematik & Invarianten (`src/lib/`)

Aus `19` geprüften Testdateien (`442` Unit-Tests grün):
1. **`graphLayout.ts` (2.277 Zeilen):**
   - `knotenRadius(grad) = min(26, 4 + 1.6 * sqrt(max(0, grad)))`
   - Barnes-Hut Quadtree (`θ = 0.9`, `REPULSION = 450`, `IDEAL_LINK = 45`, `GRAVITY = 0.0045 / sqrt(N)`, `MAX_VERZUG = 135`)
   - Räumliches Hash-Grid `resolveCollisions(nodes, COLLIDE_PADDING=14, COLLIDE_ITERATIONEN=8)` mit **0 überlappenden Scheibenpaaren im Ruhezustand** für `400`, `1.500` und `3.000` Notizen; `0,6`-Dämpfung um gezogene/gepinnte Knoten; abschließender Ruhe-Nachschlag (`NACHSCHLAG_BUDGET = 180`).
   - deterministische Sonnenblumen-Initialisierung (`golden angle`), dichtezentrierter Kamera-Fokus (`dichtesteWeltMitte`), Lesbarkeitsboden (`zeilenKMin`), reversibler Schnappschuss (`feldSchnappschuss` / `feldZurueck`).
   - *Der Gang* für isolierte Notizen ohne Verbindungen (`GANG_SPALTEN = 32`, `GANG_ABSTAND = 26`, `GANG_REIHEN_PRO_SEITE = 12` = 384/Seite).
   - Invertierter Schlüsselwort-Index für heuristische Ähnlichkeit (`DEFAULT_MAX_BUCKET = 140`) + Titel-Echo-Unterdrückung (`vomEchoVerschluckt`).
2. **`gemeinschaften.ts` (631 Zeilen):**
   - Deterministischer Multi-Level-Louvain (`MAX_SWEEPS = 200`, `MAX_STUFEN = 12`), autonome Benennung über höchsten Grad im Cluster, OKLab-Maximin-Palettenzuweisung (`HAUFEN_PALETTE_DUNKEL` / `_HELL`), Gatekeeper `unterscheidetVonArt` (`>= 0.90` Abdeckung einer Art wird verworfen).
3. **`graphHierarchy.ts` (1.053 Zeilen):**
   - `baueRegal` liefert die drei Nutzerfragen *woher* (`Notes`, `Files`, `Code`, `Data`, `Other`), *worum* (Betreff/Ordner mit Maschinenpräfix-Kürzung) und *wann* (6 Zeitkörbe) + Lücken-Zählung (`ohneBetreff`, `ohnePfad`, `ohneMarke`).
   - `dendrogram` wurde in P198 (Commit `8400617`) im UI zugunsten von `force` + `semantic` zurückgebaut, Hilfsfunktionen (`stepDendrogram`, `baueRegal`, `vorschlagFaltung`) bleiben getestet.
4. **`graphSemantik.ts`, `graphHerkunft.ts`, `graphTime.ts`, `typFarben.ts`:**
   - Bit-identische PCA über FNV-Startvektor (`keim`), Standard-Deckelung über `SEMANTIK_KAPPE`, Varianzanteil `anteil`.
   - Bi-temporale Halboffen-Intervalle `[validFrom, validTo)` (`existsAt`, `activeIdsAt`, `edgeVisibleAt`), Strukturknoten (`__`) zeitlos aktiv.
   - Herkunftskanal (`written`, `file`, `machine`) blendet sich selbst ehrlich ab, falls `< 2` Quellen existieren.
   - Dual-Channel-Farben (`--type-*-hex` für Canvas/Swatch vs. Kontrast-kalibrierte Schriftkanäle).

---

## 4. Zero-Downgrade-Inventar (`KnowledgeGraph.tsx` & `Dashboard.tsx`)

### 4.1 Pflicht-Props (`Dashboard.tsx:2552–2559`)
Alle 5 Props müssen identisch erhalten bleiben:
- `memories: Memory[]`
- `onSelectMemory: (m: Memory) => void`
- `onSelectConcept?: (name: string) => void` *(öffnet `DossierView` mit Thema)*
- `onFeldZaehlung?: (knoten: number) => void` *(speist Header-Zähler in `Dashboard`)*
- `sichtbar?: boolean` *(stoppt `requestAnimationFrame` bei Tab-Wechsel -> `0 Hz`)*

### 4.2 Geschützte `data-testid`- und ARIA-Anker (41+ bestehende Verträge)
`graph-leiste`, `graph-canvas`, `graph-legende`, `graph-legende-klappe`, `graph-schema`, `graph-schema-row`, `graph-krafte`, `graph-krafte-reset`, `graph-gruppenband`, `graph-regal`, `regal-koerb`, `regal-koerb-liste`, `regal-farbgruppe`, `graph-kopf`, `graph-im-bild`, `graph-benannt`, `graph-zustaende`, `graph-kante-tooltip`, `graph-schiene-ansicht`, `graph-schiene-tiefe`, `graph-schiene-namen`, `graph-schiene-kanal`, `graph-suche`, `graph-search-count`, `graph-zeitstand`, `graph-zeit-spaeter`, `graph-verbindungsdicke`, `graph-verbindungsdicke-wert`, `graph-bewegung`, `graph-nur-mit-verbindungen`, `graph-tag-filter`, `graph-farbgruppe`, `graph-farbhaufen`, `graph-fit`, `graph-export`, `gang-info`, `gang-blaetterer`, `gang-zurueck`, `gang-weiter`, `nachzug-info`, `graph-semantik-leer`, `graph-kern-zustand`.

### 4.3 Pflicht-Funktionsumfang (darf nicht verloren gehen)
- Ansichten `Claims` (`force`) und `Meaning` (`semantic`)
- Tiefe `1..4`, Labeldichte `None / Few / Many / All`, Farbkanäle `Type / Provenance / Groups / Communities`
- Suche mit `Enter` / `Shift+Enter`-Treffersprung + `Esc`-Kaskade
- Tag-Filter, `Connected`-Filter, Schema-Spotlight (`kind` / `predicate`), `Forces`-Slider (`gravity`, `repel`, `link`, `size`, `reset`)
- Bi-temporaler Zeitregler (sofortiges visuelles Dimmen im Drag + Commit beim Loslassen) + `<input type="date">` + `+N later`-Anzeige + `"Now"`-Reset
- Kippschalter: `Direction`, `Similar`, `Self`, `Motion`, `Connected`, `Thickness (1.0x..3.0x)`
- *Der Gang*-Blätterer für isolierte Notizen + `GraphRegal` (4 Bänder + interaktive Zeitkörbe & Farbgruppen-Picker) + `GruppenBand`
- `P200` Griff-Frost während des Ziehens, `P197` Occlusion-Watchdog, `P187` Snapshot/Release pinned, `Arrow*`/`Enter`/`Esc` räumliche Tastaturnavigation, PNG-Export (`toDataURL`), `< 2.5px` Batch-Zeichnung & Sprite-Cache für 25k+ Notizen.

---

## 5. Harte Hausgesetze & CI-Wachen (`DESIGN.md` & `scripts/`)

Diese automatisierten Wachen liefen auf dem Basisstand (`tsc --noEmit` = Exit 0, `design-wache.mjs` = `274 Messungen, 0 unter der Schwelle — Exit 0`, `zahlen-belege.mjs` = Exit 0) und gelten strikt für jeden späteren Code-Schritt:

| Wache / Vertrag | Harte Regel |
|---|---|
| **`DESIGN.md` / `verstaendlichkeit.mjs`** | **App-Oberfläche 100 % Englisch (`en-US`).** Das Wort `"node"` / `"nodes"` ist auf der UI **streng verboten** — es heißt immer `"note"` (Inhalt), `"dot"` oder `"card"` (Zeichenelement), Fallback `"Untitled"`. Fachwörter (`semantic`, `vector`, `embedding`, `graph`, `chunk`) erfordern sofortige Erklärung/Aktion am selben Ort (`<= 14 Wörter` in `>= 80 %` der Sätze). Keine nackten Bindestriche ` - `. |
| **`design-wache.mjs` / `index.css`** | Exakte `--eb-0..2` & `--feld` Luminanzstufen (Light `Y >= 0.90`, Dark `>= 1.30x` je Stufe, Gesamtspanne `>= 18.5x`), Textkontrast `>= 4,5:1` (**keine** `opacity-*`-Deckkraft auf lesbarem Auskunftstext!), Typfarben `>= 3:1`, **keine** rohen Hex-Literale außerhalb `:root`/`.dark`, **0** verwaiste CSS-Klassen (`css:klassen-waisen = 0`). |
| **`leitern-in-den-bausteinen.test.ts`** | Ausschließlich statische Gewichte `[300, 400, 600, 700, 800]` (**kein `font-medium` / `500`**!), ausschließlich `--fs-1` (`11px`) bis `--fs-8` (`40px`) + `--fs-detail` (`18px`), Radien nur über `--r-panel`/`card`/`btn`/`chip`/`badge`/`999px`, **kein** `min-h-screen` / `100vh`. |
| **`legende-hoehe.mjs`** | Zugeklappte `.graph-legende` (`data-legende="zu"`) startet auf **allen** Breiten eingeklappt und belegt bei `390×844` **höchstens 25,0 %** der Canvas-Fläche. |
| **Zielgrößen (`treff`)** | Kein interaktives Ziel `< 20px`; Desktop `>= 36px` (`28px` kompakte Werkzeugleiste), Mobile `>= 44px`. |
| **Anti-Slop (`CREATIVE_DIRECTION.md`)** | **Kein** Neon-/Glow-Effekt, **kein** Karo-/Punktraster auf dem Canvas, **kein** Regenbogenbalken über der Zeichenfläche, **keine** schreienden Uppercase-HUDs. |
