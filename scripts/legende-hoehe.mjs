// Woher die zugeklappte Legende ihre Hoehe hat — Zeile fuer Zeile gemessen.
//
// P53 Befund C: bei 390 px deckt die ZUGEKLAPPTE Legende 31,5 % der Leinwand zu, die
// Hauslatte aus P114 sind 25 %. Bevor eine Zeile hinter die Klappe faellt (und das ist
// seit #54 eine entschiedene Regel mit drei gelieferten Faellen), muss die Zahl zeigen,
// WELCHE Zeile den Platz nimmt.
//
// Aufruf: node scripts/legende-hoehe.mjs [--breite 390 --hoehe 844]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ARG = (nam, fall) => { const a = process.argv.find((x) => x.startsWith(`--${nam}=`)); return a ? a.split("=")[1] : fall; };
const BREITE = Number(ARG("breite", 390));
const HOEHE = Number(ARG("hoehe", 844));
const PORT = Number(process.env.KEPTA_LEGEND_PORT || 3888);
const CDP_PORT = Number(process.env.KEPTA_LEGEND_CDP || 3898);
const BASIS = `http://127.0.0.1:${PORT}`;
const KURZ = ARG("arbeit", "legende");
const ARBEIT = `/tmp/kepta-legende-${KURZ}`;

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(fn, { maxMs = 90000, schritt = 200 } = {}) {
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

const SONDE = `(() => {
  const leg = document.querySelector('.graph-legende');
  const lein = document.querySelector('canvas');
  if (!leg || !lein) return null;
  const lr = lein.getBoundingClientRect(), gg = getComputedStyle(leg);
  const kinder = [...leg.children].map((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return {
      klasse: String(el.className || '').slice(0, 54),
      testid: el.getAttribute('data-testid') || '',
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 64),
      x: Math.round(r.x - lr.x), y: Math.round(r.y - lr.y),
      b: Math.round(r.width), h: Math.round(r.height),
      sichtbar: s.display !== 'none' && r.height > 0,
      zeilen: Math.max(1, Math.round(r.height / (parseFloat(s.lineHeight) || 16))),
    };
  });
  const lb = leg.getBoundingClientRect();
  return {
    leinwand: { b: Math.round(lr.width), h: Math.round(lr.height) },
    legende: { b: Math.round(lb.width), h: Math.round(lb.height), zustand: leg.getAttribute('data-legende'),
      polster: gg.paddingTop + '/' + gg.paddingBottom, abstand: gg.rowGap, ecke: gg.borderRadius },
    anteil: +((lb.width * lb.height) / (lr.width * lr.height) * 100).toFixed(1),
    kinder,
  };
})()`;

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude — erst bauen."); process.exitCode = 2; return; }
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
    if (!gesund) throw new Error("Der Diener kam nicht hoch");
    await fetch(`${BASIS}/api/memories/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: Array.from({ length: 30 }, (_, i) => ({
        title: `Notiz ${i}`, content: `Inhalt ${i} ` + "Wort ".repeat(20), tags: ["saat"], type: "semantic",
      })) }),
    });
    console.log(`  Diener: Version ${gesund.version}`);

    brave = spawn(BRAVE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREITE},${HOEHE}`, "about:blank"],
      { stdio: ["ignore", "pipe", "pipe"] });
    const ziel = await warteBis(async () => {
      const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    if (!ziel) throw new Error("Kein CDP-Ziel");
    const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: 2, mobile: false });

    await cdp.send("Page.navigate", { url: `${BASIS}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
    await ausfuhren(cdp, `(()=>{localStorage.setItem('ki_gehirn_wizard_dismissed','1');return true})()`);
    await cdp.send("Page.navigate", { url: `${BASIS}/` });
    await warteBis(async () => (await ausfuhren(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
    await warteBis(async () => ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^\\s*Later\\s*$/i.test((x.textContent||'').trim()));if(!b)return /Step 1 of 4/i.test(document.body.innerText||'')?null:true;b.click();return true})()`), { maxMs: 30000 });
    await ausfuhren(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='Graph');if(b)b.click();return !!b})()`);
    await schlafe(5000);

    for (const zustand of ["zu", "auf"]) {
      await ausfuhren(cdp, `(()=>{
        const leg = document.querySelector('.graph-legende');
        const kn = document.querySelector('[data-testid="graph-legende-klappe"]');
        const offen = !!leg && leg.getAttribute('data-legende') === 'auf';
        const gewollt = ${JSON.stringify(zustand === "auf")};
        if (kn && offen !== gewollt) kn.click();
        return true;
      })()`);
      await schlafe(900);
      const mess = await ausfuhren(cdp, SONDE);
      console.log(`\n  === Zustand ${zustand}: Anteil ${mess?.anteil} % der Leinwand, Kasten ${mess?.legende.b} x ${mess?.legende.h} px`);
      for (const k of mess?.kinder || []) {
        if (!k.sichtbar) continue;
        console.log(`   ${String(k.h).padStart(4)} px  ${String(k.zeilen)} Zeile(n)  ${k.testid || k.klasse}  "${k.text.slice(0, 46)}"`);
      }
      fs.writeFileSync(path.join(ARBEIT, `legende-${zustand}-${BREITE}.json`), JSON.stringify(mess, null, 1));
    }
    const b = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARBEIT, `legende-${BREITE}.png`), Buffer.from(b.data, "base64"));
    console.log("  Bild: " + path.join(ARBEIT, `legende-${BREITE}.png`));
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
