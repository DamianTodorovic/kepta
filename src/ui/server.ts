// KEPTA Core — die Oberfläche im Browser.
//
// `npx kepta-mcp ui` startet hier einen kleinen Server auf 127.0.0.1 und
// öffnet die Seite: Notizen ansehen, suchen, anlegen, bearbeiten, in den
// Papierkorb legen und zurückholen — auf derselben verschlüsselten Datenbank,
// die die Agenten über MCP nutzen. Ohne Express und ohne neue Abhängigkeit:
// das npm-Paket bleibt eine Datei plus SQLite.
//
// Sicherheit: nur Loopback; jede Anfrage muss den eigenen Host tragen (gegen
// DNS-Rebinding); jede schreibende Anfrage braucht das Sitzungs-Token, das nur
// die eigene Seite kennt (gegen Anfragen fremder Webseiten); dazu eine strenge
// Content Security Policy. Gespeichert wird über saveWithIndex — derselbe Weg
// wie bei MCP, damit [[Links]] im Wissensgraphen landen.
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import type { KeptaStore } from "../core/store";
import type { MemoryRecord, MemoryType } from "../core/types";
import { searchMemories } from "../core/engine";
import { saveWithIndex } from "../core/mcp";
import { APP_VERSION } from "../core/version";
import { SEITE_HTML, SEITE_CSS, SEITE_JS, FAVICON_SVG } from "./seite";

const TYPEN: readonly MemoryType[] = ["semantic", "episodic", "procedural", "reference"];
export const MAX_KOERPER = 1024 * 1024;
export const STANDARD_PORT = 4747;

export interface Oberflaeche {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

export class AnfrageFehler extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Was die Seite von einer Notiz sieht — ohne interne Zähler. */
export function alsNotiz(m: MemoryRecord) {
  return {
    id: m.id,
    type: m.type,
    title: m.title,
    content: m.content,
    tags: m.tags,
    confidence: m.confidence,
    validFrom: m.validFrom,
    validTo: m.validTo,
    supersededBy: m.supersededBy,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    deletedAt: m.deletedAt,
  };
}

/** Alle aktiven Notizen, seitenweise — für die Zähler der Seitenleiste. */
function alleAktiven(store: KeptaStore): MemoryRecord[] {
  const aus: MemoryRecord[] = [];
  for (let offset = 0; ; ) {
    const seite = store.listMemories({ limit: 500, offset });
    if (seite.length === 0) return aus;
    aus.push(...seite);
    offset += seite.length;
  }
}

export function status(store: KeptaStore) {
  const typen: Record<string, number> = {};
  const tags = new Map<string, number>();
  for (const m of alleAktiven(store)) {
    typen[m.type] = (typen[m.type] ?? 0) + 1;
    for (const t of m.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return {
    version: APP_VERSION,
    notes: store.countMemories(),
    types: typen,
    tags: [...tags.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count })),
    encryption: store.verschluesselung,
    dbPath: store.dbPath,
  };
}

/** Prüft eine Notiz aus dem Browser. Teilweise = beim Bearbeiten darf ein Feld fehlen. */
export function pruefeNotiz(k: Record<string, unknown>, teilweise: boolean): Record<string, unknown> {
  const aus: Record<string, unknown> = {};
  const text = (feld: "title" | "content", max: number, fehlt: string) => {
    if (k[feld] === undefined && teilweise) return;
    const v = k[feld];
    if (typeof v !== "string" || !v.trim()) throw new AnfrageFehler(400, fehlt);
    if (v.length > max) throw new AnfrageFehler(400, `The ${feld} is longer than ${max} characters.`);
    aus[feld] = v.trim();
  };
  text("title", 300, "A note needs a title.");
  text("content", 100_000, "A note needs some content.");
  if (k.tags !== undefined) {
    if (!Array.isArray(k.tags) || k.tags.length > 30 || k.tags.some((t) => typeof t !== "string")) {
      throw new AnfrageFehler(400, "Tags must be a list of words.");
    }
    aus.tags = k.tags;
  }
  if (k.type !== undefined) {
    if (!TYPEN.includes(k.type as MemoryType)) throw new AnfrageFehler(400, "Unknown kind of knowledge.");
    aus.type = k.type;
  }
  for (const feld of ["validFrom", "validTo"] as const) {
    if (k[feld] === undefined) continue;
    const v = k[feld];
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) throw new AnfrageFehler(400, "Dates must be timestamps or empty.");
    aus[feld] = v;
  }
  if (typeof aus.validFrom === "number" && typeof aus.validTo === "number" && aus.validTo < aus.validFrom) {
    throw new AnfrageFehler(400, "“Valid until” lies before “valid from”.");
  }
  return aus;
}

function leseKoerper(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((ok, fail) => {
    let groesse = 0;
    let zuGross = false;
    const teile: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      groesse += c.length;
      if (groesse > MAX_KOERPER) zuGross = true;
      else teile.push(c);
    });
    req.on("error", fail);
    req.on("end", () => {
      if (zuGross) return fail(new AnfrageFehler(413, "That note is too large."));
      const roh = Buffer.concat(teile).toString("utf8").trim();
      if (!roh) return ok({});
      try {
        const d = JSON.parse(roh) as unknown;
        if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("kein Objekt");
        ok(d as Record<string, unknown>);
      } catch {
        fail(new AnfrageFehler(400, "The request is not valid JSON."));
      }
    });
  });
}

const SICHERHEIT = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function antworte(res: http.ServerResponse, status: number, daten: unknown): void {
  res.writeHead(status, { ...SICHERHEIT, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(daten));
}

function datei(res: http.ServerResponse, typ: string, inhalt: string): void {
  res.writeHead(200, { ...SICHERHEIT, "Content-Security-Policy": CSP, "Content-Type": typ, "Cache-Control": "no-store" });
  res.end(inhalt);
}

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function zahl(wert: string | null, standard: number, min: number, max: number): number {
  const n = wert === null ? NaN : parseInt(wert, 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : standard;
}

interface Kontext {
  store: KeptaStore;
  token: string;
  hosts: Set<string>;
  origins: Set<string>;
}

async function bearbeite(req: http.IncomingMessage, res: http.ServerResponse, ctx: Kontext): Promise<void> {
  if (!ctx.hosts.has(req.headers.host ?? "")) return antworte(res, 403, { error: "Forbidden host." });
  const url = new URL(req.url ?? "/", "http://kepta.local");
  const methode = req.method ?? "GET";
  const pfad = url.pathname;

  if (!pfad.startsWith("/api/")) {
    if (methode !== "GET") return antworte(res, 404, { error: "Not found." });
    if (pfad === "/") return datei(res, "text/html; charset=utf-8", SEITE_HTML.replace("__KEPTA_TOKEN__", ctx.token).replace("__KEPTA_VERSION__", APP_VERSION));
    if (pfad === "/app.css") return datei(res, "text/css; charset=utf-8", SEITE_CSS);
    if (pfad === "/app.js") return datei(res, "text/javascript; charset=utf-8", SEITE_JS);
    if (pfad === "/favicon.svg") return datei(res, "image/svg+xml", FAVICON_SVG);
    return antworte(res, 404, { error: "Not found." });
  }

  if (methode !== "GET") {
    const herkunft = req.headers.origin;
    if (herkunft && !ctx.origins.has(herkunft)) return antworte(res, 403, { error: "Forbidden origin." });
    if (!gleich(String(req.headers["x-kepta-token"] ?? ""), ctx.token)) {
      return antworte(res, 403, { error: "Missing or wrong session token — reload the page." });
    }
  }

  const { store } = ctx;
  const einzeln = /^\/api\/notes\/([^/]+)(\/restore)?$/.exec(pfad);

  if (pfad === "/api/status" && methode === "GET") return antworte(res, 200, status(store));

  if (pfad === "/api/notes" && methode === "GET") {
    const ansicht = url.searchParams.get("view") ?? "all";
    const typ = TYPEN.includes(ansicht as MemoryType) ? (ansicht as MemoryType) : undefined;
    if (ansicht !== "all" && ansicht !== "trash" && !typ) throw new AnfrageFehler(400, "Unknown view.");
    const limit = zahl(url.searchParams.get("limit"), 60, 1, 200);
    const offset = zahl(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    const tag = url.searchParams.get("tag") || undefined;
    const notizen = store.listMemories({ limit: limit + 1, offset, type: typ, tag, trash: ansicht === "trash" });
    return antworte(res, 200, { notes: notizen.slice(0, limit).map(alsNotiz), more: notizen.length > limit });
  }

  if (pfad === "/api/notes" && methode === "POST") {
    const daten = pruefeNotiz(await leseKoerper(req), false);
    const { record } = saveWithIndex(store, daten);
    return antworte(res, 201, { note: alsNotiz(record) });
  }

  if (pfad === "/api/search" && methode === "GET") {
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (!q) throw new AnfrageFehler(400, "Type something to search for.");
    const ergebnis = await searchMemories(store, { query: q, limit: zahl(url.searchParams.get("limit"), 60, 1, 200) });
    return antworte(res, 200, {
      query: q,
      total: ergebnis.total,
      hits: ergebnis.hits.map((h) => ({ note: alsNotiz(h.memory), score: h.score, matchedTerms: h.matchedTerms, expired: h.expired, superseded: h.superseded })),
    });
  }

  if (einzeln) {
    const id = decodeURIComponent(einzeln[1]);
    const vorhanden = store.getMemory(id);
    if (!vorhanden) throw new AnfrageFehler(404, "This note does not exist.");
    if (einzeln[2]) {
      if (methode !== "POST") throw new AnfrageFehler(404, "Not found.");
      store.restoreMemory(id);
      return antworte(res, 200, { note: alsNotiz(store.getMemory(id)!) });
    }
    if (methode === "GET") return antworte(res, 200, { note: alsNotiz(vorhanden) });
    if (methode === "DELETE") {
      store.trashMemory(id);
      return antworte(res, 200, { ok: true });
    }
    if (methode === "PUT") {
      if (vorhanden.deletedAt) throw new AnfrageFehler(409, "Restore the note before you edit it.");
      const aenderung = pruefeNotiz(await leseKoerper(req), true);
      const zusammen = {
        id,
        title: vorhanden.title,
        content: vorhanden.content,
        tags: vorhanden.tags,
        type: vorhanden.type,
        scope: vorhanden.scope,
        confidence: vorhanden.confidence,
        validFrom: vorhanden.validFrom ?? undefined,
        validTo: vorhanden.validTo ?? undefined,
        ...aenderung,
      };
      saveWithIndex(store, zusammen);
      const leeren: Record<string, null> = {};
      if (aenderung.validFrom === null) leeren.validFrom = null;
      if (aenderung.validTo === null) leeren.validTo = null;
      if (Object.keys(leeren).length) store.updateMemory(id, leeren);
      return antworte(res, 200, { note: alsNotiz(store.getMemory(id)!) });
    }
  }
  throw new AnfrageFehler(404, "Not found.");
}

function lausche(server: http.Server, port: number): Promise<void> {
  return new Promise((ok, fail) => {
    const fehler = (e: Error) => {
      server.off("listening", bereit);
      fail(e);
    };
    const bereit = () => {
      server.off("error", fehler);
      ok();
    };
    server.once("error", fehler);
    server.once("listening", bereit);
    server.listen(port, "127.0.0.1");
  });
}

/** Startet die Oberfläche. Ist der Wunschport belegt, nimmt sie einen freien. */
export async function starteOberflaeche(store: KeptaStore, opts: { port?: number } = {}): Promise<Oberflaeche> {
  const token = crypto.randomBytes(24).toString("hex");
  const ctx: Kontext = { store, token, hosts: new Set(), origins: new Set() };
  const server = http.createServer((req, res) => {
    bearbeite(req, res, ctx).catch((e: unknown) => {
      if (e instanceof AnfrageFehler) antworte(res, e.status, { error: e.message });
      else antworte(res, 500, { error: "Something went wrong inside KEPTA." });
    });
  });
  const wunsch = opts.port ?? STANDARD_PORT;
  try {
    await lausche(server, wunsch);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE" || wunsch === 0) throw e;
    await lausche(server, 0);
  }
  const port = (server.address() as AddressInfo).port;
  for (const name of ["127.0.0.1", "localhost"]) {
    ctx.hosts.add(`${name}:${port}`);
    ctx.origins.add(`http://${name}:${port}`);
  }
  return {
    url: `http://127.0.0.1:${port}/`,
    port,
    token,
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}

export function leseUiArgumente(argv: string[]): { port: number; oeffnen: boolean } {
  let port = STANDARD_PORT;
  const i = argv.indexOf("--port");
  if (i >= 0) {
    const n = Number(argv[i + 1]);
    if (Number.isInteger(n) && n >= 0 && n <= 65535) port = n;
  }
  return { port, oeffnen: !argv.includes("--no-open") };
}

type Starter = (befehl: string, argumente: string[], optionen: { stdio: "ignore"; detached: boolean }) => { on(e: "error", f: () => void): unknown; unref(): void };

/** Öffnet die Adresse im Standardbrowser. Klappt das nicht, steht sie ja im Terminal. */
export function oeffneImBrowser(url: string, plattform: string = process.platform, starte: Starter = spawn as unknown as Starter): string[] {
  const befehl =
    plattform === "darwin" ? ["open", url] : plattform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url];
  try {
    const kind = starte(befehl[0], befehl.slice(1), { stdio: "ignore", detached: true });
    kind.on("error", () => undefined);
    kind.unref();
  } catch {
    // kein Browser erreichbar — die Adresse steht im Terminal
  }
  return befehl;
}
