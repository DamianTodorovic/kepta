// P202-Foto: das Ist-Bild der echten App — kopfloses Chrome über CDP,
// je Fläche ein Bild in 1440×900. Fährt gegen eine isolierte Instanz
// (KEPTA_APP_URL, default http://localhost:3001).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.KEPTA_CHROME
  || "/Users/damiantodorovic/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.75/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const URL_APP = process.env.KEPTA_APP_URL || "http://localhost:3001";
const CDP_PORT = Number(process.env.KEPTA_CDP || 3978);
const ARBEIT = "/tmp/kepta-p202-foto";
const ZIEL = process.env.KEPTA_FOTO_ZIEL || path.join(process.cwd(), "fotos", "p202-ist");

fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(ARBEIT, { recursive: true });
fs.mkdirSync(ZIEL, { recursive: true });

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 300 } = {}) {
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
  send(e, params = {}, timeoutMs = 20000) {
    const id = ++this.nr;
    const p = new Promise((los, fehler) => {
      this.offen.set(id, { los, fehler });
      setTimeout(() => { if (this.offen.has(id)) { this.offen.delete(id); fehler(new Error("ZEIT UM")); } }, timeoutMs);
    });
    this.ws.send(JSON.stringify({ id, method: e, params }));
    return p;
  }
}

const chrome = spawn(CHROME, [
  "--headless", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
  "--no-first-run", "--disable-gpu", "--window-size=1440,900", "about:blank",
], { stdio: "ignore" });

try {
  const liste = await warteBis(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const j = await r.json();
    return j.find((t) => t.type === "page");
  }, { maxMs: 30000 });
  if (!liste) throw new Error("kein Tab");
  const cdp = await Cdp.verbindung(liste.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await cdp.send("Page.navigate", { url: URL_APP });

  // bis die Leiste steht
  await warteBis(async () => {
    const r = await cdp.send("Runtime.evaluate", { expression: "!!document.querySelector('.seiten-leiste')", returnByValue: true });
    return r.result.value === true;
  }, { maxMs: 45000 });
  await schlafe(1200);

  const aus = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
    return r.result.value;
  };
  const klick = (selector) => aus(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return "fehlt";el.click();return "ok";})()`);
  const foto = async (name) => {
    await schlafe(650);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ZIEL, `${name}.png`), Buffer.from(shot.data, "base64"));
    console.log("foto", name);
  };

  // 1. Setup — der Wizard steht beim ersten Start über der Fläche
  const wizardDa = await aus(`!!document.querySelector('[aria-label="Set up K3PTA"]')`);
  if (wizardDa) {
    await foto("setup");
    await klick(`[aria-label="Set up K3PTA"] button[data-testid="wizard-spaeter"], [aria-label="Set up K3PTA"] .btn-ghost`);
    await schlafe(400);
  }

  // 2. die Flächen über die Leiste
  for (const [name, label] of [
    ["knowledge", "Knowledge"], ["today", "Today"], ["chat", "Chat"], ["graph", "Graph"],
    ["dossier", "Dossier"], ["activity", "Activity"], ["settings", "Settings"],
  ]) {
    await klick(`[aria-label="${label}"]`);
    await schlafe(name === "graph" ? 1500 : 600);
    await foto(name);
  }

  // 3. editor: auf Knowledge den Stift im Detail-Kopf
  await klick(`[aria-label="Knowledge"]`);
  await schlafe(500);
  await klick(`[aria-label="Edit"]`);
  await schlafe(500);
  await foto("editor");
  await klick(`[aria-label="Close editor"]`);

  // 4. palette über ⌘K (window keydown)
  await schlafe(400);
  await cdp.send("Runtime.evaluate", { expression: `window.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))` });
  await schlafe(500);
  await foto("palette");
  await cdp.send("Runtime.evaluate", { expression: `window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))` });
  await schlafe(300);

  // 5. scan + duplicates über die Listen-Köpfe
  await klick(`[aria-label="Import"]`);
  await schlafe(700);
  await foto("scan");
  await klick(`[aria-label="Close"]`);
  await schlafe(300);

  await klick(`[aria-label="Scan for duplicates"], [aria-label="Duplicates"]`);
  await schlafe(700);
  await foto("duplicates");

  chrome.kill();
  console.log("FERTIG", ZIEL);
} catch (e) {
  console.error("FEHLER", e);
  chrome.kill();
  process.exit(1);
}
