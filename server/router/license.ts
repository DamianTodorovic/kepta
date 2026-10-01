// --- Lizenzprüfung (Enterprise) ---
// Geprüft wird die Ed25519-Signatur über Kundennamen und Lizenznummer
// (src/core/lizenz.ts) — offline, nichts verlässt den Rechner. Gesperrte
// Nummern (src/core/sperrliste.ts) gelten nicht, auch wenn sie schon
// aktiviert waren. In der App steht nur der öffentliche Schlüssel —
// ausstellen kann niemand, der die App auspackt. Ohne gültigen Schlüssel
// läuft die App als Free-Plan mit Tageslimiten (mountFreemium) — und an den
// ersten 24 Stunden (der Pro-Tag, helfer/probetag.ts) sogar ohne Limiten.
//
// Der Wiederherstellungsschlüssel (/api/recovery-key) ist bewusst FREI: die
// Daten sind nie Geisel der Lizenz.
import express from "express";
import { formatiereNummer, pruefeSchluessel, type Lizenzpruefung } from "../../src/core/lizenz";
import { liesVerwaltet } from "../../src/lib/richtlinien";
import { UPGRADE_URL, CHECKOUT_LIVE } from "../helfer/freemium";
import { probetagStatus } from "../helfer/probetag";
import { bodyOf } from "../helfer/body";
import type { AppKontext } from "../kontext";

export function hinterlegteLizenz(ctx: AppKontext): { name: string; pruefung: Lizenzpruefung } | null {
  const einstellungen = ctx.store.einstellungen();
  const name = einstellungen["license_name"];
  const schluessel = einstellungen["license_key"];
  if (name && schluessel) return { name, pruefung: pruefeSchluessel(name, schluessel) };
  // MDM-Ausrollung: die Organisation darf die Lizenz in der verwalteten
  // Konfiguration vorab eintragen. Geprüft wird offline wie bei jedem
  // anderen Schlüssel — verwaltet ersetzt nur das Eintippen, nie die Prüfung.
  const verwaltet = liesVerwaltet();
  if (verwaltet?.license_name && verwaltet.license_key) {
    return { name: verwaltet.license_name, pruefung: pruefeSchluessel(verwaltet.license_name, verwaltet.license_key) };
  }
  return null;
}

export function mountLicense(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  function istLizenziert(): boolean {
    if (ctx.optionen.lizenziert) return ctx.optionen.lizenziert();
    return hinterlegteLizenz(ctx)?.pruefung.gueltig === true;
  }
  // app.ts braucht dieselbe Prüfung für das Lizenz-Gate — dem Kontext beibringen.
  ctx.istLizenziert = istLizenziert;

  app.get("/api/license", (_req, res) => {
    if (ctx.optionen.lizenziert) return res.json({ licensed: ctx.optionen.lizenziert() });
    const lizenz = hinterlegteLizenz(ctx);
    if (lizenz?.pruefung.gueltig) {
      return res.json({
        licensed: true,
        licensee: lizenz.name,
        number: formatiereNummer(lizenz.pruefung.nummer!),
        edition: lizenz.pruefung.edition,
        seats: lizenz.pruefung.seats,
      });
    }
    // Freemium: ohne Schlüssel ist die App nicht gesperrt, sondern im
    // Free-Plan (Tageslimiten über mountFreemium) — der Upgrade-Weg geht mit.
    // Der Pro-Tag (24 h ab Erststart) läuft dabei als eigener Zustand mit:
    // aktiv = alle Pro-Werkzeuge offen, sonst nur der Blick auf die Uhr.
    const probetag = ctx.optionen.probetag ? probetagStatus(store, ctx.datenOrdner) : null;
    const zustand = lizenz?.pruefung.gesperrt ? { licensed: false, revoked: true, free: true } : { licensed: false, free: true };
    return res.json({
      ...zustand,
      protag: probetag ? { aktiv: probetag.aktiv, restMs: probetag.restMs } : undefined,
      upgradeUrl: UPGRADE_URL,
      // Ohne live Checkout (Paddle in Prüfung) zeigt der Kauf-Weg auf LinkedIn —
      // die Oberfläche rendert dann den Kontakt-Weg statt einer toten Adresse.
      checkoutLive: CHECKOUT_LIVE,
    });
  });

  app.post("/api/license", ctx.limiter.write, express.json({ limit: "4kb" }), (req, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const schluessel = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (!name || !schluessel) return res.status(400).json({ error: "Name and license key are required." });
    const pruefung = pruefeSchluessel(name, schluessel);
    if (pruefung.gesperrt) {
      return res.status(403).json({ error: "This license key has been revoked. If you think this is a mistake, please write to Damian Todorovic." });
    }
    if (!pruefung.gueltig) return res.status(403).json({ error: "This license key does not belong to this name." });
    store.setzeEinstellungen({ license_name: name, license_key: schluessel });
    res.json({ ok: true, licensed: true, licensee: name, number: formatiereNummer(pruefung.nummer!), edition: pruefung.edition, seats: pruefung.seats });
  });

  // --- Wiederherstellungsschluessel ---
  // Fuer den Knopf "Recovery key" unter System status. Nur die eigene
  // Oberflaeche darf ihn holen: eigener Host (gegen DNS-Rebinding), keine fremde
  // Herkunft, und ein eigener Header, den eine fremde Seite nicht ohne
  // Vorabfrage senden kann — die CORS-Liste erlaubt ihn nicht.
  app.post("/api/recovery-key", ctx.limiter.write, (req, res) => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host ?? "")) return res.status(403).json({ error: "Forbidden host." });
    const herkunft = req.headers.origin;
    if (herkunft && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(herkunft)) return res.status(403).json({ error: "Forbidden origin." });
    if (req.get("x-kepta-recovery") !== "1") return res.status(403).json({ error: "This request must come from the KEPTA window." });
    let schluessel: string | null;
    try {
      schluessel = store.wiederherstellungsSchluessel();
    } catch (e) {
      return res.status(500).json({ error: `The key could not be read: ${e instanceof Error ? e.message : String(e)}` });
    }
    if (!schluessel) return res.status(404).json({ error: "The knowledge base is not encrypted — there is no recovery key." });
    res.set("Cache-Control", "no-store").json({ key: schluessel, storedIn: store.verschluesselung.ablage ?? null });
  });
}
