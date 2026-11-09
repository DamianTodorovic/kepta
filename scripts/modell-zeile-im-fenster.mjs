// P183: die Search-Model-Zeile im echten Fenster — Settings → System → Search,
// bei 1440 und 390 px. Gemessen wird, was da steht (Modell + Zahl), ob der Block
// frei anfassbar ist und ob die Breite hält.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_ZEILE_PORT || 3884);
const CDP_PORT = Number(process.env.KEPTA_ZEILE_CDP || 3894);
const ARBEIT = "/tmp/kepta-modell-zeile";
const BREITEN = [[1440, 900], [390, 844]];

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 200 } = {}) {
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
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=1440,900`, "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    for (const [breit, hoch] of BREITEN) {
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
      // Erste Notiz JETZT posten (nach dem App-Start — die Kapsel-Indizierung
      // läuft erst mit dem ersten UI-Zugriff an) und auf die Vektoren warten.
      await fetch(`http://127.0.0.1:${PORT}/api/memories`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "Erste Notiz", content: "Der Anfang vom Bestand." }),
      });
      const gefuellt = await warteBis(async () => {
        const g = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
        return g.embeddings?.embedded >= 1 && Object.keys(g.embeddings?.models ?? {}).length > 0 ? g : null;
      }, { maxMs: 120000 });
      if (!gefuellt) throw new Error(`(${breit}px) die Notiz wurde nicht embedded`);
      console.log(`  (${breit}px) Store gefuellt: ${gefuellt.embeddings.embedded} embedded, Modelle ${JSON.stringify(gefuellt.embeddings.models)}`);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      // Settings öffnen, dann den System-Tab (dort lebt die Search-Sektion).
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));if(!b)throw new Error('kein Settings-Einstieg');b.click();return true})()`);
      await schlafe(700);
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*System\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
      const da = await warteBis(async () => ausfuhren(cdp, `(()=>!!document.querySelector('[data-testid="such-modell"]'))()`), { maxMs: 20000 });
      if (!da) throw new Error(`(${breit}px) die Search-Model-Zeile erschien nicht`);
      // Der Health-Fetch loesst nach dem Tab-Wechsel — der Zeile Zeit geben.
      const mitZahl = await warteBis(async () => {
        const z = await ausfuhren(cdp, `(document.querySelector('[data-testid="such-modell"]')||{innerText:''}).innerText||''`);
        return /\d+ of 15/.test(z) ? z : null;
      }, { maxMs: 8000, schritt: 300 });
      const zustand = await ausfuhren(cdp, `(()=>{
        const k = document.querySelector('[data-testid="such-modell"]');
        k.scrollIntoView({block:'center'});
        const r = k.getBoundingClientRect();
        const e = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
        return {
          text: (k.innerText||'').replace(/\\n+/g,' | ').slice(0, 320),
          frei: !!e && (e === k || k.contains(e)),
          ueberlaufQuer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      })()`);
      const probe = (await cdp.send("Runtime.evaluate", {
        expression: `fetch(window.location.origin + '/api/health').then(r=>r.json()).then(j=>JSON.stringify(j.embeddings || { fehlt: true }))`,
        awaitPromise: true, returnByValue: true,
      })).result?.value;
      console.log("  Health-Probe:", probe);
      const zahlDa = /(\d+ of 15)/.test(zustand.text);
      console.log(`  ${breit}x${hoch}: Modell-Zeile DA, Zahl im Text: ${zahlDa ? "JA" : "NEIN"}, frei anfassbar: ${zustand.frei ? "JA" : "NEIN"}, Überlauf quer: ${zustand.ueberlaufQuer}px`);
      console.log("    " + zustand.text);
      if (!zahlDa) throw new Error(`(${breit}px) die Zeile nennt keine Zahl`);
      if (!zustand.frei) throw new Error(`(${breit}px) der Block ist nicht frei anfassbar`);
      if (zustand.ueberlaufQuer > 0) throw new Error(`(${breit}px) seitlicher Überlauf ${zustand.ueberlaufQuer}px`);
      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `modell-zeile-${breit}.png`), Buffer.from(b.data, "base64"));
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
