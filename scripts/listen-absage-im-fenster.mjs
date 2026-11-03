// Die Listen-Absage im echten Fenster — erscheint sie, und wenn nein, was steht dort?
//
// P49 §8 meldete: bei 390 px war die Absage nicht zu sehen, und die Kette
// Tuer -> Lader -> `ladFehler` war ungeklaert. Dieser Lauf klaert sie, indem er die
// Liste nicht raten laesst: der Vor-Diener wirft nur `/api/memories` ab (die Tuer der
// Liste), alles andere bleibt in Ruhe. Gemessen wird dann nicht ein Wunschtext, sondern
// was die Flaeche wirklich zeigt — der Zweig, der gewonnen hat, und sein Wort.
//
// Aufruf: node scripts/listen-absage-im-fenster.mjs [--breiten=390x844]
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_LIST_PORT || 3824);
const VOR_PORT = Number(process.env.KEPTA_LIST_VOR || 3825);
const CDP_PORT = Number(process.env.KEPTA_LIST_CDP || 3834);
const BASIS = `http://127.0.0.1:${VOR_PORT}`;
const KURZ = (process.argv.find((a) => a.startsWith("--arbeit=")) || "--arbeit=list").slice(9);
const ARBEIT = `/tmp/kepta-listen-${KURZ}`;
const BREITEN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--breiten="));
  if (!arg) return [[390, 844]];
  return arg.slice(10).split(",").map((p) => p.split("x").map(Number));
})();

const ABSAGE = "The server did not answer";
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
      } else if (n.method) {
        c.evente.push({ methode: n.method, params: n.params });
      }
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

/** Der Vor-Diener: nur die Listen-Tuer wirft, alles andre geht durch. */
function vorDienerStart(appPort, vorPort) {
  return http.createServer((req, res) => {
    const url = String(req.url || "");
    if (url.split("?")[0] === "/api/memories") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "der Vor-Diener liess die Listen-Tuer absichtlich scheitern" }));
      return;
    }
    const weiter = http.request({ host: "127.0.0.1", port: appPort, path: url, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${appPort}` } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    weiter.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); });
    req.pipe(weiter);
  }).listen(vorPort, "127.0.0.1");
}

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude unter " + OBJEKT + " — erst bauen."); process.exitCode = 2; return; }
  if (!fs.existsSync(BRAVE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exitCode = 2; return; }
  for (const p of [PORT, VOR_PORT, CDP_PORT]) {
    try { await fetch(`http://127.0.0.1:${p}/`); console.log(`Port ${p} hoert schon — fremder Laeufer, Abbruch.`); process.exitCode = 2; return; } catch { /* frei */ }
  }
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });

  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const protokoll = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
  diener.stdout.pipe(protokoll); diener.stderr.pipe(protokoll, { end: true });

  let brave, vor = null;
  try {
    vor = vorDienerStart(PORT, VOR_PORT);
    const gesund = await warteBis(async () => { const r = await fetch(`${BASIS}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!gesund) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count}`);

    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREITEN[0][0]},${BREITEN[0][1]}`, "about:blank"],
      { stdio: ["ignore", "pipe", "pipe"] });
    const bLog = fs.createWriteStream(path.join(ARBEIT, "brave.log"));
    brave.stdout.pipe(bLog); brave.stderr.pipe(bLog, { end: true });

    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    if (!ziel) throw new Error("Kein CDP-Ziel — " + path.join(ARBEIT, "brave.log"));
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");

    for (const [breit, hoch] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });

      // Der Assistent muss vor der Messung weg sein. Ein Block hinter einem offenen
      // Overlay ist kein Beweis, und der erste Lauf 21:31 war genau das: das Bild zeigte
      // Schritt 1 von 4, while the probe reported the block as present.
      const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 30000 });
      if (!schritt) throw new Error("der Assistent zeigte Schritt 1 nicht — die Messung waere ein Blick ins Leere");
      const spaeter = await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(!b)return null;b.click();return (b.textContent||'').trim()})()`);
      if (!spaeter) throw new Error("der Assistent liess sich nicht mit Later schliessen");
      const frei = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? null : true`), { maxMs: 15000 });
      if (!frei) throw new Error("der Assistent blieb offen — jede Zahl waer ein Blick hinter die Klappe");

      const da = await warteBis(async () => ausfuhren(cdp,
        `(()=>!!document.querySelector('[data-testid="lad-fehler"]'))()`), { maxMs: 12000 });
      await ausfuhren(cdp, `(()=>{const k=document.querySelector('[data-testid="lad-fehler"]');if(k)k.scrollIntoView({block:'center'});return !!k})()`);
      await schlafe(500);

      const zustand = await ausfuhren(cdp, `(()=>{
        const k = document.querySelector('[data-testid="lad-fehler"]');
        const rect = k ? k.getBoundingClientRect() : null;
        const btn = [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean);
        // Der Treffertest sagt, ob der Mittelpunkt des Blocks wirklich diesen Block
        // trifft — ein Overlay dahinter faellt hier durch, nicht erst im Bild.
        const getroffen = k && rect ? (() => {
          const e = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return !!e && (e === k || k.contains(e));
        })() : false;
        return {
          absageDa: !!k,
          freiOhneOverlay: getroffen,
          wizardOffen: /Step 1 of 4/i.test(document.body.innerText || ''),
          tekst: k ? (k.textContent||'').trim() : null,
          masse: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), b: Math.round(rect.width), h: Math.round(rect.height) } : null,
          ueberlauf: k ? { quer: k.scrollWidth - k.clientWidth, senkrecht: k.scrollHeight - k.clientHeight } : null,
          knopfe: btn.slice(0, 24),
          koerper: (document.body.innerText || '').slice(0, 900),
        };
      })()`);
      console.log(`\n  Breite ${breit}x${hoch}: Absage ${da ? "DA" : "NICHT DA"}, frei anfassbar: ${zustand?.freiOhneOverlay ? "JA" : "NEIN"}, Assistent offen: ${zustand?.wizardOffen ? "JA" : "NEIN"}`);
      console.log("  " + JSON.stringify(zustand, null, 2));
      if (!da) throw new Error("die Listen-Absage erschien nicht im Fenster");
      if (zustand?.wizardOffen) throw new Error("der Assistent steht noch im Bild — jede Zahl waere ein Blick hinter die Klappe");
      if (!zustand?.freiOhneOverlay) throw new Error("der Mittelpunkt der Absage trifft die Absage nicht — etwas andres liegt darueber");
      // Zwei Richtungen, beide verlangt: der Satz, den die App schreibt, und die Zahl,
      // die die Tuer gab. Nur einer von beiden ist die Klage, die dieser Schnitt heilt.
      if (!String(zustand?.tekst || "").includes(ABSAGE)) throw new Error("der Satz der Absage steht nicht im Feld");
      if (!/\(HTTP 500\)/.test(String(zustand?.tekst || ""))) throw new Error("der Grund der Tuer steht nicht im Feld: " + zustand?.tekst);

      const fehl = cdp.evente.filter((e) => e.methode === "Log.entryAdded" || e.methode === "Runtime.exceptionThrown");
      console.log("  Protokoll-Ereignisse: " + fehl.length);
      for (const f of fehl.slice(0, 8)) {
        const p = f.params?.entry || f.params?.exceptionDetails || {};
        console.log("   " + String(p.text || p.message || p.exception?.description || "").slice(0, 220).replace(/\n/g, " | "));
      }

      const b = await cdp.send("Page.captureScreenshot", { format: "png" });
      fs.writeFileSync(path.join(ARBEIT, `absage-${breit}x${hoch}.png`), Buffer.from(b.data, "base64"));
      console.log("  Bild: " + path.join(ARBEIT, `absage-${breit}x${hoch}.png`));
    }
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    if (vor) vor.close();
    diener.kill("SIGTERM");
  }
}
main();
