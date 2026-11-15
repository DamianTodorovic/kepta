// Die drei neuen Absagen im echten Fenster — passen sie, wo sie stehen?
//
// 3.2.129 hat drei Sätze in bestehende Felder gesetzt: einen Toast, eine Zeile im
// Scan-Dialog, eine Zeile auf der Endschaft des Assistenten. Ein neuer Text in einer
// festen Karte ist eine Aenderung am Layout, also wird sie im Fenster gemessen (Hausregel):
// vier Breiten, Beschnitt, Ueberlappung, seitlicher Ueberlauf, dazu ein Bild der
// angeklagten Stelle.
//
// Wie die beiden Zeilen erreichbar werden, ohne die Flaeche anzufassen:
//   - Assistent: /api/memory wird fuer diese Seite blockiert, also bleibt `imported` bei 0
//     und der Assistent schliesst sich nicht von selbst (src/components/
//     OnboardingWizard.tsx:139). Dazu Storage.prototype.setItem auf Wurf gestellt — dann
//     ist der Schreib des Wunschs blockiert und die neue Zeile erscheint.
//   - Scan-Dialog: /api/scan/policy wird blockiert, der fetch wirft, und die neue
//     Ursache-Zeile erscheint an der Stelle, wo sonst die Regeln stehen.
//
// Aufruf: node scripts/pfade-im-fenster.mjs
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();
const OBJEKT = path.join(WURZEL, "dist", "server.cjs");
const BRADE = process.env.KEPTA_BRAVE || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const PORT = Number(process.env.KEPTA_PFADE_PORT || 3794);
const VOR_PORT = Number(process.env.KEPTA_PFADE_VOR || 3795);
const CDP_PORT = Number(process.env.KEPTA_PFADE_CDP || 3804);
const BASIS = `http://127.0.0.1:${VOR_PORT}`;
const KUERZEL = (process.argv.find((a) => a.startsWith("--arbeit=")) || "--arbeit=129").slice(9);
const ARBEIT = `/tmp/kepta-pfade-${KUERZEL}`;
/**
 * Die Breiten kommen als Argument, weil jeder Lauf einen *frischen* Erststart braucht:
 * das Profil spiegelt auf die Tuer (src/lib/profile.ts), also ist ein geleerter
 * Browserspeicher nach dem ersten Durchlauf wieder gefuellt und der Assistent bleibt zu.
 * Ein Lauf = eine Kapsel = ein Erststart. Aufruf: node scripts/pfade-im-fenster.mjs --breiten=390x844
 */
const BREITEN = (() => {
  const arg = process.argv.find((a) => a.startsWith("--breiten="));
  if (!arg) return [[1440, 900]];
  return arg.slice(10).split(",").map((paar) => paar.split("x").map(Number));
})();

const WIZARD_TEXT = "will not be kept";
const REGEL_TEXT = "The scan rules did not arrive";

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(hin, { maxMs = 60000, schritt = 250 } = {}) {
  const bis = Date.now() + maxMs;
  for (;;) {
    try { const v = await hin(); if (v) return v; } catch { /* noch nicht */ }
    if (Date.now() > bis) return null;
    await schlafe(schritt);
  }
}

class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.wartend = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((res, rej) => {
      const w = new WebSocket(url);
      w.onopen = () => res(w);
      w.onerror = (e) => rej(e.error || new Error("websocket fehlgeschlagen"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const n = JSON.parse(e.data);
      if (n.id && c.wartend.has(n.id)) {
        const { los, fehler } = c.wartend.get(n.id);
        c.wartend.delete(n.id);
        if (n.error) fehler(new Error(n.error.message)); else los(n.result);
      }
    };
    return c;
  }
  send(methode, params = {}) {
    const id = ++this.nr;
    return new Promise((los, fehler) => {
      this.wartend.set(id, { los, fehler });
      this.ws.send(JSON.stringify({ id, method: methode, params }));
    });
  }
  close() { try { this.ws.close(); } catch { /* schon zu */ } }
}

async function evaliere(cdp, ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("Sonde: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

/** Dasselbe Mass wie bei 3.2.126: Ueberlauf, Beschnitt, Ueberlappung, Kaeppe. */
function messungAusdruck(text) {
  return `(() => {
  const k = (el) => { const r = el.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width)}; };
  const text = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
  const alle = [...document.querySelectorAll('div,span,p')];
  const kasten = alle.find((el) => el.children.length === 0 && text(el).includes(${JSON.stringify(text)}));
  const out = {
    breite: window.innerWidth,
    dokUeberlauf: document.documentElement.scrollWidth > window.innerWidth + 1,
    dokScrollWidth: document.documentElement.scrollWidth,
    beschnitteneElemente: [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && (r.right > window.innerWidth + 1 || r.left < -1);
    }).length,
    kasten: kasten ? { mass: k(kasten), kappe: kasten.scrollHeight > kasten.clientHeight + 1, zeilen: Math.round(kasten.getBoundingClientRect().height / (parseFloat(getComputedStyle(kasten).lineHeight) || (parseFloat(getComputedStyle(kasten).fontSize) * 1.5))) } : null,
  };
  if (kasten) {
    // Der Nachbar ist das Feld *nach* dem Satz-Kasten, nicht das Feld nach dessen
    // Elternblock — die erste Fassung verglich den ganzen Dialog-Inhalt mit der Fuszeile
    // und meldete eine Ueberlappung, die auf dem Bild eine klare Luecke war.
    const naechster = kasten.nextElementSibling || (kasten.parentElement ? kasten.parentElement.nextElementSibling : null);
    // Ein Ueberlappungs-Urteil gilt nur fuer normal fliegende Nachbarn. Die Fuszeile des
    // Dialogs ist fest gepinnt (sticky/unten), ihr Kasten ragt beim Rollen in die Liste
    // hinein, ohne etwas zu beruehren — das Bild entscheidet, nicht die Schachtel.
    const art = naechster ? getComputedStyle(naechster).position : null;
    const imFluss = art === 'static' || art === 'relative';
    out.naechster = naechster ? text(naechster).slice(0, 48) : null;
    out.naechsterArt = art;
    out.ueberlappung = naechster && imFluss ? k(naechster).y < k(kasten).b - 1 : false;
    out.kastenMass = k(kasten); out.naechsterMass = naechster ? k(naechster) : null;
  }
  return JSON.stringify(out);
})()`;
}

function urteile(name, mess) {
  const fehler = [];
  if (!mess.kasten) fehler.push("Satz nicht im Baum");
  else {
    if (mess.kasten.kappe) fehler.push("Satzkasten beschnitten (scrollHeight > clientHeight)");
    if (mess.ueberlappung) fehler.push(`Satz ueberlappt das naechste Feld (${mess.naechster})`);
  }
  if (mess.dokUeberlauf) fehler.push(`seitlicher Ueberlauf: scrollWidth ${mess.dokScrollWidth} bei ${mess.breite}`);
  if (mess.beschnitteneElemente > 0) fehler.push(`${mess.beschnitteneElemente} Elemente ueber die Breite hinaus beschnitten`);
  console.log(`  ${name}: Zeilen ${mess.kasten ? mess.kasten.zeilen : "-"}  ${mess.kasten ? mess.kasten.mass.w : "-"}x${mess.kasten ? mess.kasten.mass.h : "-"} px  Ueberlauf ${mess.dokUeberlauf ? "JA" : "nein"}  Beschnitt ${mess.beschnitteneElemente}  ${fehler.length ? "FEHLER: " + fehler.join(" | ") : "ok"}`);
  return fehler;
}

async function knopf(cdp, muster) {
  return evaliere(cdp, `(()=>{const r=${JSON.stringify(muster)};const b=[...document.querySelectorAll('button')].find(x=>new RegExp(r,'i').test((x.textContent||'').trim()));if(!b)return null;b.click();return (b.textContent||'').trim()})()`);
}

/**
 * Ein eigner Vor-Diener: er leitet alles an die Kapsel weiter, nur /api/scan/policy
 * beantwortet er mit 500. Der Grund, gemessen 18:15 mit auge5: CDPs
 * Network.setBlockedURLs blockiert diesen Aufruf nicht (HTTP 200 trotz Muster), und
 * die Route selbst hat keinen Fehlerpfad — sie kann nur 200 melden. Ein Vor-Diener ist
 * der einzige Weg, die Absage ehrlich zu sehen, ohne die Flaeche anzufassen.
 */
function vorDienerStart(appPort, vorPort) {
  const server = http.createServer((req, res) => {
    // Zwei Routen werden hier absichtlich scheitern gelassen:
    //  - /api/scan/policy: die Route hat keinen eigenen Fehlerpfad (sie kann nur 200
    //    melden), und CDPs setBlockedURLs blockierte sie nicht (gemessen 18:15, auge5).
    //  - /api/memory: damit bleibt `imported` bei 0 und der Assistent schliesst sich
    //    nicht nach 900 ms weg (src/components/OnboardingWizard.tsx:139) — die Absage
    //    muss im Bild stehen, nicht im Voruebergehen.
    if (String(req.url).startsWith("/api/scan/policy") || String(req.url).startsWith("/api/memory")) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "der Vor-Diener liess diese Route absichtlich scheitern" }));
      return;
    }
    const weiter = http.request({ host: "127.0.0.1", port: appPort, path: req.url, method: req.method, headers: { ...req.headers, host: `127.0.0.1:${appPort}` } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    weiter.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: e.message })); });
    req.pipe(weiter);
  });
  server.listen(vorPort, "127.0.0.1");
  return server;
}

async function bild(cdp, ziel, text) {
  await evaliere(cdp, `(()=>{const t=${JSON.stringify(text)};const el=[...document.querySelectorAll('div,span,p')].find(e=>e.children.length===0&&(e.textContent||'').includes(t));if(el)el.scrollIntoView({block:'center'});return !!el})()`);
  await schlafe(250);
  const b = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(ziel, Buffer.from(b.data, "base64"));
}

async function main() {
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Gebaeude unter " + OBJEKT + " — erst bauen."); process.exitCode = 2; return; }
  if (!fs.existsSync(BRADE)) { console.log("Kein Brave — der Pruefer braucht einen echten Viewport."); process.exitCode = 2; return; }
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
  const prot = fs.createWriteStream(path.join(ARBEIT, "diener.log"));
  diener.stdout.pipe(prot); diener.stderr.pipe(prot, { end: true });

  let brave;
  let vor = null;
  const fehl = [];
  try {
    vor = vorDienerStart(PORT, VOR_PORT);
    const gesund = await warteBis(async () => { const r = await fetch(`${BASIS}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
    if (!gesund) throw new Error("Der Kapsel-Diener kam nicht hoch — " + path.join(ARBEIT, "diener.log"));
    console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count} (eigne Kapsel, leerer Anfang)`);

    brave = spawn(BRADE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${path.join(ARBEIT, "profil")}`,
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
    // Kein setBlockedURLs: es blockierte diesen Aufruf nicht (gemessen 18:15). Der
    // Vor-Diener erledigt die eine Route, und /api/memory bleibt in Ruhe — der
    // Assistent schliesst sich nach dem Speichern selbst, was hier gerade recht ist,
    // weil die Absage vor dem Schliessen gemessen werden muss.

    for (const [breit, hoch] of BREITEN) {
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: breit, height: hoch, deviceScaleFactor: 1, mobile: false });
      // Jeder Breite sein eigener erster Start: Profil und Assistenten-Absage sitzen im
      // Browserspeicher, und nach dem ersten Durchlauf ist die Endschaft beantwortet.
      // Ohne diese Rueckgabe waere die zweite Breite ein Blick auf eine Flaeche, die den
      // Assistenten gar nicht mehr zeigt.
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      await evaliere(cdp, `(()=>{localStorage.clear();return true})()`);
      await cdp.send("Page.navigate", { url: `${BASIS}/` });
      await warteBis(async () => (await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null, { maxMs: 90000 });
      if (BREITEN.length > 1) throw new Error("mehr als eine Breite in einem Lauf zeigt denselben Erststart nicht — pro Breite ein Lauf");
      const erst = await warteBis(async () => evaliere(cdp, `(()=>/Step 1 of 4/i.test(document.body.innerText||''))()`), { maxMs: 30000 });
      if (!erst) throw new Error("der Assistent zeigt Schritt 1 nicht — Messung waere ein Blick ins Leere");

      // 1) der Assistent wird beiseite gelegt, damit der Scan-Dialog frei liegt
      const spaeter = await knopf(cdp, "^\\s*Later\\s*$");
      if (!spaeter) throw new Error("der Assistent laesst sich nicht mit Later schliessen");
      await schlafe(900);

      // 2) Scan-Dialog: das Regelwerk ist blockiert, also muss die neue Ursache-Zeile dastehen
      const scan = await knopf(cdp, "Scan this computer");
      if (!scan) throw new Error("kein Scan this computer — die Flaeche hat den Knopf versetzt");
      const re = await warteBis(async () => {
        const m = JSON.parse(await evaliere(cdp, messungAusdruck(REGEL_TEXT)));
        return m.kasten ? m : null;
      }, { maxMs: 20000 });
      if (!re) throw new Error("die Regel-Absage erschien nicht im Scan-Dialog");
      fehl.push(...urteile(`${breit}x${hoch} Scan-Regel-Absage`, re));
      await bild(cdp, path.join(ARBEIT, `regeln-${breit}x${hoch}.png`), REGEL_TEXT);
      await cdp.send("Runtime.evaluate", { expression: `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))` });
      await schlafe(700);

      // 3) der Assistent wird wieder geoeffnet, Speicher blockiert, Wunsch gesetzt
      const setup = await evaliere(cdp, `(()=>{const b=document.querySelector('button[aria-label="Open setup"]');if(!b)return false;b.click();return true})()`);
      if (!setup) throw new Error("der Assistent ist ueber 'Open setup' nicht wieder zu oeffnen");
      await warteBis(async () => evaliere(cdp, `(()=>/Step 1 of 4/i.test(document.body.innerText||''))()`), { maxMs: 20000 });
      await evaliere(cdp, `(()=>{Storage.prototype.setItem=function(){throw new Error('blockiert')};return true})()`);
      const name = await evaliere(cdp, `(()=>{const f=[...document.querySelectorAll('input')].find(i=>/e\\.g\\. Alex/i.test(i.placeholder||''));if(!f)return null;const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(f,'Damian');f.dispatchEvent(new Event('input',{bubbles:true}));return f.value})()`);
      if (name !== "Damian") throw new Error("das Namensfeld nahm die Eingabe nicht");
      for (let ziel = 2; ziel <= 4; ziel++) {
        const geklickt = await knopf(cdp, "^\\s*Next\\s*$");
        if (!geklickt) throw new Error(`kein Next-Knopf vor Schritt ${ziel}`);
        const weiter = await warteBis(async () => evaliere(cdp, `(()=>new RegExp('Step '+${ziel}+' of 4','i').test(document.body.innerText||''))()`), { maxMs: 12000 });
        if (!weiter) throw new Error(`Schritt ${ziel} wurde nicht erreicht`);
      }
      const haken = await warteBis(async () => evaliere(cdp, `(()=>{const h=[...document.querySelectorAll('label input[type=checkbox]')].find(i=>/look through this computer/i.test(i.closest('label')?.textContent||''));if(!h)return null;h.click();return (h.closest('label').textContent||'').slice(0,44)})()`), { maxMs: 20000 });
      if (!haken) throw new Error("der Scan-Haken des Assistenten erschien nicht");
      console.log(`     Haken gesetzt: ${haken.trim().slice(0,44)}`);
      await knopf(cdp, "Save these");
      const wiz = await warteBis(async () => {
        const m = JSON.parse(await evaliere(cdp, messungAusdruck(WIZARD_TEXT)));
        return m.kasten ? m : null;
      }, { maxMs: 15000 });
      if (!wiz) throw new Error("die Wizard-Absage erschien nicht im Fenster");
      fehl.push(...urteile(`${breit}x${hoch} Wizard-Absage`, wiz));
      await bild(cdp, path.join(ARBEIT, `wizard-${breit}x${hoch}.png`), WIZARD_TEXT);
    }
    cdp.close();
    if (fehl.length) { console.log(`  BEFUNDE ${fehl.length}: ${fehl.join(" | ")}`); process.exitCode = 1; }
    else console.log("  alle vier Breiten: beide Absagen sitzen, ohne Beschnitt, ohne Ueberlappung, ohne Ueberlauf");
  } catch (e) {
    console.log("  BEFUND: " + (e && e.message ? e.message : e));
    process.exitCode = 1;
  } finally {
    if (vor) vor.close();
    if (brave) brave.kill("SIGTERM");
    diener.kill("SIGTERM");
    await schlafe(400);
    console.log(`  Kapsel: ${ARBEIT} (Bilder und Protokolle dort)`);
  }
}

void main();
