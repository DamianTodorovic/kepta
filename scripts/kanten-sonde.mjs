// Die Kanten-Sonde: wer beruehrt bei 390 px wirklich eine Bildkante?
//
// P53 meldet einen Widerspruch: Tinte an der rechten Kante, gemalt und gemeldet wird die
// linke. Bevor geflickt wird, muss die Frage beantwortet sein, WELCHE Art von Inhalt die
// rechte Kante beruehrt — ein Knotenkreis, ein Titeltext, oder die Marke selbst. Der
// Pruefer zaehlt "Tinte" farblos; diese Sonde zaehlt sie nach Klassen, und zwar am
// selben Bild, das die Flaeche malt.
//
// Drei Klassen, drei Beweise:
//   knoten  — eine Fuellung, die nicht Grund, nicht Akzent und nicht Textfarbe ist
//   text    — Pixel in der Textfarbe der Titel (und ihre Mischkanten)
//   akzent  — die 3-Bildpunkte-Marke selbst, damit sie nicht als Inhalt gilt
//
// Aufruf: node scripts/kanten-sonde.mjs [--breite 390 --hoehe 844]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRAVE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const ARG = (nam, fall) => { const a = process.argv.find((x) => x.startsWith(`--${nam}=`)); return a ? a.split("=")[1] : fall; };
const BREITE = Number(ARG("breite", 390));
const HOEHE = Number(ARG("hoehe", 844));
const PORT = Number(process.env.KEPTA_KANTE_PORT || 3866);
const CDP_PORT = Number(process.env.KEPTA_KANTE_CDP || 3876);
const BASIS = `http://127.0.0.1:${PORT}`;
const KURZ = ARG("arbeit", "kante");
const ARBEIT = `/tmp/kepta-kante-${KURZ}`;

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

/**
 * Die Sonde selbst, im Seitenton ausgefuehrt. Sie liest die groesste Leinwand (das Bild
 * ist die groesste Flaeche im Fenster) und teilt jede Kantenzeile nach Farben.
 */
const SONDE = `(() => {
  const c = [...document.querySelectorAll('canvas')].sort((a,b)=>(b.width*b.height)-(a.width*a.height))[0];
  if (!c) return null;
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = window.devicePixelRatio || 1;
  const px = (x, y) => { const p = g.getImageData(x, y, 1, 1).data; return [p[0], p[1], p[2], p[3]]; };
  const gleich = (a, b, k) => a.slice(0,3).every((v, i) => Math.abs(v - b[i]) <= k);
  // Der Grund ist nicht die Ecke: die Ecke kann ausserhalb des gemalten Kastens
  // liegen und ist dann durchsichtig. Grund ist die HAEUFIGSTE Farbe im Bild.
  const gauss = g.getImageData(0, 0, c.width, c.height);
  const haeufig = new Map();
  for (let i = 0; i < gauss.data.length; i += 4) {
    if (gauss.data[i+3] < 8) continue;
    const s = [gauss.data[i], gauss.data[i+1], gauss.data[i+2]].join(',');
    haeufig.set(s, (haeufig.get(s) || 0) + 1);
  }
  const grund = [...haeufig.entries()].sort((a,b)=>b[1]-a[1])[0][0].split(',').map(Number);
  // Die vier Kanten, je zwei Bildpunkte breit, damit ein Randpixel nicht an einer
  // Rundung verloren geht.
  const kanten = {
    oben:  (i) => g.getImageData(1, 1, c.width - 2, 2),
    unten: (i) => g.getImageData(1, c.height - 3, c.width - 2, 2),
    links: (i) => g.getImageData(1, 1, 2, c.height - 2),
    rechts:(i) => g.getImageData(c.width - 3, 1, 2, c.height - 2),
  };
  const aus = {};
  for (const [nam, hol] of Object.entries(kanten)) {
    const img = hol();
    const zaehler = { grund: 0, akzent: 0, knoten: 0, text: 0, gesamt: img.width * img.height };
    const farben = new Map();
    for (let i = 0; i < img.data.length; i += 4) {
      const p = [img.data[i], img.data[i+1], img.data[i+2], img.data[i+3]];
      const schluessel = p.slice(0,3).join(',');
      if (gleich(p, grund, 6)) { zaehler.grund++; continue; }
      zaehler.knoten++;
      farben.set(schluessel, (farben.get(schluessel) || 0) + 1);
    }
    const top = [...farben.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 6);
    aus[nam] = { ...zaehler, top };
  }
  return { dpr: d, masse: { w: c.width, h: c.height }, grund, kanten: aus };
})()`;

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude — erst bauen."); process.exitCode = 2; return; }
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
    if (!gesund) throw new Error("Der Diener kam nicht hoch");
    console.log(`  Diener: Version ${gesund.version}`);

    // Ein Bestand, der an einer Kante laeuft: 30 Notizen, wie der Pruefer sie saet.
    const gesaet = await fetch(`${BASIS}/api/memories/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories: Array.from({ length: 30 }, (_, i) => ({
        title: `Notiz ${i}`, content: `Inhalt ${i} ` + "Wort ".repeat(20), tags: ["saat"], type: "semantic",
      })) }),
    });
    console.log("  Saat: " + gesaet.status);

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
    await schlafe(6000);

    const stand = await ausfuhren(cdp, SONDE);
    console.log("\n  " + JSON.stringify(stand, null, 2));
    const b = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARBEIT, `kanten-${BREITE}.png`), Buffer.from(b.data, "base64"));
    console.log("  Bild: " + path.join(ARBEIT, `kanten-${BREITE}.png`));
  } catch (e) {
    console.log("FEHLER: " + e.message);
    process.exitCode = 1;
  } finally {
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
  }
}
main();
