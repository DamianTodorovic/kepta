// P185 zweiter Versuch: Damians Datenmenge (21 064 Notizen) in einer Kapsel,
// echte Klicks auf die drei Spuren-Schalter in den Settings, Bild nach JEDEM
// Klick. Gemessen: lebt die Fläche, was zeigt der Bildschirm, lebt der Server.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_GROSS_PORT || 3944);
const CDP_PORT = Number(process.env.KEPTA_GROSS_CDP || 3954);
const ARBEIT = "/tmp/kepta-gross-umstellen";
const ANZAHL = 21064;

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 120000, schritt = 300 } = {}) {
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

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const FELDER = [
  { name: "Atlas", themen: ["Kickoff", "Budget", "Risiken", "Meilensteine"], konzepte: ["storage", "suche", "mandant", "schluessel", "audit", "latenz", "index", "sperrkonto"] },
  { name: "Kueche", themen: ["Wochenplan", "Einkauf", "Reste", "Gast"], konzepte: ["wuerzung", "temperatur", "messer", "ofen", "sauerteig", "ablage", "vorrat"] },
];
function baueKorpus(gesamt) {
  const rnd = mulberry32(0xa11 + gesamt);
  const start = Date.UTC(2024, 9, 9);
  const dateien = [];
  for (let i = 0; i < gesamt; i++) {
    const feld = FELDER[i % FELDER.length];
    const thema = feld.themen[Math.floor(rnd() * feld.themen.length)];
    const zeilen = [`Heute zu ${thema} im Feld ${feld.name}.`];
    const anzahl = 3 + (rnd() < 0.17 ? 1 : 0);
    const wahl = new Set();
    let versuch = 0;
    while (wahl.size < anzahl && versuch++ < 40) wahl.add(feld.konzepte[Math.floor(rnd() * feld.konzepte.length)]);
    const kram = [...wahl];
    for (const konzept of kram) zeilen.push(`Der [[${konzept}]] haelt das mit [[${kram[0]}]].`);
    const erstellt = start + Math.floor(rnd() * 700) * 86400000;
    const titel = `${feld.name} ${thema} ${String(i + 1).padStart(5, "0")}`;
    dateien.push({
      name: `${feld.name}/${String(i + 1).padStart(5, "0")}.md`,
      content: ["---", `kepta_id: gross-${String(i + 1).padStart(5, "0")}`, `title: ${JSON.stringify(titel)}`,
        `tags: [${feld.name.toLowerCase()}, ${thema.toLowerCase()}]`, `created: ${Math.floor(erstellt / 1000)}`, `updated: ${Math.floor(erstellt / 1000)}`,
        "---", "", zeilen.join(" ")].join("\n"),
    });
  }
  return dateien;
}

async function main() {
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });
  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  diener.on("exit", (code, signal) => console.log(`!!! SERVER GESTORBEN code=${code} signal=${signal} um ${new Date().toLocaleTimeString("de-DE")}`));
  diener.stdout.pipe(fs.createWriteStream(path.join(ARBEIT, "diener.log")));
  diener.stderr.pipe(fs.createWriteStream(path.join(ARBEIT, "diener-err.log"), { flags: "a" }), { end: true });
  let brave = null;
  try {
    await warteBis(async () => { const r = await fetch(`http://127.0.0.1:${PORT}/api/health`); return r.ok; }, { maxMs: 60000 });
    console.log("  Diener bereit — importiere", ANZAHL, "Notizen ...");
    const t0 = Date.now();
    const dateien = baueKorpus(ANZAHL);
    let importiert = 0;
    for (let i = 0; i < dateien.length; i += 5000) {
      const haufen = dateien.slice(i, i + 5000);
      const antwort = await (await fetch(`http://127.0.0.1:${PORT}/api/import/markdown`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: haufen }),
      })).json();
      importiert += antwort.imported ?? 0;
      console.log(`  Häppchen ${i / 5000 + 1}: ${haufen.length} Dateien, importiert ${importiert}`);
    }
    console.log(`  Import fertig in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${importiert} Notizen`);

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

    for (const [breit, hoch] of [[1440, 900], [390, 844]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
      await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PORT}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 120000 });
      const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 20000 });
      if (schritt) {
        await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
        await schlafe(400);
      }
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Settings\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return true})()`);
      // Bei 21k Notizen braucht das Dashboard länger — auf den System-Tab warten statt raten.
      const tabKlick = await warteBis(async () => ausfuhren(cdp, `(()=>{
        const b = [...document.querySelectorAll('button')].find(x => /^\\s*System\\s*$/i.test((x.textContent||'').trim()));
        if (!b) return null;
        b.click();
        return document.querySelector('[data-testid="such-modell"]') ? 'offen' : 'geklickt, warte';
      })()`), { maxMs: 30000, schritt: 500 });
      console.log(`  ${breit}x${hoch} System-Tab:`, tabKlick);
      const sektion = tabKlick === 'offen' || await warteBis(async () => ausfuhren(cdp, `(()=>!!document.querySelector('[data-testid="such-modell"]'))()`), { maxMs: 15000 });
      if (!sektion) { console.log(`  ${breit}x${hoch}: Search-Sektion kam nicht — Bild gesichert.`); const bb = await cdp.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(ARBEIT, `gross-${breit}-keine-sektion.png`), Buffer.from(bb.data, "base64")); continue; }

      for (const spur of ["words", "meaning", "graph"]) {
        const geklickt = await ausfuhren(cdp, `(()=>{
          const input = document.querySelector('input[aria-label="Search track: ${spur}"]');
          if (!input) return 'KEIN INPUT';
          input.click();
          return 'geklickt, checked=' + input.checked;
        })()`);
        await schlafe(1200);
        const lebt = await ausfuhren(cdp, `document.querySelectorAll('button').length > 0 && document.body.innerText.length > 40`);
        const url = await ausfuhren(cdp, `window.location.href`);
        const dunkel = await ausfuhren(cdp, `(()=>{
          const r = document.body.getBoundingClientRect();
          // Ein schwarzer Zustand: fast keine sichtbaren Knoten im Body
          const elemente = document.body.querySelectorAll('*').length;
          return { elemente, textLaenge: (document.body.innerText||'').length };
        })()`);
        const ausnahmen = cdp.evente.filter((e) => e.methode === "Runtime.exceptionThrown");
        const letzte = ausnahmen.slice(-1).map((m) => String(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || "").split("\n")[0].slice(0, 220));
        console.log(`  ${breit} ${spur}: ${JSON.stringify(geklickt)} | lebt ${lebt ? "JA" : "NEIN"} | elemente ${dunkel?.elemente} | text ${dunkel?.textLaenge} | URL ${String(url).slice(0, 50)} | Ausnahmen ${ausnahmen.length}`);
        for (const l of letzte) if (l) console.log("    * " + l);
        const b = await cdp.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(ARBEIT, `gross-${breit}-${spur}.png`), Buffer.from(b.data, "base64"));
        // Zurück auf AN
        if (geklickt && String(geklickt).includes("checked=false")) {
          await ausfuhren(cdp, `(()=>{const i=document.querySelector('input[aria-label="Search track: ${spur}"]');if(i)i.click();return true})()`);
          await schlafe(600);
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
