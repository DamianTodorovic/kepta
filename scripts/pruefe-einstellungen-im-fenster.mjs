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
import { umrandung } from "./helfer/png-kante.mjs";

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
  //     1.11., eigener Fehler gezogen: der Rundungs-Zensus (`radien`) stand in dieser Liste
  //     nicht, weil er juenger ist als die Liste. Allein gerufen sass er darum auf einem
  //     leeren Bestand — gemessen 01:41: 113 gemalte Rundungen je Flaeche gegen 243 bis 256
  //     im gefuellten Stand vom 31.10. Eine Zahl, die auf der leeren Flaeche 0 Stellen meldet,
  //     ist kein Beweis ueber die gefuellte. Also auch `radien` in die Liste.
  const SAAT = Number(ARG("saat", 30));
  if (NUR === "" || NUR === "suche" || NUR === "treffer" || NUR === "bild" || NUR === "radius"
    || NUR === "radien") {
    const dateien = Array.from({ length: SAAT }, (_, i) => {
      const n = String(i + 1).padStart(4, "0");
      // Zwei Daten im Kuvert, nicht eine: die Flaeche haelt ihr Datumsfeld nur, wo die Saat
      // eine Zeitachse hat. Ohne sie verschwindet der Griff, und ein Pruefer, der dann
      // "fehlt" meldet, klagt die Rundung an statt seines eignen leeren Blattes (gemessen
      // 31.10. 20:18 und 20:34 gegen das installierte 3.2.105).
      const tag = new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      return {
        name: `Saat/${n}.md`,
        content: ["---", `kepta_id: fenster-${n}`, `title: "Fristenkontrolle ${n}"`, "tags: [saat]",
          "type: semantic", `created: ${tag}`, `valid_from: ${tag}`, "---",
          "", `Die Fristenkontrolle ${n} haelt die Frist mit [[Fristenkontrolle]] und [[Kasse ${i % 5}]].`].join("\n"),
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

  // Auf die Graph-Flaeche springen und belegen, dass sie offen ist. Die Liste traegt naemlich
  // dieselbe `.apple-seg`-Klasse wie die Graph-Leiste: ein Treffer dort gilt nicht als Beweis
  // hier. Gemessen 31.10. 18:45, wo der Bildbeweis "kein Export-Knopf" meldete, obwohl die
  // Flaeche nie offen war.
  const zurGraphFlaeche = async () => {
    // Der Assistent muss WEGKLIKTT sein, nicht nur angeklickt: im ersten Bildbeweis-Lauf stand er
    // noch da, und die Graph-Flaeche war dadurch 372 px breit statt 1 024 — ihr Export war leer,
    // und das war eine Folge meines Griffs, nicht der Flaeche. Geprueft wird deshalb der Rest.
    // Der Assistent kommt SPAETER als der erste Knopf im Blatt: nach dem Neuladen wartet die
    // Flaeche auf Daten, und der Einrichtungsraum baut sich danach. Ein Klick vor diesem Moment
    // trifft nichts — gemessen 31.10. 19:05 als "kein Knopf mit diesem Wort", waehrend das Bild
    // den Knopf unten rechts clearly zeigt. Also: warten, bis er da ist oder seine Frist um ist.
    const getroffen = await warteBis(async () => await evaliere(cdp, `(()=>{const alle=[...document.querySelectorAll('button')]
        .filter(x=>/^\\s*(Later|Skip|Back|ueberspringen)\\s*$/i.test((x.textContent||'').trim()));
      if(!alle.length) return null;
      const b=alle[0]; b.click();
      return alle.length+' Treffer, erster: '+(b.className||'').slice(0,24)+' sichtbar:'+(b.getBoundingClientRect().width>0);})()`),
      { maxMs: 12000, schritt: 700 });
    console.log(`  Assistent-Klick: ${getroffen || "kein Knopf innerhalb 12 s"}`);
    await schlafe(900);
    const weg = await evaliere(cdp, `(()=>!/Set up K3PTA/.test(document.body.innerText||''))()`);
    urteil("der Assistent ist beiseite, die Flaeche hat ihre Breite", weg, true);
    const gesprungen = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('.sidebar-nav-btn')]
      .find(x=>/^\\s*Graph\\s*$/.test((x.textContent||'').trim()));
      if(!b) return 'kein Seitenleisten-Knopf Graph'; b.click(); return (b.textContent||'').trim();})()`);
    console.log(`  Sprung nach: ${gesprungen}`);
    const offen = await warteBis(async () => {
      const x = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('.sidebar-nav-btn')].find(y=>y.getAttribute('data-active')==='true');return b?(b.textContent||'').trim():''})()`);
      return x === "Graph" ? x : null;
    }, { maxMs: 30000, schritt: 600 });
    urteil("**die Graph-Flaeche ist offen**", offen, "Graph");
    await schlafe(900);
  };

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
    // Erst neu laden, dann messen: die Saat liegt in der Tuer, aber die Seite kennt sie nicht
    // ohne Nachladen — dieselbe Lehre wie Zyklus A, und im Alleinlauf dieses Zyklus stand sonst
    // die leere Flaeche da (kein More-Knopf, keine Leiste, "keine Zahl").
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await zurGraphFlaeche();
    // "fehlt" ist nicht gleich "fehlt": die Flaeche haelt das Datumsfeld nur, wo es eine
    // Zeitachse gibt UND die Leiste es nicht ins More-Menue gefaltet hat. Ohne diesen Grund
    // meldet der Fall einen Defekt, wo eine Faltung spricht — gemessen 31.10. 20:18 und
    // 20:34: `datum: fehlt`, waehrend Huille, Knopf und Schlagwort-Reihe ihre Stufen nennen.
    const leiste = await evaliere(cdp, `(()=>{const mehr=[...document.querySelectorAll('button')]
        .find(b=>/^\\s*More\\s*\\(/.test((b.textContent||'').trim()));
      return { mehr: mehr?(mehr.textContent||'').trim():'kein More-Knopf',
        zeitglieder: document.querySelectorAll('.graph-time').length,
        datum: !!document.querySelector('.graph-datum'),
        slider: !!document.querySelector('input[type="range"]'),
        notizen: (document.body.innerText.match(/([\\d,]+)\\s+notes/)||[])[1] || 'keine Zahl' };})()`);
    console.log(`  Die Leiste: ${JSON.stringify(leiste)}`);
    const mass = await evaliere(cdp, `(()=>{const m=(s)=>{const e=document.querySelector(s);
      return e ? getComputedStyle(e).borderTopLeftRadius : "fehlt"};
      return { datum: m('.graph-datum'), huille: m('.apple-seg'), knopf: m('.apple-seg-btn'),
               kbd: m('.kbd'), quiet: m('.row-quiet'), stamp: m('.row-stamp'), skeleton: m('.skeleton'),
               nav: m('.sidebar-nav-btn'), tag: m('.sidebar-tag-btn') };})()`);
    console.log("  gemessene Rundungen im Graph-Blatt: " + JSON.stringify(mass));
    // Haelt die Leiste das Feld nicht, liegt es im More-Menue — oder es gibt keine Zeitachse.
    // Beides ist ein andrer Befund, und nur einer davon betrifft die Rundung.
    let datumWo = "auf der Leiste";
    if (mass.datum === "fehlt") {
      const geoeffnet = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')]
        .find(x=>/^\\s*More\\s*\\(/.test((x.textContent||'').trim()));if(!b)return 'kein More-Knopf';b.click();return (b.textContent||'').trim();})()`);
      await schlafe(900);
      const imMenue = await evaliere(cdp, `(()=>{const e=document.querySelector('.graph-datum');
        return e ? getComputedStyle(e).borderTopLeftRadius : 'fehlt'})()`);
      console.log(`  Nach ${geoeffnet}: Datumsfeld im Menue ${imMenue}`);
      if (imMenue !== "fehlt") { mass.datum = imMenue; datumWo = "im More-Menue"; }
      await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')]
        .find(x=>/^\\s*More\\s*\\(/.test((x.textContent||'').trim()));if(b)b.click();})()`);
      await schlafe(500);
    }
    urteil(`**das Datumsfeld malt die Kontrollstufe (7 px), gemessen ${datumWo}**`, mass.datum, "7px");
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
    // Vorbedingung, jetzt benannt (eigner Fehler, gemessen 1.11. 01:41 und 01:47): der Zensus
    // sass auf einem Fenster, das die Saat nicht kannte. Die Tuer zaehlte 30, die Leiste "0 entries",
    // und die vier Karten-Flaechen malten 100 Rundungen statt der 243 vom 31.10. — eine Zahl, die
    // auf der leeren Flaeche "0 Stellen ausserhalb der Stufen" meldet, ist kein Beweis ueber die
    // gefuellte. Darum: neu laden, dann erst messen (dieselbe Lehre wie Zyklus I), und die Saat
    // wird im Blatt verlangt, nicht in der Tuer.
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|ueberspringen/i.test(x.textContent||''));if(b)b.click();})()`);
    await schlafe(700);
    const eintraege = await evaliere(cdp, `(()=>{const m=document.body.innerText.match(/([\\d,]+)\\s+entries/);return m?Number(m[1].replace(/,/g,'')):0})()`);
    urteil(`**die Flaeche kennt die Saat (${SAAT} Eintraege stehen in der Leiste)**`, eintraege >= SAAT, true);
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
    // 31.10. 18:34 am installierten 3.2.104: 12 Namen, 137 Stellen. **Seit 1.11. 01:52 ist die
    // Schuld null**: die Rundungsskala sitzt am Token (`src/index.css:20-24`, nicht an 175
    // Klassenstellen geflickt), gemessen am installierten 3.2.106 im gefuellten Bestand (30
    // Eintraege in der Leiste, 245 bis 285 gemalte Rundungen je Flaeche) — **0 Namen, 0 Stellen**.
    // Der Zaun steht darum auf 0, und die Null ist nicht die Blindheit des Zaehlers: Biss um
    // 01:56, indem "7px" aus der Stufenmenge genommen wurde — derselbe Lauf meldete
    // 26 Namen und 459 Stellen und endete mit Exit 1; Datei zurueckgeschrieben und `cmp` bytegleich.
    // Ein einziger Ausreisser macht den Fensterlauf rot.
    urteil("Rundungen ausserhalb der Stufen bleiben auf den Hausstufen", ordentlich.length === 0, true);
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

  // --- Zyklus L: der Bildbeweis des Graphen, geholt durch den eignen Export ------------------
  if (NUR === "" || NUR === "bild") {
    // Punkt 1 lautet: der Graph muss gegen den Markt bestehen, und zwar mit einem Bild, das ein
    // Nutzer wirklich sieht. Bis 3.2.104 gab es dafuer nur Aufnahmen um den Rand herum. Jetzt
    // holt die Flaeche ihr eignes PNG — und dieser Schenkel nimmt genau die Kette, die der
    // Download mitbrächte, zerlegt sie in Signatur, Breite und Hoehe und schreibt sie in die Mappe.
    // Erst neu laden, dann springen: die Saat liegt in der Tuer, aber die Seite kennt sie nicht,
    // solange sie nicht nachgeladen hat — dieselbe Lehre wie Zyklus A um 12:19 Uhr ("seed
    // invisible without a reload"), und derselbe Fehler von mir um 18:52: der Bericht der leeren
    // Seite lautete "No entries yet", waehrend die Tuer 1 500 zaehlte.
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await zurGraphFlaeche();
    // Warten, bis die Flaeche ihr eignes Werkzeug zeigt. Bei 30 Notizen war der Knopf sofort da,
    // bei 1500 nicht — ob das "spaeter" oder "gar nicht" heisst, steht danach in der Meldung.
    const knopfDa = await warteBis(async () => (await evaliere(cdp,
      `document.querySelectorAll('button[data-testid="graph-export"]').length`)) > 0 ? true : null,
      { maxMs: 60000, schritt: 1500 });
    if (!knopfDa) {
      const grund = await evaliere(cdp, `(()=>{const h=[...document.querySelectorAll('h1,h2,h3,p')].map(e=>(e.textContent||'').trim()).filter(Boolean).slice(0,4).join(' | ');
        return { knoten: document.querySelectorAll('*').length, leinwaende: document.querySelectorAll('canvas').length, texte: h.slice(0,180) };})()`);
      console.log(`  kein Export-Knopf: ${JSON.stringify(grund)}`);
    }
    // Zaehlen, bevor gehandelt wird. Ein einzelner Blick kurz nach dem Sprung fand bei 1 440 px
    // 0 Flecke und im zweiten Anlauf 172 — das ist eine Rennstrecke, kein Befund. Gewartet wird,
    // bis die Zahl zweimal in Folge gleich bleibt (oder 45 s um sind); was unter die Zeile kommt,
    // ist die letzte eines Wartens, nicht die eines Augenblicks. Der Export kommt DANACH: ein
    // Bild von einer Leinwand, die noch nicht gemalt hat, misst die Kamera und nicht das Netz.
    const flecke = () => evaliere(cdp, `(()=>{const c=document.querySelector('canvas');if(!c)return 0;
      const x=c.getContext('2d');let t=0;try{const d=x.getImageData(0,0,c.width,c.height).data;
      for(let i=0;i<d.length;i+=4000){if(d[i]+d[i+1]+d[i+2]>40)t+=1}}catch(e){return 0}
      return t;})()`);
    let gewartet = null, zuletzt = -1, ruhig = 0, wartend = 0;
    while (ruhig < 2 && wartend < 45000) {
      await schlafe(1500); wartend += 1500;
      const n = await flecke();
      gewartet = n;
      if (n > 0 && n === zuletzt) ruhig += 1; else ruhig = 0;
      zuletzt = n;
    }
    console.log(`  Farbflecke: ${gewartet} nach ${Math.round(wartend / 1000)} s — ` +
      (ruhig >= 2 ? "ruhig geworden" : "nach 45 s noch in Bewegung"));
    // Die Zahl der Flecke kann gleich bleiben, waehrend die Knoten wandern (die Sonde taste
    // alle tausendsten Pixel). Fuer einen Vorher/Nachher-Vergleich an demselben Bild braucht
    // der Pruefer eine strengere Ruhe: zwei Rasterabdrueke im Abstand von zwei Sekunden,
    // Byte fuer Byte gleich. Steht das Bild nie, ist das selbst ein Befund — und der
    // Vergleich ist gueltig als Vergleich zweier Zeiten, nicht zweier Kameras.
    const raster = async () => await evaliere(cdp, `(()=>{const c=document.querySelector('canvas');if(!c)return '';
      const x=c.getContext('2d');try{const d=x.getImageData(0,0,c.width,c.height).data;let s='';
      for(let i=0;i<d.length;i+=40000){s+=d[i]+','+d[i+1]+','+d[i+2]+';'}return s;}catch(e){return ''}})()`);
    const ruhe = async (maxMs) => {
      const anfang = Date.now();
      let vorher = await raster();
      while (Date.now() - anfang < maxMs) {
        await schlafe(2000);
        const jetzt = await raster();
        if (jetzt && jetzt === vorher) return Math.round((Date.now() - anfang) / 1000);
        vorher = jetzt;
      }
      return null;
    };
    const stehend = await ruhe(30000);
    console.log(`  Das Bild steht: ${stehend === null ? "nein — auch nach 30 s bewegt sich die Leinwand" : `nach ${stehend} s`}`);
    // Was der Knopf anbietet, ist dasselbe, was ein Nutzer in den Download legt: die Kette wird
    // gefangen, nicht auf die Platte geschrieben. Aufrufbar, solange die Flaeche steht.
    const exportBild = async () => {
      const hol = await evaliere(cdp, `(()=>{let gefangen=null;const echt=HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click=function(){gefangen={name:this.getAttribute('download')||'',kette:this.href};return echt.apply(this,arguments)};
        const b=document.querySelector('button[data-testid="graph-export"]');
        if(!b) { HTMLAnchorElement.prototype.click=echt; return {fehler:'kein Export-Knopf'}; }
        b.click();
        HTMLAnchorElement.prototype.click=echt;
        if(!gefangen) return {fehler:'der Knopf hat nichts angeboten'};
        const theil=(gefangen.kette.split('base64,')[1]||'');
        return {name:gefangen.name, typ:(gefangen.kette.split(';')[0]||''), laenge:theil.length, theil};})()`);
      if (hol.fehler) { console.log(`  der Export meldet: ${hol.fehler}`); return null; }
      const puff = Buffer.from(hol.theil || "", "base64");
      return { name: hol.name, typ: hol.typ, puff,
        b: puff.length > 24 ? puff.readUInt32BE(16) : 0,
        h: puff.length > 24 ? puff.readUInt32BE(20) : 0 };
    };
    const erst = await exportBild();
    urteil("der Export gibt eine PNG-Kette her", String((erst || {}).typ || "").startsWith("data:image/png"), true);
    urteil("die Kette traegt eine echte PNG-Signatur",
      !!erst && erst.puff.length > 24 && erst.puff[0] === 0x89 && erst.puff.slice(1, 4).toString("latin1") === "PNG", true);
    const leinwand = await evaliere(cdp, `(()=>{const c=document.querySelector('canvas');
      return c ? { b: c.width, h: c.height } : { b: 0, h: 0 };})()`);
    urteil(`**das Bild hat die Groesse der Leinwand (${(erst || {}).b} x ${(erst || {}).h} gegen ${leinwand.b} x ${leinwand.h})**`,
      !!erst && erst.b === leinwand.b && erst.h === leinwand.h && erst.b > 0, true);
    // Zwei Wege, dasselbe Bild: die Aufnahme des Fensters (was ein Auge sieht) und die Kette des
    // Exports (was die Hand bekommt). Ist die Aufnahme gemalt und der Export leer, luegt der
    // Export. Sind beide leer, malt die Flaeche nach dem Groessenwechsel nicht neu — das waere
    // ein Nutzerfehler, kein Prueferfehler.
    console.log(`  Schirmaufnahme: ${await bild(`graph-${SAAT}-notizen-${BREITE}px-aufnahme.png`)}`);
    // Ist die Ansicht eingepasst? Gemessen am Bild, nicht am Gefuehl: die Umrandung aller Pixel,
    // die nicht Grund sind, gegen die Kanten der Leinwand. Beruehrt das Netz eine Kante, laeuft es
    // ueber den Rand hinaus; bleibt eine Seite weit frei, steht die Kamera neben der Arbeit.
    // Die Umrandung holt der Pruefer aus scripts/helfer/png-kante.mjs — dort, wo die
    // Entsorgung der gefilterten Zeilen steht und von einem Biss-Beleg gehalten wird.
    const melde = (r, label) => {
      if (r.meldung) { console.log(`  ${label}: ${r.meldung}`); return null; }
      if (r.x1 < 0) { console.log(`  ${label}: gar keine Tinte im Bild`); return null; }
      console.log(`  ${label}: Kasten ${r.x0},${r.y0} bis ${r.x1},${r.y1} in ${r.w}x${r.h} ` +
        `(Grund ${r.grund}, Tinte ${r.traf} von ${r.w * r.h}) — frei: oben ${r.freie.oben.toFixed(1)} %, ` +
        `unten ${r.freie.unten.toFixed(1)} %, links ${r.freie.links.toFixed(1)} %, rechts ${r.freie.rechts.toFixed(1)} %; ` +
        `Kanten beruehrt: ${r.beruehrt.join(",") || "keine"}`);
      for (const [seite, k] of Object.entries(r.kantigen)) {
        if (k.traf > 0) {
          const laenge = seite === "oben" || seite === "unten" ? r.w : r.h;
          console.log(`    ${seite}: ${k.traf} von ${laenge} Pixels der Kante tragen Tinte ` +
            `(${((k.traf / laenge) * 100).toFixed(1)} % ihrer Laenge), Spanne ${k.spanne[0]} bis ${k.spanne[1]}`);
        }
      }
      return r;
    };
    const vorDemGriff = melde(umrandung((erst || {}).puff || Buffer.alloc(0)), "Ansicht beim Eintreffen");
    if (vorDemGriff) {
      urteil("**kein Netz laeuft ueber eine Bildkante**", vorDemGriff.beruehrt.length, 0);
      // Befund A war: der Export hatte keinen Grund — die erste Zeile war `0, 0, 0, 0`.
      // Geprueft wird am ausgelieferten Bild, nicht am Quelltext.
      urteil("**der Export traegt einen undurchsichtigen Grund**", vorDemGriff.alpha, 255);
    }
        // Der Vergleich der zwei Kameras kommt ZUERST: die Klappe der Legende aendert die
    // Rahmenhoehe, in die die Kamera einpasst (`einpassFlaeche` zieht ihre Hoeh' ab), und
    // wer erst faltet und dann vergleicht, misst zwei verschiedene Rahmen als einen.
    // Gemessen 31.10. 21:44 mit der alten Folge: 556 -> 613. Nach der Umstellung wird
    // der Vergleich zweimal neu gefahren, bevor etwas gilt.
    // Zwei Erklaerungen fuer ein Bild, das nicht stimmt: es ist nichts zu malen, oder die Kamera
    // steht daneben. Der Knopf "Fit" entscheidet — bringt er ein anderes Bild, war es die Kamera.
    const weit = vorDemGriff && (vorDemGriff.beruehrt.length > 0 ||
      Math.max(...Object.values(vorDemGriff.freie)) > 25);
    let nachDemGriff = null;
    // Der Zahlengriff vor dem Bildengriff: die Bilanzzeile der Flaeche zaehlt die Notizen,
    // die wirklich im Rahmen liegen, und sie wird Bild fuer Bild geschrieben. Gelesen zwei
    // Sekunden vor und eineinhalb nach dem Klick, vergleicht sie dieselbe Weltlage — die
    // Tinten-Kasten-Rechnung unten vergleicht zwei verschiedene, denn das Feld laeuft
    // zwischen den beiden Aufnahmen weiter (gemessen 31.10. 21:49: zwei Zeugen, 545 -> 575
    // und 589 -> 659, und beide Male war die Welt in der Zwischenzeit anders verteilt).
    const rahmenZahl = async () => await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="graph-im-bild"]');
      const t=(e&&e.textContent||'').replace(/\\s+/g,' ').trim();const m=t.match(/^([\\d,]+) of ([\\d,]+)/);
      return m?{im: Number(m[1].replace(/,/g,'')), von: Number(m[2].replace(/,/g,'')), text:t}:{im:null, von:null, text:t||'schweigt'}})()`);
    if (gewartet === 0 || weit) {
      const vorher = await rahmenZahl();
      // Die Kontrolle: zweimal lesen, dazwischen NICHTS tun. Was die Zahl in der Ruhe
      // wandert, ist die Drift des Feldes und nicht die Antwort des Knopfs — ohne sie
      // schreibt man dem Griff eine Differenz zu, die die Physik hat.
      await schlafe(1500);
      const kontrolle = await rahmenZahl();
      console.log(`  Kontrolle ohne Griff: ${vorher.im} -> ${kontrolle.im} (Drift ${Math.abs((kontrolle.im ?? 0) - (vorher.im ?? 0))})`);
      const fit = await evaliere(cdp, `(()=>{const b=document.querySelector('button[data-testid="graph-fit"]');
        if(!b) return 'kein Fit-Knopf'; b.click(); return 'Fit gedrueckt';})()`);
      await schlafe(1500);
      const nachher = await rahmenZahl();
      const drift = Math.abs((kontrolle.im ?? 0) - (vorher.im ?? 0));
      const verlust = (vorher.im ?? 0) - (nachher.im ?? 0);
      console.log(`  Notizen im Bild: vorher ${vorher.im} — nach der Kontrolle ${kontrolle.im} — nach dem Fit ${nachher.im} von ${vorher.von}; Verlust gegen die Ankunft ${verlust}, Drift ohne Griff ${drift}`);
      if (vorher.im !== null && nachher.im !== null) {
        // Der Knopf verliert nur, was ueber der eignen Drift liegt.
        urteil("**der Fit-Knopf zeigt nicht weniger Notizen als die Ankunft, ueber der Drift gemessen**",
          verlust <= drift, true);
      }
      const ruhigNach = await ruhe(20000);
      const zwei = await exportBild();
      const titelNach = await evaliere(cdp, `(()=>{const b=document.querySelector('button[data-testid="graph-fit"]');
        return b ? (b.getAttribute('title')||'') : 'kein Fit-Knopf';})()`);
      nachDemGriff = melde(umrandung((zwei || {}).puff || Buffer.alloc(0)),
        `dieselbe Ansicht nach ${fit} (Bild steht: ${ruhigNach === null ? "nein nach 20 s" : ruhigNach + " s"}; Titel nun: ${titelNach})`);
      if (zwei) {
        fs.mkdirSync(BILDER_ZIEL, { recursive: true });
        const zweiter = path.join(BILDER_ZIEL, `graph-${SAAT}-notizen-${BREITE}px-nach-fit.png`);
        fs.writeFileSync(zweiter, zwei.puff);
        console.log(`  Bildbeweis nach Fit: ${zweiter} (${zwei.puff.length} B, ${zwei.b} x ${zwei.h})`);
      }
      if (nachDemGriff) {
        const randTinte = (r) => Object.values(r.kantigen).reduce((s, k) => s + k.traf, 0);
        console.log(`  nach dem Fit: Kanten beruehrt ${nachDemGriff.beruehrt.join(",") || "keine"}, ` +
          `weiteste freie Seite ${Math.max(...Object.values(nachDemGriff.freie)).toFixed(1)} % ` +
          `(vorher ${vorDemGriff ? Math.max(...Object.values(vorDemGriff.freie)).toFixed(1) + " %" : "kein Bild"})`);
        if (vorDemGriff) {
          console.log(`  Tinte auf vier Kanten: vorher ${randTinte(vorDemGriff)}, nach dem Fit ${randTinte(nachDemGriff)}`);
          urteil("**der Fit-Knopf schneidet nicht mehr ab als die Ankunft**",
            randTinte(nachDemGriff) <= randTinte(vorDemGriff), true);
        }
      }
    }
    // Die Flaechezaehlt, was ausserhalb des Ausschnitts bleibt ("1 275 of 1 500 ... are in this
    // picture"). Diese Zeile ist die Ehrlichkeit der Kamera. Sie wohnt in der Legende — und die
    // Legende hat eine Klappe (Punkt 114: zugemacht hoechstens 25 % Deckung). Also wird beides
    // gemessen: wie viel Bild die offene Legende deckt, und ob die Bilanzzeile die Klappe ueberlebt.
    const leseZeile = async () => await evaliere(cdp, `(()=>{
      const l=document.querySelector('[data-testid="graph-legende"]');
      const z=document.querySelector('[data-testid="graph-im-bild"]');
      const c=document.querySelector('canvas');
      const lesbar=(e)=>{if(!e) return null; const r=e.getBoundingClientRect(); const s=getComputedStyle(e);
        return { da: true, text: (e.textContent||'').trim().slice(0,110),
          sichtbar: r.width>0 && r.height>0 && s.display!=='none' && s.visibility!=='hidden' };};
      const aus={};
      if (l) aus.zustand = l.getAttribute('data-legende');
      if (c && l) { const cr=c.getBoundingClientRect(), lr=l.getBoundingClientRect();
        const decke = Math.max(0, Math.min(cr.bottom,lr.bottom)-Math.max(cr.top,lr.top))
                    * Math.max(0, Math.min(cr.right,lr.right)-Math.max(cr.left,lr.left));
        aus.bedeckt = +((decke/(cr.width*cr.height))*100).toFixed(1);
        aus.leinwand = [Math.round(cr.width), Math.round(cr.height)]; }
      aus.zeile = lesbar(z);
      return aus;})()`);
    const klappe = async (wort) => await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')]
      .find(x=>new RegExp('^\\\\s*(${wort})\\\\s*','i').test((x.textContent||'').trim()));
      if(!b) return 'kein Knopf mit diesem Wort'; b.click(); return (b.textContent||'').trim();})()`);
    const offen = await leseZeile();
    console.log(`  Legende offen: Zustand ${offen.zustand}, deckt ${offen.bedeckt} % der Leinwand ` +
      `(${(offen.leinwand || []).join(" x ")} px) — Bilanzzeile: ${JSON.stringify(offen.zeile)}`);
    // Wer die Kante schneidet, ist eine Frage an die Kamera, nicht ans Bild. Die Flaeche nennt es
    // selbst: der Fit-Knopf fuehrt im Titel, ob der Lesbarkeits-Boden entschieden hat.
    const grund = await evaliere(cdp, `(()=>{const b=document.querySelector('button[data-testid="graph-fit"]');
      return b ? (b.getAttribute('title')||'') : 'kein Fit-Knopf';})()`);
    console.log(`  Der Fit-Knopf sagt ueber sich: ${grund}`);
    const zugeklappt = await klappe("Hide");
    await schlafe(1200);
    const zu = await leseZeile();
    console.log(`  Klappe (${zugeklappt}): Zustand ${zu.zustand}, deckt ${zu.bedeckt} % — Bilanzzeile: ${JSON.stringify(zu.zeile)}`);
    if (zu.zeile && zu.zeile.da && zu.zeile.text !== "") {
      urteil("**die Bilanz des Ausschnitts bleibt auch hinter der Klappe lesbar**", zu.zeile.sichtbar, true);
    } else if (vorDemGriff && vorDemGriff.beruehrt.length === 0) {
      // Stille ist hier erlaubt, aber nur mit Zeuge: schweigt die Zeile, weil alles im Bild
      // steht, darf sie nicht gleichzeitig verdeckt sein. Ohne den Zeugen waere das ein Fall,
      // der nie schlagen kann.
      console.log("  ok    die Bilanzzeile schweigt, und kein Rand ist beschnitten — alles steht im Bild");
    } else {
      urteil("**die Bilanzzeile schweigt nur, wenn nichts beschnitten ist**",
        vorDemGriff ? vorDemGriff.beruehrt.length : -1, 0);
    }
    urteil("die zugemachte Legende deckt hoechstens 25 % des Bildes", (zu.bedeckt || 0) <= 25, true);
    const wieder = await klappe("Show");
    await schlafe(900);
    console.log(`  Klappe zurueck (${wieder}): Zustand ${(await leseZeile()).zustand}`);
    if (erst) {
      const datei = path.join(BILDER_ZIEL, `graph-${SAAT}-notizen-${BREITE}px.png`);
      fs.mkdirSync(BILDER_ZIEL, { recursive: true });
      fs.writeFileSync(datei, erst.puff);
      console.log(`  Bildbeweis: ${datei} (${erst.puff.length} B, ${erst.b} x ${erst.h}, Name "${erst.name || "keiner"}")`);
    }
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
