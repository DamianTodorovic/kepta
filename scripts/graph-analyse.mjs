// eslint-disable-disable-file: Probe-Werkzeug, kein Produktionscode
/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars, no-empty */
// P196: die Graph-Analyse — Gruppen-Farben ändern (echter Eingabe-Weg), Bild davor/danach.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const PORT = 3986, CDP = 3985, ARBEIT = "/tmp/kepta-graph";
fs.rmSync(ARBEIT, { recursive: true, force: true });
fs.mkdirSync(ARBEIT, { recursive: true });
const log = (z) => console.log(`[${new Date().toLocaleTimeString("de-DE")}] ${z}`);
const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 500 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) { try { const v = await fn(); if (v) return v; } catch { /* noch nicht */ } if (Date.now() > bis) return null; await schlafe(schritt); }
}
class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); this.evente = []; }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => { const w = new WebSocket(url); w.onopen = () => los(w); w.onerror = (e) => fehler(e.error || new Error("ws")); });
    const c = new Cdp(ws);
    ws.onmessage = (e) => { const n = JSON.parse(e.data); if (n.id && c.offen.has(n.id)) { const { los, fehler } = c.offen.get(n.id); c.offen.delete(n.id); n.error ? fehler(new Error(n.error.message)) : los(n.result); } else if (n.method) c.evente.push({ m: n.method, p: n.params }); };
    return c;
  }
  send(m, p = {}, t = 10000) { const id = ++this.nr; return new Promise((los, fehler) => { const w = setTimeout(() => fehler(new Error("ZEIT " + m)), t); this.offen.set(id, { los: (r) => { clearTimeout(w); los(r); }, fehler: (x) => { clearTimeout(w); fehler(x); } }); this.ws.send(JSON.stringify({ id, method: m, params: p })); }); }
}
const ausf = async (c, a, t = 10000) => { const r = await c.send("Runtime.evaluate", { expression: a, returnByValue: true, awaitPromise: true }, t); if (r.exceptionDetails) throw new Error(String(r.exceptionDetails?.exception?.description || "").slice(0, 250)); return r.result?.value; };
const bild = async (c, name) => { const b = await c.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARBEIT, name), Buffer.from(b.data, "base64")); log("Bild: " + name); };

async function main() {
  // Der Diener bleibt für die weiteren Griffe absichtlich oben.
  const diener = spawn("node", [path.join(WURZEL, "dist", "server.cjs")], {
    cwd: WURZEL, env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"],
  });
  await warteBis(async () => ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok), { maxMs: 60000 });
  void diener;
  log("Server bereit. Importiere Notizen mit Gruppen-Tags ...");
  const tags = ["md", "json", "txt", "maschine", "recherche", "fristen"];
  const dateien = [];
  for (let i = 0; i < 1200; i++) {
    const tag = tags[i % tags.length];
    dateien.push({ name: `G/${tag}-${String(i + 1).padStart(4, "0")}.${tag === "json" ? "json" : tag === "txt" ? "txt" : "md"}`,
      content: ["---", `kepta_id: gr-${String(i + 1).padStart(4, "0")}`, `title: "Gruppen-Notiz ${tag} ${i + 1}"`, `tags: ["${tag}", "graph"]`, `created: 1759000000`, `updated: 1759000000`, "---", "",
        `Inhalt der Gruppen-Notiz ${i + 1} über ${(i % 3 === 0) ? "Konzept Alpha" : (i % 3 === 1) ? "Konzept Beta" : "Konzept Gamma"} und Fristen. [[Konzept ${(i % 3 === 0) ? "Alpha" : (i % 3 === 1) ? "Beta" : "Gamma"}]]`].join("\n") });
  }
  for (let i = 0; i < dateien.length; i += 4000) {
    await fetch(`http://127.0.0.1:${PORT}/api/import/markdown`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien.slice(i, i + 4000) }) });
  }
  log("Import fertig.");
  const brave = spawn("/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", ["--headless=new", `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`, "--no-first-run", "--disable-gpu", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
  const ziel = await warteBis(async () => { const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); return l.find(z => z.type === "page" && z.webSocketDebuggerUrl) || null; }, { maxMs: 90000 });
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await warteBis(async () => (await ausf(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
  await ausf(cdp, `localStorage.setItem('ki_gehirn_wizard_dismissed','1');1`);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await warteBis(async () => (await ausf(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
  await schlafe(2000);
  // Zum Graphen navigieren (echter Klick auf die Seitenleiste)
  await ausf(cdp, `(()=>{ const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Graph'); if(b) b.click(); return !!b; })()`);
  await schlafe(4000);
  await bild(cdp, "graph-ist.png");
  // Das Regal: die Farb-Eingaben lesen
  const regal = await ausf(cdp, `(()=>{
    const eingaben = [...document.querySelectorAll('input[type="color"]')].map(i => ({ wert: i.value, label: i.getAttribute('aria-label'), testid: i.getAttribute('data-testid') }));
    return { anzahl: eingaben.length, eingaben: eingaben.slice(0, 8), kanal: (document.querySelector('[data-testid*="kanal"],[aria-label*="channel" i]')?.textContent || '').slice(0, 60) };
  })()`);
  console.log("REGAL:", JSON.stringify(regal, null, 1));
  if (regal.anzahl > 0) {
    // FALL A: eine Farbe ändern — der echte React-Weg (native Setter + input+change)
    const ergebnis = await ausf(cdp, `(()=>{
      const i = document.querySelector('input[type="color"]');
      const alt = i.value; const neu = '#123456';
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(i, neu);
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
      return { alt, neu, direktNachher: i.value };
    })()`);
    await schlafe(1500);
    const nachher = await ausf(cdp, `(()=>({ eingabe: document.querySelector('input[type="color"]').value, speicher: localStorage.getItem('kepta_gruppen') || localStorage.getItem('ki_gehirn_gruppen') || JSON.stringify(Object.keys(localStorage)) }))()`);
    console.log("FALL A (Farbe ändern):", JSON.stringify({ ergebnis, nachher }, null, 1));
    await bild(cdp, "graph-nach-farbe.png");
  }
  log("Analyse-Ende (Server+Brave laufen für weitere Schritte weiter).");
}
main().catch(e => console.log("FEHLER:", e.message));
