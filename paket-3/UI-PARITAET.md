# PAKET 3 — KRASS-FEATURES (Today 2.0 · Dossier 2.0 · Chat mit vollem Gedächtnis)

Stand: 1.10.2026 · Ausgangslage: App auf Kern 3.1.1, PAKET 2 fertig (5 Commits bis 0f05ed2), 1613/1613 Tests in 105 Dateien, installiert in /Applications/KEPTA.app.

Regeln wie PAKET 2: atomare Schritte, nach jedem Schritt `npx tsc --noEmit` + `npx vitest run` + GENAU 1 Commit. Diese Tabelle wächst in jedem Schritt — jede neue Funktion bekommt eine Zeile mit UI-Zuordnung. Nichts behaupten, was die Engine nicht liefert.

---

## Inventar der Datenquellen (Analyse vor dem Bau)

### Feature 1 — Today 2.0 „Was hat sich geändert“

| Quelle | Was sie liefert | Was fehlt |
|---|---|---|
| `GET /api/briefing?since=` (`server/router/briefing.ts` → `src/lib/briefing.ts`) | `created` (neu, mit KI-App-Herkunft), `changed` (geändert), `expiring`/`expired` (validTo-Fenster), `todos`, `contradictions`, `apps` | **abgelöste** (`superseded_by`) und **gelöschte** (`deleted_at`) fehlen im Briefing — die DB-Felder existieren (`store.supersedeMemory`, `trashMemory`), werden nur nicht ausgelesen |
| Memory-Felder `validFrom`/`validTo`/`supersededBy` | Zeitfenster + Ablösungskette, in `toApi` (`server/helfer/api-form.ts`) an jeden Client | — |
| `src/lib/graphTime.ts` (`existsAt`, `activeIdsAt`) | Zeitmaschinen-Logik „was galt zu Zeitpunkt X“ — heute nur im Graph-Zeitregler | Today nutzt sie nicht (braucht sie auch nicht: Today konsolidiert Änderungen, kein Schnappschuss) |
| `src/lib/activity.ts` (`subscribeActivity`, SSE `/api/activity`) | Live-Ereignisse save/update/delete/search/consolidate | TodayView abonniert sie nicht; sie lädt nur beim Öffnen — für die Änderungs-Konsolidierung reicht der Briefing-Abruf, SSE ist kein Substanz-Beweis |
| Zeitfenster | Briefing nimmt beliebiges `since` | UI hat nur „seit letztem Besuch“ (`localStorage kepta_last_today`) — kein Slider |

Entscheidung: **keine neue Route** — `GET /api/briefing` wird erweitert (`superseded`, `deleted`), das ist additiv; Vertragstest in `tests/lib/briefing.test.ts`. Sonderfall „alles“ (`since=0`): „geändert“ kann nicht `created_at <= 0` heißen (leer) — dort zählt `updated_at > created_at` als echte Änderung.

### Feature 2 — Dossier 2.0 Widerspruchs-Auflösung im Fluss

| Quelle | Was sie liefert | Was fehlt |
|---|---|---|
| `src/lib/dossier.ts` + `GET /api/dossier` | `contradictions` als vollständige `Widerspruch`-Objekte (mit `newer.id`/`older.id`/`updatedAt`) | `DossierView` schneidet die ids in ihrem Interface ab und zeigt nur Text — keine Aktion |
| `POST /api/contradictions/resolve` (`server/router/briefing.ts`) | `{keep, drop}` → supersede; `{keep, drop, both:true}` → Paar dauerhaft als „beide richtig“ markiert | **Gültigkeitsfenster setzen** fehlt: „beide gültig“ muss das Fenster der älteren Notiz schließen können (validTo = Zeitpunkt der neueren), sonst bleibt der Widerspruch für den Zeitregler ungelöst |
| `POST /api/memories` (Patch mit `body.id`) | validFrom/validTo/supersededBy-Patch je einzelner Notiz | wäre Zwei-Call-Lösung mit Teilfehler-Risiko — Resolve-Route wird stattdessen um `window:true` erweitert (ein Call, atomar, Vertragstest) |
| Editor-Kette | Dashboard: `MemoryPreview` → `MemoryEditor` | `DossierView` hat keinen Weg dorthin — bekommt `onEditMemory` |

### Feature 3 — Chat mit vollem Gedächtnis + Quellen-Herkunft

| Quelle | Was sie liefert | Was fehlt |
|---|---|---|
| `src/components/Chat.tsx` heute | lokales `hybridSearch`-Ranking (30 s TTL) über `activeMemories` (vom Dashboard vorgefiltert), Quellen-Chips ohne Herkunft | Server-Engine wird im Chat nicht gefragt — kein „volles Gedächtnis“, keine Suchtiefe, keine Spuren |
| `POST /api/search` (`server/router/search.ts`) | Engine (BM25+Vektoren+Graph→RRF) mit `topK`, `tracks`-Schaltern; Antwort trägt je Treffer `tracks {bm25, vektor, graph, similarity}` (PAKET 2, live verifiziert) | Chat schickt keinen Call |
| `src/lib/searchPrefs.ts` | Suchtiefe (5–32) + drei Spuren-Schalter, Event-Sync über Flächen | Chat liest sie nicht |
| Dashboard-Muster (`Dashboard.tsx` Z. 530+) | Suchdauer stoppen, „Brain warming up…“ / „Brain warm — answer in X ms“ | Chat hat keinen Warm-Status |
| `MemoryCard`-Herkunfts-Badges | `bm25 #n · vector #n · graph #n` | Chat-Quellen zeigen sie nicht |

---

## Paritäts-Tabelle (Funktion → UI)

| Funktion | Angezeigt | Einstellbar | Status | UI-Zuordnung |
|---|---|---|---|---|
| Widersprüche erkennen | ✓ | — | **UI vorhanden** | `lib/widersprueche.ts` → `TodayView` „Needs a look“ (mit Auflösung), `DossierView` „To check“ (Text) |
| Widerspruchs-Auflösung „neuere Version gilt“ | ✓ | ✓ (Knopf) | **UI vorhanden** | `TodayView` (Keep the newer/older) — Dossier 2.0 zieht nach |
| **Today 2.0: Zeitfenster-Slider (heute/7/30/alles)** | ✓ | ✓ | **heute gebaut** (Schritt 1) | `TodayView`-Regler → `since` am `/api/briefing`-Abruf |
| **Today 2.0: abgelöste Knoten (superseded_by) konsolidiert** | ✓ | — | **heute gebaut** (Schritt 1) | Briefing `superseded` (mit „replaced by“) → `TodayView`-Abschnitt „What changed“ |
| **Today 2.0: gelöschte Knoten (Papierkorb) konsolidiert** | ✓ | — | **heute gebaut** (Schritt 1) | Briefing `deleted` → `TodayView`-Abschnitt „What changed“ |
| **Dossier 2.0: Auflösung je Widerspruchs-Karte** | ✓ | ✓ | **heute gebaut** (Schritt 2) | `DossierView`-Karte: „Newer wins“ / „Both hold — cap the older“ / „Edit“ |
| **Dossier 2.0: Gültigkeitsfenster setzen** | ✓ | ✓ | **heute gebaut** (Schritt 2) | Resolve-Route `window:true` → `validTo` der älteren Notiz = Zeitpunkt der neueren + Paar markiert |
| **Chat: Suche über das ganze Gehirn (Server-Engine)** | ✓ | ✓ (via Suchtiefe) | **heute gebaut** (Schritt 3) | `Chat` ruft `POST /api/search` mit der Eingabe — nicht mehr nur das Dashboard-Vorfiltern |
| **Chat: Suchtiefe + Spuren-Schalter gelten im Chat** | ✓ (im Request) | ✓ (Settings) | **heute gebaut** (Schritt 3) | `useSuchPrefs` → `topK: tiefe`, `tracks` an jeden Chat-Such-Call |
| **Chat: Quellen-Herkunft (bm25/vektor/graph-Rang)** | ✓ | — | **heute gebaut** (Schritt 3) | Quellen-Chips je Antwort mit Herkunfts-Badges aus dem Search-Response |
| **Chat: Suchdauer + „Brain warm“** | ✓ | — | **heute gebaut** (Schritt 3) | Warm-Chip im Chat-Kopf (Muster wie Dashboard) |
| Gültigkeitsfenster (validFrom/validTo) editieren | ✓ | ✓ | **UI vorhanden** | `MemoryEditor` (Temporal-Abschnitt) |
| Zeitreise (Graph-Zeitregler) | ✓ | ✓ | **UI vorhanden** | `KnowledgeGraph` + `graphTime.ts` |
| Suchtiefe/Spuren/Treffer (PAKET 2) | ✓ | ✓ | **UI vorhanden** | Settings + Dashboard, geteilt über `searchPrefs` |

---

## Wachstums-Protokoll

- **Schritt 0:** Inventar-Analyse + Erst-Tabelle. Keine neue Route nötig für Today (Briefing wird additiv erweitert); Resolve-Route bekommt `window:true` (Schritt 2); Chat bekommt den Engine-Call (Schritt 3). 1613 Tests.
