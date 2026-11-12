// P194: die Live-Wache — Damian klickt, die Wache liest jeden Zustandswechsel
// live und fängt beim Leerwerden den vollen Zustand (DOM, localStorage, Klassen).
import fs from "node:fs";
import path from "node:path";

const CDP_PORT = 3996;
const ARBEIT = "/tmp/kepta-live-wache";
fs.mkdirSync(ARBEIT, { recursive: true });

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 30000, schritt = 400 } = {}) {
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
      const wache = setTimeout(() => fehler(new Error(`ZEIT ÜBER: ${e}`)), timeoutMs);
      this.offen.set(id, { los: (r) => { clearTimeout(wache); los(r); }, fehler: (x) => { clearTimeout(wache); fehler(x); } });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
}
const ausfuhren = async (cdp, ausdruck) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true }, 5000)).result?.value;

const zustand = (cdp) => ausfuhren(cdp, `(()=>{
  const main = document.querySelector('main');
  const settingsTabs = [...document.querySelectorAll('button')].filter(b => b.className.includes('settings')).length;
  return {
    mainTextLaenge: main ? (main.innerText||'').length : -1,
    mainText: main ? (main.innerText||'').replace(/\\n+/g,' | ').slice(0, 150) : '(kein main)',
    suchModell: !!document.querySelector('[data-testid="such-modell"]'),
    settingsTabs,
    schalter: [...document.querySelectorAll('input[aria-label^="Search track"]')].map(i => (i.getAttribute('aria-label')||'').replace('Search track: ','')+'='+i.checked).join(','),
    localStoragePrefs: JSON.stringify(Object.fromEntries(['ki_gehirn_spur_bm25','ki_gehirn_spur_vektor','ki_gehirn_spur_graph','ki_gehirn_such_tiefe','ki_gehirn_topK','einstellungen-tab'].map(k => [k, localStorage.getItem(k)]))),
    check: document.querySelectorAll('input[type=checkbox]').length,
    buttons: document.querySelectorAll('button').length,
  };
})()`);

async function main() {
  const ziel = await warteBis(async () => {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
  }, { maxMs: 30000 });
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");
  console.log("WACHE OFFEN — Damian klickt jetzt.");
  const startZustand = await zustand(cdp);
  console.log("START:", JSON.stringify(startZustand, null, 1));

  let leerGefangen = false;
  for (let i = 0; i < 600; i++) {
    await schlafe(1000);
    const z = await zustand(cdp).catch((e) => ({ fehler: e.message }));
    if (z.fehler) { console.log(`[${i}s] LESE-FEHLER: ${z.fehler}`); continue; }
    // Das Leer-Signal: das main-Inhaltsfeld wird leer (unter 40 Zeichen), während der Sidebar-Text steht.
    if (!leerGefangen && z.mainTextLaenge >= 0 && z.mainTextLaenge < 40) {
      leerGefangen = true;
      console.log(`\n!!! LEER GEFANGEN bei ${i}s !!!`);
      console.log(JSON.stringify(z, null, 1));
      const tief = await ausfuhren(cdp, `(()=>{
        const main = document.querySelector('main');
        return {
          mainKinder: main ? main.children.length : -1,
          mainHTML: main ? main.innerHTML.slice(0, 400) : '',
          rootKinder: document.getElementById('root')?.children.length ?? -1,
          rootText: (document.getElementById('root')?.innerText||'').length,
        };
      })()`);
      console.log("TIEF:", JSON.stringify(tief, null, 1));
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, "leer-gefangen.png"), Buffer.from(b.data, "base64"));
      console.log("  Bild: " + path.join(ARBEIT, "leer-gefangen.png"));
      break;
    }
    if (i % 10 === 0) console.log(`[${i}s] lebt | main ${z.mainTextLaenge} | tabs ${z.settingsTabs} | schalter ${z.schalter || '—'} | suchModell ${z.suchModell}`);
  }
}
main().catch((e) => { console.log("WACHEN-FEHLER: " + e.message); process.exitCode = 1; });
