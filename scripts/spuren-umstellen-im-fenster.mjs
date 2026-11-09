// P185: der Spuren-Blackscreen — Reproduktion ohne flaky Klicks.
// Der Schalter in den Einstellungen tut genau dies: localStorage setzen und das
// SUCH_PREFS_EVENT feuern. Genau das wird hier direkt getriggert (gleiche Kette,
// gleiche Reihenfolge), und nach jedem Schritt wird gemessen: lebt die Fläche,
// welche Ausnahme kam, und ein Bild. Zuerst auf dem Dashboard (der Hörer sitzt
// dort), dann in den Settings (System-Tab, dort steht der Schalter).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_SPUR_PORT || 3924);
const CDP_PORT = Number(process.env.KEPTA_SPUR_CDP || 3934);
const ARBEIT = "/tmp/kepta-spur-umstellen";
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
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true })).result?.value;

async function main() {
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });
  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diener.on("exit", (code, signal) => console.log(`!!! SERVER GESTORBEN code=${code} signal=${signal}`));
  let brave = null;
  try {
    await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok; }, { maxMs: 60000 });
    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    // Notiz rein (nach dem App-Start — die Kapsel-Indizierung läuft mit dem
    // ersten UI-Zugriff an), damit die Suche echte Ergebnisse reift.
    await fetch(`http://127.0.0.1:${PORT}/api/memories`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Erste Notiz", content: "Der Anfang vom Bestand." }),
    });

    for (const [breit, hoch] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      for (const ort of ["dashboard", "settings"]) {
        await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
        await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
        await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
        await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
        await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
        const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
        if (schritt) {
          await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
          await schlafe(400);
        }
        if (ort === "settings") {
          await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
          await schlafe(600);
          await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button[aria-pressed]')].find(x=>/^\\s*System\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
          await schlafe(600);
        }
        console.log(`\n  ${breit}x${hoch} · ${ort}:`);
        // Mit aktiver Suche: der Suchbegriff steht im Feld, jede Kombination der
        // drei Spuren wird durchgefahren — die Ergebnis-Flaeche re-rendert je Schritt.
        await ausfuhren(cdp, `(()=>{const f=document.querySelector('input[placeholder*="Search"]');if(f){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(f,'Bestand');f.dispatchEvent(new Event('input',{bubbles:true}));}return true})()`);
        await schlafe(1200);
        const kombis = [];
        for (const b of [1, 0]) for (const v of [1, 0]) for (const g of [1, 0]) kombis.push([b, v, g]);
        const schritte = kombis.map(([b, v, g]) =>
          [`Spuren ${b}/${v}/${g}`, `localStorage.setItem('ki_gehirn_spur_bm25','${b}');localStorage.setItem('ki_gehirn_spur_vektor','${v}');localStorage.setItem('ki_gehirn_spur_graph','${g}')`]);
        for (const [name, satz] of schritte) {
          await ausfuhren(cdp, `(()=>{${satz};window.dispatchEvent(new CustomEvent('kepta_such_prefs'));return true})()`);
          await schlafe(800);
          const lebt = await ausfuhren(cdp, `document.querySelectorAll('button').length > 0 && document.body.innerText.length > 40`);
          const url = await ausfuhren(cdp, `window.location.href`);
          const ausnahmen = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
          const letzte = ausnahmen.slice(-1).map((m) => {
            const p = m.params?.exceptionDetails || {};
            return String(p.exception?.description || p.text || "").split("\n").slice(0, 2).join(" | ").slice(0, 250);
          });
          console.log(`    ${name}: am Leben ${lebt ? "JA" : "NEIN (BLACKSCREEN)"} | URL ${String(url).slice(0, 60)} | Ausnahmen ${ausnahmen.length}`);
          for (const l of letzte) if (l) console.log("      * " + l);
          const b = await cdp.send("Page.captureScreenshot", { format: "png" });
          fs.writeFileSync(path.join(ARBEIT, `trigger-${ort}-${name.replace(/[^a-zA-Z0-9]+/g, "-")}-${breit}.png`), Buffer.from(b.data, "base64"));
        }
      }
    }
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
