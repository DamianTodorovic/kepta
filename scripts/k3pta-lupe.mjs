// Die Lupe v3 (P195): startet K3PTA mit Fernsteuerung und wacht über der Fläche.
//
// Was die ersten Läufe lehrten (10.11.):
//   - Lauf 1: der Klick selbst überlebt die App zehn Minuten — dann steht der
//     Hauptfaden still ("LESE-STÖRUNG" für immer). Kein Fehler, kein Crash:
//     eine Schleife, die nie endet. Deshalb erscheint auch nie der Crash-Bildschirm.
//   - Lauf 2: die Lupe v2 starb an einer eigenen Unstimmigkeit (sie misst
//     `gemessen`, prüfte aber noch das alte Feld `sichtbareContainer`) — v3
//     wickelt jeden Wachgang in eine eigene Kapsel, damit sie nie mehr mitten
//     im Wachen stirbt.
//
// Was v3 NEU kann: wenn der Hauptfaden stillsteht, KLOPFT SIE MIT DEM DEBUGGER
// AN. V8 unterbricht selbst eine laufende Schleife an der nächsten Gelegenheit
// und nennt die genaue Fundstelle (Datei:Zeile). Kommt das Klopfen nicht an,
// steckt der Faden in nativem Code (großes JSON, Regex, SQLite) — auch das ist
// eine Antwort. Kommt er an, steht der Übeltäter im Protokoll.
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
  /** Wartet auf ein bestimmtes Ereignis (z.B. Debugger.paused). */
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

// Die ehrliche Messung (P195, Lehre aus der Mess-Blende): Elemente in
// display:none-Teilbäumen melden ihren EIGENEN display-Wert und visibility,
// aber 0×0 — der alte Greifer (`main [class*=flex-1]`, erste 10) füllte sich
// deshalb mit Artefakten versteckter Ansichten und rief "leer", obwohl die
// Fläche gesund war. Jetzt: die ACHT DIREKTEN Hüllen von main, mit Klasse,
// Größe, Display und Textlänge — plus das Ansichts-Schild und seine Spur.
const zustand = (cdp) => ausfuhren(cdp, `(()=>{
  const main = document.querySelector('main');
  const hüllen = main ? [...main.children].map(el => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return { k: String(el.className).replace(/\\s+/g,' ').slice(0, 90), b: Math.round(r.width), h: Math.round(r.height), d: s.display, zeichen: (el.textContent||'').length };
  }) : [];
  const sichtbar = hüllen.find(h => h.d !== 'none' && h.b > 0 && h.h > 0);
  return {
    url: location.pathname,
    fenster: { b: window.innerWidth, h: window.innerHeight },
    hüllen,
    sichtbarText: sichtbar ? sichtbar.zeichen : 0,
    ansicht: document.querySelector('[data-ansicht]')?.getAttribute('data-ansicht') ?? '(keine Spur — App älter als 3.2.201)',
    ansichtSpur: (window.__ansichtSpur || []).slice(-12),
    doppelt: { hüllen: document.querySelectorAll('[data-ansicht]').length, mains: document.querySelectorAll('main').length, wurzeln: document.querySelectorAll('#root > *').length },
    schalter: [...document.querySelectorAll('input[aria-label^="Search track"]')].map(i => (i.getAttribute('aria-label')||'').replace('Search track: ','')+'='+i.checked).join(','),
    topK: localStorage.getItem('ki_gehirn_topK'),
    tiefe: localStorage.getItem('ki_gehirn_such_tiefe'),
    tabGespeichert: localStorage.getItem('kepta_einstellungen_tab'),
  };
})()`);

const messen = async (cdp) => {
  try {
    const m = await cdp.send("Performance.getMetrics", {}, 3000);
    const holen = (n) => m.metrics?.find((x) => x.name === n)?.value;
    return { heap: Math.round((holen("JSHeapUsedSize") ?? 0) / 1048576), knoten: holen("Nodes") ?? 0 };
  } catch { return null; }
};

async function main() {
  log("Die Lupe v3 startet: K3PTA wird beendet und mit der Lupe neu gestartet.");
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

  let ziel = null;
  for (let i = 0; i < 60 && !ziel; i++) {
    await schlafe(1000);
    try {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      ziel = l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    } catch { /* noch nicht */ }
  }
  if (!ziel) { log("KEIN CDP-ZIEL — die Lupe kann nicht lesen. Skript endet."); return; }
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable").catch(() => {});
  await cdp.send("Page.enable").catch(() => {});
  await cdp.send("Performance.enable").catch(() => {});
  await cdp.send("Debugger.enable").catch(() => {});
  log("Die Lupe hängt am Fenster. Damian: mach, was du immer machst — ich fange alles.");

  const start = await zustand(cdp);
  log("START-ZUSTAND: " + JSON.stringify(start));

  const letzteGute = () => JSON.stringify({ url: letzte?.url, ansicht: letzte?.ansicht, hüllen: letzte?.hüllen?.slice(0, 3), schalter: letzte?.schalter });
  let letzte = start;
  let stillstandStreak = 0;
  let eingefrorenGemeldet = 0;
  let gefangen = 0;

  for (let i = 0; i < 900; i++) {
    await schlafe(5000);
    try {
      let z;
      try {
        z = await zustand(cdp);
      } catch (leseFehler) {
        stillstandStreak += 1;
        log(`[${i * 5}s] der Hauptfaden antwortet nicht (${stillstandStreak}×): ${leseFehler.message}`);
        // Drei verweigerte Antworten hintereinander (~30 s) = der Blackscreen-Moment.
        if (stillstandStreak >= 3 && eingefrorenGemeldet < 3) {
          eingefrorenGemeldet += 1;
          log(`\n!!! STILLSTAND #${eingefrorenGemeldet} bei ${i * 5}s — der Hauptfaden steht. Das letzte Lebenszeichen: ${letzteGute()}`);
          // Der Prozess-Blitz: dreht der Faden (CPU hoch = Schleife) oder wartet
          // er (CPU 0 = blockiert, z.B. auf einen sync-Ausflug zum Hauptprozess)?
          try {
            const { execSync } = await import("node:child_process");
            const blitz = execSync("ps -axo pid,pcpu,pmem,state,comm | grep -i 'K3PTA' | grep -v grep", { encoding: "utf8" });
            log("PROZESS-BLITZ beim Stillstand:\n" + blitz.trim().split("\n").map((z) => "  " + z.trim()).join("\n"));
          } catch { log("PROZESS-BLITZ: keine K3PTA-Prozesse gefunden"); }
          const b = await cdp.send("Page.captureScreenshot", { format: "png" }, 8000).catch(() => null);
          if (b) { fs.writeFileSync(path.join(ARBEIT, `stillstand-${eingefrorenGemeldet}.png`), Buffer.from(b.data, "base64")); log(`  Bild: stillstand-${eingefrorenGemeldet}.png`); }
          // Das Debugger-Klopfen: V8 unterbricht die Schleife und nennt die Fundstelle.
          const seit = Date.now();
          let gefasst = null;
          for (let k = 0; k < 12 && !gefasst && !cdp.zu; k++) {
            await cdp.send("Debugger.pause", {}, 3000).catch(() => {});
            await schlafe(2500);
            gefasst = await cdp.warteAufEvent("Debugger.paused", seit, 1);
          }
          if (gefasst) {
            const rahmen = gefasst.params.callFrames || [];
            log(`!!! DER ÜBELTÄTER — der Hauptfaden steckt hier (${rahmen.length} Rahmen):`);
            for (const [idx, f] of rahmen.slice(0, 25).entries()) {
              const datei = (f.url || "(unbekannt)").split("/").slice(-2).join("/");
              log(`  ${idx}. ${f.functionName || "(anonym)"} @ ${datei}:${f.location.lineNumber + 1}:${f.location.columnNumber}`);
            }
            await cdp.send("Debugger.resume", {}, 3000).catch(() => {});
            log("  (die Lupe hat den Faden wieder laufen lassen — das Klopfen wiederholt sich beim nächsten Stillstand)");
          } else {
            log("!!! DAS KLOPFEN KAM NICHT AN — der Faden steckt in nativem Code (großes JSON.parse, eine Regex mit Rücklauf oder SQLite). Das engt die Jagd auf die Tuer/Scan-Kette ein.");
          }
          stillstandStreak = 0;
        }
        continue;
      }
      stillstandStreak = 0;
      letzte = z;
      // Ehrlicher Fund: keine sichtbare Hülle — oder eine sichtbare ohne Text
      // (das schwarze Feld: Hülle block, Inhalt leer). Keine Blenden-Artefakte mehr.
      const sichtbare = (z.hüllen ?? []).filter((h) => h.d !== "none" && h.b > 0 && h.h > 0);
      const flaecheArm = sichtbare.length === 0 || (z.sichtbarText ?? 0) < 20;
      const wache = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
      if ((flaecheArm || wache.length > 0) && gefangen < 3) {
        gefangen += 1;
        log(`\n!!! FUNDSACHE #${gefangen} bei ${i * 5}s (flaecheArm=${flaecheArm}, ausnahmen=${wache.length})`);
        log(`ANSICHT im Fund: ${JSON.stringify(z.ansicht)} | Spur: ${JSON.stringify(z.ansichtSpur)}`);
        log("HÜLLEN: " + JSON.stringify(z.hüllen, null, 1));
        if (wache.length > 0) log("AUSNAHMEN: " + JSON.stringify(wache.slice(-5).map((e) => String(e.params?.exceptionDetails?.exception?.description || e.params?.exceptionDetails?.text).slice(0, 300))));
        const b = await cdp.send("Page.captureScreenshot", { format: "png" }, 8000).catch(() => null);
        if (b) { fs.writeFileSync(path.join(ARBEIT, `fundsache-${gefangen}.png`), Buffer.from(b.data, "base64")); log(`  Bild: fundsache-${gefangen}.png`); }
      }
      if (i % 2 === 0) {
        const m = await messen(cdp);
        const ort = sichtbare[0] ? `${sichtbare[0].zeichen} Z · ${sichtbare[0].k.slice(0, 34)}` : "keine Hülle sichtbar";
        log(`[${i * 5}s] lebt | ${ort} | ansicht ${z.ansicht} | schalter ${z.schalter || "—"} | heap ${m ? m.heap + " MB" : "?"} knoten ${m ? m.knoten : "?"}`);
      }
    } catch (wachFehler) {
      // Die Wache selbst darf nie sterben (Lehre aus Lauf 2).
      log(`[${i * 5}s] WACH-STÖRUNG (die Lupe läuft weiter): ${wachFehler.message}`);
      if (cdp.zu) { log("Die Verbindung zum Fenster ist zu — Damian hat es geschlossen oder es stürzte ab. Die Lupe endet."); break; }
    }
  }
  log("Die Lupe endet nach 75 Minuten. Damian: schick mir den Ordner K3PTA-Lupe auf dem Desktop.");
}
main().catch((e) => { log("LUPE-FEHLER: " + e.message); });
