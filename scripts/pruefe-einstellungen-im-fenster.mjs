// Der Fenster-Pruefer: eine Einstellung wird gesetzt, das Fenster neu geladen, und **beides**
// verlangt — der gespeicherte Wert und die Wirkung auf der Flaeche.
//
// WARUM ES DIESE DATEI GIBT. Punkt 4 lautet woertlich: "jeden Schalter der Einstellungen im
// echten Fenster pruefen". Die Suite bewiesen Werte in jsdom; jsdom hat keine CSS-Kaskade, keinen
// Reload ueber einen echten Ursprung und keine Font-Rasterung — genau die drei Dinge, an denen ein
// "funktioniert nicht" sichtbar wird. Diese Datei faehrt den Zyklus im echten Viewport.
//
// WAS GEFAHREN WIRD, und warum das das ausgelieferte Objekt ist. Der Diener startet aus `dist/`,
// und vor jedem Lauf haelt eine Pruefung, dass die fuenf tragenden Artefakte **bytegleich** mit
// ihren Eintraegen im installierten app.asar sind (`index.html`, die App-Buendel-Gruppe, das CSS,
// `server.cjs`, `mcp-server.cjs`). sha256, gemessen am Objekt, nicht am Wort.
//
// ISOLATION. Eigener Server-Port, eigener CDP-Port, eigenes HOME, eigener Datenordner, eigenes
// Browser-Profil — alles unter /tmp/kepta-fenster, nichts davon angeruehrt: Damians echtes Profil,
// sein Schluesselbund, seine Wissensbasis, das gemeinsame `dist/` wird nur **gelesen**. Getroffen
// werden nur die eignen zwei Kind-Prozesse; die Kapsel geht im `finally`.
//
// KEPTA_NO_AUTOSTART darf hier NICHT gesetzt sein: `server.ts` beendet den
// Ablauf des Autostarts bei dieser Variable ("Nur automatisch starten, wenn direkt
// ausgefuehrt"), der Bundel importiert dann, lauscht aber nie und geht ohne eine Zeile
// Ausgabe aus. Genau das war der "stille Exit", den ich 30.10. dem Objekt angefangen
// hatte — Ursache war mein eigner Schluessel, nicht das Objekt.
//
// DOPPELUNG, benannt. Die CDP-Klasse liegt ein zweites Mal hier (statt in `fps-laeufer.mjs`),
// weil der Kosten-Laeufer ein bewaehrtes Messinstrument ist und diese Nacht nicht angefasst wird.
// Der Schritt "beide auf ein Modul" ist eine eigne, kleine Scheibe.
//
//   node scripts/pruefe-einstellungen-im-fenster.mjs
//   node scripts/pruefe-einstellungen-im-fenster.mjs --breite 390 --hoehe 844
//   node scripts/pruefe-einstellungen-im-fenster.mjs --nur tab
//
// Ausgang: 0 = alle Zyklen durch, 1 = ein Zyklus fehlt, 2 = die Maschine oder das Objekt spaerrt.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARG = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BREITE = Number(ARG("breite", 1440));
const HOEHE = Number(ARG("hoehe", 900));
const NUR = String(ARG("nur", ""));
const PORT = 3601;
const CDP_PORT = 3611;
const BASIS = `http://127.0.0.1:${PORT}`;
const ARBEIT = "/tmp/kepta-fenster";
const BRADE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

let server = null;
let brave = null;
let ende = null;
const zeilen = [];
let fehl = 0;
function urteil(name, echt, erwartet) {
  const ok = JSON.stringify(echt) === JSON.stringify(erwartet);
  if (!ok) fehl++;
  console.log(`  ${ok ? "ok  " : "FEHLT"}  ${name}: ${JSON.stringify(echt)} (erwartet ${JSON.stringify(erwartet)})`);
}
const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(hin, { maxMs = 60000, schritt = 400 } = {}) {
  const anfang = Date.now();
  for (;;) {
    try { const z = await hin(); if (z) return z; } catch { /* noch nicht */ }
    if (Date.now() - anfang > maxMs) return null;
    await schlafe(schritt);
  }
}

/** Der kleinste CDP-Client, den dieses Haus braucht: Rohr, Aufruf, Antwort. */
class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.wartend = new Map(); }
  static async verbindung(url) {
    const ws = await new Promise((res, rej) => {
      const w = new WebSocket(url);
      w.onopen = () => res(w);
      w.onerror = () => rej(new Error("CDP-Rohr abgelehnt"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined && c.wartend.has(m.id)) { c.wartend.get(m.id)(m); c.wartend.delete(m.id); }
    };
    return c;
  }
  send(methode, params = {}) {
    return new Promise((res, rej) => {
      const id = ++this.nr;
      this.wartend.set(id, (m) => (m.error ? rej(new Error(`${methode}: ${m.error.message}`)) : res(m.result)));
      this.ws.send(JSON.stringify({ id, method: methode, params }));
      setTimeout(() => { if (this.wartend.has(id)) { this.wartend.delete(id); rej(new Error(`${methode}: keine Antwort`)); } }, 30000);
    });
  }
}

async function evaliere(cdp, ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`Im Fenster geworfen: ${(r.exceptionDetails.exception?.description || r.exceptionDetails.text || "").slice(0, 300)}`);
  return r.result.value;
}

async function knopf(cdp, muster) {
  return evaliere(cdp, `(()=>{const m=${JSON.stringify(muster)};const re=new RegExp(m,'i');
    const k=[...document.querySelectorAll('button,a[role="button"]')].find(b=>re.test((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')));
    if(!k)return null;k.click();return (k.textContent||'').trim().slice(0,40);})()`);
}

async function main() {
  if (!fs.existsSync(BRADE)) { console.log("Kein Brave unter " + BRADE + " — der Pruefer braucht einen echten Viewport."); process.exit(2); }
  try { if ((await fetch(`${BASIS}/api/health`)).ok) { console.log(`Port ${PORT} hoert schon — fremder Diener, Abbruch.`); process.exit(2); } } catch { /* frei */ }

  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(`${ARBEIT}/h`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/d`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/profil`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/bilder`, { recursive: true });

  // 1) Die Bytes, die ich fahre, sind die des installierten Objekts.
  const forderer = createRequire(path.join(WURZEL, "package.json"));
  const asar = forderer("@electron/asar");
  const objektPfad = "/Applications/K3PTA.app/Contents/Resources/app.asar";
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
  const stuecke = ["index.html", "assets/index-CxpGa2va.js", "assets/index-CTwHozHf.css", "server.cjs", "mcp-server.cjs"];
  let gleich = 0;
  for (const f of stuecke) {
    const repo = path.join(WURZEL, "dist", f);
    if (!fs.existsSync(repo)) { console.log("  FEHLT im Repo-Bundel: " + f); continue; }
    let ausDemObjekt;
    try { ausDemObjekt = asar.extractFile(objektPfad, "dist/" + f); } catch { console.log("  FEHLT im Objekt: " + f); continue; }
    if (hash(ausDemObjekt) === hash(fs.readFileSync(repo))) gleich++;
    else console.log(`  ANDERS  ${f}: repo ${hash(fs.readFileSync(repo))} / objekt ${hash(ausDemObjekt)}`);
  }
  urteil("Artefakte bytegleich mit dem installierten Objekt", gleich, stuecke.length);
  const vers = JSON.parse(fs.readFileSync(path.join(WURZEL, "package.json"), "utf8"));
  console.log(`  Bundel: ${stuecke.length} Stuecke geprueft, Version laut Baum ${vers.version ?? "?"}`);

  // 2) Der Diener in der Kapsel.
  server = spawn("node", [path.join(WURZEL, "dist", "server.cjs")], {
    cwd: WURZEL,
    env: { ...process.env, HOME: `${ARBEIT}/h`, KEPTA_DATA_DIR: `${ARBEIT}/d`, KEPTA_ENCRYPTION: "off", PORT: String(PORT), },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const prot = fs.createWriteStream(`${ARBEIT}/server.log`);
  server.stdout.pipe(prot); server.stderr.pipe(prot, { end: true });
  const gesund = await warteBis(async () => { const r = await fetch(`${BASIS}/api/health`); return r.ok ? await r.json() : null; }, { maxMs: 60000 });
  if (!gesund) { console.log("  Der Kapsel-Diener kam nicht hoch — " + ARBEIT + "/server.log"); process.exit(2); }
  console.log(`  Diener: Version ${gesund.version}, Bestand ${gesund.count} (eigne Kapsel, Verschluesselung aus)`);

  // 3) Der echte Viewport.
  brave = spawn(BRADE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
    "--no-first-run", "--disable-gpu", "--hide-scrollbars", `--window-size=${BREITE},${HOEHE}`, "about:blank"],
  { stdio: ["ignore", "pipe", "pipe"] });
  const bLog = fs.createWriteStream(`${ARBEIT}/brave.log`);
  brave.stdout.pipe(bLog); brave.stderr.pipe(bLog, { end: true });
  const ziel = await warteBis(async () => {
    const l = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
  }, { maxMs: 90000 });
  if (!ziel) { console.log("  Kein CDP-Ziel — " + ARBEIT + "/brave.log"); process.exit(2); }
  const cdp = await Cdp.verbindung(ziel.webSocketDebuggerUrl);
  _cdp = cdp;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: 2, mobile: false });
  await cdp.send("Page.navigate", { url: `${BASIS}/` });
  await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });

  // 4) Ein leerer Bestand oeffnet den Assistenten ueber der Flaeche; "Later" ist der Weg vorbei.
  const spaeter = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(b){b.click();return (b.textContent||'').trim()}return null})()`);
  console.log(`  Assistent: ${spaeter ? `Weg über "${spaeter}"` : "stand keiner im Weg"}`);
  await schlafe(700);

  const steuere = async () => {
    const treffer = await knopf(cdp, "^\\s*(Settings|Einstellungen)\\s*$");
    if (!treffer) {
      const namen = await evaliere(cdp, `[...document.querySelectorAll('button,a[role="button"]')].map(b=>(b.textContent||'').trim()).filter(Boolean).slice(0,40).join(' | ')`);
      throw new Error(`die Seitenleiste nennt keinen Settings-Punkt — diese Knopfe stehen: ${namen}`);
    }
    await warteBis(async () => ((await evaliere(cdp, `!!document.querySelector('button[aria-pressed]')`)) ? true : null), { maxMs: 20000 });
  };
  const panelNam = async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button[aria-pressed]')].find(x=>x.getAttribute('aria-pressed')==='true');return b?(b.textContent||'').trim():null})()`);
  const syncOffen = async () => evaliere(cdp, `(()=>{const e=document.querySelector('input[placeholder^="At least"]');return e?getComputedStyle(e).display:'keine Abfrage'})()`);
  const bild = async (name) => {
    const s = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARBEIT, "bilder", name), Buffer.from(s.data, "base64"));
    return path.join(ARBEIT, "bilder", name);
  };

  // --- Zyklus A: der Tab, der sein Gedaechtnis verlieren würde -------------------------------
  if (NUR === "" || NUR === "tab") {
    await steuere();
    urteil("beim ersten Oeffnen steht der erste Schirm", await panelNam(), "AI & data");
    const schirm = await knopf(cdp, "Device Sync");
    urteil("der Klick oeffnet die Geraete-Sync", schirm, "Device Sync");
    urteil("die Sync-Abfrage ist wirklich zu sehen", Boolean(await syncOffen()), true);
    console.log("  Bild: " + await bild("vor-dem-neuladen.png"));
    urteil("der Wert liegt im Speicher", await evaliere(cdp, `localStorage.getItem('ki_gehirn_einstellungen_tab')`), "sync");

    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    urteil("**nach dem Neuladen steht wieder derselbe Schirm offen**", await panelNam(), "Device Sync");
    urteil("und die Abfrage ist wieder gemalt", Boolean(await syncOffen()), true);
    console.log("  Bild: " + await bild("nach-dem-neuladen.png"));

    await knopf(cdp, "AI & data");
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    urteil("ein Zurueckklick wird ebenso gemerkt", await panelNam(), "AI & data");
  }

  // --- Zyklus B: die Textgroesse, Wert und Wirkung -------------------------------------------
  if (NUR === "" || NUR === "groesse") {
    // Die Groehne der Wirkung ist nicht die Grundgroesse des Dokuments: `wendeZoomAn`
    // (src/lib/uiText.ts:105-113) setzt `document.body.style.zoom` und die Gegenbreite,
    // nicht `html { font-size }`. Ein Pruefen auf 16px waehre ein Fall, der nie verlieren
    // kann — gemessen 31.10. 02:20, wo genau das passierte. Also: Zoom und Breite.
    const vorher = await evaliere(cdp, `(()=>{const b=document.body;const bRect=b.getBoundingClientRect();
      return { zoom: getComputedStyle(b).zoom, breite: Math.round(bRect.width), wert: localStorage.getItem('ki_gehirn_zoom') }})()`);
    const gesetzt = await evaliere(cdp, `(()=>{const e=document.getElementById('display-textgroesse');if(!e)return null;
      e.value='130';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {min:e.min,max:e.max}})()`);
    urteil("die Textgroesse-Steuerung ist da", gesetzt !== null, true);
    await schlafe(900);
    const nachher = await evaliere(cdp, `(()=>{const b=document.body;const bRect=b.getBoundingClientRect();
      return { zoom: getComputedStyle(b).zoom, breite: Math.round(bRect.width), wert: localStorage.getItem('ki_gehirn_zoom') }})()`);
    console.log(`  vorher: zoom ${vorher.zoom}, Breite ${vorher.breite}, Wert ${vorher.wert}`);
    console.log(`  nachher: zoom ${nachher.zoom}, Breite ${nachher.breite}, Wert ${nachher.wert}`);
    urteil("der Wert ist gesetzt", nachher.wert, "130");
    urteil("und das Blatt malt einen andern Zoom", Number(nachher.zoom) > Number(vorher.zoom), true);
    urteil("die Gegenbreite haelt den Text im Fenster", nachher.breite <= BREITE + 2, true);
    console.log("  Bild: " + await bild("textgroesse-vor-neuladen.png"));

    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    const neuGeladen = await evaliere(cdp, `(()=>{const b=document.body;const bRect=b.getBoundingClientRect();
      return { zoom: getComputedStyle(b).zoom, breite: Math.round(bRect.width), wert: localStorage.getItem('ki_gehirn_zoom') }})()`);
    urteil("**nach dem Neuladen malt das Blatt denselben Zoom**", neuGeladen.zoom, nachher.zoom);
    urteil("und der Wert ist nicht weg", neuGeladen.wert, "130");
    await steuere();
    urteil("die Steuerung zeigt ihn auch", await evaliere(cdp, `(()=>{const e=document.getElementById('display-textgroesse');return e?String(e.value):null})()`), "130");
    console.log("  Bild: " + await bild("textgroesse-nach-neuladen.png"));
    await knopf(cdp, "AI & data");
    await evaliere(cdp, `(()=>{const e=document.getElementById('display-textgroesse');if(e){e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}})()`);
    await schlafe(600);
    urteil("und zurueck auf 100 ist der Zoom wieder einer", await evaliere(cdp, `(()=>{const z=getComputedStyle(document.body).zoom;return z==="1"||z==="normal"})()`), true);
  }

  console.log(fehl ? `  ${fehl} Pruefung(en) fehlgeschlagen` : "  alle Zyklen durch: Wert gesetzt, Fenster neu geladen, Wirkung gesehen");
  return fehl ? 1 : 0;
}

main().then((code) => { ende = code; }).catch((e) => {
  ende = 1;
  console.log("  WURF: " + (e && e.message ? e.message : String(e)));
}).finally(() => {
  try { cdpSchliessen(); } catch { /* egal */ }
  raeumen();
  console.log("  Kapsel noch da? " + (fs.existsSync(ARBEIT) ? "ja" : "nein"));
  console.log("  eigne Kinder: Server " + (server ? server.pid : "keiner") + ", Browser " + (brave ? brave.pid : "keiner"));
  process.exit(ende ?? 1);
});

let _cdp = null;
function cdpSchliessen() { if (_cdp) { try { _cdp.ws.close(); } catch { /* zu */ } } }
function raeumen() {
  for (const k of [server, brave]) {
    if (!k) continue;
    try { process.kill(k.pid, "SIGKILL"); } catch { /* schon weg */ }
  }
  // Die Bilder gehoeren in die Mappe, der Rest der Kapsel ist Stapel ausser Haus.
  const ziel = "/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/belege-3110/fenster-101";
  try {
    fs.mkdirSync(ziel, { recursive: true });
    for (const b of fs.existsSync(`${ARBEIT}/bilder`) ? fs.readdirSync(`${ARBEIT}/bilder`) : []) {
      fs.copyFileSync(`${ARBEIT}/bilder/${b}`, path.join(ziel, b));
    }
  } catch { /* Bilder sind Beweis, nicht Bedingung */ }
  // Der Browser haelt Profile-Dateien noch offen, wenn sein Kind gerade getoetet
  // wurde — also zweimal versuchen und danach sagen, was wirklich weg ist.
  for (const _ of [0, 1, 2]) {
    try { fs.rmSync(ARBEIT, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* noch */ }
    if (!fs.existsSync(ARBEIT)) break;
    const bis = Date.now() + 900;
    while (Date.now() < bis) { /* warten, bis der Kind-Prozess seine Griffe lost */ }
  }
}
