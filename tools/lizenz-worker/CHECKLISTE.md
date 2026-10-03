# KEPTA Selbstbedienungs-Checkout — Setup-Checkliste (30–60 Minuten)

Ziel: Damians Handverkauf bleibt für Business/Enterprise; Pro kauft sich
selbst. Die App ist seit dem Freemium-Umbau darauf vorbereitet (Upgrade-Panel,
429 mit `upgradeUrl`, Aktivierung offline). Schritt für Schritt:

## 1. Paddle (Merchant of Record — nimmt EU-VAT/Steuern ab, ~20 Minuten)
- [x] Konto auf paddle.com angelegt (18.9.2026, live-Konto von Damian)
- [x] Produkte + Preise angelegt (18.9.2026, beide **Active**):
  - **KEPTA Pro** — `pro_01m2v86hxy555dhs6078p3q4w9`: €12.00/Monthly (`pri_01m2v8x40ddazssq0r3se0m6t0`) + €120.00/Yearly (`pri_01m2v92ltm0ctnxs5ewt6xqshn`)
  - **KEPTA Business (per Seat)** — `pro_01m2v8aa8bg1dq2xadnmsy2b99`: €25.00/Monthly (`pri_01m2vassqjm41yrp4k6brsjcq2`)
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
   - [x] **KEPTA-Landing-Page gebaut und live:** `https://damiantodorovic.github.io/` (Wurzel, User-Repo `DamianTodorovic/damiantodorovic.github.io`) und `https://damiantodorovic.github.io/kepta/` (gh-pages-Branch im kepta-Repo) — enthält Preise, ToS, Privacy Notice, 14-Tage-Rückerstattung
   - [x] Domain `damiantodorovic.github.io` bei Paddle → Checkout → Website Approval eingereicht (19.9.) → **Status: Pending**
   - [ ] Paddle-Genehmigung abwarten; bei Rückfragen Support antworten

**Support-Text-Vorschlag (englisch, kopieren/reichen):**
> Hi Paddle team, I'm building KEPTA — a local-first encrypted memory app for
> AI assistants (desktop application for macOS/Windows, BUSL-1.1 source-available
> core, public repo at github.com/DamianTodorovic/kepta). I'd like to request access to Hosted
> Checkouts so customers can buy a license directly from inside the desktop
> app without a marketing website. Thanks!

**Status (20.9.): ERLEDIGT** — erste Anfrage lief versehentlich über fanglotse@gmail.com
(Paddle-Support „Marina" wies sie korrekt ab: nur Anfragen von mit dem Konto
verknüpften Adressen). Korrekte Anfrage am 20.9. von **damian2212todi@gmail.com**
(an sellers@paddle.com, mit Verweis auf das offene Ticket) abgesendet — Antwort abwarten.

**Sobald Zugriff da ist:** Hosted Checkout für `pri_01m2v8x40ddazssq0r3se0m6t0`
(Pro monthly), `pri_01m2v92ltm0ctnxs5ewt6xqshn` (Pro yearly) und
`pri_01m2vassqjm41yrp4k6brsjcq2` (Business seat) anlegen → Link als
`KEPTA_UPGRADE_URL` setzen (siehe Schritt 3).

## 2. Worker deployen (~15 Minuten)
- [ ] `cd tools/lizenz-worker && npm i -g wrangler` (oder `npx wrangler`)
- [ ] `wrangler kv namespace create LIZENZEN` → Namespace-ID in `wrangler.toml` eintragen
- [ ] **`wrangler secret put LIZENZ_PRIVATE_KEY`** — der Ed25519-Private-Schlüssel (Base64-DER-PKCS8) aus dem Schlüsselbund (`security find-generic-password -s app.kepta.license-signing -w` liefert ihn). ⚠️ **Dieser Schlüssel signiert ALLE Lizenzen — in den Worker-Secrets hat er genau einen sachgerechten Platz, niemals im Git-Repo.**
- [ ] `wrangler secret put PADDLE_WEBHOOK_SECRET` (steht in Paddle → Developer Tools → Notifications)
- [ ] `wrangler secret put RESEND_API_KEY` (resend.com, Free-Tier reicht für den Start)
- [ ] `wrangler deploy` → notiere die URL (`https://kepta-licenzen.<account>.workers.dev`)

## 3. Verbinden (~5 Minuten)
- [ ] Paddle → Notifications → Webhook-Endpunkt: die Worker-URL, Events: `transaction.completed`
- [ ] **Testkauf in der Paddle-Sandbox** → Mail muss kommen, Schlüssel muss in der App aktivieren (die App prüft offline gegen den öffentlichen Schlüssel in `src/core/lizenz.ts` — passt er nicht, signiert der Worker mit dem falschen Schlüssel: dann `LIZENZ_PRIVATE_KEY` prüfen)
- [ ] **KEPTA_UPGRADE_URL = der direkte Paddle-Checkout-Link** (aus Hosted Checkouts, sobald Zugriff genehmigt ist — siehe Blocker-Kasten oben). Bis dahin bleibt der Default (`https://kepta.pro/upgrade`) gesetzt; das App-Upgrade-Panel zeigt ihn nur, wenn ein Nutzer wirklich auf „Upgrade to Pro" klickt. In der App als ENV setzen, fertig.

## 4. Nach dem ersten echten Kauf
> 💡 **Die ganze Kette kostet 0 € im Betrieb:** Paddle rechnet nur pro Verkauf ab,
> Cloudflare Worker/KV und Resend laufen im Free-Tier, und als Upgrade-Ziel dient
> der direkte Paddle-Checkout-Link — keine eigene Website, keine Domain nötig.
- [ ] Sperrliste-Konzept bleibt: Number aus dem KV übernehmen, wenn ein Schlüssel gesperrt werden soll (License Studio `sperre` schreibt `src/core/sperrliste.ts` — KV-Nummern müssen dort nachgetragen werden; ein Export-Befehl im Worker kann das automatisieren, auf Wunsch bauen)
- [ ] Paddle-Payouts → Bankverbindung einmal prüfen (Auszahlung ab erster Zahlung; Provision nur pro Verkauf, keine Grundgebühr)
- [ ] LinkedIn-Prozess für Pro beenden: „Buy" verweist auf Checkout; LinkedIn bleibt für Business/Enterprise

## Was der Worker bewusst NICHT kann
- Keine Sperrliste-Synchronisation (bewusst: der Schlüssel bleibt offline; Sperren laufen über App-Updates wie bisher)
- Kein Account, kein Login, keine Kundendatenbank — nur KV: Schlüssel → Kunde
- Kein Cloud-Zwang für die App — sie merkt nicht einmal, dass der Worker existiert
