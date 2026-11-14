// P202 Pixel-Abnahme: Mockup und App bei denselben Innenmaßen (1412×872 —
// das .fenster des Mockups bei 1440 Breite), übereinander gelegt, Differenz
// pro Pixel gezählt (Toleranz 12/255), Heat-Map geschrieben, die Regionen
// (Spalten- und Zeilen-Bänder) benannt — die Messung sagt WO die Abweichung sitzt.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = process.env.KEPTA_CHROME
  || "/Users/damiantodorovic/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.75/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const MOCKUP = process.env.KEPTA_MOCKUP || "/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/p201-redesign/mockup/k3pta-app-fenster.html";
const APP = process.env.KEPTA_APP_URL || "http://localhost:3006";
const CDP_PORT = Number(process.env.KEPTA_CDP || 3991);
const ARBEIT = "/tmp/kepta-pixel";
const FLAECHE = process.env.KEPTA_FLAECHE || "knowledge";

fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(ARBEIT, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), "fotos", "p202-pixel"), { recursive: true });

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
  send(e, params = {}, timeoutMs = 25000) {
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
  "--no-first-run", "--disable-gpu", "--window-size=1272,762", "about:blank",
], { stdio: "ignore" });

try {
  const liste = await warteBis(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    return (await r.json()).find((t) => t.type === "page");
  }, { maxMs: 30000 });
  if (!liste) throw new Error("kein Tab");
  const cdp = await Cdp.verbindung(liste.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1244, height: 734, deviceScaleFactor: 1, mobile: false });

  const aus = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
    return r.result.value;
  };

  // ── 1. das MOCKUP fotografiert, cropped auf die .fenster-Bounds ──
  await cdp.send("Page.navigate", { url: `file://${MOCKUP}?screen=${FLAECHE}` });
  await schlafe(900);
  const mockShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARBEIT, "mockup-voll.png"), Buffer.from(mockShot.data, "base64"));
  const bounds = await aus(`JSON.stringify((() => { const r = document.querySelector(".fenster").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })())`);
  const b = JSON.parse(bounds);
  const mockCrop = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
  fs.writeFileSync(path.join(ARBEIT, "mockup.png"), Buffer.from(mockCrop.data, "base64"));

  // ── 2. die APP: der gleiche Rahmen (die App-Viewport = das Mockup-Fenster-Maß
  //     1244×734 — die App hat keinen 14px-Body-Rand), die erste Zeile aktiv ──
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1244, height: 734, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: APP });
  await warteBis(async () => (await aus(`!!document.querySelector(".listen-zeilen")`)) === true, { maxMs: 30000 });
  // Die Ersteinrichtung der frischen Instanz räumt der dismissed-Merker weg —
  // die Assistent-Messung fährt separat (KEPTA_FLAECHE=setup).
  await aus(`localStorage.setItem("ki_gehirn_wizard_dismissed","1"); localStorage.setItem("kepta_scan_wunsch","0"); location.reload(); "geladen"`);
  await schlafe(1800);
  await warteBis(async () => (await aus(`document.querySelectorAll(".listen-zeilen .row-entry").length`)) >= 1, { maxMs: 30000 });
  await schlafe(900);
  // die Mockup-Farben der vier Kinds (die Settings-Wahl der Mess-Instanz)
  await aus(`["semantic|#3a6ea8","episodic|#a8742e","procedural|#2e7d5b","reference|#a4553f"].forEach((p) => { const [k,v] = p.split("|"); document.documentElement.style.setProperty("--type-" + k, v); }); localStorage.setItem("ki_gehirn_gruppierung","alle");`);
  await aus(`(()=>{ const z = document.querySelector(".listen-zeilen .row-entry"); if (z) z.click(); return z ? "geklickt" : "keine Zeile"; })()`);
  await schlafe(900);
  const appShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARBEIT, "app.png"), Buffer.from(appShot.data, "base64"));

  // ── 3. der DIFFER: Canvas im Chrome, Pixel-Differenz, Heat-Map, Regionen ──
  const mockB64 = fs.readFileSync(path.join(ARBEIT, "mockup.png")).toString("base64");
  const appB64 = fs.readFileSync(path.join(ARBEIT, "app.png")).toString("base64");
  const differR = await cdp.send("Runtime.evaluate", { expression: `(async () => {
    const lad = (b64) => new Promise((los) => { const i = new Image(); i.onload = () => los(i); i.src = "data:image/png;base64," + b64; });
    const a = await lad(${JSON.stringify(mockB64)});
    const b = await lad(${JSON.stringify(appB64)});
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
    x.drawImage(a, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h);
    x.drawImage(b, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    const hit = x.createImageData(w, h);
    let differenz = 0;
    const spalten = new Array(w).fill(0), zeilen = new Array(h).fill(0);
    for (let i = 0, p = 0; i < w * h * 4; i += 4, p++) {
      const d = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]);
      if (d > 36) {
        differenz++;
        const xx = p % w, yy = (p / w) | 0;
        spalten[xx]++; zeilen[yy]++;
        hit.data[i] = 255; hit.data[i+1] = 0; hit.data[i+2] = 0; hit.data[i+3] = 255;
      }
    }
    x.putImageData(hit, 0, 0);
    const bands = (arr, n) => { const out = []; const breite = Math.ceil(arr.length / n); for (let i = 0; i < arr.length; i += breite) { let s = 0; for (let j = i; j < Math.min(i + breite, arr.length); j++) s += arr[j]; out.push(s); } return out; };
    return JSON.stringify({
      masse: { w, h, gesamt: w * h },
      differenz,
      anteil: (differenz / (w * h) * 100).toFixed(2) + " %",
      spalten: bands(spalten, 12),
      zeilen: bands(zeilen, 8),
    });
  })()`, returnByValue: true, awaitPromise: true });
  const differWert = differR.result.value;
  fs.writeFileSync(path.join(ARBEIT, "differ.json"), differWert);
  const d = JSON.parse(differWert);
  const heatR = await cdp.send("Runtime.evaluate", { expression: `(async () => {
    const lad = (b64) => new Promise((los) => { const i = new Image(); i.onload = () => los(i); i.src = "data:image/png;base64," + b64; });
    const a = await lad(${JSON.stringify(mockB64)}); const b = await lad(${JSON.stringify(appB64)});
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(a, 0, 0); const pa = x.getImageData(0, 0, w, h).data;
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(b, 0, 0); const pb = x.getImageData(0, 0, w, h).data;
    const hit = x.createImageData(w, h);
    for (let i = 0, p = 0; i < w * h * 4; i += 4, p++) {
      const diff = Math.abs(pa[i]-pb[i]) + Math.abs(pa[i+1]-pb[i+1]) + Math.abs(pa[i+2]-pb[i+2]);
      hit.data[i] = (pa[i] * 0.55) | 0; hit.data[i+1] = (pa[i+1] * 0.55) | 0; hit.data[i+2] = (pa[i+2] * 0.55) | 0; hit.data[i+3] = 255;
      if (diff > 36) { hit.data[i] = 226; hit.data[i+1] = 64; hit.data[i+2] = 43; }
    }
    x.putImageData(hit, 0, 0);
    return c.toDataURL("image/png").split(",")[1];
  })()`, returnByValue: true, awaitPromise: true });
  const heat = heatR.result.value;
  fs.writeFileSync(path.join(process.cwd(), "fotos", "p202-pixel", `${FLAECHE}-heat.png`), Buffer.from(heat, "base64"));
  fs.writeFileSync(path.join(process.cwd(), "fotos", "p202-pixel", `${FLAECHE}-app.png`), Buffer.from(appB64, "base64"));
  fs.writeFileSync(path.join(process.cwd(), "fotos", "p202-pixel", `${FLAECHE}-mockup.png`), Buffer.from(mockB64, "base64"));

  console.log(`FLAECHE ${FLAECHE}: ${d.differenz} von ${d.masse.gesamt} Pixeln differieren (${d.anteil})`);
  console.log("Spalten-Bänder (12×", Math.ceil(d.masse.w / 12), "px):", d.spalten.join(" | "));
  console.log("Zeilen-Bänder (8×", Math.ceil(d.masse.h / 8), "px):", d.zeilen.join(" | "));
  chrome.kill();
} catch (e) {
  console.error("FEHLER", e);
  chrome.kill();
  process.exit(1);
}
