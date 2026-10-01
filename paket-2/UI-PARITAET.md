# PAKET 2 — UI-FUNKTIONSPARITÄT (Kernflächen-Overhaul)

Stand: 2.10.2026 · Ausgangslage: App auf Kern 3.1.1, 1602/1602 Tests in 105 Dateien, git lokal (5 Commits).

Regel aus dem APP-MASTERPLAN: **Jede Funktion muss in der App ANGEZEIGT und EINSTELLBAR sein.**
Status-Werte: `angezeigt ✓ / einstellbar ✓` (Parität erfüllt) · `heute gebaut` (in diesem Paket erweitert) · `Enterprise-App` (bewusst Enterprise-UI, Paket 4) · `später 🏳️` (bewusst aufgeschoben).

Diese Tabelle wächst in jedem Schritt des Pakets. Jede Zeile nennt die UI-Zuordnung (Datei + Bedienelement/Anzeige) — eine Funktion ohne Zeile wäre ein Paket-Mangel.

---

## Inventar der Kernflächen (Analyse vor dem Bau)

| Fläche | Datei(en) | Was sie rendert / einstellt |
|---|---|---|
| Suche | `src/components/Dashboard.tsx` (Suchfeld, Debounce 180 ms), `src/lib/semantic.ts` (lokales Hybrid-Ranking als Sofort-Fallback), `server/router/search.ts` (POST /api/search → Engine) | Semantic-Toggle (an/aus), Ergebnis-Regler (5/10/20/50/100/250/„All“), Server-Call mit `query/topK/tags`; zeigt Trefferzahl + beste Cosine-Ähnlichkeit; Treffer-Karten (`MemoryCard`) zeigen Score + matchedTerms |
| Dashboard | `src/components/Dashboard.tsx` | Index-Streifen (Anzahl, Typen-Verteilung, Kategorien, Agent-Status), Import-Band (Drag&Drop, URL-Clipper, Rechner-Scan), Inbox-Wächter, Duplikate-Chip, Gruppierungen (Datei/Typ/Zeitraum), Papierkorb |
| Graph | `src/components/KnowledgeGraph.tsx`, `src/lib/graphTime.ts`, `src/lib/graphLayout.ts` (Force/Tree), `/api/graph` (`server/router/system.ts`) | Force/Tree-Umschaltung, Zeitregler (lokal über validFrom/validTo/superseded — `activeIdsAt`), Entity-Filter, Klick → Editor |
| Settings | `src/components/Settings.tsx` (Tabs System/MCP/Sync) | AI-Provider + Schlüssel + Modell, Auto-Learn, Extract-Modell, Textgröße (Zoom), Import-Reparatur, Nachsortieren nach Typ, Export; `SystemStatus` (Health), `PrivacyShield`, `ConnectApps`, `PraxisSync`, `RecoveryKey` |
| Chat-Cockpit | `src/components/Chat.tsx` | Test-Cockpit: Provider-Chat mit Quellen; Kontext = Top-k der Suche |
| Weitere | `TodayView`, `DossierView`, `ActivityView`, `TeamView`, `OnboardingWizard`, `DuplicatesPanel`, `MachineScan`, `CommandPalette`, `Trash` (im Dashboard) | Zeitgeschehen, Themen-Dossiers, Aktivitätsstrom, Team, Erst-Einrichtung, Dedupe, Rechner-Scan, Tastatur-Befehle |

Health-Quelle: `/api/health` (`server/router/system.ts`) liefert `version` (3.1.1), `count`, `embeddings { total, embedded, models }`, `encryption { aktiv, ablage }`, `mcp { protocol, tools, http }` — heute nur in `SystemStatus` sichtbar, nicht im Dashboard.

---

## Paritäts-Tabelle (Kern-Fähigkeit → UI)

| Kern-Fähigkeit | Angezeigt | Einstellbar | Status | UI-Zuordnung |
|---|---|---|---|---|
| Suchtiefe topk (Engine 5–32, Default 16) | — | — | **heute gebaut** (Paket 2, Schritt 3) | war nur API/Ergebnis-Regler; wird Settings-Such-Abschnitt + an jeden Search-Call |
| Spuren (BM25 / Vektoren / Graph) einzeln an/aus | — | — | **heute gebaut** (Paket 2, Schritt 3) | Engine `params.tracks` existierte ohne UI; Settings-Schalter + Router-Durchleitung |
| Treffer-Anzahl (5 bis alle) | ✓ (Trefferzahl-Chip) | ✓ (Ergebnis-Regler) | **UI vorhanden** | Dashboard-Werkzeugleiste „Results“ (RESULT_STOPS bis „All“) |
| Spuren-Herkunft je Treffer (bm25Rank/vectorRank/entityRank) | — | n/a (Anzeige-Eigenschaft) | **heute gebaut** (Paket 2, Schritt 2) | steckt in `SearchHit.components`, Router gab sie nicht ans Frontend; wird Treffer-Badges |
| Suchdauer in ms + Such-Cache („Gehirn warm“) | — | n/a | **heute gebaut** (Paket 2, Schritt 2) | Frontend stoppt die Anfrage; Delta-Cache (Kern 3.1.1) wird als Status sichtbar |
| Semantische Suche an/aus (lokal + Server) | ✓ | ✓ | **UI vorhanden** | Dashboard-Toggle „Semantic search“ |
| Zeitreise asOf (Suche) | — | — | **später 🏳️** (Suche-API hat `asOf`; Graph-Zeitregler deckt die Fläche ab) | Suche: Parameter in `POST /api/search` ohne UI · Graph: Zeitregler `KnowledgeGraph` + `graphTime.ts` |
| Zeitreise (Graph-Zeitregler) | ✓ | ✓ | **UI vorhanden** | KnowledgeGraph-Slider über die Wissenstands-Zeit |
| Dedupe (Duplikate prüfen/aufräumen) | ✓ (Chip + Anzahl) | ✓ (Panel prüfen, löschen, „kein Duplikat“) | **UI vorhanden** | `DuplicatesPanel` + Dashboard-Chip |
| Konsolidierung (memories zusammenziehen) | ✓ (Aktivitäts-Ereignis) | — | **später 🏳️** (Paket 3, Dossier 2.0: Auflösung im Fluss) | Engine `consolidateMemories` + MCP-Werkzeug; App zeigt nur das Ereignis |
| Gültigkeitsfenster (validFrom/validTo) | ✓ (Graph-Zeitregler reagiert) | ✓ (Datumsfelder im Editor) | **UI vorhanden** | `MemoryEditor` (Temporal-Abschnitt) |
| Sync/Import (Dateien, URL, Rechner-Scan, Inbox, Obsidian, PraxisSync) | ✓ | ✓ | **UI vorhanden** | Import-Band, `MachineScan`, Inbox-Scan, `PraxisSync` |
| Verschlüsselungs-Status (SQLCipher, Keychain-Ablage) | ✓ | n/a (Sicherheitszustand, kein Bedienobjekt) | **UI vorhanden** | `SystemStatus`-Zeile + `RecoveryKey` |
| Embedding-Modell + Zähler | teilweise (Abdeckung %) | — | **heute gebaut** (Paket 2, Schritt 4: Modell + Zähler im Dashboard) | `/api/health` `embeddings.models`; war nur `SystemStatus`-Abdeckung |
| Health „Gehirn-Status“ (Version, Zähler, Verschlüsselung) | teilweise (nur Settings) | — | **heute gebaut** (Paket 2, Schritt 4) | wird Dashboard-Statusstreifen aus `/api/health` |
| Trash/Restore | ✓ (Zähler) | ✓ (Restore-Knopf) | **UI vorhanden** | Dashboard-Papierkorb |
| Onboarding | ✓ | ✓ (später/vollständig, Neuaufruf über Seitenleiste) | **UI vorhanden** | `OnboardingWizard` (adaptiv, Dismiss persistiert) |
| Privacy-Shield | ✓ | ✓ | **UI vorhanden** | `PrivacyShield` in Settings |
| Such-Cache-Wärmen nach Write (Delta-Cache „<1 s nach Write“) | — | n/a | **heute gebaut** (Paket 2, Schritt 2: Warm-Status-Anzeige) | Kern 3.1.1-Delta-Cache wird sichtbar |
| HyDE (Query-Erweiterung im Live-Kern) | — | — | **später 🏳️** (nicht im App-Kernstand vorhanden; kommt mit dem nächsten Kern-Sync + Settings-Schalter) | App-Engine-Kopie enthält HyDE nicht — ehrlich vermerkt statt behauptet |
| Audit-Kette + Verify-Button | — | — | **Enterprise-App** (Paket 4) | Beweiskette ist Enterprise-Kern (E-Phase) |
| Mandanten + Rechte + Retention/Legal Hold | — | — | **Enterprise-App** (Paket 4) | Mandanten-Wächter ist Enterprise-Kern |
| PITR-Zeitregler | — | — | **Enterprise-App** (Paket 4) | Team-Zeitmaschine/PITR |
| MCP-Werkzeuge (8, Protokoll 2026-07-28) | ✓ (Status + HTTP/Stdio-Adresse) | ✓ (Connect-Anleitungen, Copy-Buttons) | **UI vorhanden** | Settings-MCP-Tab, `ConnectApps` |
| Widersprüche-Erkennung | ✓ | — | **UI vorhanden** (Anzeige) | `lib/widersprueche.ts` → `DossierView`, `TodayView` |

---

## Wachstums-Protokoll

- **Schritt 1 (dieser Stand):** Inventar + Erst-Tabelle. Vier „heute gebaut“-Zeilen markieren die Bauaufträge der Schritte 2–4.
