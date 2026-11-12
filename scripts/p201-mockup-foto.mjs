// P201: die Mockup-Fotos — kopfloser Brave über CDP (bewährtes Gestell),
// je Screen ein Bild in 1440×900.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const CDP_PORT = 3977;
const ARBEIT = "/tmp/kepta-mock-foto";
const MOCKUP = "/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/p201-redesign/mockup/k3pta-redesign.html";
const ZIEL = path.dirname(MOCKUP);
fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(ARBEIT, { recursive: true });

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 400 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
}
class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => {
      const w = new WebSocket(url);
      w.onopen = () => los(w);
      w.onerror = (e) => fehler(e.error || new Error("ws fehlgeschlagen"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const n = JSON.parse(e.data);
      if (n.id && c.offen.has(n.id)) {
        const { los, fehler } = c.offen.get(n.id);
        c.offen.delete(n.id);
        if (n.error) fehler(new Error(n.error.message)); else los(n.result);
      }
    };
    return c;
  }
  send(e, params = {}, timeoutMs = 15000) {
    const id = ++this.nr;
    const p = new Promise((los, fehler) => {
      this.offen.set(id, { los, fehler });
      setTimeout(() => { if (this.offen.has(id)) { this.offen.delete(id); fehler(new Error("ZEIT UM")); } }, timeoutMs);
    });
    this.ws.send(JSON.stringify({ id, method: e, params }));
    return p;
  }
}

const brave = spawn(BRAVE, [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
  "--no-first-run", "--disable-gpu", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

try {
  const stelle = await warteBis(async () => {
    const liste = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return liste.find((t) => t.type === "page");
  }, { maxMs: 45000 });
  const cdp = await Cdp.verbindung(stelle.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const s of ["knowledge", "graph", "chat", "today", "settings"]) {
    await cdp.send("Page.navigate", { url: `file://${MOCKUP}?screen=${s}` });
    await schlafe(1400);
    const b = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ZIEL, `mock-${s}.png`), Buffer.from(b.data, "base64"));
    console.log(`Foto: mock-${s}.png`);
  }
} catch (f) {
  console.error("FEHLER:", f.message);
  process.exitCode = 1;
} finally {
  brave.kill("SIGTERM");
  await schlafe(600);
  brave.kill("SIGKILL");
}
