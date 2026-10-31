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
// Gegen welches Objekt die Bytes gehalten werden: vor dem Tausch ist das der gebaute Leib unter
// `release/mac-arm64`, danach das installierte Stueck. Beides sind ausgelieferte Bytes — nur der
// Moment der Landung unterscheidet sie.
const OBJEKT = ARG("gegen", "/Applications/K3PTA.app/Contents/Resources/app.asar");
// Wohin die Bilder gehoeren: sie sind Beweis zu einem Stand, nicht dem naechsten.
// Der Zielordner war fest geschrieben, und ein Lauf fuer die naechste Fassung ersetzte die
// Bilder des vorigen Belegs — gemessen 31.10. 15:07, wo der Lauf gegen das installierte
// Objekt drei committete Bilder des 3.2.101-Belegs ueberschrieb (nach-dem-neuladen,
// textgroesse-nach-neuladen, vor-dem-neuladen). Also: Ordner nach der Fassung im Baum, und
// mit `--bilder <pfad>` fuer einen bestimmten Moment setzbar.
const FASSUNG = (() => {
  try { return String(JSON.parse(fs.readFileSync(path.join(WURZEL, "package.json"), "utf8")).version); }
  catch { return "unbekannt"; }
})();
const BILDER_ZIEL = ARG("bilder", `/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/belege-3110/fenster-${FASSUNG.split(".").pop()}`);
const BRADE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

let server = null;
let brave = null;
let ende = null;
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
  if (!fs.existsSync(OBJEKT)) { console.log("Kein Objekt unter " + OBJEKT); process.exit(2); }
  if (!fs.existsSync(BRADE)) { console.log("Kein Brave unter " + BRADE + " — der Pruefer braucht einen echten Viewport."); process.exit(2); }
  try { if ((await fetch(`${BASIS}/api/health`)).ok) { console.log(`Port ${PORT} hoert schon — fremder Diener, Abbruch.`); process.exit(2); } } catch { /* frei */ }

  fs.rmSync(ARBEIT, { recursive: true, force: true });
  fs.mkdirSync(`${ARBEIT}/h`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/d`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/profil`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/bilder`, { recursive: true });
  // Der Stapel wird zu Beginn geloescht, die Bilder aber am Ende in die Mappe gelegt: ohne
  // diese Zeile sieht ein Leser erst am Schluss, wohin ein Lauf seine Beweise legt — und der
  // erste Lauf dieses Pruefers schrieb sie in den Ordner des Belegs davor (31.10.).
  console.log(`  Bilder-Ziel: ${BILDER_ZIEL}`);

  // 1) Die Bytes, die ich fahre, sind die des installierten Objekts.
  const forderer = createRequire(path.join(WURZEL, "package.json"));
  const asar = forderer("@electron/asar");
  const hash = (b) => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
  // Die Gebinde heissen nach ihrem Inhalt (Vite haengt den Hash an den Dateinamen), also
  // werden sie **aufgesucht**, nicht auswendig gewusst — ein harter Name waehre nach jedem Bau
  // ein falscher Alarm (gemessen 31.10. 11:48: "FEHLT im Repo-Bundel: index-CxpGa2va.js").
  const haupt = (name, muster) => {
    const ordner = path.join(WURZEL, "dist", "assets");
    const treffer = fs.readdirSync(ordner).filter((f) => muster.test(f) && !f.includes("." + name.slice(1) + "."));
    const paare = treffer.map((f) => path.join(ordner, f)).filter((fp) => fs.existsSync(fp));
    paare.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
    return paare[0] ? path.relative(path.join(WURZEL, "dist"), paare[0]) : name;
  };
  const stuecke = ["index.html", haupt("assets/app.js", /^index-.*\.js$/), haupt("assets/app.css", /^index-.*\.css$/), "server.cjs", "mcp-server.cjs"];
  let gleich = 0;
  for (const f of stuecke) {
    const repo = path.join(WURZEL, "dist", f);
    if (!fs.existsSync(repo)) { console.log("  FEHLT im Repo-Bundel: " + f); continue; }
    let ausDemObjekt;
    try { ausDemObjekt = asar.extractFile(OBJEKT, "dist/" + f); } catch { console.log("  FEHLT im Objekt: " + f); continue; }
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
  // Nur die drei Schirme der Einstellungen, nicht jeder gedruckte Knopf im Blatt: nach den
  // Such-Zyklen standen auch die Graph-Schalter (Force/Tree) mit aria-pressed da, und ein
  // Pruefer, der "der erste gedruckte Knopf" liest, meldet dann "Force" statt des Tabs.
  const PANEL = ["AI & data", "MCP / API", "Device Sync"];
  const panelNam = async () => evaliere(cdp, `(()=>{const wanted=${JSON.stringify(PANEL)};
    const b=[...document.querySelectorAll('button[aria-pressed]')].find(x=>x.getAttribute('aria-pressed')==='true' && wanted.some(w=>(x.textContent||'').trim()===w));
    return b?(b.textContent||'').trim():null})()`);
  const syncOffen = async () => evaliere(cdp, `(()=>{const e=document.querySelector('input[placeholder^="At least"]');return e?getComputedStyle(e).display:'keine Abfrage'})()`);
  const bild = async (name) => {
    const s = await cdp.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(ARBEIT, "bilder", name), Buffer.from(s.data, "base64"));
    return path.join(ARBEIT, "bilder", name);
  };

  // --- Die Saat: eine Suche ohne Notizen ist keine Pruefung, sondern ein leerer Blatt.
  //     Dieselbe Route, die der Kosten-Laeufer nimmt (`POST /api/import/markdown`), ein
  //     eigner kleiner Korpus: dreissig Notizen, die all das Wort "Fristenkontrolle"
  //     fuehren — genug, damit eine Trefferzahl eine Stufe ist und nicht ein Zufall.
  const SAAT = 30;
  if (NUR === "" || NUR === "suche" || NUR === "treffer") {
    const dateien = Array.from({ length: SAAT }, (_, i) => {
      const n = String(i + 1).padStart(4, "0");
      return {
        name: `Saat/${n}.md`,
        content: ["---", `kepta_id: fenster-${n}`, `title: "Fristenkontrolle ${n}"`, "tags: [saat]",
          "type: semantic", "---", "", `Die Fristenkontrolle ${n} haelt die Frist mit [[Fristenkontrolle]] und [[Kasse ${i % 5}]].`].join("\n"),
      };
    });
    const ant = await fetch(`${BASIS}/api/import/markdown`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files: dateien }),
    });
    urteil("die Saat geht durch die echte Import-Tuer", ant.ok, true);
    const gez = await warteBis(async () => { const h = await (await fetch(`${BASIS}/api/health`)).json(); return h.count >= SAAT ? h.count : null; }, { maxMs: 90000, schritt: 700 });
    urteil("der Bestand zaehlt die Saat", Number(gez) >= SAAT, true);
    console.log(`  Bestand nach der Saat: ${gez}`);
  }

  const zeileZurKnowledge = async () => { await knopf(cdp, "^\\s*(Knowledge|Wissen)\\s*$"); await warteBis(async () => (await evaliere(cdp, `!!document.querySelector('input[aria-label="Search your memory"]')`) ? true : null), { maxMs: 20000 }); };
  const stufe = async (index) => evaliere(cdp, `(()=>{const e=document.querySelector('input[aria-label="Results shown"]');if(!e)return null;
    const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(e,${index});
    e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`);
  const suchZeilen = async (wort) => {
    await zeileZurKnowledge();
    const r = await evaliere(cdp, `(async()=>{const e=document.querySelector('input[aria-label="Search your memory"]');if(!e)return -1;
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(e,${JSON.stringify(wort)});e.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,2600));
      // Der Treffer-Streifen ist kein .chip und kein testid-Knoten — gelesen wird nach dem
      // Wort, nicht nach dem Behaelter. (Im Template-Literal stehen zwei Backslashes, sonst
      // wird aus \\d ein d und der Griff findet nie eine Zahl.)
      const streifen=[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0)
        .map(e=>(e.textContent||'').trim()).find(t=>/^\\d+( of \\d+)? hits?$/i.test(t))||'';
      return { zeilen: document.querySelectorAll('.row-entry').length, grund: streifen.slice(0,60) };})()`);
    return r;
  };

  // --- Zyklus A: der Tab, der sein Gedaechtnis verlieren würde -------------------------------
  if (NUR === "" || NUR === "tab") {
    await steuere();
    urteil("beim ersten Oeffnen steht der erste Schirm", await panelNam(), "AI & data");
    const schirm = await knopf(cdp, "Device Sync");
    urteil("der Klick oeffnet die Geraete-Sync", schirm, "Device Sync");
    urteil("die Sync-Abfrage ist wirklich zu sehen", Boolean(await syncOffen()), true);
    console.log("  Bild: " + await bild("vor-dem-neuladen.png"));
    urteil("der Wert liegt im Speicher", await evaliere(cdp, `localStorage.getItem('kepta_einstellungen_tab')`), "sync");

    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    urteil("**nach dem Neuladen steht wieder derselbe Schirm offen**", await panelNam(), "Device Sync");
    urteil("und die Abfrage ist wieder gemalt", Boolean(await syncOffen()), true);
    console.log("  Bild: " + await bild("nach-dem-neuladen.png"));

    await knopf(cdp, "MCP / API");
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    // Nicht "AI & data" zurueckklicken: der Grundwert ist derselbe Schirm, die Auskunft waer
    // gruen, auch wenn nirgends etwas stuende — ein Fall, der nie verlieren kann. Der mittlere
    // Schirm ist der, den nur das Gedaechtnis holen kann.
    urteil("ein Klick auf den mittleren Schirm wird ebenso gemerkt", await panelNam(), "MCP / API");

    // Der Uebertrag vom alten Namen. Eine Installation, die vor 3.2.103 lief, hat den Wert unter
    // `ki_gehirn_einstellungen_tab` liegen; ohne Uebertrag fiele sie auf den Anfang zurueck.
    await evaliere(cdp, `localStorage.setItem('ki_gehirn_einstellungen_tab','sync'); localStorage.removeItem('kepta_einstellungen_tab'); 'gesetzt'`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    urteil("**der alte Name hebt den Wert herueber**", await panelNam(), "Device Sync");
    urteil("und der neue Name traegt ihn", await evaliere(cdp, `localStorage.getItem('kepta_einstellungen_tab')`), "sync");
    urteil("**der alte Name ist danach leer — im Browser**", await evaliere(cdp, `localStorage.getItem('ki_gehirn_einstellungen_tab')`), null);
    console.log("  Bild: " + await bild("uebertrag-alter-name.png"));
  }

  // --- Zyklus B: die Textgroesse, Wert und Wirkung -------------------------------------------
  if (NUR === "" || NUR === "groesse") {
    // eigne Vorbedingung: der Regler liegt im System-Schirm (`src/components/Settings.tsx:654`
    // bis :1195), und der vorherige Schenkel laesst die Flaeche auf einem andern Schirm stehen.
    // Ein Zyklus, der den Schirm seines Vorgaengers erbt, schlaegt fehl, sobald jemand die
    // Reihenfolge aendert — gemessen 31.10. 15:40 am installierten 3.2.103, wo der neue
    // Uebertrag-Schenkel auf "Device Sync" endete und fuenf Pruefungen dieser Zyklus' ins Leere
    // griffen. Also: erst den Schirm ziehen und pruefen, dass er offen ist.
    await knopf(cdp, "AI & data");
    urteil("Vorbedingung: der System-Schirm ist offen", await panelNam(), "AI & data");
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

  // --- Zyklus C: die drei Spuren, Wert und Trefferzahl ---------------------------------------
  //     Hausform fuer diese drei Werte ist '1' / '0' (src/lib/searchPrefs.ts:52-54), nicht
  //     "true"/"false" — ein Pruefer, der die Wortform des Lesers erfindet, schlägt gegen die
  //     eigne Erwartung, nicht gegen die App. Gefunden 31.10. beim ersten Lauf.
  if (NUR === "" || NUR === "suche") {
    const grund = await suchZeilen("Fristenkontrolle");
    urteil("mit allen Spuren findet die Flaeche etwas", grund.zeilen > 0, true);
    const alleAus = async () => {
      await steuere();
      return evaliere(cdp, `(()=>{const a=['Track BM25','Track Vectors','Track Graph'].map(n=>document.querySelector('input[aria-label="'+n+'"]'));
        a.forEach(e=>{if(e&&e.checked)e.click()});return a.map(e=>e?!e.checked:null)})()`);
    };
    const aus = await alleAus();
    urteil("alle drei Spuren sind aus", aus, [true, true, true]);
    await schlafe(900);
    const ohne = await suchZeilen("Fristenkontrolle");
    console.log(`  Zeilen: alle Spuren an -> ${grund.zeilen}, alle drei aus -> ${ohne.zeilen}`);
    urteil("**ohne jede Spur findet die Flaeche nichts**", ohne.zeilen, 0);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    const gespeichert = await evaliere(cdp, `['ki_gehirn_spur_bm25','ki_gehirn_spur_vektor','ki_gehirn_spur_graph'].map(k=>localStorage.getItem(k))`);
    urteil("**nach dem Neuladen stehen alle drei noch auf aus**", gespeichert, ["0", "0", "0"]);
    urteil("und die Flaeche findet weiterhin nichts", (await suchZeilen("Fristenkontrolle")).zeilen, 0);
    await steuere();
    await evaliere(cdp, `(()=>{const e=document.querySelector('input[aria-label="Track BM25"]');if(e&&!e.checked)e.click();})()`);
    await schlafe(900);
    const wieder = await suchZeilen("Fristenkontrolle");
    urteil("die eine Spur wieder an, und die Liste füllt sich", wieder.zeilen > 0, true);
    console.log(`  Zeilen mit nur BM25: ${wieder.zeilen}`);
    console.log("  Bild: " + await bild("spuren-nur-bm25.png"));
  }

  // --- Zyklus D: die Trefferstufe, ihr Wert und ihre Kappe ---------------------------------
  //     Vor dem Schnitt 3.2.102 war das gemessen und falsch: Stufe 5, Titel "Showing at most 5
  //     hits", Liste 16 Zeilen (eigne Kapsel, 30 gesaete Notizen, 31.10. 11:28). Jetzt verlangt
  //     der Zyklus die Zahl, die der Regler sagt, und den Rueckweg, der sie wieder oeffnet.
  if (NUR === "" || NUR === "treffer") {
    const grund = await suchZeilen("Fristenkontrolle");
    await steuere();
    urteil("die Trefferzahl-Stufe ist da", await stufe(0), "0");
    await schlafe(900);
    const wenig = await suchZeilen("Fristenkontrolle");
    console.log(`  Zeilen: ohne Kappe ${grund.zeilen}, auf Stufe 5 ${wenig.zeilen}`);
    urteil("**auf Stufe 5 zeigt die Liste fuenf, nicht was die Tuer bringt**", wenig.zeilen, 5);
    // Der Streifen nennt beide Zahlen, seit 3.2.102: geschickt vs. passend.
    urteil("**der Streifen sagt, wie viel passt, nicht nur, was kam**", /16 of 30 hits|30 hits/.test(String(wenig.grund)) || (await evaliere(cdp, `(()=>[...document.querySelectorAll('.chip,span')].some(e=>/of 30 hits/.test(e.textContent||'')))()`)), true);
    urteil("und die Liste nennt ihren Rueckweg", /of .* matches/.test(wenig.grund || "") || (await evaliere(cdp, `(()=>[...document.querySelectorAll('button')].some(b=>/show all/i.test(b.textContent||'')))()`)), true);
    console.log("  Bild: " + await bild("trefferstufe-5.png"));
    await steuere();
    urteil("die letzte Stufe heisst alles", await stufe(6), "6");
    await schlafe(900);
    const alles = await suchZeilen("Fristenkontrolle");
    // Der Grundwert von oben ist schon unter der Kappe gemessen (Stufe 5 ist der Default) —
    // "alles" gegen ihn zu rechnen war ein Fehler des Pruefers, nicht der Flaeche.
    urteil("und die Liste zeigt wieder alles", alles.zeilen, SAAT);
    urteil("mehr als unter der Kappe", alles.zeilen > wenig.zeilen, true);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    urteil("**nach dem Neuladen steht die Stufe noch auf alles**", await evaliere(cdp, `localStorage.getItem('ki_gehirn_topK')`), "0");
    urteil("und die Liste zeigt dieselbe Zahl", (await suchZeilen("Fristenkontrolle")).zeilen, alles.zeilen);
    await steuere();
    await stufe(0);
    await schlafe(900);
    urteil("wieder auf 5, greift die Kappe erneut", (await suchZeilen("Fristenkontrolle")).zeilen, 5);
  }

  // --- Zyklus E: die Suchtiefe, und was sie wirklich bestellt --------------------------------
  //     Die Tiefe hebt nur die BESTELLUNG an (`anfrageLimit = max(Stufe, Tiefe)`), die Anzeige
  //     bleibt bei der Stufe. Beides zusammen ist die Behauptung — gemessen 13:12: "5 of 30
  //     hits" bei Tiefe 5, "30 hits" bei Tiefe 32, und in beiden Faellen fuenf Karten.
  if (NUR === "" || NUR === "tiefe") {
    const tiefe = async (wert) => evaliere(cdp, `(()=>{const e=document.querySelector('input[aria-label="Search depth (top-k)"]');if(!e)return null;
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(e,'${wert}');
      e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`);
    await steuere();
    await stufe(0);
    await schlafe(900);
    urteil("die Tiefe geht auf den kleinsten Wert", await tiefe(5), "5");
    await schlafe(900);
    const duenn = await suchZeilen("Fristenkontrolle");
    await steuere();
    urteil("und auf den groessten", await tiefe(32), "32");
    await schlafe(900);
    const dick = await suchZeilen("Fristenkontrolle");
    console.log(`  Tiefe 5: "${duenn.grund}" / ${duenn.zeilen} Karten — Tiefe 32: "${dick.grund}" / ${dick.zeilen} Karten`);
    urteil("**die Tiefe aendert, was die Tuer bringt**", / of 30 hits$/.test(duenn.grund) && /^30 hits$/.test(dick.grund), true);
    urteil("**die Kappe der Stufe haelt bei beiden**", [duenn.zeilen, dick.zeilen], [5, 5]);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    urteil("**nach dem Neuladen steht die Tiefe noch auf 32**", await evaliere(cdp, `localStorage.getItem('ki_gehirn_such_tiefe')`), "32");
  }

  // --- Zyklus F: das Schild vor der Agenten-Lesung, an der echten Agenten-Tuer ---------------
  //     Hauswort des Schalters: er verbirgt Kennwoerter, Kartennummern, IBANs und Passwoerter
  //     vor KI-Apps — Namen, E-Mails und Telefonnummern bleiben sichtbar. Eine Probe mit einer
  //     E-Mail schlage also gegen das Papier, nicht gegen die Flaeche.
  if (NUR === "" || NUR === "schild") {
    const geheim = "Zahlungsplan Alpha: IBAN DE89 3704 0044 0532 0130 00, password: Hunter2!x";
    const angelegt = await fetch(`${BASIS}/api/memory`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Zahlungsplan Alpha", content: geheim, tags: ["schild-probe"], type: "semantic" }),
    });
    urteil("die Probe-Notiz liegt im Bestand der Kapsel", angelegt.ok, true);
    const lies = async () => {
      const r = await fetch(`${BASIS}/api/mcp/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "Zahlungsplan Alpha", limit: 5 }) });
      const satz = JSON.stringify(await r.json());
      return { iban: /DE89 3704/.test(satz), pw: /Hunter2/.test(satz), maske: /\[IBAN-\d\]|\[SECRET-\d\]/.test(satz) };
    };
    const gesichert = await lies();
    console.log(`  mit Schild: IBAN=${gesichert.iban} Kennwort=${gesichert.pw} Maske=${gesichert.maske}`);
    urteil("**mit Schild bringt die Agenten-Tuer keine IBAN**", gesichert.iban, false);
    urteil("**und kein Kennwort**", gesichert.pw, false);
    urteil("dafuer steht die Maske im Leib", gesichert.maske, true);
    await steuere();
    await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide secrets from AI apps"]');if(e)e.click()})()`);
    await schlafe(1400);
    urteil("der Schalter geht aus", await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide secrets from AI apps"]');return e?e.getAttribute('aria-checked'):null})()`), "false");
    const nackt = await lies();
    console.log(`  ohne Schild: IBAN=${nackt.iban} Kennwort=${nackt.pw} Maske=${nackt.maske}`);
    urteil("**ohne Schild bringt die Agenten-Tuer die echte IBAN**", nackt.iban, true);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    urteil("**nach dem Neuladen steht das Schild noch aus**", (await (await fetch(`${BASIS}/api/shield`)).json()).apps, false);
    await steuere();
    await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide secrets from AI apps"]');if(e&&e.getAttribute('aria-checked')!=='true')e.click()})()`);
    await schlafe(1400);
    urteil("und wieder an, ist die IBAN wieder verdeckt", (await lies()).iban, false);
    console.log("  Bild: " + await bild("schild-agenten-tuer.png"));
  }

  // --- Zyklus G: das Schild vor der cloud-Frage, an der Vorschau der Flaeche ----------------
  //     Die Flaeche hat dafuer eine eigne Probe: "Try it — this is what a cloud model would
  //     see". Kein Schluessel noetig, kein Netzgang — die Vorschau ist genau dasselbe Wort,
  //     das vor die Frage gelegt wuerde.
  if (NUR === "" || NUR === "cloud") {
    await steuere();
    const vorschau = () => evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="shield-preview"]');return e?(e.textContent||'').trim():null})()`);
    const vorher = await vorschau();
    urteil("die Vorschau ist da", vorher !== null, true);
    urteil("**mit cloud-Schild steht die Maske in der Vorschau**", /\[EMAIL-\d\]/.test(String(vorher)) && !/anna@example\.com/.test(String(vorher)), true);
    await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide personal data from cloud AI"]');if(e)e.click()})()`);
    await schlafe(1400);
    const nachher = await vorschau();
    urteil("**ohne cloud-Schild steht die echte Mail in der Vorschau**", /anna@example\.com/.test(String(nachher)), true);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await steuere();
    urteil("**nach dem Neuladen steht der Schalter noch auf aus**", await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide personal data from cloud AI"]');return e?e.getAttribute('aria-checked'):null})()`), "false");
    urteil("und die Vorschau bleibt unmaskiert", /anna@example\.com/.test(String(await vorschau())), true);
    await evaliere(cdp, `(()=>{const e=document.querySelector('button[role="switch"][aria-label="Hide personal data from cloud AI"]');if(e&&e.getAttribute('aria-checked')!=='true')e.click()})()`);
    await schlafe(1400);
    urteil("wieder an, ist die Mail wieder verdeckt", /\[EMAIL-\d\]/.test(String(await vorschau())), true);
    console.log("  Bild: " + await bild("cloud-schild-vorschau.png"));
  }

  // --- Zyklus H: die Passphrase, und was ihr Knopf darf --------------------------------------
  if (NUR === "" || NUR === "sync") {
    await steuere();
    await knopf(cdp, "Device Sync");
    const knopfZustand = () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Create bundle/.test(x.textContent||''));
      return b?{ deaktiviert: b.disabled===true, grund: (b.title||b.getAttribute('title')||'').slice(0,80) }:null})()`);
    const anfang = await knopfZustand();
    urteil("der Knopf steht am Schirm", anfang !== null, true);
    urteil("**ohne Passphrase ist er gesperrt**", anfang.deaktiviert, true);
    const schreibe = (t) => evaliere(cdp, `(()=>{const e=document.querySelector('input[placeholder^="At least"]');if(!e)return null;
      const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;set.call(e,${JSON.stringify(t)});
      e.dispatchEvent(new Event('input',{bubbles:true}));return e.value.length})()`);
    // Eine Zeile, eine Behauptung — die erste Fassung verknuepfte Laenge und Knopfzustand in
    // einem Ausdruck, der auch dann haette gruen sein koennen, wenn der Knopf nie sprach.
    const kurz = await schreibe("kurz");
    await schlafe(600);
    urteil(`bei ${kurz} Zeichen ist er noch zu`, (await knopfZustand()).deaktiviert, true);
    await schreibe("zwolf oder mehr Zeichen");
    await schlafe(600);
    urteil("bei dreizehn Zeichen ist er offen", (await knopfZustand()).deaktiviert, false);
    urteil("**und die Sperre kommt zurueck, wenn die Phrase verschwindet**", await (async () => { await schreibe(""); await schlafe(600); return (await knopfZustand()).deaktiviert; })(), true);
    await schreibe("eine lange passphrase");
    await schlafe(600);
    console.log(`  Bild: ${await bild("passphrase-frei.png")} (Laenge vorher ${kurz})`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await steuere();
    await knopf(cdp, "Device Sync");
    urteil("**und die Passphrase ueberlebt den Neuladen nicht — sie wird nirgends gehalten**",
      await evaliere(cdp, `(()=>{const e=document.querySelector('input[placeholder^="At least"]');return e?(e.value||''):null})()`), "");
  }

  // --- Zyklus I: die Radien, gemessen im echten Blatt ----------------------------------------
  if (NUR === "" || NUR === "radius") {
    // Die Design-Wache rechnet Token gegen Token in `src/index.css`; was der Browser malt, sieht
    // sie nicht. Seit 31.10. stehen neun wuertzliche Radien auf den Stufen, drei davon ruecken
    // wirkliche Pixel — ihr Beweis ist darum eine Messung am Leib, nicht die gruene Wache.
    // Die zwei Reglerschienen bleiben hier unerreichbar: `::-webkit-slider-runnable-track` ist
    // kein Knoten, und einen Pseudo-Griff kennt dieser Weg nicht — ihre Gleichheit ist gerechnet
    // (2 px Koerper, jede Rundung klemmt auf 1 px), nicht gemessen, und steht so im Papier.
    await knopf(cdp, "Graph");
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('.apple-seg').length`)) > 0 ? true : null), { maxMs: 90000 });
    const mass = await evaliere(cdp, `(()=>{const m=(s)=>{const e=document.querySelector(s);
      return e ? getComputedStyle(e).borderTopLeftRadius : "fehlt"};
      return { datum: m('.graph-datum'), huille: m('.apple-seg'), knopf: m('.apple-seg-btn'),
               kbd: m('.kbd'), quiet: m('.row-quiet'), stamp: m('.row-stamp'), skeleton: m('.skeleton'),
               nav: m('.sidebar-nav-btn'), tag: m('.sidebar-tag-btn') };})()`);
    console.log("  gemessene Rundungen im Graph-Blatt: " + JSON.stringify(mass));
    urteil("**das Datumsfeld malt die Kontrollstufe (7 px)**", mass.datum, "7px");
    urteil("**die Segmenthuille malt die Kartentufe (12 px)**", mass.huille, "12px");
    urteil("der Segmentknopf malt die Kontrollstufe", mass.knopf, "7px");
    // Die zwei Seitenleisten-Reihen zogen die Stufe erst als Utility in die Bauteilkette — von
    // dort verschwand sie wieder, weil ein Wert im Escape fuer beide Wachen unsichtbar ist. Jetzt
    // steht sie in `src/index.css` an der Hausregel, und gemalt werden soll dasselbe: 7 px.
    urteil("**die Seitenleisten-Reihe malt die Kontrollstufe**", mass.nav, "7px");
    urteil("**und die Schlagwort-Reihe auch**", mass.tag, "7px");
    console.log(`  Bild: ${await bild("radien-graph-panel.png")}`);
  }

  // --- Zyklus J: die Rundungen, die ein Auge wirklich sieht ---------------------------------
  if (NUR === "" || NUR === "radien") {
    // Die Design-Wache sieht nur `src/index.css`. Was ein Bauteil mit einer Tailwind-Klasse
    // (`rounded-lg`, `rounded-[7px]`) malt, liegt ausserhalb ihres Gesichts — und das ist die
    // Frage von Punkt 2: wie viele verschiedene Ecken sieht ein Nutzer wirklich?
    // Der erste Anlauf dieses Schenkels mass SECHS MAL dieselbe Flaeche: der Assistent stand vor
    // dem Fenster, die Klicks gingen ins Leere, und `knopf()`'s Antwort wurde weggeworfen. Darum
    // jetzt: Assistent weg, jeder Klick wird nachgefuert, und jede Flaeche meldet ihren Kopf —
    // zwei Flaechen mit demselben Kopf sind keine zwei Flaechen.
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|ueberspringen/i.test(x.textContent||''));if(b)b.click();})()`);
    await schlafe(700);
    const flaeche = async (nam) => {
      const geklickt = await knopf(cdp, nam);
      urteil(`der Knopf nach ${nam} steht im Blatt`, geklickt !== null, true);
      await schlafe(1400);
      const r = await evaliere(cdp, `(()=>{const zaehler={};
        for (const e of document.querySelectorAll('*')) {
          const w = getComputedStyle(e).borderTopLeftRadius;
          if (!w || w === '0px') continue;
          // Der erste Klassenname ist oft eine Utility ("absolute", "flex-1") und nicht der
          // Besitzer der Rundung — darum zuerst Kennung und Pruefname, dann erst die Klasse.
          const namen = e.id || e.getAttribute?.("data-testid")
            || (typeof e.className === "string" && e.className.trim() ? e.className.trim().split(/\\s+/).find(c => !/^(absolute|relative|fixed|flex|inline-flex|w-|h-|px-|py-|p-|m-|gap-|z-|text-|min-|max-)/.test(c)) : "")
            || e.tagName.toLowerCase();
          const schluessel = w + ' :: ' + namen.slice(0, 28);
          zaehler[schluessel] = (zaehler[schluessel] || 0) + 1;
        }
        // Der Kopf allein truegt nicht: eine Grusszeile kann in der Huelle stehen und bleibt
        // gleich, wenn die Flaeche wechselt. Die Seitenleiste fuehrt, was wirklich offen ist.
        const aktive = [...document.querySelectorAll('.sidebar-nav-btn')]
          .find(b => b.getAttribute('data-active') === 'true');
        return { zaehler,
          aktiv: aktive ? (aktive.textContent || '').trim().slice(0, 20) : "keine aktive Seite",
          kopf: [...document.querySelectorAll('h1,h2,h3')].map(h=>(h.textContent||'').trim()).filter(Boolean).slice(0,2).join(' / ').slice(0, 46),
          knoten: document.querySelectorAll('*').length };})()`);
      urteil(`**${nam} ist die offene Flaeche**`, r.aktiv, nam);
      return { flaeche: nam, ...r };
    };
    const gesicht = [];
    for (const nam of ["Knowledge", "Graph", "Chat", "Dossier", "Activity", "Settings"]) {
      const fund = await flaeche(nam);
      gesicht.push(fund);
      const werte = Object.entries(fund.zaehler).sort((a, b) => b[1] - a[1]);
      const zahlen = new Set(werte.map(([k]) => k.split(" :: ")[0]));
      console.log(`  ${nam}: ${werte.reduce((s, [, n]) => s + n, 0)} gemalte Rundungen, ${zahlen.size} Werte, offen "${fund.aktiv}", ${fund.knoten} Knoten`);
      for (const [k, n] of werte.slice(0, 6)) console.log(`      ${String(n).padStart(4)}  ${k}`);
    }
    const offene = new Set(gesicht.map((g) => g.aktiv));
    console.log("  gesehene Flaechen: " + gesicht.map((g) => `${g.flaeche}="${g.aktiv}"`).join(" | "));
    urteil("**sechs Klicks sind sechs verschiedene Flaechen**", offene.size, 6);
    // Die Latte ist die Stufenordnung des Hauses plus die Kapsel: 3/4/7/12/14 px, und alles ab
    // 100 px, weil der Browser eine Kapsel auf die halbe Kantenlaenge klemmt.
    const stufen = new Set(["3px", "4px", "7px", "12px", "14px"]);
    const fremd = {};
    for (const { zaehler } of gesicht) {
      for (const [schluessel, n] of Object.entries(zaehler)) {
        const [wert] = schluessel.split(" :: ");
        const px = parseFloat(wert);
        if (!Number.isFinite(px) || stufen.has(wert) || px >= 100) continue;
        fremd[schluessel] = (fremd[schluessel] || 0) + n;
      }
    }
    const ordentlich = Object.entries(fremd).sort((a, b) => b[1] - a[1]);
    console.log(`  ausserhalb der Stufen: ${ordentlich.length} Namen, ${ordentlich.reduce((s, [, n]) => s + n, 0)} Stellen`);
    for (const [k, n] of ordentlich.slice(0, 14)) console.log(`      ${String(n).padStart(4)}  ${k}`);
    // Diese Zahl ist die gemessene Schuld der Bauteile, kein Fehler des Laufs — und sie ist
    // gezaeunt. Erster Stand 31.10. 16:03: 15 Namen, 377 Stellen. Nach der ersten Bewegung
    // (Notizkarte zur Kapsel, zwei Seitenleisten-Reihen auf die Kontrollstufe) gemessen
    // 31.10. 18:34 am installierten 3.2.104: **12 Namen, 137 Stellen** — der Fall um genau
    // 240 Stellen (186 + 42 + 12), wie gerechnet. Ein dreizehnter Name macht rot, ein
    // sitzender bleibt Meldung. Groesster Sitzender jetzt: 30 Stellen mit 6 px und 30 mit
    // 8 px an Bauteilen, deren erster Name eine Layout-Klasse ist (`items-center`).
    urteil("Rundungen ausserhalb der Stufen bleiben beim gemeldeten Stand", ordentlich.length <= 12, true);
    console.log(`  MERKER: ${ordentlich.length} Namen ausserhalb der Stufen — Zaehlung aus diesem Lauf`);
    console.log(`  Bild: ${await bild("radien-flaechen.png")}`);
  }

  // --- Zyklus K: die KI-Verbindung, und ob sie ohne lokalen Speicher wiederkehrt ------------
  if (NUR === "" || NUR === "ki") {
    // Der Zensus 31.10. fand genau einen Speicher-Schluessel OHNE Hauspraefix: `aiVerbindung`
    // (src/lib/ai.ts:218). Er faellt durch `gehoertUns`, wird aber auf eigne Weise gespiegelt —
    // unter `ai_connection` in den verschluesselten Datenordner (src/lib/ai.ts:232, 462, 567).
    // Behaupten kann das nur ein Fenster, dem man den lokalen Speicher WEGNIMMT: der Zufalls-Port
    // der App macht jeden Neustart zu einem frischen Ursprung, und nur der Spiegel ueberlebt ihn.
    await steuere();
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await schlafe(700);
    // Die Felder wohnen auf dem ERSTEN Schirm (`src/components/Settings.tsx:808` und :822 liegen
    // im Block `activeTab === 'system'`, Zeile 654 bis 1195), nicht unter "MCP / API" — das Bild
    // des ersten Laufs zeigte dort nur die Apps zum Verbinden.
    await knopf(cdp, "AI & data");
    const schreibeFeld = (selektor, wert) => evaliere(cdp, `(()=>{const e=document.querySelector(${JSON.stringify(selektor)});
      if(!e)return null;const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      set.call(e,${JSON.stringify(wert)});e.dispatchEvent(new Event('input',{bubbles:true}));return e.value})()`);
    const ADRESSE = "http://127.0.0.1:4711/v1";
    const MODELL = "sonden-modell-k1";
    urteil(" das Adressfeld nimmt die Eingabe an", await schreibeFeld('input[placeholder="https://api.example.com/v1"]', ADRESSE), ADRESSE);
    urteil(" das Modellfeld nimmt die Eingabe an", await schreibeFeld('input[placeholder="e.g. gpt-4o-mini"]', MODELL), MODELL);
    // Tippen allein genuegt nicht: `update` (Settings.tsx:428) setzt nur React-Zustand, die
    // Spiegelung beginnt erst beim Absenden des Formulars (:462, Knopf "Save" bei :868). Ohne
    // diesen Klick meldete der Schenkel drei Ausfaelle, die der Pruefer sich selbst machte.
    const gespeichert = await knopf(cdp, "^\\s*Save\\s*$");
    urteil(" der Knopf zum Sichern steht am Schirm", gespeichert !== null, true);
    await schlafe(2500);
    const sitzung = await evaliere(cdp, `localStorage.getItem('aiVerbindung')`);
    urteil(" die Sitzung traegt beide Werte", typeof sitzung === "string"
      && sitzung.includes(ADRESSE) && sitzung.includes(MODELL), true);
    // Jetzt der eigentliche Test: der lokale Speicher wird geleert, als waere das Fenster ein
    // frischer Ursprung. Was dann zurueckkommt, kann nur aus dem Datenordner kommen.
    await evaliere(cdp, `localStorage.removeItem('aiVerbindung'); localStorage.removeItem('ki_gehirn_ai_settings'); 'geraeumt'`);
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
    await steuere();
    await knopf(cdp, "AI & data");
    await schlafe(1200);
    const gelesen = await evaliere(cdp, `(()=>({adresse:(document.querySelector('input[placeholder="https://api.example.com/v1"]')||{}).value||'',
      modell:(document.querySelector('input[placeholder="e.g. gpt-4o-mini"]')||{}).value||''}))()`);
    urteil("**ohne lokalen Speicher kommt die Adresse aus dem Spiegel**", gelesen.adresse, ADRESSE);
    urteil("**und das Modell auch**", gelesen.modell, MODELL);
    console.log(`  Bild: ${await bild("ki-verbindung-aus-spiegel.png")}`);
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
  const ziel = BILDER_ZIEL;
  try {
    fs.mkdirSync(ziel, { recursive: true });
    const blaetter = fs.existsSync(`${ARBEIT}/bilder`) ? fs.readdirSync(`${ARBEIT}/bilder`) : [];
    for (const b of blaetter) fs.copyFileSync(`${ARBEIT}/bilder/${b}`, path.join(ziel, b));
    console.log(`  Bilder: ${blaetter.length} nach ${ziel}`);
  } catch (e) {
    // Bilder sind Beweis, nicht Bedingung — aber ein verlorener Beweis darf nicht schweigen.
    console.log(`  BILDER VERLOREN: ${e.message} (Ziel ${ziel})`);
  }
  // Der Browser haelt Profile-Dateien noch offen, wenn sein Kind gerade getoetet
  // wurde — also zweimal versuchen und danach sagen, was wirklich weg ist.
  for (let versuch = 0; versuch < 3; versuch += 1) {
    try { fs.rmSync(ARBEIT, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }); } catch { /* noch */ }
    if (!fs.existsSync(ARBEIT)) break;
    const bis = Date.now() + 900;
    while (Date.now() < bis) { /* warten, bis der Kind-Prozess seine Griffe lost */ }
  }
}
