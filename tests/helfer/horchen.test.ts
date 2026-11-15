// @vitest-environment node
//
// Warum diese Datei existiert: Supertest macht aus einer Express-App für JEDE
// Anfrage einen neuen http-Server, bindet ihn auf einen ephemeren Port und
// schließt ihn nach der Antwort wieder. Bei über hundert Test-Workern ist das ein
// beständiges Vergeben und Freigeben von Loopback-Ports, und es sind schon
// Antworten von einem Server eingezogen, der nicht der eigene war — 401 statt
// 403, 404 statt 400, ETIMEDOUT, Zahlen, die diese App an keiner Stelle selbst
// senden kann. tests/setup.horchen.ts hält deshalb pro App genau einen Hörer
// offen. Diese Fälle messen das, und dass ein gewöhnlicher Mock-Server dabei
// unberührt bleibt.
import { describe, it, expect } from "vitest";
import express, { type Express } from "express";
import http from "node:http";
import request from "supertest";
import { geriegelt, horcherVon } from "./hoerer";

/** Eine App, die ihren eigenen Anbindungsort zurückgibt. */
function zaehlerApp(): Express {
  const app = express();
  app.get("/ort", (req, res) => {
    res.json({ port: req.socket.localPort });
  });
  return app;
}

async function portDer(app: Express): Promise<number> {
  const res = await request(app).get("/ort");
  expect(res.status).toBe(200);
  return Number(res.body.port);
}

describe("Ein Hörer pro App, nicht einer pro Anfrage", () => {
  it("der Riegel sitzt in jedem Test-Prozess", () => {
    expect(geriegelt(), "tests/setup.horchen.ts hängt nicht in setupFiles").toBe(true);
  });

  it("zwei Anfragen an dieselbe App laufen über denselben Port", async () => {
    const app = zaehlerApp();
    const erste = await portDer(app);
    const zweite = await portDer(app);
    expect(zweite, `die zweite Anfrage saß auf einem anderen Hörer: ${erste} → ${zweite}`).toBe(erste);
  });

  it("derselbe Hörer antwortet, und nach der Antwort steht er noch", async () => {
    const app = zaehlerApp();
    const port = await portDer(app);
    const hoerer = horcherVon(app);
    expect(hoerer, "die App hat keinen gepufferten Hörer").toBeDefined();
    expect(hoerer!.listening, "der Hörer wurde nach der Antwort geschlossen").toBe(true);
    expect((hoerer!.address() as { port: number }).port).toBe(port);
  });

  it("zwei verschiedene Apps behalten ihren eigenen Hörer", async () => {
    const a = await portDer(zaehlerApp());
    const b = await portDer(zaehlerApp());
    expect(b, "zwei Apps teilten sich einen Hörer").not.toBe(a);
  });

  it("lässt einen gewöhnlichen Mock-Server in Ruhe", async () => {
    const mock = http.createServer((_req, res) => res.end("mock"));
    try {
      await new Promise<void>((resolve, reject) => {
        mock.once("error", reject);
        mock.listen(0, "127.0.0.1", () => resolve());
      });
      expect(typeof mock.address()).toBe("object");
    } finally {
      await new Promise<void>((resolve) => mock.close(() => resolve()));
    }
  });

  it("der eigne Hoerer sitzt auf IPv4-Loopback, nicht auf dem Doppelstapel", async () => {
    // Supertest verbindet immer `http://127.0.0.1:<port>` (node_modules/supertest/
    // lib/test.js:66). Ein Hörer auf `::` nimmt diese Verbindung zwar über die
    // IPv4-gemappte Adresse an, aber er gehoert ihr nicht allein: gemessen 4.11.
    // 21:36 MEZ auf diesem Rechner (/tmp/v4v6-race.mjs) konnten ein IPv4-Hoerer auf
    // 127.0.0.1:45991 und ein Doppelstapel-Hoerer auf :::45991 **gleichzeitig**
    // sitzen, und die Anfrage an 127.0.0.1 beantwortete der IPv4-Inlaender. Das ist
    // die Ursache 9 in ihrer ganzen Laenge: ein fremder lokaler Lauscher auf demselben
    // Port beantwortet unsere Testanfrage, und die Zahl (401 statt 400) stammt von ihm.
    const app = zaehlerApp();
    await portDer(app);
    const adr = horcherVon(app)!.address() as { address: string; family: string };
    expect(adr.family, `Hoerer-Familie ist ${adr.family}, erwartet IPv4`).toBe("IPv4");
    expect(adr.address, `Hoerer sitzt auf ${adr.address}, erwartet 127.0.0.1`).toBe("127.0.0.1");
  });

  it("kein fremder IPv4-Hoerer kann sich auf den Port des eignen setzen", async () => {
    // Die Gegenprobe desselben Satzes, an der Maschine gemessen statt am Feldnamen:
    // wer seinen Hoerer auf 127.0.0.1 bindet, dem muss der Kernel denselben Port auf
    // derselben Adresse verwehren. Solange der eigne Hoerer auf `::` sitzt, ist der
    // Port fuer einen IPv4-Hoerer frei — und genau dieser Fall zeigt das (gemessen:
    // der Fremde setzte sich darauf und beantwortete die Anfrage).
    const app = zaehlerApp();
    const port = await portDer(app);
    const fremder = http.createServer((_req, res) => res.end("fremd"));
    const code = await new Promise<string | null>((resolve) => {
      fremder.once("error", (e) => resolve((e as NodeJS.ErrnoException).code ?? "fehler"));
      fremder.once("listening", () => resolve("gesetzt"));
      fremder.listen(port, "127.0.0.1");
    });
    if (code === "gesetzt") await new Promise<void>((r) => fremder.close(() => r()));
    expect(code, `ein fremder IPv4-Hoerer bekam Port ${port} (Code ${code}) — der eigne sitzt nicht auf IPv4`).toBe("EADDRINUSE");
  });
});
