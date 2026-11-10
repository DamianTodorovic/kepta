// P193 zweiter Lauf: der Klick im ECHTEN ELECTRON-Fenster (Kapsel-HOME, CDP).
// Gemessen wird pro Schritt: Antwortet die Oberfläche noch (evaluate mit Zeit),
// welche Ausnahmen kamen, und ein Bild. Friert sie ein, sehen wir es hier.
import fs from "node:fs";
import path from "node:path";

const CDP_PORT = 3984;
const ARBEIT = "/tmp/kepta-elektron";
const ANZAHL = 2000;

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
  send(e, params = {}, timeoutMs = 15000) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      const wache = setTimeout(() => fehler(new Error(`ZEIT ÜBER: ${e} nach ${timeoutMs} ms — die Fläche hängt!`)), timeoutMs);
      this.offen.set(id, { los: (r) => { clearTimeout(wache); los(r); }, fehler: (x) => { clearTimeout(wache); fehler(x); } });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
}
const ausfuhren = async (cdp, ausdruck, timeoutMs = 15000) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true }, timeoutMs)).result?.value;

async function main() {
  const endpoint = JSON.parse(fs.readFileSync(path.join(ARBEIT, "h", ".kepta", "endpoint.json"), "utf8"));
  console.log("  App-Server:", endpoint.url, "| PID:", endpoint.pid);
  const ziel = await warteBis(async () => {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
  }, { maxMs: 60000 });
  if (!ziel) throw new Error("kein CDP-Ziel");
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  console.log("  CDP verbunden mit dem Electron-Fenster.");

  // 2000 Notizen importieren (der Bestand, damit die Such-Fläche echtes Material hat)
  const dateien = [];
  for (let i = 0; i < ANZAHL; i++) {
    dateien.push({
      name: `S/${String(i + 1).padStart(5, "0")}.md`,
      content: ["---", `kepta_id: el-${String(i + 1).padStart(5, "0")}`, `title: "Elektron-Notiz ${i + 1}"`,
        `tags: ["klick"]`, `created: 1759000000`, `updated: 1759000000`, "---", "",
        `Inhalt der Elektron-Notiz ${i + 1} über Suche und Klick. [[suche]]`].join("\n"),
    });
  }
  for (let i = 0; i < dateien.length; i += 5000) {
    await fetch(`${endpoint.url}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien.slice(i, i + 5000) }),
    });
  }
  console.log("  Import fertig:", ANZAHL, "Notizen");

  // Die App auf die Settings-Seite bringen (sie startet auf Knowledge).
  await ausfuhren(cdp, `(()=>{
    localStorage.clear();
    const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));
    if(b)b.click(); return true;
  })()`);
  await schlafe(1200);
  await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*System\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
  const sektion = await warteBis(async () => ausfuhren(cdp, `(()=>!!document.querySelector('[data-testid="such-modell"]'))()`, 10000), { maxMs: 20000 });
  console.log("  Search-Sektion:", sektion ? "DA" : "FEHLT");
  if (!sektion) throw new Error("die Sektion kam im Electron-Fenster nicht");

  // Der ECHTE Klick auf den Words-Schalter — mit Zeitmessung.
  const t0 = Date.now();
  const klick = await ausfuhren(cdp, `(()=>{
    const input = document.querySelector('input[aria-label="Search track: words"]');
    if (!input) return 'KEIN INPUT';
    input.click();
    return 'geklickt, checked=' + input.checked;
  })()`, 20000);
  console.log(`  KLICK (${Date.now() - t0} ms):`, klick);
  await schlafe(2000);

  // Antwortet die Fläche noch? (Der Freeze-Test.)
  const lebt = await ausfuhren(cdp, `(()=>{
    const inputs = [...document.querySelectorAll('input[aria-label^="Search track"]')].map(i => (i.getAttribute('aria-label')||'').replace('Search track: ','')+'='+i.checked).join(',');
    return { lebt: true, buttons: document.querySelectorAll('button').length, inputs, body: (document.body.innerText||'').slice(0, 100) };
  })()`, 20000);
  console.log("  NACH DEM KLICK:", JSON.stringify(lebt, null, 1));
  const ausnahmen = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
  console.log("  Ausnahmen:", ausnahmen.length);
  for (const m of ausnahmen.slice(-3)) {
    const p = m.params?.exceptionDetails || {};
    console.log("    *", String(p.exception?.description || p.text || "").split("\n").slice(0, 3).join(" | ").slice(0, 300));
  }
  // Und ein Blick in die Such-Fläche selbst (das Dashboard hinter den Einstellungen).
  const suchProbe = await ausfuhren(cdp, `(()=>{
    localStorage.setItem('ki_gehirn_such_bm25','0');
    window.dispatchEvent(new CustomEvent('kepta_such_prefs'));
    return true;
  })()`);
  console.log("  Direkt-Trigger danach:", suchProbe);
  await schlafe(1500);
  const lebt2 = await ausfuhren(cdp, `document.querySelectorAll('button').length > 0`, 20000);
  console.log("  Fläche nach Direkt-Trigger:", lebt2 ? "LEBT" : "SCHWARZ");
  const b = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ARBEIT, "elektron-nach-klick.png"), Buffer.from(b.data, "base64"));
  console.log("  Bild: " + path.join(ARBEIT, "elektron-nach-klick.png"));
}
main().catch((e) => { console.log("FEHLER: " + e.message); process.exitCode = 1; });
