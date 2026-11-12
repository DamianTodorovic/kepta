// P201: der Apple-Maßstab — jede der 13 Flächen bei vier Fensterbreiten messen.
// Gesucht: seitlicher Überlauf (Elemente über dem rechten Rand), abgeschnittene
// Text-Zeilen ohne Scroll-Grammatik. Das ist der Beweis-Basis für die ehrliche
// Antwort auf "würde Apple das ausliefern?" — kein Detektor, Messung.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const CDP_PORT = 3979;
const ARBEIT = "/tmp/kepta-massstab";
const MOCKUP = process.env.KEPTA_MOCKUP || "/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/p201-redesign/mockup/k3pta-redesign-END.html";
fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(ARBEIT, { recursive: true });

const BREITEN = [1440, 1180, 1024, 820];
const FLAECHEN = ["knowledge", "graph", "chat", "today", "dossier", "activity", "settings", "editor", "preview", "palette", "scan", "duplicates", "setup"];

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

  // die Messung läuft im Seiten-Kontext:
  const MESSUNG = `(() => {
    const vw = document.documentElement.clientWidth;
    const funde = [];
    const gesehn = new Set();
    const nenne = (el) => {
      let s = el.tagName.toLowerCase();
      if (typeof el.className === "string" && el.className) s += "." + el.className.split(/\\s+/).slice(0, 2).join(".");
      return s;
    };
    for (const el of document.querySelectorAll("*")) {
      if (!(el instanceof HTMLElement)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2) continue;
      // 1) ragt über den rechten Rand der Fensterbreite?
      if (r.right > vw + 1) {
        const k = "rand|" + nenne(el);
        if (!gesehn.has(k)) { gesehn.add(k); funde.push({ art: "rand", sel: nenne(el), um: Math.round(r.right - vw) }); }
      }
      // 2) abgeschnittene Text-Zeile ohne Scroll-Grammatik (nur Blätter mit eigenem Text)
      const ox = cs.overflowX;
      if ((ox === "visible" || ox === "hidden" || ox === "clip") && el.children.length === 0 &&
          el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && (el.textContent || "").trim().length > 0) {
        const k = "text|" + nenne(el);
        if (!gesehn.has(k)) { gesehn.add(k); funde.push({ art: "text", sel: nenne(el), fehlt: el.scrollWidth - el.clientWidth }); }
      }
    }
    funde.sort((a, b) => (b.um || 0) + (b.fehlt || 0) - ((a.um || 0) + (a.fehlt || 0)));
    return { vw, dok: document.documentElement.scrollWidth - vw, anzahl: funde.length, funde: funde.slice(0, 8) };
  })()`;

  const zeilen = [];
  for (const b of BREITEN) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: b, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const f of FLAECHEN) {
      await cdp.send("Page.navigate", { url: `file://${MOCKUP}?screen=${f}` });
      await schlafe(650);
      const { result } = await cdp.send("Runtime.evaluate", { expression: MESSUNG, returnByValue: true });
      const m = result.value;
      zeilen.push({ breite: b, flaeche: f, ...m });
    }
  }
  const schlecht = zeilen.filter((z) => z.anzahl > 0 || z.dok > 0);
  console.log(`Gemessen: ${zeilen.length} Flächen-Breiten, davon ${schlecht.length} mit Funden.\n`);
  for (const z of schlecht) {
    console.log(`${z.breite}px ${z.flaeche}: dok+${z.dok} ${z.anzahl} Funde ${z.funde.map((x) => `[${x.art}] ${x.sel}${x.um ? ` +${x.um}px` : ""}${x.fehlt ? ` fehlt ${x.fehlt}px` : ""}`).join(" ")}`);
  }
  if (schlecht.length === 0) console.log("Keine Überläufe — alle 13 Flächen halten alle vier Breiten.");
  fs.writeFileSync(path.join(ARBEIT, "massstab.json"), JSON.stringify(zeilen, null, 2));
} catch (f) {
  console.error("FEHLER:", f.message);
  process.exitCode = 1;
} finally {
  brave.kill("SIGTERM");
  await schlafe(600);
  brave.kill("SIGKILL");
}
