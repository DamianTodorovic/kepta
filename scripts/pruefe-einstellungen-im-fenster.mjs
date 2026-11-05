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
import { kantenUrteil } from "./helfer/kanten-urteil.mjs";
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
// Der Zielordner folgt dem Hausmuster `belege-TTMM` des Tages, nicht einem
// mitgeschriebenen Datum: der Lauf vom 4.11. landete in `belege-3110`, weil ein
// frueherer Tag den Pfad in die Zeile geschrieben hatte. Keiner der Beweise ist
// damit falsch, aber einer war am falschen Ort.
const HEUTE = (() => { const d = new Date(); return `belege-${String(d.getDate()).padStart(2, "0")}${String(d.getMonth() + 1).padStart(2, "0")}`; })();
const BILDER_ZIEL = ARG("bilder", `/Users/damiantodorovic/Desktop/ki gehirn/audit-2026-10-09/feldzug/${HEUTE}/fenster-${FASSUNG.split(".").pop()}`);
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
  constructor(ws) {
    this.ws = ws; this.nr = 0; this.wartend = new Map();
    // Ereignisse (keine Antwort auf eine Anfrage) gingen bis hierher verloren: der Pruefer
    // sah nur, was er selbst fragte. Punkt 4s Fehler-Feger braucht die Zeilen, die das
    // Fenster von sich aus meldet - Konsole, Ausnahmen, fehlgeschlagene Anfragen.
    this.ereignisse = [];
  }
  static async verbindung(url) {
    const ws = await new Promise((res, rej) => {
      const w = new WebSocket(url);
      w.onopen = () => res(w);
      w.onerror = () => rej(new Error("CDP-Rohr abgelehnt"));
    });
    const c = new Cdp(ws);
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id !== undefined && c.wartend.has(m.id)) { c.wartend.get(m.id)(m); c.wartend.delete(m.id); return; }
      if (m.method) c.ereignisse.push(m);
    };
    c.ereignisse = c.ereignisse || [];
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
  //    Gemessen 2.11. 07:21: dieser Griff lief einmal, kurz nachdem der erste Knopf gemalt war —
  //    da war der Assistent noch nicht da, und das Protokoll meldete "stand keiner im Weg",
  //    obwohl das Bild desselben Laufs den offenen Schirm zeigt. Also: fragen, bis einer
  //    antwortet oder vier Sekunden um sind, und danach **nachlesen**, ob der Schirm wirklich zu
  //    ist. Ein gruener Wert hinter einem offenen Overlay ist kein Beweis (Hausform vom 16.10.).
  const spaeter = await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return (b.textContent||'').trim()})()`), { maxMs: 4000 });
  await schlafe(700);
  const schirm = await evaliere(cdp, `(()=>/Step 1 of 4|Set up K3PTA/.test(document.body.innerText||''))()`);
  console.log(`  Assistent: ${spaeter ? `Weg ueber "${spaeter}"` : "kein Knopf in vier Sekunden"}; Schirm danach ${schirm ? "STEHT NOCH DA" : "zu"}`);
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
    || NUR === "radien" || NUR === "auswahl" || NUR === "gruppenzeit" || NUR === "tastmass"
    || NUR === "saetze") {
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
    // Eigner Fehler, gemessen 4.11. 00:32 MEZ: der Neuladen liess die Flaeche auf Graph
    // stehen, und Graph sagt kein "N entries" - die Sonde fand die Zahl nicht und meldete
    // "die Flaeche kennt die Saat nicht", obwohl die Leiste 34 Eintraege zeigte. Verlangt
    // wird die Zahl dort, wo die Flaeche sie ausspricht: auf Knowledge.
    await knopf(cdp, "Knowledge");
    await schlafe(900);
    // Die Sonde selbst war der Defekt, nicht die Flaeche: sie suchte "N entries", und
    // diese Fassung sagt "N notes in the search index" (dasselbe Muster wie der Tastmass-
    // Schenkel weiter unten). Gemessen 4.11. 00:36 MEZ: mit dem alten Muster blieb der Fall
    // false, obwohl die Leiste 34 Eintraege zeigte.
    const eintraege = Number(await evaliere(cdp, `(()=>{const m=(document.body.innerText||'').match(/([\\d,]+)\\s+(?:entries|notes in the (?:search )?index)/);return m?Number(m[1].replace(/,/g,'')):-1})()`));
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

  // --- Zyklus M: die Zahl zu der Wahl, die er wirklich trifft (Punkt 5, vierter Schlag) ------
  //     Die Flaeche filtert Thema UND Fach zusammen (`Dashboard.tsx:948-956`), und der Leerlauf
  //     nannte bis 3.2.108 entweder eine Randzahl oder schwieg. Seit 3.2.109 liest er die Zelle
  //     der Kreuztabelle. Bewiesen wird das am ausgelieferten Stueck, und nur dort, wo Zelle und
  //     Rand sich unterscheiden - sonst ist der Satz gegen beide Zahlen gleich gueltig und
  //     beweist nichts. Die Chip-Worte sind die Etikette aus `src/lib/graphHierarchy.ts`
  //     (TRAEGER_LABELS, THEMA_LABELS); findet der Zyklus keinen Chip, sagt er das loud.
  if (NUR === "" || NUR === "auswahl") {
    // Drei gescannte Dokumente ohne jedes Themenwort. Ohne sie ist kein Paar zu finden, das
    // die Zelle von BEIDEN Randzahlen unterscheidet: die Kapsel-Saat (30 Prosanotizen mit
    // "faellig") fuehrt nur Paare, deren Zelle gleich der Fachzahl ist - und die alte Fassung
    // nennt die Fachzahl, also waere der Fall blind (gemessen 14:02:07: "holds 0 of them" gegen
    // 3.2.108 gruen, weil Fachzahl und Zelle dort beide 0 waren).
    const dateien = Array.from({ length: 3 }, (_, i) => {
      const n = String(900 + i);
      return { name: `auswahl/Mappe-${n}.md`,
        content: ["---", `kepta_id: auswahl-${n}`, `title: "Ablage ${n}"`, "tags: [machine-scan, md, auswahl]",
          "type: semantic", "---", "", `Ablage ${n} ohne jedes Signal, nur ein Ordner und ein Text.`].join("\n") };
    });
    await fetch(`${BASIS}/api/import/markdown`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: dateien, scope: "local" }) });
    await schlafe(2200);
    const zahlen = await evaliere(cdp, `fetch('/api/memories/gruppen').then(r=>r.json())`);
    urteil("**die Tuer liefert die Kreuztabelle im ausgelieferten Stueck**", !!(zahlen && zahlen.themenNachTraeger), true);
    const F = ["notes", "files", "code", "daten", "anderes"];
    const H = ["people", "projects", "events", "tasks", "guides", "links"];
    const F_LABEL = { notes: "Notes", files: "Files", code: "Code", daten: "Data", anderes: "Other" };
    const H_LABEL = { people: "People", projects: "Projects", events: "Events", tasks: "Tasks", guides: "Guides", links: "Links" };
    // Ein Paar, dessen Zelle sich von BEIDEN Randzahlen unterscheidet (Fachzahl und Themenrand).
    // Der erste Entwurf brach nur aus der inneren Schleife und merkte sich darum das LETZTE
    // Paar - gemessen 14:02:07: "Other x Tasks", wo Fachzahl und Zelle beide 0 sind und der Fall
    // darum gegen die alte Fassung nicht verlieren kann.
    let paar = null;
    aussen: for (const f of F) {
      for (const h of H) {
        const zelle = (zahlen.themenNachTraeger?.[f]?.[h]) ?? 0;
        const rand = (zahlen.themen?.[h] ?? 0);
        const fach = (zahlen.traeger?.[f] ?? 0);
        if (zelle !== rand && zelle !== fach) { paar = { f, h, zelle, rand, fach }; break aussen; }
      }
    }
    if (!paar) {
      urteil("ein Paar, dessen Zelle sich vom Rand unterscheidet", false, true);
    } else {
      console.log(`  Raender: ${JSON.stringify(zahlen.themen)} | Facher: ${JSON.stringify(zahlen.traeger)}`);
      console.log(`  gesuchte Wahl: ${F_LABEL[paar.f]} x ${H_LABEL[paar.h]} — Zelle ${paar.zelle}, Rand ${paar.rand}`);
      // Erst neu laden, dann messen — dieselbe Lehre wie Zyklus I und J, zum zweiten Mal
      // an mir selbst gemessen (14:01:19 gegenueber 14:00:59): die Saat liegt in der Tuer, aber die Seite kennt sie
      // ohne Nachladen nicht, und ohne Eintraege baut die Liste ihre Achsen-Reihen gar nicht.
      await cdp.send("Page.reload", { ignoreCache: true });
      await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
      // Der Assistent haelt die Liste: ohne ihn wegzuklicken ist die Achsen-Reihe gar nicht im
      // Blatt (zwei Laeufe 13:58:57 und 14:00:25: die Knopfliste zeigte "Look for a local model"
      // und "Summarise", aber keine Achsen-Chips und null [role="group"] im ganzen Blatt). Derselbe Griff wie in Zyklus J, vor dem Klick auf die Liste.
      await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|ueberspringen/i.test(x.textContent||''));if(b)b.click();})()`);
      await schlafe(900);
      // Die Kapsel merkt sich die letzte Sicht im eignen Profil (localStorage unter
      // /tmp/kepta-fenster) — gemessen 14:00:59: der Fensterlauf landete auf Settings, und die
      // Listen-Sicht war gar nicht montiert (null [role="group"] im ganzen Blatt). Ein Klick
      // reicht nicht, wenn die Seite noch nicht hydriert ist; also nach dem Zustand fragen.
      let offen = null, versuche = 0;
      while (versuche++ < 8) {
        offen = await knopf(cdp, "Knowledge");
        await schlafe(1200);
        const da = await evaliere(cdp, `!!document.querySelector('[role="group"]')`);
        if (da) break;
      }
      console.log(`  Liste geoeffnet ueber: ${JSON.stringify(offen)} nach ${versuche} Griff(en)`);
      const frage = async (text) => await evaliere(cdp, `(()=>{const g=[...document.querySelectorAll('[role="group"]')]
        .find(x=>[...x.querySelectorAll('button')].some(b=>(b.textContent||'').trim()===${JSON.stringify(text)}));
        return g?(g.getAttribute('aria-label')||''):''})()`);
      const fFrage = await frage(F_LABEL[paar.f]), hFrage = await frage(H_LABEL[paar.h]);
      if (fFrage.length === 0 || hFrage.length === 0) {
        const namen = await evaliere(cdp, `[...document.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).filter(Boolean).join(' | ')`);
        const rollen = await evaliere(cdp, `[...document.querySelectorAll('[role="group"]')].map(g=>(g.getAttribute('aria-label')||'?')+'['+[...g.querySelectorAll('button')].map(b=>(b.textContent||'').trim()).join(',')+']').join(' || ')`);
        console.log(`  Gruppen im Blatt: ${rollen}`);
        console.log(`  alle Knopfe: ${namen}`);
      }
      urteil(`der Fach-Chip "${F_LABEL[paar.f]}" steht in einer Gruppe`, fFrage.length > 0, true);
      urteil(`und der Thema-Chip "${H_LABEL[paar.h]}" auch`, hFrage.length > 0, true);
      const treffe = async (label) => await evaliere(cdp, `(()=>{const g=[...document.querySelectorAll('[role="group"]')]
        .find(x=>[...x.querySelectorAll('button')].some(b=>(b.textContent||'').trim()===${JSON.stringify(label)}));
        if(!g)return 'keine Gruppe'; const b=[...g.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(label)});
        if(!b)return 'kein Chip'; b.click(); return 'geklickt'})()`);
      const stellung = async (label) => await evaliere(cdp, `(()=>{const g=[...document.querySelectorAll('[role="group"]')]
        .find(x=>[...x.querySelectorAll('button')].some(b=>(b.textContent||'').trim()===${JSON.stringify(label)}));
        const b=g&&[...g.querySelectorAll('button')].find(x=>(x.textContent||'').trim()===${JSON.stringify(label)});
        return b?(b.getAttribute('aria-pressed')||'?'):'kein Chip'})()`);
      console.log(`  Gruppen: ${JSON.stringify(fFrage)} / ${JSON.stringify(hFrage)}`);
      await treffe(F_LABEL[paar.f]);
      await schlafe(1200);
      console.log(`  Fach-Chip "${F_LABEL[paar.f]}": aria-pressed = ${await stellung(F_LABEL[paar.f])}`);
      await treffe(H_LABEL[paar.h]);
      await schlafe(1600);
      console.log(`  Thema-Chip "${H_LABEL[paar.h]}": aria-pressed = ${await stellung(H_LABEL[paar.h])}`);
      const satz = await evaliere(cdp, `(()=>{const p=[...document.querySelectorAll('p')].map(e=>(e.textContent||'').trim())
        .find(t=>/the store holds/.test(t));return p||'kein Satz'})()`);
      console.log(`  der Leerlauf-Satz: ${JSON.stringify(String(satz).slice(0, 220))}`);
      const zahl = String(satz).match(/holds ([\d,]+) of them/);
      const gelesen = zahl ? Number(zahl[1].replace(/,/g, "")) : null;
      urteil(`**der Satz nennt die Zelle (${paar.zelle}) von ${F_LABEL[paar.f]} x ${H_LABEL[paar.h]}**`, gelesen, paar.zelle);
      // Der alte Fehler war der Rand (alle Termine); der zweite alte Fehler war die Fachzahl
      // (alle Stuecke dieses Fachs). Beide duerfen nicht dastehen, sonst ist der Fall blind.
      urteil("und nicht den Rand des Themas", gelesen === paar.rand, false);
      urteil("und nicht die Zahl des Fachs allein", gelesen === paar.fach, false);
      console.log(`  Bild: ${await bild("auswahl-zelle.png")}`);
    }
  }

  // --- Zyklus N: was der Nutzer in den ersten Sekunden sieht (Punkt 6, Aufgabe 34) -----------
  //     Gemessen an seiner eignen Tuer (1.11. 13:34, Bestand 21 064): `GET /api/memories/gruppen`
  //     braucht 1 351 und 1 304 ms, weil die Route beim Fragen teilt und nichts gespeichert ist.
  //     Die Flaeche haelt fuer die Zeit ein Wort bereit ("counting the N loaded" gegen die ganze
  //     Menge - seit 3.2.114 "all of your notes", vorher "the whole store", darum fragt dieser
  //     Zyklus nach BEIDEN Formen) - ob es ankommt, wann es wechselt und ob die
  //     Zeile je leer ist, war nicht gemessen.
  if (NUR === "" || NUR === "gruppenzeit") {
    // Der erste Entwurf (06:41) lud neu, wartete auf Knopfe, klickte die Liste - und begann
    // DANN zu fragen: 1 ms, und die Zeile nannte schon die ganze Menge. Das ist kein Verlauf,
    // das ist ein Blick hinter die Antwort. Also: Reload lost die Anfrage der Flaeche aus, und
    // die Proben beginnen im selben Augenblick, ohne dass dazwischen ein Griff wartet.
    const anfang = Date.now();
    await cdp.send("Page.reload", { ignoreCache: true });
    const spur = [];
    let ziel = -1;
    while (Date.now() - anfang < 12000 && ziel < 0) {
      const text = await evaliere(cdp, `(()=>{const e=[...document.querySelectorAll('span')].find(x=>/in what form/.test(x.textContent||''));
        return e?(e.textContent||'').trim():''})()`).catch(() => "");
      spur.push([Date.now() - anfang, String(text || "")]);
      if (/the whole store|all of your notes/.test(String(text))) ziel = spur.length - 1;
      await schlafe(100);
    }
    const spurAlt = spur;
    // Von der ERSTEN Probe an kann die Zeile nicht reden: vor dem Bergbau der Flaeche ist kein
    // Span da (gemessen 06:47: Probe 1 bei 0 ms ist leer, Probe 2 bei 114 ms nennt "in the
    // index", Probe 3 bei 225 ms nennt die ganze Menge). Gefragt wird darum die Zeit, in der
    // die Zeile steht - und ob sie in dieser Zeit je eine Zahl ohne Grundgesamtheit zeigt.
    urteil("**sobald die Zeile steht, nennt sie eine Grundgesamtheit**",
      spurAlt.slice(Math.max(0, spurAlt.findIndex(([, s]) => s.length > 0))).every(([, s]) => /in the (?:search )?index|counting the|the whole store|all of your notes/.test(s)), true);
    const stadien = spurAlt.filter(([, text]) => /counting the|in the (?:search )?index/.test(text)).length;
    const erste = spurAlt.findIndex(([, text]) => text.length > 0);
    console.log(`  Verlauf: ${spurAlt.length} Griffe in ${spurAlt[spurAlt.length - 1][0]} ms, ` +
      `${stadien} Proben nennen die Grundgesamtheit "geladen", ` +
      `Zeile zuerst nach ${erste >= 0 ? spurAlt[erste][0] : -1} ms, ` +
      `die ganze Menge ab ${ziel >= 0 ? spurAlt[ziel][0] + " ms" : "NICHT innerhalb 12 s"}`);
    console.log(`  Proben um die erste Zeile: ${JSON.stringify(spurAlt.slice(Math.max(0, erste - 1), erste + 4).map(([, s]) => s))}`);
    urteil("**die Zeile ist nie leer, bevor sie eine Grundgesamtheit nennt**",
      spurAlt.slice(erste, ziel + 1).every(([, text]) => text.length > 0), true);
    urteil("**die ganze Menge kommt, bevor der Nutzer zu lange schaut**", ziel >= 0 && spurAlt[ziel][0] < 8000, true);
    console.log(`  Bild: ${await bild("gruppenzeit-erste-sekunden.png")}`);
  }

  // --- Zyklus O: der Fehler-Feger ueber alle Sichten (Punkt 4, Aufgabe 31) -------------------
  //     Punkt 4 heisst woertlich "keine Fehler in keinem Bereich". Pruefen konnte das bis
  //     hierher nur die Einstellungen-Flaeche (zwoelf Zyklen). Was fehlte, war das Protokoll,
  //     das das Fenster von sich aus schreibt: Konsole, Ausnahmen, fehlgeschlagene Anfragen.
  //     Abbruch und Strome (EventSource, die beim Sichtwechsel enden) sind kein Fehler -
  //     sie werden ausgefiltert, und die Liste der verschiedenen Zeilen wird gedruckt, damit
  //     ein gruener Lauf nicht behauptet, es sei nichts gewesen.
  if (NUR === "" || NUR === "fehler") {
    for (const dom of ["Runtime.enable", "Log.enable", "Network.enable"]) {
      try { await cdp.send(dom); } catch { console.log(`  ${dom} geht in diesem Fenster nicht`); }
    }
    cdp.ereignisse.length = 0;
    for (const nam of ["Knowledge", "Today", "Chat", "Graph", "Dossier", "Activity", "Settings"]) {
      const geklickt = await knopf(cdp, `^\\s*${nam}\\s*$`);
      urteil(`die Sicht ${nam} ist zu treffen`, geklickt !== null, true);
      await schlafe(1500);
    }
    const zeilen = [];
    for (const e of cdp.ereignisse) {
      const p = e.params || {};
      if (e.method === "Runtime.consoleAPICalled" && p.type === "error") {
        zeilen.push("konsole: " + (p.args || []).map((a) => a.value ?? a.description ?? a.subtype ?? "").join(" ").slice(0, 170));
      } else if (e.method === "Runtime.exceptionThrown") {
        const d = p.exceptionDetails || {};
        zeilen.push("Ausnahme: " + String((d.exception && d.exception.description) || d.text || "").slice(0, 170));
      } else if (e.method === "Log.entryAdded" && p.entry && p.entry.level === "error") {
        zeilen.push(`log(${p.entry.source}): ` + String(p.entry.text).slice(0, 170));
      } else if (e.method === "Network.loadingFailed") {
        if (/abort|cancel/i.test(String(p.errorText || ""))) continue;
        zeilen.push(`netz(${p.type}): ${p.errorText}`);
      }
    }
    const verschiedene = [...new Set(zeilen)];
    console.log(`  Ereignisse: ${cdp.ereignisse.length} | Fehlerzeilen: ${zeilen.length} | verschiedene: ${verschiedene.length}`);
    for (const z of verschiedene.slice(0, 14)) console.log(`      ${z}`);
    urteil("**keine Fehlerzeile in sieben Sichten**", verschiedene.length, 0);
    console.log(`  Bild: ${await bild("fehler-feger.png")}`);
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
    // Der Zahlengriff steht jetzt VOR der Kanten-Latte (5.11.): dieselbe Bilanzzahl, die unten
    // den Kameravergleich traegt, ist auch der Grund der gemeldeten Kante. Ein Leser, zwei Orte.
    const rahmenZahl = async () => await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="graph-im-bild"]');
      const t=(e&&e.textContent||'').replace(/\\s+/g,' ').trim();const m=t.match(/^([\\d,]+) of ([\\d,]+)/);
      return m?{im: Number(m[1].replace(/,/g,'')), von: Number(m[2].replace(/,/g,'')), text:t}:{im:null, von:null, text:t||'schweigt'}})()`);

    const vorDemGriff = melde(umrandung((erst || {}).puff || Buffer.alloc(0)), "Ansicht beim Eintreffen");
    if (vorDemGriff) {
      // Die Latte ist NEU GEFASST, nicht erweicht. Sie verlangte bis hierher "kein Netz ueber
      // einer Bildkante" und war bei 1 500 Notizen in jedem Lauf rot - ein Stand, der seit
      // `P1-KAMERA-ENTSCHEIDUNG-3110.md` §8 beschlossen ist: die Kamera schneidet nicht
      // absichtlich, sie schneidet, wo das Bild sonst aufhoert, ein Bild zu sein. Was fehlte,
      // war der Uebergang. Geprueft wird jetzt die Übereinstimmung von Wort, Marke und Bild:
      //  - jede Kante mit Tinte ist gemeldet, und jede gemeldete Kante traegt Tinte;
      //  - jede gemeldete Kante malt die Marke (Band ueber neun Zehntel ihrer Laenge), und
      //    keine ungemeldete Kante malt sie. Ein Band, das immer malt, faellt an der zweiten.
      const kantenGemeldet = await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="graph-im-bild"]');
        return e ? (e.dataset.kanten || "") : ""})()`);
      const gemeldete = String(kantenGemeldet).split(/\s+/).filter(Boolean);
      const tintenkanten = Object.entries(vorDemGriff.kantigen).filter(([, k]) => k.traf > 0).map(([s]) => s);
      const markenkanten = Object.entries(vorDemGriff.band).filter(([, d]) => d >= 0.9).map(([s]) => s);
      console.log(`  Kanten: Tinte ${JSON.stringify(tintenkanten)}, gemeldet ${JSON.stringify(gemeldete)}, Marke ${JSON.stringify(markenkanten)}`);
      urteil("**jede Kante, die Tinte traegt, ist als Beschnitt gemeldet**",
        tintenkanten.filter((s) => !gemeldete.includes(s)), []);
      // Die zweite Richtung war blind, gemessen am ausgelieferten Objekt: sie verlangte Tinte in
      // der nullten Pixelreihe, die Flaeche malt ihre Marke aber eine CSS-Reihe innerhalb
      // (KnowledgeGraph.tsx:4865-4868) -- bei doppeltem Zoom Spalte 2 bis 7, Spalte 0 und 1
      // bleiben Grund. Gefragt wird jetzt die Zahl, die dem Wort denselben Grund gibt: eine
      // gemeldete Kante braucht eine Zahl ausserhalb, und Zahlen ausserhalb brauchen eine
      // gemeldete Kante. Der Biss liegt in scripts/helfer/kanten-urteil.mjs, Fall zwei und drei.
      const bilanz = await rahmenZahl();
      const kU = kantenUrteil({ gemeldete, im: bilanz.im, von: bilanz.von });
      console.log(`  Wort gegen Zahl: ${kU.begruendung} (Zeile: ${bilanz.text})`);
      urteil("**jede gemeldete Kante hat ihre Zahl ausserhalb, und keine Zahl ausserhalb bleibt ohne Kante**",
        kU.fehl, []);
      urteil("**jede gemeldete Kante malt die Marke**", gemeldete.filter((s) => !markenkanten.includes(s)), []);
      urteil("**keine ungemeldete Kante malt eine Marke**", markenkanten.filter((s) => !gemeldete.includes(s)), []);
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
    if (gewartet === 0 || weit) {
      // Das Feld erst einfrieren, dann die zwei Kameras vergleichen (die eigne Forderung aus
      // `P1-KAMERA-ENTSCHEIDUNG-3110.md` §9: "Was ein fairer Test braucht, bevor die Frage
      // wieder angefasst wird: das Feld einfrieren"). Ohne das hier ist ein Verlust von 27
      // Notizen bei 1 500 nicht von der Abkuehlung des Feldes zu trennen - gemessen 14:10:29
      // am installierten 3.2.109: Kontrolle driftet 0, und trotzdem verliert der Fit 27.
      const erstarrt = await ruhe(90000);
      console.log(`  Feld erstarrt nach ${erstarrt === null ? ">90 (nicht erstarrt)" : erstarrt + " s"} — Vergleich folgt auf stehender Welt`);
      urteil("**der Kameravergleich laeuft auf erstarrtem Feld**", erstarrt !== null, true);
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
      } else {
        // Stille ist ein benannter Zweig, kein gruener Fall: gemessen 4.11. 15:45 MEZ am
        // ausgelieferten 3.2.144, wo die Bilanzzeile schwieg, weil der Rahmen alle 150 hielt.
        // Ohne diese Zeile liest ein Bericht "null von null" und haelt es fuer einen Ausfall.
        console.log("  Bilanzzeile schweigt (der Rahmen haelt alles) — dieser Vergleich hat in diesem Lauf keinen Gegenstand; die Wache fahrt ihn mit 34 Notizen bei 390 x 628");
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

  // --- Zyklus R: der Lesekorpus (Punkt 7, zum ersten Mal ueberhaupt) --------------------------
  //     Punkt 7 heisst woertlich "jeder muss es verstehen". Bis heute war dazu NIE etwas
  //     gemessen — kein Blatt dieser Welle nennt einen Korpus der Saetze, die ein Nutzer wirklich
  //     liest. Also zuerst die Aufnahme, und zwar aus dem gemalten Text des Fensters (nicht aus
  //     dem Quelltext: was im Baum steht, wird nicht unbedingt auch gezeigt). Das Urteil darueber
  //     spricht ein Leser ohne Projektkenntnis, nicht diese Datei.
  if (NUR === "" || NUR === "saetze") {
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await schlafe(1500);
    const spaeterR = await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return (b.textContent||'').trim()})()`), { maxMs: 3000 });
    if (spaeterR) await schlafe(700);
    const korpus = {};
    for (const nam of ["Knowledge", "Today", "Chat", "Graph", "Dossier", "Activity", "Settings"]) {
      const geklickt = await knopf(cdp, `^\\s*${nam}\\s*$`);
      urteil(`die Sicht ${nam} ist zu treffen`, geklickt !== null, true);
      await schlafe(1400);
      const texte = await evaliere(cdp, `(()=>{const haupt=document.querySelector('main')||document.body;
        return haupt.innerText.split(/\\n+/).map(s=>s.replace(/\\s+/g,' ').trim()).filter(s=>s.length>1)})()`);
      korpus[nam] = texte;
      console.log(`  ${nam}: ${texte.length} Zeilen sichtbarer Text`);
    }
    const still = Object.entries(korpus).filter(([, v]) => v.length === 0).map(([k]) => k);
    urteil("**keine Sicht bleibt stumm**", still, []);
    // Punkt 7, 3.2.115: dasselbe Woerterbuch, das die Wache in jsdom haelt, wird hier am
    // GEMALTEN Text des ausgelieferten Stuecks gefragt. Ein Beschluss, den nur ein Test kennt,
    // gilt am Objekt nicht — er gilt erst, wenn das Objekt ihn spricht.
    const verbotenQ = [[/\bentries?\b/, "entry/entries"], [/memory node/i, "memory node"],
      [/the whole store/i, "the whole store"], [/\bin the store\b/i, "in the store"], [/\bin the index\b/i, "in the index"],
      // 3.2.118, dieselben drei Woerter, die die jsdom-Wache haelt — am gemalten Text des
      // ausgelieferten Stuecks. Ein Beschluss, den nur ein Test kennt, gilt am Objekt nicht.
      [/\bbrain\b/i, "brain"], [/memory type/i, "memory type"], [/search cache/i, "search cache"],
      [/vector search active/i, "vector search active"], [/\bnodes in the prompt\b/i, "nodes in the prompt"]];
    const alleZeilen = Object.entries(korpus).flatMap(([namme, v]) => v.map((z) => [namme, z]));
    for (const [muster, name] of verbotenQ) {
      const treffer = alleZeilen.filter(([, z]) => muster.test(z));
      urteil(`**kein Wort "${name}" auf dem Schirm**`, treffer.map(([n, z]) => `${n}: ${z.slice(0, 70)}`), []);
    }
    // 3.2.116, die andre Klasse: ein Wort, das einen Zustand meint und wie ein Befehl (oder eine
    // Faehigkeit) gelesen wird. Als Zeile exakt getroffen, nicht als Teilwort — "Ready" in einem
    // Satz waer erlaubt, "Ready" als Ueberschrift ist es nicht.
    for (const wort of ["Ready", "Clean"]) {
      const treffer = alleZeilen.filter(([, z]) => z.trim() === wort);
      urteil(`**keine Zeile behauptet allein "${wort}"**`, treffer.map(([n, z]) => `${n}: ${z}`), []);
    }
    // 3.2.117, die positive Seite: ein Satz, den ich setze, muss am ausgelieferten Stueck auch
    // dastehen. Gegen das installierte 3.2.116 treffen alle drei im gemalten Text nicht, also
    // schlaegt jede einzelne, wenn die Heilung je verloren geht.
    const vorgeschrieben = [
      ["Knowledge", /\b[\d,]+ notes stored\b/, "N notes stored (Streifen der Wissens-Sicht)"],
      ["Settings", /The database on this computer/, "The database on this computer"],
      ["Settings", /Encrypted on this disk/, "Encrypted on this disk"],
      // 3.2.118, zwei von drei Heilungen sind im Korpus erreichbar; die dritte
      // ("One set of notes for every AI app") sitzt auf einem andern Tab und die zwei
      // Index-Streifen nur in einem Zustand, der hier nie eintritt — die haelt der
      // Inhalts-Pruefer am Buendel, nicht dieses Bild.
      ["Chat", /\b[\d,]+ notes in the prompt\b/, "N notes in the prompt (Kontext-Streifen)"],
      ["Settings", /Connect Claude Desktop and Cursor/, "Connect Claude Desktop and Cursor"],
    ];
    for (const [namme, muster, name] of vorgeschrieben) {
      const treffer = (korpus[namme] || []).filter((z) => muster.test(z));
      urteil(`**"${name}" steht wirklich auf dem Schirm**`, treffer.length > 0, true);
      if (treffer.length) console.log(`  gefunden in ${namme}: ${treffer[0].slice(0, 90)}`);
    }
    fs.mkdirSync(BILDER_ZIEL, { recursive: true });
    const pfad = path.join(BILDER_ZIEL, `saetze-korpus-${BREITE}px.json`);
    fs.writeFileSync(pfad, JSON.stringify({ stand: new Date().toISOString(), breite: BREITE, hoehe: HOEHE, korpus }, null, 1));
    const gesamt = Object.values(korpus).reduce((a, v) => a + v.length, 0);
    console.log(`  Korpus: ${gesamt} Zeilen in sieben Sichten, geschrieben nach ${pfad}`);
    console.log(`  Bild: ${await bild("saetze-korpus.png")}`);
  }

  // --- Zyklus Q: das Tastmass im echten Fenster (Punkt 2, der gezogene Vertrag) ---------------
  //     `src/index.css` schreibt 28 px Default und 20 px Boden vor (.tap / .tap-min), und die
  //     Design-Wache meldet `.tap-min` als Waise: keine Flaeche ruft ihn. Geglaubt wird hier
  //     nicht dem Quelltext, sondern dem gemalten Rechteck — eine Klassen-Kette aus dem Baum
  //     greifen ist keine Messung (Hausregel vom 27.10., als 44 px bei 390 gegen 36 px bei
  //     1440 lief). Gezahlt wird, was der Finger trifft: gemalt, sichtbar, nicht `inert`,
  //     nicht `pointer-events: none`.
  if (NUR === "" || NUR === "tastmass") {
    // Erst neu laden, dann zaehlen. Ohne diesen Schritt stand die Flaeche auf ihrem Stand von
    // VOR der Saat: das Bild meldete "0 entries in the index" und "No entries yet", waehrend die
    // Tuer 30 zaehlte — derselbe Prueferfehler, den `radien` (31.10.), `auswahl` und `gruppenzeit`
    // schon je einmal gezogen haben, hier zum vierten Mal an mir selbst (gemessen 02.11. 07:24).
    await cdp.send("Page.reload", { ignoreCache: true });
    await warteBis(async () => ((await evaliere(cdp, `document.querySelectorAll('button').length`)) > 0 ? true : null), { maxMs: 90000 });
    await schlafe(1500);
    // Der Neuladen kann den Assistenten zurueckbringen; derselbe Weg wie oben, wieder gefragt.
    const spaeterQ = await warteBis(async () => evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later|skip|spaeter/i.test(x.textContent||''));if(!b)return null;b.click();return (b.textContent||'').trim()})()`), { maxMs: 3000 });
    if (spaeterQ) await schlafe(700);
    const inLeiste = Number(await evaliere(cdp, `(()=>{const m=(document.body.innerText||'').match(/(\\d+)\\s+(?:entries|notes) in the (?:search )?index/);return m?Number(m[1]):-1})()`));
    urteil(`**die Flaeche kennt die Saat (${SAAT} Eintraege stehen in der Leiste)**`, inLeiste >= SAAT, true);
    console.log(`  Leiste sagt: ${inLeiste} Eintraege (Tuer: ${SAAT} gesaet)`);
    const BREITE_IST = Number(await evaliere(cdp, `window.innerWidth`));
    console.log(`  Fenster: ${BREITE_IST} x ${await evaliere(cdp, `window.innerHeight`)} px (bestellt ${BREITE} x ${HOEHE})`);
    urteil("das Fenster ist so breit, wie der Lauf bestellt", BREITE_IST, BREITE);
    const zensus = async (seite) => {
      await knopf(cdp, seite.regex);
      await schlafe(1200);
      return await evaliere(cdp, `(()=>{const out=[];const aus={leer:0,unsichtbar:0,inert:0};
        for (const e of document.querySelectorAll('button,a[href],[role="button"],[role="tab"],input,select,summary')) {
          const r = e.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) { aus.leer += 1; continue; }
          const st = getComputedStyle(e);
          if (st.visibility === 'hidden' || st.display === 'none' || st.pointerEvents === 'none') { aus.unsichtbar += 1; continue; }
          if (e.closest('[inert]')) { aus.inert += 1; continue; }
          const name = (e.getAttribute('aria-label') || e.title || e.textContent || e.tagName).replace(/\\s+/g,' ').trim().slice(0,26);
          // Ein 1x1-Pixel-Eingabefeld ist keine Zielscheibe, sondern der Leseweg: das Haus malt
          // die Schalter als label um ein verstecktes input (index.css: label:has(input[type=
          // checkbox])). Getroffen wird das Label. Also wird die Trefferflaeche gefragt, nicht der
          // Behaelter - dieselbe Lehre wie #116 (ein Marker, den kein Verbraucher trifft, ist kahl).
          const held = e.closest('label');
          const hr = held ? held.getBoundingClientRect() : null;
          const treffer = hr && hr.width >= r.width && hr.height >= r.height ? hr : r;
          out.push({ name, w: Math.round(treffer.width), h: Math.round(treffer.height),
            k: e.tagName.toLowerCase(), art: e.getAttribute('type') || '',
            hinter: hr && treffer !== r ? Math.round(r.width) + "x" + Math.round(r.height) : '' });
        }
        return { ziele: out, aus } })()`);
    };
    const seitenQ = [
      { name: "Knowledge", regex: "^\\s*(Knowledge|Wissen)\\s*$" },
      { name: "Graph", regex: "^\\s*(Graph)\\s*$" },
      { name: "Settings", regex: "^\\s*(Settings|Einstellungen)\\s*$" },
    ];
    let klein = [];
    let gesamt = 0;
    for (const seite of seitenQ) {
      const mess = await zensus(seite);
      const ziele = mess.ziele;
      gesamt += ziele.length;
      const unter = ziele.filter((z) => Math.min(z.w, z.h) < 20);
      klein.push(...unter.map((z) => ({ ...z, seite: seite.name })));
      console.log(`  ${seite.name}: ${ziele.length} Ziele, ${unter.length} unter dem Boden — ` +
        `kleinstes ${ziele.length ? JSON.stringify(ziele.reduce((a, b) => (Math.min(b.w, b.h) < Math.min(a.w, a.h) ? b : a))) : "keins"}`);
      console.log(`    ausgelassen: ${mess.aus.leer} ohne Rechteck, ${mess.aus.unsichtbar} unsichtbar oder nicht treffbar, ${mess.aus.inert} hinter der eingeklappten Leiste`);
      // Das Bild pro Sicht, nicht eins am Ende: die Frage "was bleibt bei 390 am Graphen
      // uebrig?" ist am Bild zu entscheiden, und der letzte Klick vor dem alten Knipser war
      // Settings — das Graph-Bild gab es nie (gemessen 02.11. 07:22).
      console.log(`    Bild: ${await bild(`tastmass-${BREITE_IST}-${seite.name}.png`)}`);
    }
    // Die eine Pruefung, die nie verlieren kann, ist ein Zensus ueber null Elemente. Also erst
    // der Zensus selbst, dann die Latte.
    urteil("**der Zensus sieht ueberhaupt Ziele**", gesamt > 0, true);
    console.log(`  gesamt: ${gesamt} Ziele in ${seitenQ.length} Sichten, ${klein.length} unter 20 px`);
    for (const z of klein.slice(0, 12)) console.log(`    ${z.seite}  ${z.k}${z.art ? ":" + z.art : ""}  ${z.w} x ${z.h}${z.hinter ? "  (Feld " + z.hinter + " im Label)" : ""}  "${z.name}"`);
    urteil("**kein Ziel liegt unter dem 20-px-Boden des Hauses**", klein.length, 0);
    console.log(`  Bild: ${await bild(`tastmass-${BREITE_IST}px.png`)}`);
  }

  // --- Zyklus P: der FehlerPFAD, wenn die eigne Tuer stirbt (Punkt 4, zweiter Teil) ----------
  //     Sieben Sichten ohne Fehlerzeile ist die eine Haelfte von "keine Fehler in keinem
  //     Bereich". Die andre ist, was der Nutzer sieht, wenn etwas wirklich kaputt geht. Als
  //     erster Pfad der groesste: der eigne Diener wird fortgenommen (eigne Kind-PID, eigner
  //     Port - kein fremder Prozess wird je angefasst).
  if (NUR === "" || NUR === "tuerfort") {
    await knopf(cdp, "^\\s*(Knowledge|Wissen)\\s*$");
    await schlafe(1400);
    for (const dom of ["Runtime.enable", "Log.enable"]) { try { await cdp.send(dom); } catch { /* dieses Fenster kennt das Feld nicht */ } }
    cdp.ereignisse.length = 0;
    const pid = server.pid;
    console.log(`  Diener ${pid} wird fortgenommen (eignes Kind, eigener Port ${PORT})`);
    server.kill();
    await schlafe(5000);
    // Der ganze Schirm, nicht die ersten 300 Zeichen: die Index-Zeile sitzt am ENDE des
    // Streifens, und ein gekappter Text kann ein Wort nicht finden, das unterhalb der Kappe
    // steht. Gemessen 02.11. 08:46 am ausgelieferten 3.2.114 — die Zeile sagte "No answer from
    // the store", und der Pruefer meldete trotzdem "kein Grund", weil er nur die ersten 300
    // Zeichen und sechs Redewendungen kannte (ohne "no answer").
    const text = String(await evaliere(cdp, `document.body.innerText || ''`)).replace(/\s+/g, " ");
    console.log(`  was auf dem Schirm steht (erste 300): ${JSON.stringify(text.slice(0, 300))}`);
    const grund = /server|no answer|not answer|did not respond|offline|cannot reach|verbindung|connection/i.test(text);
    urteil("**der Nutzer erfahrt einen Grund, wenn die Tuer fort ist**", grund, true);
    // Die zweite Haelfte des Befunds ist ein bestimmtes Wort, und das steht in einer bestimmten
    // Zelle — der Schirmtext oben ist auf 300 Zeichen gekappt und reicht nie bis zur Index-Zeile.
    // Ohne diese Messung waere "die Zeile behauptet weiter In sync" eine Behauptung des Pruefers.
    const stelle = String(await evaliere(cdp, `(()=>{const z=[...document.querySelectorAll('.index-cell')]
      .find(e=>/local, private, MCP/.test(e.textContent||''));return (z?.textContent||'').replace(/\\s+/g,' ').trim()})()`));
    console.log(`  die Index-Zeile sagt: ${JSON.stringify(stelle)}`);
    urteil("**und die Index-Zeile verspricht keinen Sync, wenn die Tuer fort ist**", /in sync/i.test(stelle), false);
    const ausnahmen = cdp.ereignisse.filter((e) => e.method === "Runtime.exceptionThrown").length;
    urteil("**und das Fenster wirft dabei keine unverarbeitete Ausnahme**", ausnahmen, 0);
    console.log(`  Bild: ${await bild("tuer-fort.png")}`);
  }

  // --- Zyklus Q: die Gesundheits-Absage im echten Fenster (Punkt 4 / Aufgabe #60, 5.11.) ----
  //     Die Zeile ist neu, und ein Grund, den nur ein jsdom-Fall malt, ist kein Grund fuer einen
  //     Menschen. Nach Zyklus P ist der eigne Diener fort: die Tuer antwortet nicht mehr, also
  //     muss die Flaeche die Stille nennen -- ohne eine Zahl zu erfinden und ohne den Wortlaut
  //     des Browsers. Fuer den Alleinlauf wird der eigne Kind-Prozess hier fortgenommen.
  if (NUR === "healthgrund") {
    const pid = server.pid;
    console.log(`  Diener ${pid} wird fortgenommen (eignes Kind, eigener Port ${PORT})`);
    server.kill();
    await schlafe(4000);
  }
  if (NUR === "" || NUR === "healthgrund") {
    await knopf(cdp, "^\\s*(Settings|Einstellungen)\\s*$");
    await schlafe(900);
    await knopf(cdp, "MCP / API");
    await schlafe(2600);
    const breitIst = Number(await evaliere(cdp, `window.innerWidth`));
    // Bei Telefonbreite sitzt die Zeile unter dem Falz: ohne das Fenster heraufzuholen zeigt
    // das Bild den Kopf der Flaeche und nicht den Befund (Klick- und Messregel des Hauses).
    await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="settings-health-grund"]');if(e)e.scrollIntoView({block:'center'});return true})()`);
    await schlafe(400);
    const zeile = String(await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="settings-health-grund"]');return e?(e.textContent||'').replace(/\\s+/g,' ').trim():''})()`));
    const kasten = await evaliere(cdp, `(()=>{const e=document.querySelector('[data-testid="settings-health-grund"]');if(!e)return null;const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height),Math.round(r.left),Math.round(r.right)]})()`);
    console.log(`  die Gesundheits-Zeile sagt: ${JSON.stringify(zeile)}`);
    console.log(`  ihr Kasten (breite, hoehe, links, rechts) bei ${breitIst} px: ${JSON.stringify(kasten)}`);
    urteil("**die Absage malt eine Zeile, statt nur die Farbe zu wechseln**", zeile.length > 0, true);
    urteil("**und die Stille erhaelt keine erfundne Zahl**", /HTTP \\d/.test(zeile), false);
    urteil("**auch nicht das Wort des Browsers**", /Failed to fetch|TypeError|net::/i.test(zeile), false);
    urteil("**sonst ihren eignen Satz: Ankunft fehlt**", /did not arrive/i.test(zeile), true);
    const rechte = Array.isArray(kasten) ? (kasten[2] >= 0 && kasten[3] <= breitIst) : null;
    urteil("**und die Zeile bleibt im Fenster**", rechte, true);
    // Der Name traegt die Weite: zwei Laeufe desselben Zyklus duerfen einander nicht ueberschreiben
    // (gemessen 31.10. 15:07, wo ein Lauf die committeten Bilder des vorigen ersetzte).
    console.log(`  Bild: ${await bild(`health-absage-${breitIst}px.png`)}`);
  }

  // --- P71 / Aufgabe #31: der Import-Wurf im echten Fenster (Zyklus `importwurf`) ---
  // Die Quittung des Datei-Imports ist der einzige Absage-Ort des Hauses, der keinen
  // eignen Daten-Namen traegt (Dashboard.tsx:1876 -- ein div ohne data-testid), also wird
  // sie ueber ihren Text gesucht und der Text selbst gemessen. Der Werfer ist die Datei
  // selbst: extractTextFromFile ruft `file.text()`, und eine Bibliothek, die darin wirft,
  // ist genau der Fall, dessen Wortlaut nicht auf den Knopf darf (P4-2310 c, P71).
  if (NUR === "" || NUR === "importwurf") {
    // Der.healthgrund-Zyklus laesst die Flaeche auf den Einstellungen stehen; das
    // Dateifeld wohnt in der Wissens-Flaeche (Dashboard.tsx:1866), also zuerst hin.
    const gesprungen = await evaliere(cdp, `(()=>{const b=[...document.querySelectorAll('.sidebar-nav-btn')]
      .find(x=>/^\s*Knowledge\s*$/.test((x.textContent||'').trim()));
      if(!b) return 'kein Seitenleisten-Knopf Knowledge'; b.click(); return (b.textContent||'').trim();})()`);
    console.log(`  Sprung nach: ${gesprungen}`);
    await schlafe(1200);
    const geworfen = await evaliere(cdp, `(async () => {
      File.prototype.text = () => Promise.reject(new Error("QuotaExceededError: the quota has been exceeded - /Users/a/.kepta/kepta.db"));
      const i = document.querySelector('input[type="file"]');
      if (!i) return "kein Dateifeld in der Flaeche";
      const dt = new DataTransfer();
      dt.items.add(new File(["Inhalt eines Mandats."], "mandat.md", { type: "text/markdown" }));
      i.files = dt.files;
      i.dispatchEvent(new Event("change", { bubbles: true }));
      return "abgegeben";
    })()`);
    console.log(`  Abgabe: ${JSON.stringify(String(geworfen))}`);
    urteil("**die Flaeche hat ein Dateifeld, das die Abgabe annimmt**", String(geworfen), "abgegeben");
    await schlafe(1500);
    const fund = await evaliere(cdp, `(() => {
      // Der tiefste Treffer ist die Quittung selbst: Vorfahren kommen zuerst in der
      // Dokumentordnung, also ist der letzte dieser Liste der engste Kasten.
      const alle = [...document.querySelectorAll('div')].filter((d) => /Import did not run|Import stopped after/.test(d.textContent || ''));
      const treffer = alle.length ? alle[alle.length - 1] : null;
      if (!treffer) return null;
      treffer.scrollIntoView({ block: 'center' });
      const r = treffer.getBoundingClientRect();
      return { text: (treffer.textContent || '').replace(/\\s+/g, ' ').trim(), kasten: [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.right)] };
    })()`);
    const breitIst = Number(await evaliere(cdp, `window.innerWidth`));
    const text = fund ? fund.text : "";
    console.log(`  die Import-Quittung sagt: ${JSON.stringify(text)}`);
    console.log(`  ihr Kasten bei ${breitIst} px: ${JSON.stringify(fund ? fund.kasten : null)}`);
    urteil("**der Wurf malt eine Quittung, statt zu schweigen**", text.length > 0, true);
    urteil("**sie nennt ihre eigne Zaehlung**", /no note was written|of \d+ writes/i.test(text), true);
    urteil("**und verweist nicht in die Konsole**", /developer console/i.test(text), false);
    for (const verraeter of ["QuotaExceededError", "/Users/a/.kepta", "the quota has been exceeded"]) {
      urteil(`**der Wortlaut des Werfers bleibt beim Betreiber (${verraeter})**`, text.includes(verraeter), false);
    }
    urteil("**und die Zeile bleibt im Fenster**", fund ? (fund.kasten[2] >= 0 && fund.kasten[3] <= breitIst) : null, true);
    console.log(`  Bild: ${await bild(`import-wurf-${breitIst}px.png`)}`);
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
