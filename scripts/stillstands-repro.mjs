// P195: der Stillstands-Versuch — Damians Datenmaß in der Kapsel, sein Zustand,
// ein echter Klick (Eingabe-Ereignis wie ein Nutzer), dann 18 Minuten Wartezeit
// mit dem Debugger-Klopfen. Grund (Damian, 10.11.): die alte GitHub-Version 3.2.1
// hat den Fehler nicht — der Versuch entscheidet, ob der Fehler schon hier im
// Versuch erscheint (dann nennt das Klopfen die Zeile) oder erst im A/B gegen
// 3.2.1. Gestell wie gross-bestand-umstellen.mjs: Server unter Node + kopfloser
// Brave (kein Electron — dann dreht das native Modul nicht um).
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.env.REPRO_WURZEL || process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.REPRO_PORT || 3986);
const CDP_PORT = Number(process.env.REPRO_CDP || 3985);
const ARBEIT = process.env.REPRO_ARBEIT || "/tmp/kepta-stillstand";
const MINUTEN = Number(process.env.REPRO_MINUTEN || 18);
fs.mkdirSync(ARBEIT, { recursive: true });
const PROTOKOLL = path.join(ARBEIT, "protokoll.log");
const log = (z) => {
  const zl = `[${new Date().toLocaleTimeString("de-DE")}] ${z}`;
  console.log(zl);
  fs.appendFileSync(PROTOKOLL, zl + "\n");
};

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 60000, schritt = 500 } = {}) {
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
      } else if (n.method) c.evente.push({ methode: n.method, params: n.params, t: Date.now() });
      if (c.evente.length > 300) c.evente.splice(0, c.evente.length - 300);
    };
    ws.onclose = () => { c.zu = true; };
    return c;
  }
  send(e, params = {}, timeoutMs = 8000) {
    if (this.zu) return Promise.reject(new Error("VERBINDUNG ZU"));
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      const wache = setTimeout(() => fehler(new Error(`ZEIT ÜBER ${e}`)), timeoutMs);
      this.offen.set(id, { los: (r) => { clearTimeout(wache); los(r); }, fehler: (x) => { clearTimeout(wache); fehler(x); } });
      this.ws.send(JSON.stringify({ id, method: e, params }));
    });
  }
  async warteAufEvent(methode, seit, maxMs) {
    const bis = Date.now() + maxMs;
    for (;;) {
      const gefunden = this.evente.find((e) => e.methode === methode && e.t >= seit);
      if (gefunden) return gefunden;
      if (Date.now() > bis) return null;
      await schlafe(150);
    }
  }
}
const ausfuhren = async (cdp, ausdruck, timeoutMs = 5000) =>
  (await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true }, timeoutMs)).result?.value;

/** Der LEICHTE Tastgriff: textContent erzwingt kein Neu-Anordnen — die Wache darf den Patienten nicht selbst schwer machen. */
const probe = (cdp) => ausfuhren(cdp, `(()=>({
  zeichen: (document.querySelector('main')?.textContent || '').length,
  fensterB: window.innerWidth,
  schalter: [...document.querySelectorAll('input[aria-label]')].filter(i => /track/i.test(i.getAttribute('aria-label')||'')).map(i => (i.getAttribute('aria-label')||'')+'='+i.checked).join(','),
  topK: localStorage.getItem('ki_gehirn_topK'),
}))()`);

/** Echter Klick wie ein Nutzer: Eingabe-Ereignis auf die Mitte der Schaltfläche. */
async function echterKlick(cdp, auswahl) {
  const box = await ausfuhren(cdp, `(()=>{
    const el = ${auswahl};
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  if (!box) { log("KLICK: ZIEL NICHT GEFUNDEN"); return false; }
  for (const typ of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: typ, x: box.x, y: box.y, button: "left", clickCount: 1,
    }, 5000);
  }
  return true;
}

async function main() {
  log(`Stillstands-Versuch startet (Kapsel ${ARBEIT}, Port ${PORT}, ${MINUTEN} Minuten).`);
  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diener.on("exit", (code, signal) => log(`!!! SERVER GESTORBEN code=${code} signal=${signal}`));
  diener.stdout.pipe(fs.createWriteStream(path.join(ARBEIT, "diener.log")));
  diener.stderr.pipe(fs.createWriteStream(path.join(ARBEIT, "diener-err.log"), { flags: "a" }), { end: true });

  const bereit = await warteBis(async () => (await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok, { maxMs: 60000 });
  if (!bereit) { log("SERVER KAM NICHT HOCH — Versuch endet."); diener.kill(); return; }
  log(`Server bereit auf http://127.0.0.1:${PORT}`);

  // Damians Datenmaß: 21 000 Notizen in 5000er-Häppchen.
  const gesamt = 21000;
  const anfang = Date.now();
  for (let basis = 0; basis < gesamt; basis += 5000) {
    const haepchen = [];
    for (let i = basis; i < Math.min(basis + 5000, gesamt); i++) {
      haepchen.push({
        name: `S/${String(i + 1).padStart(6, "0")}.md`,
        content: ["---", `kepta_id: st-${String(i + 1).padStart(6, "0")}`, `title: "Stillstand-Notiz ${i + 1}"`,
          `tags: ["stillstand"]`, `created: 1759000000`, `updated: 1759000000`, "---", "",
          `Inhalt der Stillstand-Notiz ${i + 1} über Fristen, Suche und Klick. [[suche]]`].join("\n"),
      });
    }
    const r = await fetch(`http://127.0.0.1:${PORT}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: haepchen }),
    });
    log(`  Import ${Math.min(basis + 5000, gesamt)}/${gesamt}: ${r.status} (${Math.round((Date.now() - anfang) / 1000)} s)`);
  }

  const brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
    "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
  const ziel = await warteBis(async () => {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
  }, { maxMs: 90000 });
  if (!ziel) { log("KEIN CDP-ZIEL — Versuch endet."); brave.kill(); diener.kill(); return; }
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Performance.enable");
  await cdp.send("Debugger.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });

  // Damians Zustand: „All" (topK=0), Tiefe 32, words aus, Settings-Tab system, Assistent zu.
  await ausfuhren(cdp, `localStorage.setItem('ki_gehirn_topK','0');localStorage.setItem('ki_gehirn_such_tiefe','32');localStorage.setItem('ki_gehirn_spur_bm25','0');localStorage.setItem('kepta_einstellungen_tab','system');localStorage.setItem('ki_gehirn_wizard_dismissed','1');1`);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
  await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
  await schlafe(3000);

  // Der echte Klick aus seinem Video: Settings öffnen, dann die words-Schaltfläche.
  await echterKlick(cdp, `[...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === 'Settings')`);
  await schlafe(1500);
  const geklickt = await echterKlick(cdp, `document.querySelector('input[aria-label="Search track: words"]')?.closest('label') || document.querySelector('input[aria-label="Track BM25"]')?.closest('label')`);

  log(`Echter Klick auf die words-Schaltfläche: ${geklickt ? "ausgeführt" : "nicht gefunden (Fläche anders als erwartet)"}`);
  const nach = await probe(cdp).catch((e) => ({ fehler: e.message }));
  log(`Nach dem Klick: ${JSON.stringify(nach)}`);

  let letzte = null;
  let still = 0;
  let gemeldet = 0;
  const start = Date.now();
  for (let i = 0; i < (MINUTEN * 60) / 5; i++) {
    await schlafe(5000);
    let z;
    try {
      z = await probe(cdp);
    } catch (e) {
      still += 1;
      log(`[${Math.round((Date.now() - start) / 1000)}s] keine Antwort (${still}×): ${e.message}`);
      if (still >= 3 && gemeldet < 3) {
        gemeldet += 1;
        log(`!!! STILLSTAND #${gemeldet} nach ${Math.round((Date.now() - start) / 1000)} s. Letztes Lebenszeichen: ${JSON.stringify(letzte)}`);
        try {
          const blitz = execSync(`ps -axo pid,pcpu,pmem,state,comm | grep -iE 'node dist/server|Brave' | grep -v grep | head -8`, { encoding: "utf8" });
          log("PROZESS-BLITZ:\n" + blitz.trim().split("\n").map((z2) => "  " + z2.trim()).join("\n"));
        } catch { log("PROZESS-BLITZ: leer"); }
        const seit = Date.now();
        let gefasst = null;
        for (let k = 0; k < 12 && !gefasst && !cdp.zu; k++) {
          await cdp.send("Debugger.pause", {}, 3000).catch(() => {});
          await schlafe(2500);
          gefasst = await cdp.warteAufEvent("Debugger.paused", seit, 1);
        }
        if (gefasst) {
          const rahmen = gefasst.params.callFrames || [];
          log(`!!! DER ÜBELTÄTER (${rahmen.length} Rahmen):`);
          for (const [idx, f] of rahmen.slice(0, 25).entries()) {
            const datei = (f.url || "(unbekannt)").split("/").slice(-2).join("/");
            log(`  ${idx}. ${f.functionName || "(anonym)"} @ ${datei}:${f.location.lineNumber + 1}:${f.location.columnNumber}`);
          }
          await cdp.send("Debugger.resume", {}, 3000).catch(() => {});
          log("  (Faden wieder laufen gelassen — das Klopfen wiederholt sich)");
        } else {
          log("!!! KLOPFEN KAM NICHT AN — nativer/blockierter Faden (sync-Ausflug, großes JSON, Regex).");
        }
        still = 0;
      }
      continue;
    }
    still = 0;
    letzte = z;
    if (i % 6 === 0) {
      let metrik = "";
      try {
        const m = await cdp.send("Performance.getMetrics", {}, 3000);
        const holen = (n) => m.metrics?.find((x) => x.name === n)?.value;
        metrik = ` | heap ${Math.round((holen("JSHeapUsedSize") ?? 0) / 1048576)} MB | knoten ${holen("Nodes") ?? "?"}`;
      } catch { metrik = " | metrik ?"; }
      log(`[${Math.round((Date.now() - start) / 1000)}s] lebt | zeichen ${(z?.zeichen ?? "?")}${metrik} | ${z?.schalter || "—"}`);
    }
  }
  log(`Versuch endet nach ${MINUTEN} Minuten. Kein Stillstandsbefund oben = hier nicht aufgetreten.`);
  brave.kill();
  diener.kill();
}
main().catch((e) => { log("REPRO-FEHLER: " + e.message); });
