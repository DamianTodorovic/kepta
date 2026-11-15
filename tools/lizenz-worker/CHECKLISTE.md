# K3PTA Selbstbedienungs-Checkout — Setup-Checkliste (30–60 Minuten)

> **Stand 09.10.2026: dieser Weg ist zugestellt, nicht gelöscht.** Die
> herunterladbare App hat kein Schlüssel-Feld, keine Grenzen und kein
> Upgrade-Panel mehr; die Einzelstufe, für die diese Checkliste angelegt wurde,
> gibt es nicht mehr. Schlüssel gehören nur zu K3PTA Enterprise und werden von
> Hand verkauft (License Studio). Die Price-IDs unten sind die Belege dessen,
> was in Paddle angelegt wurde — **die Einzelstufe muss in Paddle archiviert
> werden**, sonst läuft ein Verkauf ins Leere: der Worker stellt für einen
> Preis ohne Stufe bewusst nichts aus.
>
> Ziel, falls ein Checkout wieder angeht: Damians Handverkauf bleibt die
> Haupttür; der Worker automated nur die Team-Form von K3PTA Enterprise.
> Schritt für Schritt:

## 1. Paddle (Merchant of Record — nimmt EU-VAT/Steuern ab, ~20 Minuten)
- [x] Konto auf paddle.com angelegt (18.9.2026, live-Konto von Damian)
- [x] Produkte + Preise angelegt (18.9.2026, beide **Active**):
  - **Einzelstufe (tot, war 12 €/Monat und 120 €/Jahr)** — `pro_01m2v86hxy555dhs6078p3q4w9`: €12.00/Monthly (`pri_01m2v8x40ddazssq0r3se0m6t0`) + €120.00/Yearly (`pri_01m2v92ltm0ctnxs5ewt6xqshn`) — **in Paddle archivieren**
  - **Team-Lizenz (per Seat)** — `pro_01m2v8aa8bg1dq2xadnmsy2b99`: €25.00/Monthly (`pri_01m2vassqjm41yrp4k6brsjcq2`)
- [ ] Checkout: Custom-Data-Feld `name` (Kundenname wie auf der Rechnung) sichtbar machen — daraus signiert der Worker den Schlüssel
- [ ] Test-Umgebung (Sandbox) einmal durchklicken

### ⚠️ Checkout-Link-Blocker (18.9.2026 im Dashboard verifiziert)
Paddle Billing liefert **keinen fertigen Checkout-Link** ohne einen von zwei Wegen:
1. **Hosted Checkouts** (`vendors.paddle.com/hosted-checkouts`) ist **zugangsgesperrt** —
   „only available for customers with an app-to-web sales funnel, or for embedding the
   checkout in a non-mobile app, such as a desktop application. **To request access,
   please contact support.**" — das ist GENAU unser Fall (Desktop-App!). → Damian
   klickt dort auf **contact support** und bittet um Hosted-Checkout-Zugriff
   (Kurztext dazu weiter unten).
2. **Website Approval** (Paddle verlangt eine kontrollierte Domain mit ToS + Privacy + Refund auf der Seite — ein Repo-Pfad reicht nicht):
   - [x] **K3PTA-Landing-Page gebaut und live:** `https://damiantodorovic.github.io/` (Wurzel, User-Repo `DamianTodorovic/damiantodorovic.github.io`) und `https://damiantodorovic.github.io/kepta/` (gh-pages-Branch im kepta-Repo) — enthält Preise, ToS, Privacy Notice, 14-Tage-Rückerstattung
   - [x] Domain `damiantodorovic.github.io` bei Paddle → Checkout → Website Approval eingereicht (19.9.) → **Status: Pending**
   - [ ] Paddle-Genehmigung abwarten; bei Rückfragen Support antworten

**Support-Text-Vorschlag (englisch, kopieren/reichen):**
> Hi Paddle team, I'm building K3PTA — a local-first encrypted memory app for
> AI assistants (desktop application for macOS/Windows, BUSL-1.1 source-available
> core, public repo at github.com/DamianTodorovic/kepta). I'd like to request access to Hosted
> Checkouts so customers can buy a license directly from inside the desktop
> app without a marketing website. Thanks!

**Status (20.9.): ERLEDIGT** — erste Anfrage lief versehentlich über fanglotse@gmail.com
(Paddle-Support „Marina" wies sie korrekt ab: nur Anfragen von mit dem Konto
verknüpften Adressen). Korrekte Anfrage am 20.9. von **damian2212todi@gmail.com**
(an sellers@paddle.com, mit Verweis auf das offene Ticket) abgesendet — Antwort abwarten.

**Sobald Zugriff da ist:** Hosted Checkout für `pri_01m2vassqjm41yrp4k6brsjcq2`
(Team-Lizenz pro Seat) anlegen → Link als `KEPTA_UPGRADE_URL` setzen (siehe
Schritt 3). Die beiden Price-IDs der ehemaligen Einzelstufe bleiben unbenutzt.

## 2. Worker deployen (~15 Minuten)
- [ ] `cd tools/lizenz-worker && npm i -g wrangler` (oder `npx wrangler`)
- [ ] `wrangler kv namespace create LIZENZEN` → Namespace-ID in `wrangler.toml` eintragen
- [ ] **`wrangler secret put LIZENZ_PRIVATE_KEY`** — der Ed25519-Private-Schlüssel (Base64-DER-PKCS8) aus dem Schlüsselbund (`security find-generic-password -s app.kepta.license-signing -w` liefert ihn). ⚠️ **Dieser Schlüssel signiert ALLE Lizenzen — in den Worker-Secrets hat er genau einen sachgerechten Platz, niemals im Git-Repo.**
- [ ] `wrangler secret put PADDLE_WEBHOOK_SECRET` (steht in Paddle → Developer Tools → Notifications)
- [ ] `wrangler secret put RESEND_API_KEY` (resend.com, Free-Tier reicht für den Start)
- [ ] `wrangler deploy` → notiere die URL (`https://kepta-licenzen.<account>.workers.dev`)

## 3. Verbinden (~5 Minuten)
- [ ] Paddle → Notifications → Webhook-Endpunkt: die Worker-URL, Events: `transaction.completed`
- [ ] **Testkauf in der Paddle-Sandbox** → Mail muss kommen, und der Schlüssel muss die Prüfung in `src/core/lizenz.ts` bestehen (der Worker signiert mit dem GLEICHEN privaten Schlüssel, dessen öffentliche Seite dort steht; passt er nicht, ist `LIZENZ_PRIVATE_KEY` falsch). die App selbst prüft keinen Schlüssel mehr — der Schlüssel weist den Vertrag aus.
- [ ] **KEPTA_UPGRADE_URL = der direkte Paddle-Checkout-Link** — die App kennt kein Upgrade-Panel und keinen Link nach innen; der Link lebt nur auf der Download-Seite und in den Vertriebs-Assets. In Paddle als Checkout-Ziel setzen.

## 4. Nach dem ersten echten Kauf
> 💡 **Die ganze Kette kostet 0 € im Betrieb:** Paddle rechnet nur pro Verkauf ab,
> Cloudflare Worker/KV und Resend laufen im Free-Tier, und als Upgrade-Ziel dient
> der direkte Paddle-Checkout-Link — keine eigene Website, keine Domain nötig.
- [ ] Sperrliste-Konzept bleibt: Number aus dem KV übernehmen, wenn ein Schlüssel gesperrt werden soll (License Studio `sperre` schreibt `src/core/sperrliste.ts` — KV-Nummern müssen dort nachgetragen werden; ein Export-Befehl im Worker kann das automatisieren, auf Wunsch bauen)
- [ ] Paddle-Payouts → Bankverbindung einmal prüfen (Auszahlung ab erster Zahlung; Provision nur pro Verkauf, keine Grundgebühr)
- [ ] LinkedIn-Prozess: „Buy" verweist auf gar keinen Checkout — ein Schlüssel kommt nur gegen Vereinbarung von Damian (die ehemalige Einzelstufe hat nichts mehr freigeschaltet, seit die App unbegrenzt läuft)

## Was der Worker bewusst NICHT kann
- Keine Sperrliste-Synchronisation (bewusst: der Schlüssel bleibt offline; Sperren laufen über App-Updates wie bisher)
- Kein Account, kein Login, keine Kundendatenbank — nur KV: Schlüssel → Kunde
- Kein Cloud-Zwang für die App — sie merkt nicht einmal, dass der Worker existiert
