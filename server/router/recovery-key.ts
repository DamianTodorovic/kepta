// Der Wiederherstellungsschlüssel — der Satz Zeichen, mit dem jemand seine
// verschlüsselte Datenbank auch ohne Keychain wieder aufbekommt.
//
// Er wohnt seit jeher in einer Zeile mit der alten Lizenz-Route, ist aber davon
// unabhängig: die Daten waren nie Geisel einer Bezahlung. Seit die kostenlose
// App gar kein Schlüssel-System mehr hat (09.10.2026) steht er allein da — und
// seine drei Türsteher bleiben, denn sie schützen den Schlüssel, nicht einen Plan:
// nur dieser Host (gegen DNS-Rebinding), nur diese Herkunft, und ein Kopf, den
// eine fremde Seite ohne Vorabfrage nicht senden kann.
import express from "express";
import type { AppKontext } from "../kontext";

export function mountRecoveryKey(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

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
