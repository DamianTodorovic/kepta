// @vitest-environment node
// P4-91 (23.10., Brief 91): der globale Fehler-Handler gibt keinen fremden Exception-Wortlaut heraus.
//
// Bis heute kopierte server/app.ts die Zeile `const grund = e.expose === true && typeof
// e.message === "string" ? e.message : "..."` - und `expose` setzt in dieser App niemand
// selbst (kein `createError` im server/-Baum), also kam der Wortlaut ausschliesslich aus
// fremden Bibliotheken. Dieser Fall misst die drei Wege der Mittelware mit eigenen
// Fehlern; der fremde Satz steht als Marker drin und darf nirgends zurueckkommen.
//
// Rot vor dem Flicken (der 400er traegt dann den Marker), gruen danach.
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { sichererFehler } from "../server/app";

const FREMD = "FREMD-WORTLAUT-9f2a-aus-einer-bibliothek";

function appMit(wurf: unknown) {
  const app = express();
  app.get("/wurf", () => {
    throw wurf;
  });
  app.use(sichererFehler);
  return app;
}

describe("P4-91: der Wortlaut an der fremden Exception", () => {
  it("ein expose:true-4xx nennt den Klassensatz, nie den Satz der Exception", async () => {
    const r = await request(appMit(Object.assign(new Error(FREMD), { status: 400, statusCode: 400, expose: true }))).get("/wurf");
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/not usable as sent/i);
    expect(String(r.body.error), "der fremde Wortlaut steht in der Antwort").not.toContain(FREMD);

    // Kontrolle 1: ohne expose bleibt der generische Satz, und der Marker fehlt auch dort
    const ohneExpose = await request(appMit(Object.assign(new Error(FREMD), { status: 404, statusCode: 404 }))).get("/wurf");
    expect(ohneExpose.status).toBe(404);
    expect(String(ohneExpose.body.error)).toBe("The request could not be handled.");
    expect(String(ohneExpose.body.error)).not.toContain(FREMD);

    // Kontrolle 2: die 500 traegt ihren festen Satz; der Grund bleibt im Protokoll
    const serverfehler = await request(appMit(new Error(FREMD))).get("/wurf");
    expect(serverfehler.status).toBe(500);
    expect(String(serverfehler.body.error)).toMatch(/server log/i);
    expect(String(serverfehler.body.error)).not.toContain(FREMD);
  });
});
