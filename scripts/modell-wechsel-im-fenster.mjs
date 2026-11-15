// P184: der Such-Modell-Wechsel im echten Fenster — Settings → Search, Select auf
// bge-m3, Apply, dann misst der Lauf: die Meldung erscheint, /api/health nennt
// bge-m3 als Modell, die Search-Model-Zeile liest sich neu. 1440 und 390 px.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_WECHSEL_PORT || 3904);
const CDP_PORT = Number(process.env.KEPTA_WECHSEL_CDP || 3914);
const ARBEIT = "/tmp/kepta-modell-wechsel";

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
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); this.evente = []; }
  static async verbindung(url) {
    const ws = await new Promise((los, fehler) => {
      const w = new WebSocket(url);
      w.onopen = () => los(w);
      w.onerror = (e) => fehler(e.error || new Error("websocket fehlgeschlagen"));
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
  send(e, params = {}) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      this.offen.set(id, { los, fehler });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
}
const ausfuhren = async (cdp, ausdruck) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true })).result?.value;

async function main() {
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });
  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let brave = null;
  try {
    await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok; }, { maxMs: 60000 });
    console.log("  Diener bereit.");
    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    for (const [breit, hoch] of [[1440, 900], [390, 844]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
      if (schritt) {
        await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
        await schlafe(500);
      }
      // Notiz JETZT (nach dem App-Start) + embedded warten.
      await fetch(`http://127.0.0.1:${PORT}/api/memories`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Erste Notiz", content: "Der Anfang vom Bestand." }),
      });
      const gefuellt = await warteBis(async () => {
        const g = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
        return g.embeddings?.embedded >= 1 && Object.keys(g.embeddings?.models ?? {}).length > 0;
      }, { maxMs: 120000 });
      if (!gefuellt) throw new Error(`(${breit}px) die Notiz wurde nicht embedded`);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });

      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));if(!b)throw new Error('kein Settings-Einstieg');b.click();return true})()`);
      await schlafe(700);
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*System\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
      await warteBis(async () => ausfuhren(cdp, `(()=>!!document.querySelector('[data-testid="such-modell-wechsel"]'))()`), { maxMs: 20000 });
      // Select auf bge-m3 stellen (React: nativer Setter + change-Ereignis).
      await ausfuhren(cdp, `(()=>{
        const s = document.querySelector('[data-testid="such-modell-wechsel"] select');
        if (!s) throw new Error('kein Select');
        const ziel = [...s.options].find(o => o.value.startsWith('bge-m3'));
        if (!ziel) throw new Error('bge-m3 fehlt in der Liste');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
        setter.call(s, ziel.value);
        s.dispatchEvent(new Event('change', { bubbles: true }));
        return ziel.value;
      })()`);
      await ausfuhren(cdp, `(()=>{
        const b = document.querySelector('[data-testid="such-modell-wechsel"] button');
        if (!b) throw new Error('kein Apply');
        b.click(); return true;
      })()`);
      // Auf die Meldung + das neue Modell in health warten (Re-Einbettung 1 Notiz — schnell).
      const meldung = await warteBis(async () => {
        const m = await ausfuhren(cdp, `(()=>{const k=[...document.querySelectorAll('[role="status"]')].map(x=>x.innerText||'').find(t=>t.includes('Switched to'));return k||null})()`);
        return m || null;
      }, { maxMs: 20000 });
      const neu = await warteBis(async () => {
        const g = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
        return (g.embeddings?.models ?? {})["bge-m3"] >= 1 ? g : null;
      }, { maxMs: 120000 });
      if (!meldung) throw new Error(`(${breit}px) die Wechsel-Meldung erschien nicht`);
      if (!neu) throw new Error(`(${breit}px) health nennt bge-m3 nicht als Modell`);
      // Die Zeile liest sich neu (Modell + Profil bge).
      const zeile = await ausfuhren(cdp, `(()=>{const k=document.querySelector('[data-testid="such-modell"]');if(!k)return null;k.scrollIntoView({block:'center'});const r=k.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {frei:!!e&&(e===k||k.contains(e)),ueberlauf:document.documentElement.scrollWidth-document.documentElement.clientWidth,text:(k.innerText||'').replace(/\\n+/g,' | ').slice(0,260)}})()`);
      if (!zeile) throw new Error(`(${breit}px) die Zeile ist weg`);
      if (!/bge-m3/.test(zeile.text)) throw new Error(`(${breit}px) die Zeile nennt bge-m3 nicht: ${zeile.text}`);
      console.log(`  ${breit}x${hoch}: Wechsel OK — Meldung: ${meldung.slice(0, 110)}`);
      console.log(`    Zeile: ${zeile.text}`);
      console.log(`    frei anfassbar: ${zeile.frei ? "JA" : "NEIN"}, Überlauf quer: ${zeile.ueberlauf}px`);
      if (!zeile.frei) throw new Error(`(${breit}px) der Wechsler ist nicht frei anfassbar`);
      if (zeile.ueberlauf > 0) throw new Error(`(${breit}px) seitlicher Überlauf ${zeile.ueberlauf}px`);
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `wechsel-${breit}.png`), Buffer.from(b.data, "base64"));
    }
    console.log("  Protokoll-Ereignisse: " + cdp.evente.filter((e) => e.methode === "Log.entryAdded" || e.methode === "Runtime.exceptionThrown").length);
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
