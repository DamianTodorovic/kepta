// Was ein Mensch wirklich liest — der Wort-stand der Flaeche, im Fenster gemessen.
//
// Punkt 7 ("jeder muss es verstehen") war bis heute keine Zahl, sondern ein Gefuehl.
// Dieser Lauf zaehlt nicht den Quelltext und nicht die Katalog-Tabelle, sondern das,
// was in einem echten Fenster steht: der sichtbare Leib jeder Seite, plus jeder
// `title`-Text, den die Flaeche als Erklaerung bereithaelt. Ein Wort, das nirgends
// erklaert wird, ist eine Zumutung — und eine Zahl, die niemand sehen kann, ist keine
// Messung.
//
// Aufruf: node scripts/verstaendlichkeit-im-fenster.mjs [--arbeit=29] [--breiten=1440x900]
// Ausgabe: /tmp/kepta-wortschatz-<arbeit>/wortschatz.json und eine Zahlengruppe im Protokoll.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_WORT_PORT || 3844);
const CDP_PORT = Number(process.env.KEPTA_WORT_CDP || 3854);
const BASIS = `http://127.0.0.1:${PORT}`;
const KURZ = (process.argv.find((a) => a.startsWith("--arbeit=")) || "--arbeit=29").slice(9);
const ARBEIT = `/tmp/kepta-wortschatz-${KURZ}`;
const BREITEN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--breiten="));
  if (!arg) return [[1440, 900]];
  return arg.slice(10).split(",").map((p) => p.split("x").map(Number));
})();

const SEITEN = ["Knowledge", "Today", "Chat", "Graph", "Dossier", "Activity", "Settings"];
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
  constructor(ws) { this.ws = ws; this.nr = 0; this.offen = new Map(); }
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

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude unter " + OBJEKT + " — erst bauen."); process.exitCode = 2; return; }
  if (!fs.existsSync(BRAVE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exitCode = 2; return; }
  for (const p of [PORT, CDP_PORT]) {
    try { await fetch(`http://127.0.0.1:${p}/`); console.log(`Port ${p} hoert schon — fremder Laeufer, Abbruch.`); process.exitCode = 2; return; } catch { /* frei */ }
  }
  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(ARBEIT, { recursive: true });

  const diener = spawn("node", [OBJEKT], {
    cwd: WURZEL,
    env: { ...process.env, HOME: path.join(ARBEIT, "h"), KEPTA_DATA_DIR: path.join(ARBEIT, "d"), KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prot = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
  diener.stdout.pipe(prot); diener.stderr.pipe(prot, { end: true });

  let brave;
  try {
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

    const ergebnis = { version: gesund.version, breiten: [], seiten: {} };

    for (const [breit, hoch] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await ausfuhren(cdp, `(()=>{localStorage.clear();sessionStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });

      // der Assistent muss zu, sonst gemessen wir hinter einer Klappe
      const schritt = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 30000 });
      if (!schritt) throw new Error("der Assistent zeigte Schritt 1 nicht — der Erststart ist das halbe Messobjekt");
      const spaeter = await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(!b)return null;b.click();return (b.textContent||'').trim()})()`);
      if (!spaeter) throw new Error("der Assistent liess sich nicht mit Later schliessen");
      const frei = await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? null : true`), { maxMs: 15000 });
      if (!frei) throw new Error("der Assistent blieb offen — jede Zahl waere ein Blick hinter die Klappe");

      // Erst der Erststart selbst: was der Assistent zeigt, ist Teil der Flaeche.
      // Der Schritt-1-Text wird vor dem Schliessen geholt.
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? true : null`), { maxMs: 60000 });
      const erststart = await ausfuhren(cdp, `(()=>({ tekst: (document.body.innerText||''), titel: [...document.querySelectorAll('[title]')].map(e=>e.getAttribute('title')) }))()`);
      ergebnis.seiten[`Erststart@${breit}`] = erststart;
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(b)b.click();return !!b})()`);
      await warteBis(async () => ausfuhren(cdp, `/Step 1 of 4/i.test(document.body.innerText||'') ? null : true`), { maxMs: 15000 });

      for (const name of SEITEN) {
        const getroffen = await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(name)});if(!b)return null;b.click();return b.textContent.trim()})()`);
        if (!getroffen) { console.log(`  ! Seite ${name}: kein Knopf mit diesem Wort`); continue; }
        await schlafe(1200);
        const stand = await ausfuhren(cdp, `(()=>({
          tekst: document.body.innerText || '',
          titel: [...document.querySelectorAll('[title]')].map(e => e.getAttribute('title')).filter(Boolean),
          knopfe: [...document.querySelectorAll('button')].map(b => (b.textContent||'').trim()).filter(Boolean),
        }))()`);
        ergebnis.seiten[`${name}@${breit}`] = stand;
        console.log(`  ${name}@${breit}: ${String(stand.tekst).split(/\s+/).filter(Boolean).length} Woerter, ${stand.titel.length} title-Texte`);
      }
      ergebnis.breiten.push(`${breit}x${hoch}`);
    }

    fs.writeFileSync(path.join(ARBEIT, "wortschatz.json"), JSON.stringify(ergebnis, null, 1));
    console.log("  JSON: " + path.join(ARBEIT, "wortschatz.json"));
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
