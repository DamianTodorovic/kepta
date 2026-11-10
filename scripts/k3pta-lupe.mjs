// Die Lupe: startet K3PTA mit Fernsteuerung und wacht über der Fläche.
// Damian macht den Blackscreen-Klick — diese Wache fängt den Zustand live
// (DOM, Klassen, Tabs, Speicher, Bild) und schreibt alles in eine Datei.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CDP_PORT = 3996;
const ARBEIT = path.join(os.homedir(), "Desktop", "K3PTA-Lupe");
fs.mkdirSync(ARBEIT, { recursive: true });
const PROTOKOLL = path.join(ARBEIT, "lupe.log");
const log = (z) => { const zl = `[${new Date().toLocaleTimeString("de-DE")}] ${z}`; console.log(zl); fs.appendFileSync(PROTOKOLL, zl + "\n"); };

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
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); this.evente = []; }
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
      } else if (n.method) c.evente.push({ methode: n.method, params: n.params });
    };
    return c;
  }
  send(e, params = {}, timeoutMs = 8000) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      const wache = setTimeout(() => fehler(new Error(`ZEIT ÜBER ${e}`)), timeoutMs);
      this.offen.set(id, { los: (r) => { clearTimeout(wache); los(r); }, fehler: (x) => { clearTimeout(wache); fehler(x); } });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
}
const ausfuhren = async (cdp, ausdruck) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true }, 5000)).result?.value;

const zustand = (cdp) => ausfuhren(cdp, `(()=>{
  const sichtbar = [...document.querySelectorAll('main > div, main [class*=flex-1]')].filter(el => getComputedStyle(el).display !== 'none' && (el.innerText||'').length > 0);
  // P194-Zweite: die Behaelter EXISTIEREN mit Text, aber Damian sieht schwarz —
  // gemessen wird jetzt die SICHTBARKEIT: Position, Groesse, Farbe.
  const gemessen = sichtbar.slice(0, 8).map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.width), h: Math.round(r.height), farbe: s.color, bg: s.backgroundColor, opacity: s.opacity, transform: s.transform.slice(0, 40) };
  });
  return {
    url: location.href,
    fenster: { b: window.innerWidth, h: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
    gemessen,
    tabs: [...document.querySelectorAll('button')].filter(b => /^(System|Artificial|Data|MCP|Sync)/i.test((b.textContent||'').trim())).map(b => (b.textContent||'').trim().slice(0, 18)),
    schalter: [...document.querySelectorAll('input[aria-label^="Search track"]')].map(i => (i.getAttribute('aria-label')||'').replace('Search track: ','')+'='+i.checked).join(','),
    topK: localStorage.getItem('ki_gehirn_topK'),
    tiefe: localStorage.getItem('ki_gehirn_such_tiefe'),
    semantik: localStorage.getItem('ki_gehirn_semantic'),
    tabGespeichert: localStorage.getItem('kepta_einstellungen_tab'),
    ausnahmen: null,
  };
})()`);

async function main() {
  log("Die Lupe startet: K3PTA wird beendet und mit der Lupe neu gestartet.");
  try { const { execSync } = await import("node:child_process"); execSync(`osascript -e 'tell application "K3PTA" to quit'`); } catch { /* lief nicht */ }
  await schlafe(3000);
  const app = spawn("/Applications/K3PTA.app/Contents/MacOS/K3PTA", [`--remote-debugging-port=${CDP_PORT}`], {
    env: { ...process.env }, stdio: ["ignore", "ignore", "ignore"], detached: false,
  });
  app.on("exit", (code, signal) => log(`K3PTA beendet (code=${code} signal=${signal})`));
  await schlafe(9000);

  const endpointPfad = path.join(process.env.HOME ?? "", ".kepta", "endpoint.json");
  const endpoint = JSON.parse(fs.readFileSync(endpointPfad, "utf8"));
  log(`App-Server: ${endpoint.url} (PID ${endpoint.pid})`);

  const ziel = await warteBis(async () => {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
  }, { maxMs: 60000 });
  if (!ziel) { log("KEIN CDP-ZIEL — die Lupe kann nicht lesen. Skript endet."); return; }
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  log("Die Lupe hängt am Fenster. Damian: mach den Blackscreen-Klick — ich fange den Zustand.");

  const start = await zustand(cdp);
  start.ausnahmen = "siehe Folgezeilen";
  log("START-ZUSTAND: " + JSON.stringify(start));

  let gefangen = 0;
  for (let i = 0; i < 900; i++) {
    await schlafe(1000);
    const z = await zustand(cdp).catch((e) => ({ fehler: e.message }));
    if (z.fehler) { log(`[${i}s] LESE-STÖRUNG: ${z.fehler}`); continue; }
    const wache = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
    // Fang-Bedingungen: (a) die sichtbare Fläche hat kaum Text, (b) eine neue Ausnahme
    const ausserhalb = (z.gemessen ?? []).filter((c) => c.b > 0 && (c.y > z.fenster.h || c.y + c.h < 0 || c.x > z.fenster.b || c.x + c.b < 0));
    const unsichtbar = (z.gemessen ?? []).filter((c) => c.b > 0 && c.h > 0 && (c.opacity === '0' || c.farbe === 'rgba(0, 0, 0, 0)'));
    const flaecheArm = z.sichtbareContainer.length === 0 || z.sichtbareContainer.every((c) => c.text.length < 60);
    if ((flaecheArm || ausserhalb.length > 0 || unsichtbar.length > 0 || wache.length > 0) && gefangen < 3) {
      gefangen += 1;
      log(`\n!!! FUNDSACHE #${gefangen} bei ${i}s !!!`);
      log(`Diagnose: ausserhalb ${ausserhalb?.length ?? 0}, unsichtbar ${unsichtbar?.length ?? 0}, flaecheArm ${flaecheArm}`);
      log(JSON.stringify(z, null, 1));
      const tief = await ausfuhren(cdp, `(()=>{
        const sichtbar = [...document.querySelectorAll('main > div, main [class*=flex-1]')].filter(el => getComputedStyle(el).display !== 'none');
        return sichtbar.map(el => ({ klasse: (el.className||'').slice(0, 80), text: (el.innerText||'').replace(/\\n+/g,' | ').slice(0, 300) }));
      })()`).catch((e) => [{ fehler: e.message }]);
      log("TIEF: " + JSON.stringify(tief, null, 1));
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `fundsache-${gefangen}.png`), Buffer.from(b.data, "base64"));
      log(`  Bild: fundsache-${gefangen}.png`);
      if (gefangen === 3) { log("Drei Fundsachen gefangen — die Lupe endet. Damian: schick mir den Ordner K3PTA-Lupe auf dem Desktop."); break; }
    }
    if (i % 15 === 0) log(`[${i}s] lebt | container ${z.sichtbareContainer?.length} | schalter ${z.schalter || '—'} | tabs ${JSON.stringify(z.tabs)}`);
  }
}
main().catch((e) => { log("LUPE-FEHLER: " + e.message); });
