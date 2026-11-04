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
  const stil = getComputedStyle(document.documentElement);
  const rgb = (nam) => { const w = stil.getPropertyValue(nam).trim(); const m = w.match(/(\\d+)\\s+(\\d+)\\s+(\\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
  const arten = ['--type-semantic', '--type-episodic', '--type-procedural', '--type-document']
    .map(rgb).filter(Boolean);
  const text = rgb('--text-1') || [251, 251, 248];
  const akzent = rgb('--accent') || [255, 136, 115];
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
    const zaehler = { grund: 0, akzent: 0, knoten: 0, text: 0, unsichtbar: 0, gesamt: img.width * img.height };
    const farben = new Map();
    for (let i = 0; i < img.data.length; i += 4) {
      const p = [img.data[i], img.data[i+1], img.data[i+2], img.data[i+3]];
      if (p[3] < 8) { zaehler.unsichtbar++; continue; }
      const schluessel = p.slice(0,3).join(',');
      if (gleich(p, grund, 6)) { zaehler.grund++; continue; }
      if (arten.some((a) => gleich(p, a, 10))) { zaehler.knoten++; farben.set(schluessel, (farben.get(schluessel) || 0) + 1); continue; }
      if (gleich(p, text, 12)) { zaehler.text++; farben.set('TEXT ' + schluessel, (farben.get('TEXT ' + schluessel) || 0) + 1); continue; }
      if (gleich(p, akzent, 10)) { zaehler.akzent++; continue; }
      zaehler.knoten++;
      farben.set('ANDRE ' + schluessel, (farben.get('ANDRE ' + schluessel) || 0) + 1);
    }
    const top = [...farben.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 6);
    aus[nam] = { ...zaehler, top };
  }
  // Die Geometrie der Ebenen: Leinwand, ihr Rand, und der undurchsichtige Kasten im Bild.
  const cr = c.getBoundingClientRect();
  const kasten = (() => {
    const img = g.getImageData(0, 0, c.width, c.height);
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (img.data[(y * c.width + x) * 4 + 3] >= 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  })();
  const kette = [];
  for (let el = c, i = 0; el && i < 5; i++) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    kette.push({ tag: el.tagName, klasse: String(el.className || '').slice(0, 60),
      css: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      rand: s.borderTopWidth + ' ' + s.borderRightWidth, fuellung: s.paddingLeft + ' ' + s.paddingRight,
      ecke: s.borderRadius, grund: s.backgroundColor, ueberlauf: s.overflow });
    el = el.parentElement;
  }
  // Drittens: derselbe Vergleich auf dem TRAEGER, den der Bild-Export benutzt
  // (Grund drauf, Leinwand drauf). Der Export laedt ueber einen Download - hier zaehlt
  // dieselbe Komposition, ohne dass eine Datei den Ordner verlaengert.
  const traeger = document.createElement('canvas');
  traeger.width = c.width; traeger.height = c.height;
  const tx = traeger.getContext('2d');
  const stil2 = getComputedStyle(document.documentElement);
  tx.fillStyle = (stil2.getPropertyValue('--bg-panel-solid') || '#151515').trim();
  tx.fillRect(0, 0, traeger.width, traeger.height);
  tx.drawImage(c, 0, 0);
  const klassenTraeger = {};
  {
    const rand = (x0, y0, bw, bh) => {
      const im = tx.getImageData(x0, y0, bw, bh);
      const z = { grund: 0, akzent: 0, inhalt: 0, unsichtbar: 0 };
      const haeufig = new Map();
      for (let i = 0; i < im.data.length; i += 4) {
        const q = [im.data[i], im.data[i+1], im.data[i+2], im.data[i+3]];
        if (q[3] < 8) { z.unsichtbar++; continue; }
        const s = q.slice(0,3).join(',');
        haeufig.set(s, (haeufig.get(s) || 0) + 1);
        if (gleich(q, grund, 6)) { z.grund++; continue; }
        if (gleich(q, akzent, 12)) { z.akzent++; continue; }
        z.inhalt++;
      }
      z.top = [...haeufig.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 4);
      return z;
    };
    klassenTraeger.oben = rand(1, 1, traeger.width - 2, 2);
    klassenTraeger.unten = rand(1, traeger.height - 3, traeger.width - 2, 2);
    klassenTraeger.links = rand(1, 1, 2, traeger.height - 2);
    klassenTraeger.rechts = rand(traeger.width - 3, 1, 2, traeger.height - 2);
  }
  // Und die Meldung der Flaeche selbst, aus dem Attribut am Rand der Zeile.
  const gemeldet = [...document.querySelectorAll('[data-kanten]')].map((e) => e.getAttribute('data-kanten'));
  return { gemeldet, traeger: klassenTraeger, dpr: d, masse: { w: c.width, h: c.height }, leinwandCss: { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) }, kasten, kette, grund, akzent, kanten: aus };
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

    // Dritter Zeuge: **derselbe Schirmsschuss**, also was der Mensch wirklich sieht.
    // Die Leinwandmisst nur ihre eignen Pixel (durchsichtig uber der CSS-Flaeche), der
    // Traeger misst die Export-Komposition. Ohne den Schirm ist die Frage "ist die Marke
    // im Export blasser als auf dem Schirm" nicht entscheidbar - gemessen 4.11. 01:52,
    // wo beide Spalten eine Marke zaehlen, die der Betrachter in beiden Faellen gleich
    // sieht oder gleich nicht sieht, und kein Lauf das trennte.
    const { entpacke } = await import("./helfer/png-kante.mjs");
    const schirm = entpacke(Buffer.from(b.data, "base64"));
    if (schirm.meldung) {
      console.log("  Schirm kann nicht gelesen werden: " + schirm.meldung);
    } else {
      const d = stand.dpr || 2;
      const cx = Math.round(stand.leinwandCss.x * d);
      const cy = Math.round(stand.leinwandCss.y * d);
      const grund = stand.grund, akzent = stand.akzent;
      const misch = (a) => a.map((v, i) => Math.round(0.75 * v + 0.25 * grund[i]));
      const gemischt = misch(akzent);
      const gleich = (p, q, k) => q && p.every((v, i) => Math.abs(v - q[i]) <= k);
      const k = stand.masse.w, h = stand.masse.h;
      const streifen = (x0, y0, bw, bh) => {
        const z = { grund: 0, akzentRein: 0, akzentGemischt: 0, andres: 0, gesamt: bw * bh };
        const haeufig = new Map();
        for (let y = y0; y < y0 + bh; y++) {
          for (let x = x0; x < x0 + bw; x++) {
            const sx = cx + x, sy = cy + y;
            if (sx < 0 || sy < 0 || sx >= schirm.w || sy >= schirm.h) continue;
            const o = (sy * schirm.w + sx) * schirm.bpp;
            const p = [schirm.mal[o], schirm.mal[o + 1], schirm.mal[o + 2]];
            const schluessel = p.join(",");
            haeufig.set(schluessel, (haeufig.get(schluessel) || 0) + 1);
            if (gleich(p, grund, 6)) { z.grund++; continue; }
            if (gleich(p, akzent, 12)) { z.akzentRein++; continue; }
            if (gleich(p, gemischt, 12)) { z.akzentGemischt++; continue; }
            z.andres++;
          }
        }
        z.top = [...haeufig.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 4);
        return z;
      };
      const vier = {
        oben: streifen(1, 1, k - 2, 2),
        unten: streifen(1, h - 3, k - 2, 2),
        links: streifen(1, 1, 2, h - 2),
        rechts: streifen(k - 3, 1, 2, h - 2),
      };
      console.log(`  Schirm-Anker: Geraetepixel ${schirm.w} x ${schirm.h}, Leinwand bei ${cx},${cy}, Grund ${grund}, Akzent ${akzent}, erwartet gemischt ${gemischt}`);
      for (const [nam, z] of Object.entries(vier)) {
        console.log(`    ${nam}: grund ${z.grund}, Akzent rein ${z.akzentRein}, Akzent gemischt ${z.akzentGemischt}, andres ${z.andres} von ${z.gesamt} | ${JSON.stringify(z.top)}`);
      }

      // Das Urteil, nicht noch eine Zahl: **ist die Marke auf dem Schirm dieselbe wie im
      // Export?** Die beiden Spalten waren sich uneins, weil die Leinwand ihre eigne, noch
      // ungemischte Farbe zaehlt, ein Mensch aber die komponierte sieht. Verglichen wird die
      // haeufigste Farbe einer gemeldeten Kante, die weder Grund noch Karten- noch Panel-Farbe
      // ist — auf beiden Flaechen nach demselben Suchen, Toleranz 6 je Kanal.
      const ziffern = (s) => String(s).split(",").map(Number);
      const nahest = (a, b2) => a && b2 && a.every((v, i) => Math.abs(v - b2[i]) <= 6);
      const karte = ziffern((vier.oben.top[0] || ["", 0])[0]);
      const panel = ziffern(((stand.traeger.oben || {}).top || [["", 0]])[0][0]);
      const marke = (top, verbot) => (top || [])
        .map(([s, n]) => [ziffern(s), n])
        .find(([c2]) => !verbot.some((v) => nahest(c2, v)));
      const gemeldeteKanten = (stand.gemeldet || []).join(" ").split(/\s+/).filter(Boolean);
      // Die Latte ist nicht mein Gefuehl, sondern die Zahl, die das Haus fuer eine Grafik
      // gelten laesst, die etwas sagen muss: **mindestens 3:1 Kontrast gegen den Grund, auf
      // dem sie liegt** (WCAG fuer nicht-textliche Bildinhalte; 4,5:1 gilt hier nur fuer Wort).
      // Verglichen wird auf beiden Flaechen, und gegen den *strengeren* der beiden Grunda.
      const leuchtkraft = (c) => {
        const e = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * e(c[0]) + 0.7152 * e(c[1]) + 0.0722 * e(c[2]);
      };
      const verhaeltnis = (a, b2) => {
        const L1 = leuchtkraft(a), L2 = leuchtkraft(b2);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      };
      console.log("  Marken-Urteil (gemeldete Kante: Schirm gegen Traeger, Latte 3:1 auf beiden Ebenen):");
      let fehl = 0;
      for (const nam of gemeldeteKanten) {
        const s = marke((vier[nam] || {}).top, [grund, karte]);
        const t = marke((stand.traeger[nam] || {}).top, [grund, panel]);
        if (!s || !t) { console.log(`    ${nam}: keine Marke gefunden (Schirm ${JSON.stringify(s)}, Traeger ${JSON.stringify(t)})`); fehl++; continue; }
        const sUnt = Math.min(verhaeltnis(s[0], karte), verhaeltnis(s[0], grund));
        const tUnt = Math.min(verhaeltnis(t[0], panel), verhaeltnis(t[0], grund));
        const abstand = Math.max(...s[0].map((v, i) => Math.abs(v - t[0][i])));
        const ok = sUnt >= 3 && tUnt >= 3;
        if (!ok) fehl++;
        console.log(`    ${nam}: Schirm ${s[0].join(",")} bei ${sUnt.toFixed(2)}:1 gegen Traeger ${t[0].join(",")} bei ${tUnt.toFixed(2)}:1 — Kanal-Abstand ${abstand} (Unterschied, nicht Urteil), ${ok ? "Marke auf beiden Ebenen sichtbar" : "MARKE ZU SCHWACH"}`);
      }
      if (!gemeldeteKanten.length) console.log("    keine Kante gemeldet — dieser Vergleich hat hier keinen Gegenstand");
      console.log(`  URTEIL MARKE: ${fehl ? fehl + " Kante(n) ohne Marke oder unter 3:1" : gemeldeteKanten.length ? "jede gemeldete Kante traegt eine Marke ueber 3:1, auf Schirm und im Export" : "ohne Gegenstand (keine gemeldete Kante)"}`);
      if (fehl) process.exitCode = 1;
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
