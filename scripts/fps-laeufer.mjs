// Der Kosten-Laeufer: misst, was die Graph-Flaeche pro Bild kostet — und ob sich
// Knotenscheiben wirklich schneiden. `node scripts/fps-laeufer.mjs`
//
// WARUM ES DIESE DATEI GIBT. Das README behauptet an zwei Stellen
// (`README.md:37` und `README.md:143`): „verified at 3 000 nodes and 9 500 edges
// at 60 fps" und „never overlap". Nachgemessen am 11.10. war die einzige Quelle
// dafuer ein CHANGELOG-Eintrag (`CHANGELOG.md:931`, „Measured afterwards: 3 000
// nodes, 9 500 edges, 60 fps") — in `scripts/` existierte kein Weg, die Zahl
// nachzumessen. Hausregel: entweder die Grenze ist gemessen gehalten, oder die
// Zusage steht gemessen und belegt in Test und Doku. Diese Datei ist der Messweg.
//
// WAS GEMESSEN WIRD — und was nicht. Headless-Chrome hat keinen Vsync, der
// Rame-Takt dort ist nicht der Bildrhythmus eines Nutzers. „60 fps" heißt aber
// nichts anderes, als dass ein Bild in 16,67 ms fertig sein muss. Also wird die
// ARBEIT pro Bild gemessen: die Dauer jedes `requestAnimationFrame`-Rueckrufs
// (Physik + Zeichnen, alles, was die Flaeche in einem Bild tut), dazu der
// Rame-Abstand als Zweitzahl. Eine Zahl gilt nur mit Ruhe-Sonde: der Laeufer
// verweigert das Urteil auf einer belasteten Maschine (siehe `ruhe-sonde.mjs`,
// dessen eigene Messung: der Median bleibt unter Last fast gleich, was die Last
// sieht, sind die Ausreisser).
//
// UEBERLAPPUNG wird in WELT-Einheiten gezaehlt, nicht auf dem Schirm: zwei
// Scheiben schneiden sich, wenn ihr Mittenabstand kleiner ist als r1 + r2. Das
// ist dieselbe Rechnung, die die Kollisionsloesung der Flaeche fuehrt, und sie
// ist unabhaengig davon, wie weit jemand gerade zoomt. Gemessen wird der Rahmen
// nach der Ruhe — „never overlap" ist eine Aussage im geruhten Zustand.
//
//   node scripts/fps-laeufer.mjs                     3 000 Knoten, sechs Sekunden
//   node scripts/fps-laeufer.mjs --knoten 1500       kleinerer Bestand
//   node scripts/fps-laeufer.mjs --sekunden 12       laenger messen
//   node scripts/fps-laeufer.mjs --json              Rohdaten fuer die Doku
//
// Isolation: eigener Server-Port (3541), eigener CDP-Port (3741), eigenes HOME
// und eigener Datenordner unter /tmp/kepta-fps, eigenes Browser-Profil. Das
// gemeinsame `dist/` und Port 3478 werden nicht angefasst, nichts wird committet.
//
// Platz. Der Stapel unter /tmp/kepta-fps wurde am 11.10. 115 MB, und die Maschine
// stand auf 99 % mit 3,6 Gi frei. Geprüft wird das jetzt von der ZENTRALEN Wache
// (`scripts/platten-wache.mjs`, cmp-gleich im app- und im Kern-Baum) auf der
// Stufe LEICHT (2 Gi), nicht schwer: dieser Lauf schreibt Bundle, Profil und
// Datenbank — gemessen 0,115 Gi für einen vollen 3 000-Knoten-Lauf. Die Wache
// prüft Repo UND /tmp, nennt Wert und geprüften Pfad, und ihr Exit-Code 75 heißt
// „kein Start". Profil und Datenordner räumt der Läufer am Ende selbst weg
// (`--behalten` lässt sie liegen); der Bundle bleibt, er ist die Wiederverwendung.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sonde, ruedig, beschlag } from "./ruhe-sonde.mjs";
import { pruefe, meldung, KEIN_START } from "./platten-wache.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARG = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const KNOTEN = ARG("knoten", 3000);
const SEKUNDEN = ARG("sekunden", 6);
const PORT = ARG("port", 3541);
const CDP_PORT = ARG("cdp", 3741);
const ALS_JSON = process.argv.includes("--json");
const BUDGET_MS = 1000 / 60;
const BASIS = `http://127.0.0.1:${PORT}`;
const ARBEIT = "/tmp/kepta-fps";
const BRADE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
const BEHALTEN = process.argv.includes("--behalten");

// ---------------- der Bestand ----------------
// Deterministisch (ein PRNG-Pfad), vier Felder, Zipf-artige Konzeptwahl — und
// pro Notiz genug [[Erwaehnungen]], dass an 3 000 Notizen etwa 9 500 Kanten
// haengen. Die Zahl, die zaehlt, ist nicht diese Rechnung: es ist die Kante,
// die die Flaeche selbst meldet („3 000 notes · N concepts · M links").
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const FELDER = [
  { name: "Atlas", themen: ["Kickoff", "Budget", "Risiken", "Meilensteine"], konzepte: ["storage", "suche", "mandant", "schluessel", "audit", "latenz", "index", "sperrkonto"] },
  { name: "Kueche", themen: ["Wochenplan", "Einkauf", "Reste", "Gast"], konzepte: ["wuerzung", "temperatur", "messer", "ofen", "sauerteig", "ablage", "vorrat"] },
  { name: "Garten", themen: ["Beete", "Schnitt", "Giessen", "Boden"], konzepte: ["kompost", "regen", "schatten", "saat", "rankhilfe", "mulch"] },
  { name: "Forschung", themen: ["Paper", "Versuch", "Replikation", "Datensatz"], konzepte: ["embedding", "benchmark", "metrik", "stichprobe", "fehlerbalken", "revision"] },
];
const TYPEN = ["semantic", "episodic", "procedural", "reference"];

function baueKorpus(gesamt) {
  const rnd = mulberry32(0xf5a1 + gesamt);
  const start = Date.UTC(2024, 9, 9);
  const tagMs = 86400000;
  const dateien = [];
  let kanten = 0;
  for (let i = 0; i < gesamt; i++) {
    const feld = FELDER[i % FELDER.length];
    const thema = feld.themen[Math.floor(rnd() * feld.themen.length)];
    const zeilen = [`Heute zu ${thema} im Feld ${feld.name}.`];
    // Dichte nach der Behauptung: 9 500 Kanten an 3 000 Knoten sind 3,17
    // Erwaehnungen je Notiz. Jede Notiz traegt drei, jede sechste eine vierte —
    // was am Ende zaehlt, ist nicht diese Rechnung, sondern die Zahl, die die
    // Flaeche selbst in der Legende meldet.
    const anzahl = 3 + (rnd() < 0.17 ? 1 : 0);
    const wahl = new Set();
    let versuch = 0;
    while (wahl.size < anzahl && versuch++ < 40) wahl.add(feld.konzepte[Math.floor(rnd() * feld.konzepte.length)]);
    const kram = [...wahl];
    for (const konzept of kram) zeilen.push(`Der [[${konzept}]] haelt das mit [[${kram[0]}]].`);
    kanten += kram.length * 2;
    const erstellt = start + Math.floor(rnd() * 700) * tagMs;
    const tags = [feld.name.toLowerCase(), thema.toLowerCase()];
    const typ = TYPEN[Math.floor(rnd() * TYPEN.length)];
    const titel = `${feld.name} ${thema} ${String(i + 1).padStart(5, "0")}`;
    dateien.push({
      name: `${feld.name}/${String(i + 1).padStart(5, "0")}.md`,
      content: [
        "---",
        `kepta_id: fps-${String(i + 1).padStart(5, "0")}`,
        `title: ${JSON.stringify(titel)}`,
        `tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`,
        `type: ${typ}`,
        `created: ${Math.floor(erstellt / 1000)}`,
        `updated: ${Math.floor(erstellt / 1000)}`,
        "---",
        "",
        zeilen.join(" "),
      ].join("\n"),
    });
  }
  return { dateien, kantenRohtext: kanten };
}

// ---------------- der Browser von innen ----------------
const INJEKT = `
(function () {
  var S = { rahmen: [], abstand: [], scheiben: [], sammlen: false, letzter: 0 };
  var ur = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return ur(function (t) {
      var a = performance.now();
      if (S.letzter) S.abstand.push(a - S.letzter);
      S.letzter = a;
      try { return cb(t); } finally {
        if (S.rahmen.length < 40000) S.rahmen.push(Math.round((performance.now() - a) * 100) / 100);
      }
    });
  };
  function haupt() { return document.querySelector('[data-testid="graph-canvas"]'); }
  var proto = CanvasRenderingContext2D.prototype;
  var arc = proto.arc, rect = proto.fillRect, bild = proto.drawImage;
  // Eine Scheibe ist die KLEINSTE Kreisform an einer Mitte: Ringe um einen
  // Knoten herum sind immer groesser als er (rr + 2, rr + 4, n.r + 4).
  var karten = new Map();
  var weltT = null;
  function eintrag(x, y, r) {
    var k = Math.round(x) + "," + Math.round(y);
    var b = karten.get(k);
    if (!b || r < b) karten.set(k, r);
  }
  // Die Transformation GENAU hier halten: nach dem Etikett-Durchgang steht auf
  // dem Kontext wieder der Bildschirm-Satz, und daraus die Welt zu lesen war
  // der Grund, warum ein frueherer Schlepp-Zug ins Leere griff.
  function halteTransformation(ctx) {
    var t = ctx.getTransform();
    var d = Math.min(2, window.devicePixelRatio || 1);
    weltT = [t.a / d, t.e / d, t.d / d, t.f / d];
  }
  proto.arc = function (x, y, r, s, e2, ccw) {
    if (S.sammlen && this.canvas === haupt() && r > 0 && r < 1e5) { eintrag(x, y, r); halteTransformation(this); }
    return arc.call(this, x, y, r, s, e2, ccw);
  };
  proto.fillRect = function (x, y, w, h) {
    if (S.sammlen && this.canvas === haupt() && w > 0 && w === h && w < 1e4) { eintrag(x + w / 2, y + h / 2, w / 2); halteTransformation(this); }
    return rect.apply(this, arguments);
  };
  proto.drawImage = function (img, dx, dy, dw, dh) {
    if (S.sammlen && this.canvas === haupt() && arguments.length >= 5 && dw === dh && dw > 0) { eintrag(dx + dw / 2, dy + dh / 2, dw / 2); halteTransformation(this); }
    return bild.apply(this, arguments);
  };
  var api = {};
  api.an = function () { S.rahmen.length = 0; S.abstand.length = 0; karten.clear(); S.sammlen = true; return true; };
  api.ablesen = function () {
    S.sammlen = false;
    // Die Statistik gehoert den Rahmen, in denen die Flaeche wirklich malte.
    // Ueber alle Rahmen gemittelt waere der Zug durch eine ruhende Flaeche ein
    // Median von 0 ms — eine Zahl, die besser aussieht, als sie ist.
    var r = S.rahmen.filter(function (x) { return x > 0.05; }).sort(function (a, b) { return a - b; });
    var q = function (p) { return r.length ? r[Math.min(r.length - 1, Math.floor(p * (r.length - 1)))] : null; };
    var a = S.abstand.slice().sort(function (x, y) { return x - y; });
    var qa = function (p) { return a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : null; };
    var scheiben = [];
    karten.forEach(function (rad, k) {
      var t = k.split(",");
      scheiben.push([Number(t[0]), Number(t[1]), rad]);
    });
    return {
      ramen: S.rahmen.length,
      // Gegen eine blinde Phase: ein Ziehen, das keinen Knoten trifft, malt
      // nichts neu und meldet dann 0 ms Arbeit — das sieht gruener aus, als es
      // ist. Gezaehlt werden nur Rahmen, in denen die Flaeche wirklich arbeitete.
      arbeitende: r.length,
      arbeitMs: { median: q(0.5) === null ? null : Math.round(q(0.5) * 10) / 10, p95: q(0.95) === null ? null : Math.round(q(0.95) * 10) / 10, p99: q(0.99) === null ? null : Math.round(q(0.99) * 10) / 10, max: q(1) === null ? null : Math.round(q(1) * 10) / 10, mittel: r.length ? Math.round(r.reduce(function (s2, x) { return s2 + x; }, 0) / r.length * 10) / 10 : null },
      ueberBudget: r.filter(function (x) { return x > 16.67; }).length,
      abstandMs: { median: qa(0.5) ? Math.round(qa(0.5) * 10) / 10 : null, p95: qa(0.95) ? Math.round(qa(0.95) * 10) / 10 : null },
      scheiben: scheiben.length,
      groesste: scheiben.reduce(function (m, s2) { return Math.max(m, s2[2]); }, 0),
      weltT: weltT,
      welt: scheiben,
    };
  };
  // Ueberlappung in WELT-Einheiten: geschnitten, wenn Mittenabstand < r1 + r2.
  // Gitterzelle = zwei groesste Scheibe, damit 3 000 Knoten nicht 4,5 Mio.
  // Paare pruefen muessen.
  api.kollision = function () {
    var scheiben = [];
    karten.forEach(function (rad, k) {
      var t = k.split(",");
      scheiben.push([Number(t[0]), Number(t[1]), rad]);
    });
    var maxr = scheiben.reduce(function (m, s2) { return Math.max(m, s2[2]); }, 1);
    var zelle = Math.max(1, maxr * 2);
    var gitter = new Map();
    for (var i = 0; i < scheiben.length; i++) {
      var cx = Math.floor(scheiben[i][0] / zelle), cy = Math.floor(scheiben[i][1] / zelle);
      var k = cx + ":" + cy;
      if (!gitter.has(k)) gitter.set(k, []);
      gitter.get(k).push(scheiben[i]);
    }
    var paare = 0, tiefl = 0, beruehrt = 0, proben = [];
    var seen = new Set();
    gitter.forEach(function (liste, k) {
      var te = k.split(":"), cx = Number(te[0]), cy = Number(te[1]);
      var nachbarn = [];
      for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
        var l = gitter.get((cx + dx) + ":" + (cy + dy));
        if (l) nachbarn.push.apply(nachbarn, l);
      }
      for (var a2 = 0; a2 < liste.length; a2++) {
        for (var b2 = 0; b2 < nachbarn.length; b2++) {
          var x = liste[a2], y = nachbarn[b2];
          if (x === y) continue;
          var id = x[0] < y[0] || (x[0] === y[0] && x[1] <= y[1]) ? x.join("_") + "|" + y.join("_") : y.join("_") + "|" + x.join("_");
          if (seen.has(id)) continue;
          seen.add(id);
          var d = Math.hypot(x[0] - y[0], x[1] - y[1]);
          var summe = x[2] + y[2];
          if (d < summe * 1.001) beruehrt++;
          if (d < summe * 0.999) {
            paare++;
            tiefl = Math.max(tiefl, summe - d);
            if (proben.length < 5) proben.push({ d: Math.round(d), r1: Math.round(x[2]), r2: Math.round(y[2]), schnitt: Math.round(summe - d) });
          }
        }
      }
    });
    return { scheiben: scheiben.length, geschnitten: paare, beruehrend: beruehrt, tiefsterSchnitt: Math.round(tiefl), proben: proben };
  };
  api.klar = function () { karten.clear(); S.rahmen.length = 0; S.abstand.length = 0; };
  window.__fps = api;
})();
`;

class Cdp {
  constructor(ws) { this.ws = ws; this.nr = 0; this.wartend = new Map();
    this.ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      const w = this.wartend.get(m.id);
      if (!w) return;
      this.wartend.delete(m.id);
      if (m.error) w.rej(new Error(JSON.stringify(m.error).slice(0, 200)));
      else w.res(m.result);
    });
  }
  static verbindung(url) { return new Promise((res, rej) => { const ws = new WebSocket(url); ws.onopen = () => res(new Cdp(ws)); ws.onerror = rej; }); }
  send(methode, params = {}) {
    const id = ++this.nr;
    return new Promise((res, rej) => {
      this.wartend.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method: methode, params }));
      setTimeout(() => { if (this.wartend.has(id)) { this.wartend.delete(id); rej(new Error(`timeout ${methode}`)); } }, 120000);
    });
  }
  zu() { try { this.ws.close(); } catch { /* schon zu */ } }
}

const schlafe = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaliere(ausdruck) {
  const r = await cdp.send("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`${ausdruck.slice(0, 60)}: ${JSON.stringify(r.exceptionDetails).slice(0, 200)}`);
  return r.result.value;
}
async function ruf(name, args = "undefined") { return evaliere(`__fps.${name}(${args})`); }
async function warteBis(test, { maxMs = 60000, schritt = 400 } = {}) {
  const anfang = Date.now();
  while (Date.now() - anfang < maxMs) {
    try { const w = await test(); if (w) return w; } catch { /* noch nicht */ }
    await schlafe(schritt);
  }
  throw new Error("Warten zu lang — Messung abgebrochen");
}
async function maus(typ, x, y, button = "left") {
  await cdp.send("Input.dispatchMouseEvent", { type: typ, x, y, button, clickCount: typ === "mouseMoved" ? 0 : 1, buttons: typ === "mouseReleased" ? 0 : button === "left" ? 1 : 0 });
}

let cdp, server, brave;
/** Eigene Kinder nur eigene Kinder treffen lassen — zweimal aufrufbar. */
function machZu() {
  try { if (cdp) { cdp.zu(); cdp = null; } } catch { /* schon zu */ }
  try { if (brave) { brave.kill("SIGKILL"); brave = null; } } catch { /* schon weg */ }
  try { if (server) { server.kill("SIGTERM"); server = null; } } catch { /* schon weg */ }
}
async function main() {
  // 0a) Erst der Platz, dann die Ruhe. Die Zahl kommt von der zentralen Wache,
  // nicht von einer eigenen df-Zeile — die hatte ich gebaute und ließ `null`
  // durch, weil macOS eine lange Gerätezeile umbricht. Stufe LEICHT: dieser
  // Lauf schreibt gemessen 0,115 Gi (Bundle, Profil, Datenbank), kein
  // Bilderstapel.
  const platte = pruefe({ stufe: "leicht" });
  console.error(meldung(platte));
  if (!platte.genug) {
    console.error(`  Laeufer startet nicht (Exit ${KEIN_START}). Alte Stapel: /tmp/kepta-fps, /tmp/e2/b<bestand> (Browserprofile).`);
    process.exit(KEIN_START);
  }

  // 0) Die Maschine muss ruhig sein, sonst ist jede Millisekunde ein Gerücht.
  //    Der Wurf passiert, BEVOR dieser Laeufer irgendetwas startet — sonst
  //    misst er sich seine eigene Last frei.
  const urteil = ruedig(sonde());
  if (!urteil.ruhig) {
    console.error("MASCHINE NICHT RUHIG — kein Urteil über Zeitfälle.");
    for (const u of urteil.ursachen) console.error(`  ${u}`);
    console.error("  Laeufer später noch einmal, wenn die Suite durch ist (siehe ruhe-sonde.mjs).");
    process.exit(3);
  }
  console.error(beschlag(urteil.messung));

  // 1) Eigener Bundle, eigener Server, eigener Datenordner, eigenes HOME.
  //    Das gemeinsame `dist/` ist Leitungseigentum — hier wird weder hinein-
  //    gebaut noch daraus gestartet. Der Laeufer baut sich einmal selbst nach
  //    /tmp/kepta-fps/bundle (vite + esbuild), danach läuft er aus dem Speicher.
  const BUEND = process.env.FPS_BUNDLE || `${ARBEIT}/bundle`;
  const lauf = (befehl, args) => new Promise((res, rej) => {
    const p = spawn(befehl, args, { cwd: WURZEL, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (b) => process.stderr.write(b));
    p.stderr.on("data", (b) => process.stderr.write(b));
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${befehl} exit ${c}`))));
  });
  if (!fs.existsSync(path.join(BUEND, "server.cjs"))) {
    console.error(`baue eigenen Bundle nach ${BUEND} — dist/ bleibt unberuehrt`);
    await lauf("npx", ["vite", "build", "--outDir", BUEND, "--emptyOutDir"]);
    await lauf("npx", ["esbuild", "server.ts", "--bundle", "--platform=node", "--format=cjs",
      "--packages=external", "--external:vite", "--external:esbuild", "--external:lightningcss",
      "--keep-names", `--outfile=${BUEND}/server.cjs`]);
  }
  // `--packages=external` laesst express & Co. im Bundle stehen — Node sucht sie
  // aber von der Datei aus, nicht vom Arbeitsverzeichnis. Ohne diesen Zeiger
  // startet der eigene Server nicht („Cannot find module 'express'"), mit ihm
  // liegt er neben dem Repo und greift doch nur dessen installierten Baum auf.
  const zeiger = path.join(BUEND, "node_modules");
  if (!fs.existsSync(zeiger)) fs.symlinkSync(path.join(WURZEL, "node_modules"), zeiger, "dir");
  fs.rmSync(`${ARBEIT}/d`, { recursive: true, force: true });
  fs.mkdirSync(`${ARBEIT}/h`, { recursive: true });
  fs.mkdirSync(`${ARBEIT}/d`, { recursive: true });
  try { const r = await fetch(`${BASIS}/api/health`); if (r.ok) { console.error(`Port ${PORT} hoert schon — fremder Server`); process.exit(2); } } catch { /* frei */ }
  const prot = fs.createWriteStream(`${ARBEIT}/server.log`);
  server = spawn("node", [path.join(BUEND, "server.cjs")], {
    cwd: WURZEL, env: { ...process.env, HOME: `${ARBEIT}/h`, KEPTA_DATA_DIR: `${ARBEIT}/d`, KEPTA_ENCRYPTION: "off", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(prot); server.stderr.pipe(prot, { end: true });
  const gesund = await (async () => {
    const anfang = Date.now();
    while (Date.now() - anfang < 60000) {
      try { const r = await fetch(`${BASIS}/api/health`); if (r.ok) return await r.json(); } catch { /* */ }
      await schlafe(300);
    }
    return null;
  })();
  if (!gesund) { throw new Error(`Server startet nicht — ${ARBEIT}/server.log`); }

  // 2) Der Bestand über die echte Import-Route.
  const { dateien, kantenRohtext } = baueKorpus(KNOTEN);
  const antwort = await fetch(`${BASIS}/api/import/markdown`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: dateien }),
  });
  if (!antwort.ok) throw new Error(`Import ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
  const zaehlung = await warteBis(async () => {
    const h = await (await fetch(`${BASIS}/api/health`)).json();
    if (h.count < KNOTEN) console.error(`  wartet auf Bestand: ${h.count}/${KNOTEN}`);
    return h.count >= KNOTEN ? h : null;
  }, { maxMs: 900000, schritt: 5000 });
  console.error(`bestand: ${zaehlung.count} Notizen (Rohtext-Erwaehnungen ${kantenRohtext})`);

  // 3) Browser mit eigenem Profil und CDP.
  const seite = await (async () => {
    const args = ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${ARBEIT}/profil`,
      "--no-first-run", "--disable-gpu", "--hide-scrollbars", "--disable-backgrounding-occluded-windows",
      "--window-size=1440,900", "about:blank"];
    const k = spawn(BRADE, args, { stdio: ["ignore", "pipe", "pipe"] });
    const log = fs.createWriteStream(`${ARBEIT}/brave.log`);
    k.stdout.pipe(log); k.stderr.pipe(log, { end: true });
    brave = k;
    const ziele = await warteBis(async () => {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const l = await r.json();
      return l.find((z) => z.type === "page" && z.webSocketDebuggerUrl) || null;
    }, { maxMs: 90000 });
    return ziele;
  })();
  cdp = await Cdp.verbindung(seite.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: INJEKT });
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await cdp.send("Page.navigate", { url: `${BASIS}/` });
  await warteBis(async () => (await evaliere("document.querySelectorAll('button').length") > 0 ? true : null), { maxMs: 90000 });
  await evaliere(`localStorage.clear()`);
  await cdp.send("Page.navigate", { url: `${BASIS}/` });
  await warteBis(async () => (await evaliere(`!!document.querySelector('[data-testid="graph-canvas"]')`) ? true : null), { maxMs: 60000 });
  // Der Assistent steht über der Fläche; „Later" ist der Weg vorbei.
  await evaliere(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/later/i.test(x.textContent||''));if(b)b.click();})()`);
  await evaliere(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent?.trim()==='Graph');if(b)b.click();})()`);
  await warteBis(async () => (await evaliere(`!!document.querySelector('[data-testid="graph-canvas"]')`) ? true : null), { maxMs: 60000 });

  // 4) Kraftfeld, und die Flaeche muss die Zahlen selbst nennen.
  const kraftGefunden = await evaliere(`(()=>{const b=document.querySelector('[title^="Force view"]');if(!b)return false;b.click();return true})()`);
  if (!kraftGefunden) console.log("  KEIN Kraftfeld-Knopf — die Zahlen der Flaeche stammen aus einer andern Ansicht");
  const sageDerFlaeche = await warteBis(async () => {
    const t = await evaliere(`document.querySelector('[data-testid="graph-legende"]')?.textContent || ''`);
    // Die Zahl der Flaeche ist gegliedert ("3,000 notes"), seit #101 gilt ein Kleid pro
    // Flaeche. Ein Muster, das nur \d+ nimmt, liest aus "3,000" die **000** und meldet
    // "0 notes" — gemessen 4.11. 16:06 MEZ in diesem Lauf, wo der Kopf 3,000 Notizen nannte
    // und die Sonde 0. Also: Gruppen mit Komma zulassen und das Komma abziehen.
    const m = t.match(/([\d,]+) notes[^·]*·\s*([\d,]+) concepts[^·]*·\s*([\d,]+) links/);
    const zahl = (s) => Number(String(s).replace(/,/g, ""));
    return m ? { notizen: zahl(m[1]), konzepte: zahl(m[2]), kanten: zahl(m[3]), tekst: m[0] } : null;
  }, { maxMs: 60000 });
  console.error(`die Flaeche meldet: ${sageDerFlaeche.tekst}`);

  // 5) Phase A: die Welt zur Ruhe bringen — Physik und Zeichnen zugleich.
  await ruf("an");
  await schlafe(SEKUNDEN * 1000);
  const settling = await ruf("ablesen");
  const welt = settling.welt;
  // Nach dem Ruhen: ein Bild mehr, ohne die Stellung zu ändern, und die
  // Scheiben-Menge neu gesammelt.
  // Der Titel ist seit 3.2.145 eine Bedingung ("all N notes are in the picture", wenn der
  // Rahmen alles haelt) — ein Klick, der ihn als Suchkette traegt, klickt dann ins Leere und
  // meldet Erfolg. Gegriffen wird die stabile Kennung, und der Lauf meldet, ob der Knopf da war.
  const fitGefunden = await evaliere(`(()=>{const b=document.querySelector('[data-testid="graph-fit"]');if(!b)return false;b.click();return true})()`);
  console.log(`  Fit-Knopf gefunden und gedrueckt: ${fitGefunden}`);
  await schlafe(1500);
  await ruf("an");
  const zoomGefunden = await evaliere(`(()=>{const b=document.querySelector('[title="Zoom in"]');if(!b)return false;b.click();return true})()`);
  if (!zoomGefunden) console.log("  KEIN Zoom-in-Knopf — die ruhige Messung gilt der Ankunft, nicht dem Zoom");
  await schlafe(1200);
  const ruhig = await ruf("ablesen");
  const ueberlapp = await ruf("kollision");

  // 6) Phase B: ein Knoten wird gezogen — das ist der teuerste Weg (Physik
  // heizt nach, alles malt neu). Ziel ist die groesste Scheibe, die im Bild
  // auch wirklich zu greifen ist: die Transformations kommt aus dem Rahmen,
  // in dem die Scheiben gemalt wurden (siehe `halteTransformation`), und ein
  // Griff unter die Legende waere kein Knotengriff, sondern ein Schwenk.
  const [zk, zx, zky, zy] = ruhig.weltT || [];
  const cRect = await evaliere(`(()=>{const r=document.querySelector('[data-testid="graph-canvas"]').getBoundingClientRect();return [r.left,r.top,r.width,r.height];})()`);
  const kandidat = welt
    .map((s) => ({ s, sx: s[0] * zk + zx, sy: s[1] * zky + zy }))
    .filter((p) => Number.isFinite(p.sx) && p.sx > 40 && p.sy > 40 && p.sx < cRect[2] - 40 && p.sy < cRect[3] * 0.55)
    .sort((a, b) => b.s[2] - a.s[2])[0];
  await ruf("an");
  if (kandidat) {
    const zx2 = Math.round(cRect[0] + kandidat.sx), zy2 = Math.round(cRect[1] + kandidat.sy);
    await maus("mousePressed", zx2, zy2);
    for (let i = 1; i <= 24; i++) {
      await maus("mouseMoved", zx2 + i * 9, zy2 + i * 5);
      await schlafe(120);
    }
    await maus("mouseReleased", zx2 + 216, zy2 + 120);
  }
  const ziehen = await ruf("ablesen");
  await schlafe(700);

  // Die zweite Sonde: ruhig war es vor dem Start. Waehrend der Messung kann
  // eine Suite angesprungen sein, und dann ist die Zahl wertlos. ZUERST wird
  // die eigene Maschine entlassen — sonst hoert die Sonde ihren eigenen Browser
  // und meldet "nicht ruhig", ohne dass jemand anders laeuft.
  machZu();
  await schlafe(2000);
  const urteilAmEnde = ruedig(sonde());
  const out = {
    gemessenAm: new Date().toISOString(),
    maschine: {
      vorDemStart: beschlag(urteil.messung),
      nachDerMessung: beschlag(urteilAmEnde.messung),
      ruhigUeberAlles: urteilAmEnde.ruhig,
      ursachen: urteilAmEnde.ursachen,
      kerne: os.cpus().length,
      last1: Math.round(os.loadavg()[0] * 100) / 100,
      os: os.release(),
    },
    bestand: { notizen: sageDerFlaeche.notizen, konzepte: sageDerFlaeche.konzepte, kanten: sageDerFlaeche.kanten, health: zaehlung.count },
    budgetMs: Math.round(BUDGET_MS * 100) / 100,
    phasen: { einschwingen: settling, ruheNachFit: ruhig, knotenZiehen: ziehen },
    ueberlappung: ueberlapp,
    scheiben: { groessteWelt: Math.round(settling.groesste) },
    befehl: `node scripts/fps-laeufer.mjs --knoten ${KNOTEN} --sekunden ${SEKUNDEN}`,
  };
  if (ALS_JSON) console.log(JSON.stringify(out, null, 1));
  else {
    for (const [name, p] of Object.entries(out.phasen)) {
      console.log(`${name.padEnd(14)} rame ${String(p.ramen).padStart(5)} (malende ${String(p.arbeitende).padStart(5)})   Arbeit/Bild  median ${p.arbeitMs.median} ms  p95 ${p.arbeitMs.p95} ms  max ${p.arbeitMs.max} ms   ueber 16,67 ms: ${p.ueberBudget}/${p.arbeitende}   Rame-Abstand median ${p.abstandMs.median} ms`);
    }
    if (!out.phasen.knotenZiehen.arbeitende) {
      console.log("ACHTUNG: im Schlepp-Zug arbeitete die Flaeche in keinem Rahmen — der Griff hat keinen Knoten getroffen, diese Phase ist kein Befund.");
    }
    console.log(`ueberlappung   ${out.ueberlappung.scheiben} Scheiben, geschnitten: ${out.ueberlappung.geschnitten} Paare, beruehrend: ${out.ueberlappung.beruehrend}, tiefster Schnitt ${out.ueberlappung.tiefsterSchnitt} Welt-Einheiten`);
    console.log(`bestand        ${out.bestand.notizen} notes · ${out.bestand.konzepte} concepts · ${out.bestand.kanten} links   (die Flaeche sagt das selbst)`);
    console.log(`maschine         vorher: ${out.maschine.vorDemStart}`);
    console.log(`                 nachher: ${out.maschine.nachDerMessung}${out.maschine.ruhigUeberAlles ? "" : "  — NICHT RUHIG, Zahl nicht veröffentlichen"}`);
    console.log(`befehl         ${out.befehl}`);
  }
  fs.writeFileSync(`${ARBEIT}/ergebnis.json`, JSON.stringify(out, null, 1));
  // Der Stapel nach sich selbst: Profil und Datenordner sind Wegwerfware, der
  // Bundle ist die Wiederverwendung. Ohne diesen Schritt haette jeder Lauf
  // ~110 MB hinterlassen — der Anfang dieses Nachtrags.
  if (!BEHALTEN) {
    for (const weg of [`${ARBEIT}/profil`, `${ARBEIT}/d`, `${ARBEIT}/brave.log`]) {
      try { fs.rmSync(weg, { recursive: true, force: true }); } catch { /* schon weg */ }
    }
    console.error(`aufgeraeumt: ${ARBEIT}/profil, ${ARBEIT}/d (Bundle bleibt; --behalten laesst alles liegen)`);
  }
}

main().catch((e) => { console.error("ABGEBROCHEN:", e.message); process.exitCode = 1; })
  .finally(machZu);
