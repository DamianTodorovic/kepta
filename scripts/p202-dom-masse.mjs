// P202 DOM-Maße: dieselben Griffe auf beiden Seiten (das Mockup-HTML und die
// App) — Position, Größe, Schrift. Die Tabelle nennt die Abweichung je Griff;
// null heißt: die Maße stehen 1:1.
import { spawn } from "node:child_process";

const CHROME = process.env.KEPTA_CHROME
  || "/Users/damiantodorovic/.cache/puppeteer/chrome-headless-shell/mac_arm-152.0.7977.75/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const MOCKUP = process.env.KEPTA_MOCKUP || "/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/p201-redesign/mockup/k3pta-app-fenster.html";
const APP = process.env.KEPTA_APP_URL || "http://localhost:3006";
const CDP_PORT = Number(process.env.KEPTA_CDP || 3990);
const ARBEIT = "/tmp/kepta-dom";

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

// Die Griffe: Name, Mockup-Selektor, App-Selektor. gemessen wird x/y/w/h
// relativ zum Fensterrahmen (.fenster auf der Mockup-Seite, .huelle auf der
// App-Seite — beide beginnen an derselben Ecke).
const GRIFFE = [
  ["titelbalken", ".titelbalken", ".fenster-titelleiste"],
  ["titel", ".fenster-titel", ".fenster-titel"],
  ["nav-spalte", ".nav", ".seiten-leiste"],
  ["suche", ".nav .suche", ".sidebar-suche-feld"],
  ["navi-1-zeile", ".navi button:nth-child(1)", ".sidebar-nav-btn:nth-child(1)"],
  ["navi-2-zeile", ".navi button:nth-child(2)", ".sidebar-nav-btn:nth-child(2)"],
  ["navi-zahl", ".navi button:nth-child(1) .zahl", ".sidebar-nav-btn:nth-child(1) .seiten-zahl"],
  ["tags-kopf", ".nav-sektion", ".seiten-kopf"],
  ["tagzeile-1", ".tagzeile", ".sidebar-tag-btn:nth-of-type(1)"],
  ["nav-fuss", ".nav-fuss", ".nav-fuss-leiste"],
  ["liste-spalte", ".liste", ".listen-spalte"],
  ["listen-kopf", ".listen-kopf", ".listen-kopf"],
  ["listen-titel", ".listen-kopf .titel", ".listen-titel"],
  ["listen-seg", ".listen-seg", ".listen-spalte .apple-seg"],
  ["seg-btn-1", ".listen-seg button:nth-child(1)", ".listen-spalte .apple-seg-btn:nth-child(1)"],
  ["zeile-1", ".zeilen .zeile-item:nth-of-type(1)", ".listen-zeilen .row-entry:nth-of-type(1)"],
  ["zeile-1-titel", ".zeile-item:nth-of-type(1) .titel-zeile", ".listen-zeilen .row-entry:nth-of-type(1) .row-body h3"],
  ["zeile-1-vorschau", ".zeile-item:nth-of-type(1) .vorschau", ".listen-zeilen .row-entry:nth-of-type(1) .row-body p"],
  ["zeile-2", ".zeilen .zeile-item:nth-of-type(2)", ".listen-zeilen .row-entry:nth-of-type(2)"],
  ["listen-fuss", ".listen-fuss", ".listen-fuss"],
  ["detail-kopf", ".detail .detail-kopf", ".detail-spalte .detail-kopf"],
  ["detail-h1", ".detail-korper h1", ".detail-korper h1"],
  ["detail-meta", ".detail-korper .meta", ".detail-meta"],
  ["detail-text", ".detail-korper .koerper-text", ".detail-korper article"],
  ["gruppe-1", ".detail-korper .detail-gruppe", ".detail-korper .detail-gruppe"],
  ["statuszeile", ".statuszeile", ".fenster-status-slot .flaechen-status"],
];

const MESS_AUSDRUCK = (sel,ankerSel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  const anker = document.querySelector(${JSON.stringify(ankerSel)});
  if (!el || !anker) return null;
  const r = el.getBoundingClientRect(), a = anker.getBoundingClientRect();
  const st = getComputedStyle(el);
  return JSON.stringify({ x: +(r.x - a.x).toFixed(1), y: +(r.y - a.y).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fs: st.fontSize, fw: st.fontWeight, lh: st.lineHeight, pad: st.padding, gap: st.gap, br: st.borderRadius, bg: st.backgroundColor, col: st.color });
})()`;

const chrome = spawn(CHROME, [
  "--headless", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
  "--no-first-run", "--disable-gpu", "--window-size=1272,762", "about:blank",
], { stdio: "ignore" });

try {
  const liste = await warteBis(async () => {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    return (await r.json()).find((t) => t.type === "page");
  }, { maxMs: 30000 });
  const cdp = await Cdp.verbindung(liste.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1272, height: 762, deviceScaleFactor: 1, mobile: false });
  const aus = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false });
    return r.result.value;
  };

  // ── Mockup ──
  await cdp.send("Page.navigate", { url: `file://${MOCKUP}?screen=knowledge` });
  await schlafe(900);
  const mock = {};
  for (const [name, mockSel] of GRIFFE) {
    mock[name] = JSON.parse(await aus(MESS_AUSDRUCK(mockSel, ".fenster")) || "null");
  }

  // ── App ──
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1244, height: 734, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Page.navigate", { url: APP });
  await warteBis(async () => (await aus(`document.querySelectorAll(".listen-zeilen .row-entry").length`)) >= 1, { maxMs: 30000 });
  await schlafe(600);
  await aus(`["semantic|#3a6ea8","episodic|#a8742e","procedural|#2e7d5b","reference|#a4553f"].forEach((p) => { const [k,v] = p.split("|"); document.documentElement.style.setProperty("--type-" + k, v); }); localStorage.setItem("ki_gehirn_wizard_dismissed","1");`);
  await aus(`(()=>{ const z = document.querySelector(".listen-zeilen .row-entry"); if (z) z.click(); return "ok"; })()`);
  await schlafe(900);
  const app = {};
  for (const [name, , appSel] of GRIFFE) {
    app[name] = JSON.parse(await aus(MESS_AUSDRUCK(appSel, ".huelle")) || "null");
  }

  // ── die Tabelle ──
  let zeilen = 0;
  for (const [name] of GRIFFE) {
    const m = mock[name], a = app[name];
    if (!m || !a) { console.log(`— ${name}: mockup ${m ? "da" : "FEHLT"}, app ${a ? "da" : "FEHLT"}`); continue; }
    const abw = [];
    for (const f of ["x", "y", "w", "h"]) {
      const d = +(a[f] - m[f]).toFixed(1);
      if (Math.abs(d) > 1.5) abw.push(`${f}: ${m[f]} → ${a[f]} (${d > 0 ? "+" : ""}${d})`);
    }
    if ((m.fs || "") !== (a.fs || "")) abw.push(`fs: ${m.fs} → ${a.fs}`);
    if ((m.fw || "") !== (a.fw || "")) abw.push(`fw: ${m.fw} → ${a.fw}`);
    if (abw.length) { zeilen++; console.log(`${name}: ${abw.join(" · ")}`); }
  }
  console.log(`— ${zeilen} von ${GRIFFE.length} Griffen weichen ab`);
  chrome.kill();
} catch (e) {
  console.error("FEHLER", e);
  chrome.kill();
  process.exit(1);
}
