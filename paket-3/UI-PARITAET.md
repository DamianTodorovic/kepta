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
| Widersprüche erkennen | ✓ | — | **UI vorhanden** | `lib/widersprueche.ts` → `TodayView` „Needs a look“ (mit Auflösung), `DossierView` „To check“ (Karte, Schritt 2) |
| Widerspruchs-Auflösung „neuere Version gilt“ | ✓ | ✓ (Knopf) | **UI vorhanden** | `TodayView` (Keep the newer/older) und `DossierView`-Karte „Newer wins“ (Schritt 2) |
| **Today 2.0: Zeitfenster-Slider (heute/7/30/alles)** | ✓ | ✓ | **gebaut** (Schritt 1, 69ee29c) | `TodayView`-Regler (5 Stufen inkl. gewohntem „Last visit“) → `since` am `/api/briefing`-Abruf |
| **Today 2.0: abgelöste Knoten (superseded_by) konsolidiert** | ✓ | — | **gebaut** (Schritt 1, 69ee29c) | Briefing `superseded` (mit „replaced by“) → `TodayView`-Abschnitt „What changed“, Nachfolger als Klickziel |
| **Today 2.0: gelöschte Knoten (Papierkorb) konsolidiert** | ✓ | — | **gebaut** (Schritt 1, 69ee29c) | Briefing `deleted` → `TodayView`-Abschnitt „What changed“ mit Verweis auf den Papierkorb |
| **Dossier 2.0: Auflösung je Widerspruchs-Karte** | ✓ | ✓ | **gebaut** (Schritt 2, a5bdd7b) | `DossierView`-Karte: „Newer wins“ / „Both hold — cap the older“ / „Edit“ (Editor via `onEditMemory`) |
| **Dossier 2.0: Gültigkeitsfenster setzen** | ✓ | ✓ | **gebaut** (Schritt 2, a5bdd7b) | Resolve-Route `window:true` → `validTo` der älteren Notiz = Zeitpunkt der neueren + Paar markiert (Vertragstest) |
| **Chat: Suche über das ganze Gehirn (Server-Engine)** | ✓ | ✓ (via Suchtiefe) | **gebaut** (Schritt 3, aff99a6) | `Chat` befragt `POST /api/search` bei jeder Frage (Engine-Treffer führen den Kontext) + 300-ms-Debounce-Vorschau beim Tippen |
| **Chat: Suchtiefe + Spuren-Schalter gelten im Chat** | ✓ (im Request, Test belegt) | ✓ (Settings) | **gebaut** (Schritt 3, aff99a6) | `useSuchPrefs` → `topK: tiefe`, `tracks` an jeden Chat-Such-Call |
| **Chat: Quellen-Herkunft (bm25/vektor/graph-Rang)** | ✓ | — | **gebaut** (Schritt 3, aff99a6) | Quellen-Chips je Antwort mit Herkunfts-Badges aus dem Search-Response |
| **Chat: Suchdauer + „Brain warm“** | ✓ | — | **gebaut** (Schritt 3, aff99a6) | Warm-Chip im Chat-Kopf, gemessen an der eigenen Engine-Anfrage |
| Gültigkeitsfenster (validFrom/validTo) editieren | ✓ | ✓ | **UI vorhanden** | `MemoryEditor` (Temporal-Abschnitt) |
| Zeitreise (Graph-Zeitregler) | ✓ | ✓ | **UI vorhanden** | `KnowledgeGraph` + `graphTime.ts` |
| Suchtiefe/Spuren/Treffer (PAKET 2) | ✓ | ✓ | **UI vorhanden** | Settings + Dashboard, geteilt über `searchPrefs` |

---

## Wachstums-Protokoll

- **Schritt 0:** Inventar-Analyse + Erst-Tabelle. Keine neue Route nötig für Today (Briefing wird additiv erweitert); Resolve-Route bekommt `window:true` (Schritt 2); Chat bekommt den Engine-Call (Schritt 3). 1613 Tests.
- **Schritt 1 (69ee29c):** Today 2.0. `src/lib/briefing.ts` liefert `superseded` (mit `supersededBy`-id + Nachfolger-Titel via LEFT JOIN) und `deleted` (Papierkorb-Bewegungen im Fenster); Kategorien sind disjunkt (eine abgelöste Notiz zählt nicht doppelt als „geändert“). `TodayView` bekommt den Zeitmaschinen-Slider (5 Stufen: Last visit / Today / 7 days / 30 days / Everything — `FENSTER` + `fensterSeit`), den konsolidierten Abschnitt „What changed“ (new · updated · replaced mit Nachfolger-Klick · deleted mit Weg zum Papierkorb), Kopf-Chips für replaced/deleted und dynamische Untertitel. Sonderfall „Everything“: „geändert“ = `updated_at > created_at + 999` (echte Änderung nach der Erstellung), statt der leeren Menge `created_at <= 0`. 1617 Tests.
- **Schritt 2 (a5bdd7b):** Dossier 2.0. `POST /api/contradictions/resolve` versteht jetzt `window:true`: die ältere Notiz bekommt `validTo = updatedAt` der neueren (nur wenn kein Fenster existiert und das Ende nach dem Beginn liegt — nichts erfunden, Antwort sagt `window: null`), das Paar wird als „beide richtig“ markiert und kommt nicht wieder (Vertragstests in `tests/enterprise-api.test.ts`). `DossierView` zeigt je Widerspruch eine Karte mit drei Entscheidungen — „Newer wins“, „Both hold — cap the older“, „Edit“ (öffnet den Editor über den neuen `onEditMemory`-Prop aus dem Dashboard); ohne ids (alter Server-Stand) bleibt die ehrliche Textzeile ohne Aktionen. 1622 Tests.
- **Schritt 3 (aff99a6):** Chat mit vollem Gedächtnis. `Chat.tsx` befragt bei jeder Frage die Engine (`POST /api/search`) mit der Suchtiefe und den drei Spuren-Schaltern aus `lib/searchPrefs` — das ganze Gehirn statt nur des Dashboard-Vorfilterns; Engine-Treffer führen den Prompt-Kontext an (Knotenanzahl bleibt budgetiert), bei leerer Antwort oder unerreichbarem Server ordnet das lokale `hybridSearch` weiter. Die Quellen-Chips je Antwort tragen die Herkunfts-Badges (`bm25 #n · vector #n · graph #n`, dieselbe Wahrheit wie auf der MemoryCard), der Chat-Kopf zeigt die gemessene Suchdauer und den „Brain warm“-Zustand. Zusätzlich: ein 300-ms-Debounce-Ranking live beim Tippen (Vorschau-Kontext), das Senden befragt die Engine garantiert selbst — die Eingabe wird beim Absenden geleert, der Debounce allein würde nicht liefern. 1625 Tests.
