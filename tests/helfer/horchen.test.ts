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
});
