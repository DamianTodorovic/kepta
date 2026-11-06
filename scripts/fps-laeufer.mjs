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
// (`--behalten` lässt sie liegen); der Bundle wird jeden Lauf neu gebaut und bleibt als Ordner stehen.
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
/** Ein Pfad, keine Zahl: `--bild /tmp/x.png` schreibt das stehende Feld als Bild. */
const ARG_TXT = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] || null : null;
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
const BILD = ARG_TXT("bild");

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
  function eintrag(x, y, r, stil) {
    var k = Math.round(x) + "," + Math.round(y);
    var b = karten.get(k);
    // Die Farbe an der Mitte: "1 Paar, beide Radius 26" ist ein Befund ohne Namen. Die
    // Flaeche malt Begriffe, Notizen und Ringe in verschiedne Farben, und nur die Farbe
    // sagt, ob das Paar ueberhaupt ein Paar aus dem Kraftfeld ist — ein Ring um einen
    // Knoten her kann keine Kollision heilen, weil er gar kein Knoten ist.
    if (!b || r < b[0]) karten.set(k, [r, String(stil === null || stil === undefined ? "?" : stil).slice(0, 40)]);
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
    if (S.sammlen && this.canvas === haupt() && r > 0 && r < 1e5) { eintrag(x, y, r, this.fillStyle); halteTransformation(this); }
    return arc.call(this, x, y, r, s, e2, ccw);
  };
  proto.fillRect = function (x, y, w, h) {
    if (S.sammlen && this.canvas === haupt() && w > 0 && w === h && w < 1e4) { eintrag(x + w / 2, y + h / 2, w / 2, this.fillStyle); halteTransformation(this); }
    return rect.apply(this, arguments);
  };
  proto.drawImage = function (img, dx, dy, dw, dh) {
    if (S.sammlen && this.canvas === haupt() && arguments.length >= 5 && dw === dh && dw > 0) { eintrag(dx + dw / 2, dy + dh / 2, dw / 2, this.fillStyle); halteTransformation(this); }
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
    karten.forEach(function (v, k) {
      var t = k.split(",");
      scheiben.push([Number(t[0]), Number(t[1]), v[0], v[1]]);
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
    karten.forEach(function (v, k) {
      var t = k.split(",");
      scheiben.push([Number(t[0]), Number(t[1]), v[0], v[1]]);
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
            if (proben.length < 5) proben.push({ x: Math.round(x[0]), y: Math.round(x[1]), dx: Math.round(y[0]), dy: Math.round(y[1]), d: Math.round(d), r1: Math.round(x[2]), r2: Math.round(y[2]), schnitt: Math.round(summe - d), stil1: x[3], stil2: y[3] });
          }
        }
      }
    });
    return { scheiben: scheiben.length, geschnitten: paare, beruehrend: beruehrt, tiefsterSchnitt: Math.round(tiefl), proben: proben };
  };
  // Die Stellung aller gemalten Scheiben als ein Vergleichsprogramm. Zwei Lesungen
  // gleich heisst: das Feld steht. Ohne dieses Warten wird Ueberlappung in einem
  // Augenblick gezaehlt, in dem die Welt noch gleitet — gemessen 4.11. 19:31 MEZ, wo
  // der Laeufer nach sechs Sekunden Kuehlung ein Paar zaelte, das dasselbe Feld im
  // Test erst bei Schritt 310 von 380 abgibt (r 26 + 26, Abstand 49 gegen 52).
  api.stellung = function () {
    var s = [];
    karten.forEach(function (v, k) { s.push(k + ":" + Math.round(v[0])); });
    return s.sort().join("|");
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
      if (m.error) w.rej(new Error(JSON.stringify(m.error).slice(0, 700)));
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
  if (r.exceptionDetails) throw new Error(`${ausdruck.slice(0, 60)}: ${JSON.stringify(r.exceptionDetails).slice(0, 700)}`);
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
  //    gebaut noch daraus gestartet. Der Laeufer baut sich seinen Bundle selbst
  //    nach /tmp/kepta-fps/bundle (vite + esbuild).
  //
  //    DER BAU FAEHRT JEDEN LAUF. Bis zum 4.11. 20:36 MEZ galt der Ordner als
  //    Wiederverwendung (`if existsSync server.cjs`), und was auf der Platte lag, war
  //    ein Bundle von 16:06 MEZ — aus der Fassung vor dem Nachschlag. Vier Laeufe
  //    danach, zwei davon als "am ausgelieferten 3.2.146/3.2.147 gemessen" in die Doku
  //    gegangen, haben dieselben alten Bytes gelesen. Eine Zahl, die nicht dieselben
  //    Bytes misst wie das Stueck, das sie beschreibt, ist kein Beweis. Darum steht
  //    jetzt vor jedem Lauf die Fassung auf dem Protokoll, und der Lauf bricht ab, wenn
  //    die Antwort des Servers eine andre Zahl nennt als der Baum, aus dem gebaut wurde.
  const BUEND = process.env.FPS_BUNDLE || `${ARBEIT}/bundle`;
  const lauf = (befehl, args) => new Promise((res, rej) => {
    const p = spawn(befehl, args, { cwd: WURZEL, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (b) => process.stderr.write(b));
    p.stderr.on("data", (b) => process.stderr.write(b));
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`${befehl} exit ${c}`))));
  });
  const BAUM_VERSION = (fs.readFileSync(path.join(WURZEL, "src/core/version.ts"), "utf8").match(/APP_VERSION = "([\d.]+)"/) || [])[1] || "keine Zahl";
  const bauAnfang = Date.now();
  console.error(`baue eigenen Bundle nach ${BUEND} — dist/ bleibt unberuehrt (Baum-Fassung ${BAUM_VERSION})`);
  await lauf("npx", ["vite", "build", "--outDir", BUEND, "--emptyOutDir"]);
  await lauf("npx", ["esbuild", "server.ts", "--bundle", "--platform=node", "--format=cjs",
    "--packages=external", "--external:vite", "--external:esbuild", "--external:lightningcss",
    "--keep-names", `--outfile=${BUEND}/server.cjs`]);
  console.error(`  Bundle gebaut in ${((Date.now() - bauAnfang) / 1000).toFixed(1)} s`);
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
  // Die Fassung auf dem Protokoll, bevor eine Zahl gezaehlt wird. Ein Lauf ueber
  // alten Bytes nennt die neue Fassung sein Eigen — gemessen 4.11., wo vier Laeufe
  // denselben Bundle von 16:06 MEZ benutzten und als 3.2.146/3.2.147 galten.
  console.error(`fassung: ${gesund.version} (der Baum, aus dem gebaut wurde: ${BAUM_VERSION})`);
  if (gesund.version !== BAUM_VERSION) {
    console.error(`ABBRUCH: der Server meldet ${gesund.version}, der Baum sagt ${BAUM_VERSION} — dieses Urteil gehoert keiner der beiden Fassungen.`);
    process.exit(2);
  }

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
  const kraftGefunden = await evaliere(`(()=>{const b=document.querySelector('[title^="Claims view"]');if(!b)return false;b.click();return true})()`);
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
  console.error(`die Flaeche meldet beim ersten Griff: ${sageDerFlaeche.tekst}`);
  // Der erste Griff kann eine wartende Welt erwischen: gemessen 4.11. 19:31 MEZ meldete
  // derselbe Bestand zweimal hinter einander "6 concepts of 3,027 in all · 2,379 links"
  // (16:10) und "0 concepts · 0 links" (19:31). Eine Sonde, die das erste Muster gelten
  // laesst, zaehlt einen Augenblick und nennt ihn den Bestand. Also: warten, bis zwei
  // Lesungen gleich sind, und beide zeigen.
  let zuletzt = sageDerFlaeche;
  const stabil = await warteBis(async () => {
    const t2 = await evaliere(`document.querySelector('[data-testid="graph-legende"]')?.textContent || ''`);
    const m2 = t2.match(/([\d,]+) notes[^·]*·\s*([\d,]+) concepts[^·]*·\s*([\d,]+) links/);
    if (!m2) return null;
    const jetzt = { notizen: Number(m2[1].replace(/,/g, "")), konzepte: Number(m2[2].replace(/,/g, "")), kanten: Number(m2[3].replace(/,/g, "")), tekst: m2[0] };
    if (jetzt.konzepte === zuletzt.konzepte && jetzt.kanten === zuletzt.kanten && jetzt.notizen === zuletzt.notizen) return jetzt;
    zuletzt = jetzt;
    return null;
  }, { maxMs: 30000, schritt: 1500 });
  if (stabil) {
    if (stabil.tekst !== sageDerFlaeche.tekst) console.error(`die Flaeche meldet nach der Ruhe: ${stabil.tekst}`);
    else console.error(`die Flaeche meldet gleichbleibend: ${stabil.tekst}`);
  } else {
    console.error(`die Flaeche hat in 30 s nicht zweimal dasselbe gemeldet — letzter Stand: ${zuletzt.tekst}`);
  }
  // Der volle Kopf, nicht sein Anfang. Die Zahl "0 concepts" ist zwei verschiedene
  // Welten: ein Bestand ohne Begriffe, und ein Begriff-Bein, das den Lauf nicht
  // erreichte — die Flaeche sagt den Unterschied in ihrem eignen Satz
  // (kopfKanteSatz: "the entity links did not arrive"), und der Satz steht HINTER
  // dem dritten Number, den das Muster oben abschneidet. Gemessen 4.11.: zwei Laeufe
  // desselben Bestands meldeten "6 concepts of 3,027 in all" und "0 concepts" ohne
  // Zusatz, und die Sonde hielt beide fuer den Bestand. Die Tuer selbst antwortete in
  // beiden Faellen bei 0 s mit 500 Begriffen und 2 000 Kanten (Mappe:
  // scripts/graph-begriffskurve.mjs, 3 000 Notizen, 29 375 Kanten im Bestand) — der
  // Unterschied lag an der Flaeche, nicht am Kern. Also: Kopf voll zeigen, und ein
  // Lauf, dessen Begriff-Bein nie entschieden ist, gilt nicht als Messung.
  const kopfVoll = await evaliere(`document.querySelector('[data-testid="graph-kopf"]')?.textContent || 'kein Kopf'`);
  console.error(`der Kopf der Flaeche in voller Laenge: ${kopfVoll}`);
  const absage = /did not arrive/i.test(kopfVoll);
  if (zuletzt.konzepte === 0 && zuletzt.kanten === 0 && !absage) {
    const entschieden = await warteBis(async () => {
      const k = await evaliere(`document.querySelector('[data-testid="graph-kopf"]')?.textContent || ''`);
      const z = (k.match(/([\d,]+) concepts/) || [])[1];
      if (/did not arrive/i.test(k)) return { grund: "die Flaeche nennt die Absage", konzepte: 0 };
      if (z && Number(z.replace(/,/g, "")) > 0) return { grund: "die Begriffe sind angekommen", konzepte: Number(z.replace(/,/g, "")) };
      return null;
    }, { maxMs: 60000, schritt: 2000 });
    if (!entschieden) {
      console.log("ABBRUCH: die Flaeche meldete null Begriffe und nannte keinen Grund — das Begriff-Bein war in 60 s nicht entschieden. "
        + "Ein Ueberlappungsurteil aus diesem Feld ist kein Urteil ueber das ausgelieferte Stueck.");
      process.exitCode = 1;
      return;
    }
    console.error(`  Begriff-Bein entschieden nach dem Warteraum: ${entschieden.grund} (${entschieden.konzepte} Begriffe) — Kopf neu gelesen`);
    const neu = await evaliere(`document.querySelector('[data-testid="graph-legende"]')?.textContent || ''`);
    const m3 = neu.match(/([\d,]+) notes[^·]*·\s*([\d,]+) concepts[^·]*·\s*([\d,]+) links/);
    if (m3) {
      zuletzt = { notizen: Number(m3[1].replace(/,/g, "")), konzepte: Number(m3[2].replace(/,/g, "")), kanten: Number(m3[3].replace(/,/g, "")), tekst: m3[0] };
      console.error(`die Flaeche meldet fuer diese Messung: ${zuletzt.tekst}`);
    }
  }

  // 5) Phase A: die Welt zur Ruhe bringen — Physik und Zeichnen zugleich.
  await ruf("an");
  await schlafe(SEKUNDEN * 1000);
  const settling = await ruf("ablesen");
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
  // Vor dem Zaehlen der Geometrie: warten, bis das Feld steht. Die Zahl "Paare in der
  // Ruhe" ist sonst eine Zahl ueber eine Bewegung, und die Doku verkauft sie als Zustand.
  // Ein stehendes Feld malt von selbst kein Bild — und eine Sonde, die in diesem
  // Augenblick die Scheiben sammelt, sammelt nichts und meldet "0 Paare". Genau das
  // ist ein gruen, das nicht schlagen kann: gemessen 4.11. 19:36 MEZ, wo der erste
  // Ruhe-Warteraum 0 Scheiben und 0 Paare meldete, weil nach `an` kein Rahmen mehr
  // kam. Also wird pro Versuch ein Bild erzwungen (Zoom rein, Zoom raus — dieselbe
  // Stellung, nur ein neuer Durchgang), und eine leere Lesung gilt nie als Ruhe.
  let stellungVorher = null;
  let stehendNach = null;
  let scheibenZuletzt = 0;
  for (let versuch = 1; versuch <= 24; versuch++) {
    await ruf("an");
    await evaliere(`(()=>{const z=document.querySelector('[title="Zoom in"]');const a=document.querySelector('[title="Zoom out"]');if(z)z.click();if(a)a.click();return true})()`);
    await schlafe(900);
    const jetzt = await ruf("stellung");
    const n = (jetzt || "").split("|").filter(Boolean).length;
    scheibenZuletzt = n;
    if (n > 0 && stellungVorher !== null && jetzt === stellungVorher) { stehendNach = versuch * 0.9; break; }
    stellungVorher = jetzt;
  }
  console.log(`  Feld steht: ${stehendNach ? "ja, nach " + stehendNach.toFixed(1) + " s" : "NEIN — in 21.6 s nicht zwei Mal dasselbe Bild"} (Scheiben in der letzten Lesung: ${scheibenZuletzt})`);
  if (scheibenZuletzt === 0) {
    console.log("  FEHLER: die letzte Lesung hatte keine Scheiben — Ueberlappung ist ohne Gegenstand, das Urteil wird zurueckgehalten");
  }
  const ueberlapp = await ruf("kollision");
  // Das Bild zum Befund, auf Bestellung: `--bild /tmp/x.png`. Geroehrent wird das
  // stehende Feld NACH dem Einpassen und VOR dem Zug — das ist der Stand, den ein
  // Mensch sieht, wenn er die Flaeche oeffnet und wartet. Punkt 1 der neun Punkte
  // ("Graph gegen den Markt") ist mit einer Zahl nicht abzulegen; der Zeuge ist ein
  // Bild, und das Bild gehoert zu demselben Lauf, der die Scheiben gezaehlt hat.
  if (BILD) {
    const kasten = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');if(!c)return null;const r=c.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};})()`);
    if (!kasten) {
      console.log(`  KEIN Leinwand-Rechteck — das Bild ist bestellt, aber nicht gemalt`);
      process.exitCode = 1;
    } else {
      const vorBlur = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');return c.matches(':focus-visible')?'Fokus auf der Leinwand':'kein Fokus auf der Leinwand'})()`);
      await evaliere(`(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();return true})()`);
      await schlafe(250);
      console.log(`  Bild-Vorher: ${vorBlur} (der Fokusring in --fokus ist eine Tastatur-Auskunft, kein Teil des Bildes)`);
      const schuss = await cdp.send("Page.captureScreenshot", { format: "png", clip: { ...kasten, scale: 1 }, captureBeyondViewport: false });
      const { entpacke } = await import("./helfer/png-kante.mjs");
      const roh = Buffer.from(schuss.data, "base64");
      fs.writeFileSync(BILD, roh);
      const bild = entpacke(roh);
      // Ein Bild ohne seinen Zustand ist ein Bild von einem unbekannten Schirm. Also
      // derselbe Moment in Zahlen: wer den Fokus haelt, was die Tuer als Nachzug meldet,
      // und wie breit die Spalte neben der Leinwand ist — denn ein Akzentrand um die
      // ganze Leinwand ist ein andrer Befund als ein Fuell-Streifen an ihrer Oberkante.
      const zustand = await evaliere(`(()=>{const a=document.activeElement;const info=document.querySelector('[data-testid="nachzug-info"]');const r=info?info.getBoundingClientRect():null;const lein=document.querySelector('[data-testid="graph-canvas"]');const spalte=lein&&lein.parentElement?lein.parentElement.getBoundingClientRect():null;return {fokus:a?((a.getAttribute('data-testid')||a.tagName)+(a.className?' .'+String(a.className).split(' ').slice(0,3).join('.'):'')):'keinen', infoKlasse:info?info.className:'fehlt', infoRechteck:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null, infoTitel:info?(info.getAttribute('title')||''):'', leinwand:spalte?[Math.round(spalte.width),Math.round(spalte.height)]:null};})()`);
      console.log(`  Zustand im Bild: Fokus ${zustand.fokus} | nachzug-info "${zustand.infoKlasse}" Rechteck ${JSON.stringify(zustand.infoRechteck)} | Titel "${zustand.infoTitel}" | Leinwand-Spalte ${JSON.stringify(zustand.leinwand)} CSS`);
      console.log(`  Bild: ${BILD} — ${roh.length} B, ${bild.w ?? "?"} x ${bild.h ?? "?"} Geraetepixel, Leinwand ${Math.round(kasten.width)} x ${Math.round(kasten.height)} CSS`);
      // Und die Frage, die ein Bild nicht selbst beantwortet: WELCHES Element liegt auf
      // den vier Kanten und in der Mitte? Ein Akzentrand rund um die Leinwand ist ein
      // andrer Befund als ein Fuell-Streifen an ihrer Oberkante, und die Pixel allein
      // unterscheiden die beiden nicht.
      const kanten = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');const r=c.getBoundingClientRect();const n=(x,y)=>{const e=document.elementFromPoint(x,y);return e?((e.getAttribute('data-testid')||e.tagName)+(e.className&&typeof e.className==='string'?' .'+e.className.split(' ').slice(0,2).join('.'):'')):'—';};return {oben:n(r.left+r.width/2,r.top+1),unten:n(r.left+r.width/2,r.bottom-2),links:n(r.left+1,r.top+r.height/2),rechts:n(r.right-2,r.top+r.height/2),mitte:n(r.left+r.width/2,r.top+r.height/2)};})()`);
      console.log(`  Kanten des Bildes: oben ${kanten.oben} | unten ${kanten.unten} | links ${kanten.links} | rechts ${kanten.rechts} | mitte ${kanten.mitte}`);
      // Und ob der Rand gemalt oder gelegt ist: die Leinwand-Pixel an der Kante gegen
      // ihre eigne CSS-Auszeichnung. Ein Akzentrand, den `focus-visible` malt, ist eine
      // Tastatur-Auskunft; ein Rand, der in den Pixeln liegt, ist ein Bildbefund.
      const rand = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');const s=getComputedStyle(c);let p=[0,0,0,0];try{const g=c.getContext('2d');p=[...g.getImageData(1,1,1,1).data].map(Number);}catch(e){p='kein Leseweg: '+e.message;}return {outline:s.outlineWidth+' '+s.outlineStyle+' '+s.outlineColor,fokusVisible:c.matches(':focus-visible'),border:s.borderTopWidth+' '+s.borderTopColor,pixel:p};})()`);
      console.log(`  Rand der Leinwand: outline ${rand.outline} | border ${rand.border} | focus-visible ${rand.fokusVisible} | erstes Pixel ${JSON.stringify(rand.pixel)}`);
      // Wer den Rand malt, ist noch nicht gefragt: die Leinwand selbst ist an der Kante
      // durchsichtig (alpha 0), also liegt der Akzent an einem ihrer Eltern. Eine Kette
      // von Grossvätern mitihren Rändern ist die Antwort, nicht ein Verdacht.
      const kette = await evaliere(`(()=>{const out=[];let e=document.querySelector('[data-testid="graph-canvas"]');for(let i=0;i<6&&e;i++){const s=getComputedStyle(e);out.push((e.getAttribute('data-testid')||e.tagName)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)+' Rand '+s.borderTopWidth+'/'+s.borderTopColor+' Um '+s.outlineWidth+' '+s.outlineStyle+' Schein '+s.boxShadow.slice(0,42));e=e.parentElement;}return out;})()`);
      for (const z of kette) console.log(`  Elternkante: ${z}`);
      // Wer die Kante malt, ist damit noch nicht gesagt. Also: die Geschwister der
      // Leinwand in derselben Spalte, mit ihrem Rechteck und ihren Farben — und nur die
      // interessiert, deren Rand die Bildkante beruehrt.
      const faerber = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');const vater=c.parentElement;const r=c.getBoundingClientRect();const out=[];for(const e of vater.querySelectorAll('*')){if(e===c||e.contains(c))continue;const b=e.getBoundingClientRect();const kante=Math.abs(b.left-r.left)<3||Math.abs(b.right-r.right)<3||Math.abs(b.top-r.top)<3||Math.abs(b.bottom-r.bottom)<3;if(!kante)continue;const st=getComputedStyle(e);out.push((e.getAttribute('data-testid')||e.tagName)+' '+(typeof e.className==='string'?e.className.split(' ').slice(0,3).join('.'):'')+' @'+Math.round(b.x-r.left)+','+Math.round(b.y-r.top)+' '+Math.round(b.width)+'x'+Math.round(b.height)+' Rand '+st.borderTopWidth+'/'+st.borderTopColor+' Grund '+st.backgroundColor+' Um '+st.outlineWidth+' '+st.outlineStyle+'/'+st.outlineColor+' Schein '+st.boxShadow.slice(0,26));}return out.slice(0,8);})()`);
      for (const f of faerber) console.log(`  Kantennachbar: ${f}`);
      // Die Frage, die die Pixel noch offen lassen: WELCHE Elemente liegen an der Kante
      // uebereinander, und was steht in der Leinwand selbst? `elementsFromPoint` nennt
      // den ganzen Stapel, `getImageData` die Pixel der Leinwand — zusammen trennen sie
      // "von der Flaeche gemalt" von "von einem Element darueber gelegt".
      const stapel = await evaliere(`(()=>{const c=document.querySelector('[data-testid="graph-canvas"]');const r=c.getBoundingClientRect();const pkt=(x,y)=>{const st=document.elementsFromPoint(x,y).slice(0,4).map(e=>(e.getAttribute('data-testid')||e.tagName)+(typeof e.className==='string'&&e.className?'.'+e.className.split(' ')[0]:''));const g=c.getContext('2d');let px='—';try{const d=g.getImageData(Math.max(0,Math.min(c.width-1,Math.round((x-r.left)*2))),Math.max(0,Math.min(c.height-1,Math.round((y-r.top)*2))),1,1).data;px=[...d].join(',');}catch(e){px='kein Leseweg';}return {punkt:Math.round(x-r.left)+','+Math.round(y-r.top),stapel:px+' | '+st.join(' > ')};};return [pkt(r.left+r.width/2,r.top+2),pkt(r.left+2,r.top+r.height/2),pkt(r.right-3,r.top+r.height/2),pkt(r.left+r.width/2,r.bottom-3)];})()`);
      for (const st of stapel) console.log(`  Kantenstapel ${st.punkt}: ${st.stapel}`);
      if (!faerber.length) console.log("  Kantennachbar: kein Geschwister-Element beruehrt die Bildkante");
    }
  }

  // 6) Phase B: ein Knoten wird gezogen — das ist der teuerste Weg (Physik
  // heizt nach, alles malt neu). Ziel ist die groesste Scheibe, die im Bild
  // auch wirklich zu greifen ist.
  //
  // Stellung, Transformationsmaess und Leinwand-Kasten MUESSEN aus demselben Rahmen
  // kommen wie der Griff selbst: gemessen 22:05 und 22:27 MEZ war die Leinwand beim
  // Bild noch 1 128 CSS-Pixel breit und beim darauf folgenden Kasten-Griff 696 — eine
  // Seitentafel war aufgegangen. Die Scheiben der alten Ruhe-Lesung lagen damit
  // ausserhalb des neuen Zielbereichs, die Kandidatenliste war leer ("Kandidat 0 von
  // 0 getroffen"), und die Phase, die den Zug beweisen soll, war zum zweiten Mal ein
  // Nichtangriff — diesmal an der eignen Sonde, nicht an der Flaeche.
  await ruf("an");
  await evaliere(`(()=>{const z=document.querySelector('[title="Zoom in"]');const a=document.querySelector('[title="Zoom out"]');if(z)z.click();if(a)a.click();return true})()`);
  await schlafe(900);
  const vorZug = await ruf("ablesen");
  const [zk, zx, zky, zy] = vorZug.weltT || [];
  const cRect = await evaliere(`(()=>{const r=document.querySelector('[data-testid="graph-canvas"]').getBoundingClientRect();return [r.left,r.top,r.width,r.height];})()`);
  // Der Zug ist nur ein Zug, wenn ein Knoten daran haengt. Gemessen 4.11.: in drei
  // von fuenf Laeufen arbeitete die Flaeche in keinem einzigen Rahmen des Schlepp-Zugs —
  // der Griff traf eine Leerstelle, und die Phase, die als einziger Browser-Beweis fuer
  // "ein gezogener Knoten bleibt getrennt" taugen soll, war ein Nichtangriff. Also:
  // die groessten acht Scheiben der Reihe nach, und jeder Versuch wird an der Arbeit
  // der Flaeche geprueft, nicht am eignen Willen.
  const kandidaten = (vorZug.welt || [])
    .map((s) => ({ s, sx: s[0] * zk + zx, sy: s[1] * zky + zy }))
    .filter((p) => Number.isFinite(p.sx) && p.sx > 40 && p.sy > 40 && p.sx < cRect[2] - 40 && p.sy < cRect[3] * 0.55)
    .sort((a, b) => b.s[2] - a.s[2]).slice(0, 8);
  if (!kandidaten.length) {
    console.log(`  KEINE Kandidatin: ${(vorZug.welt || []).length} Scheiben in der Rahmen-Lesung, Maess ${JSON.stringify(vorZug.weltT)}, Kasten ${JSON.stringify((cRect || []).map((v) => Math.round(v)))}`);
  }
  let ziehen = null;
  let treffer = 0;
  for (let i = 0; i < kandidaten.length; i++) {
    await ruf("an");
    const zx2 = Math.round(cRect[0] + kandidaten[i].sx), zy2 = Math.round(cRect[1] + kandidaten[i].sy);
    await maus("mousePressed", zx2, zy2);
    for (let j = 1; j <= 24; j++) {
      await maus("mouseMoved", zx2 + j * 9, zy2 + j * 5);
      await schlafe(120);
    }
    await maus("mouseReleased", zx2 + 216, zy2 + 120);
    const lesung = await ruf("ablesen");
    if (lesung.arbeitende > 0) { ziehen = lesung; treffer = i + 1; break; }
  }
  if (!ziehen) ziehen = await ruf("ablesen");
  console.log(`  Schlepp-Zug: ${ziehen.arbeitende > 0 ? `Kandidat ${treffer} von ${kandidaten.length} getroffen` : `KEINER von ${kandidaten.length} grossen Scheiben getroffen — die Phase bleibt ein Nichtangriff`}`);
  // Die Geometrie NACH dem Zug. Zwei Dinge sind daran zu verstehen, und beide sind
  // gemessen worden, bevor sie hier standen.
  //
  // Erstens: gesammelt wird EIN Rahmen nach der Ruhe, nicht der ganze Zug. Die
  // Scheiben-Sammlung ist eine Vereinigung ueber alle Rahmen seit dem letzten `an`,
  // und ein Zug malt 635 Scheiben an 99 verschiedenen Orten — die Nach-zug-Lesung von
  // 21:15:56 MEZ lief in 99 Rahmen und endete mit `RangeError: Set maximum size
  // exceeded` in der Paar-Pruefung. Gezahlt wird das Endbild, nicht der Flug.
  //
  // Zweitens: die Zusage der Flaeche ("Dragged notes stay put") wirkt, nachdem das
  // Feld zurueckkommt — also wird die Ruhe erst abgewartet, und zwar mit demselben
  // Zeugen wie vorher: zwei Lesungen, dieselbe Stellung.
  let ruheVorher = null;
  let nachZugSteht = null;
  for (let versuch = 1; versuch <= 24; versuch++) {
    await ruf("an");
    await evaliere(`(()=>{const z=document.querySelector('[title="Zoom in"]');const a=document.querySelector('[title="Zoom out"]');if(z)z.click();if(a)a.click();return true})()`);
    await schlafe(900);
    const jetzt = await ruf("stellung");
    const n = (jetzt || "").split("|").filter(Boolean).length;
    if (n > 0 && ruheVorher !== null && jetzt === ruheVorher) { nachZugSteht = versuch * 0.9; break; }
    ruheVorher = jetzt;
  }
  console.log(`  Nach dem Zug: ${nachZugSteht === null ? "KEINE Ruhe in 21.6 s — die Lesung gilt dem letzten Rahmen, nicht einem stehenden Feld" : `steht das Feld nach ${nachZugSteht.toFixed(1)} s`}`);
  const ueberlappNachZug = await ruf("kollision");

  // Die zweite Sonde: ruhig war es vor dem Start. Waehrend der Messung kann
  // eine Suite angesprungen sein, und dann ist die Zahl wertlos. ZUERST wird
  // die eigene Maschine entlassen — sonst hoert die Sonde ihren eigenen Browser
  // und meldet "nicht ruhig", ohne dass jemand anders laeuft.
  // Der Satz "entlassen und zwei Sekunden gewartet" war zu kurz: gemessen
  // 06:13:15 bis 06:15:46 MEZ meldete der erste Wurf nach `machZu()`
  // "max/median 2,83 — NICHT RUHIG", obwohl der Vorwurf vor dem Start ruhig war
  // (1,16) und kein fremder Laeufer lief. Das Sterben des egnen Browsers haengt
  // nach. Also: bis zu vier Wueme, jeder einzelne gedruckt, und die Latte bleibt
  // dieselbe (`ruhig` nach uralter Schwelle). Hoert die Sonde nach zwanzig
  // Sekunden immer noch eine Last, ist sie nicht ruhiger erklaert -- sie ist
  // unruhig, und der Lauf verweigert das Urteil wie bisher.
  machZu();
  let urteilAmEnde = null;
  const wuerfe = [];
  for (let wurf = 1; wurf <= 4; wurf++) {
    await schlafe(wurf === 1 ? 2000 : 6000);
    const u = ruedig(sonde());
    wuerfe.push({ wurf, zeile: beschlag(u.messung), ruhig: u.ruhig });
    urteilAmEnde = u;
    if (u.ruhig) break;
  }
  const out = {
    gemessenAm: new Date().toISOString(),
    // Die Fassung im Leib des Artefakts, nicht nur in seinem Kopf: ein Beleg, der seine
    // Fassung nicht selbst traegt, bezeugt nur den Stand, den jemand anders fuer ihn sagt.
    fassung: gesund.version,
    maschine: {
      vorDemStart: beschlag(urteil.messung),
      nachDerMessung: beschlag(urteilAmEnde.messung),
      wuerfe,
      ruhigUeberAlles: urteilAmEnde.ruhig,
      ursachen: urteilAmEnde.ursachen,
      kerne: os.cpus().length,
      last1: Math.round(os.loadavg()[0] * 100) / 100,
      os: os.release(),
    },
    bestand: { notizen: zuletzt.notizen, konzepte: zuletzt.konzepte, kanten: zuletzt.kanten, health: zaehlung.count, absage: absage, kopf: kopfVoll },
    budgetMs: Math.round(BUDGET_MS * 100) / 100,
    phasen: { einschwingen: settling, ruheNachFit: ruhig, knotenZiehen: ziehen },
    ueberlappung: ueberlapp,
    ueberlappungNachZug: ueberlappNachZug,
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
    if (out.ueberlappung.scheiben === 0) {
      console.log("ueberlappung   KEIN GEGENSTAND — 0 Scheiben gesammelt, die Zahl 0 Paare waere ein Nicht-Angriff");
      process.exitCode = 1;
    } else {
      console.log(`ueberlappung   ${out.ueberlappung.scheiben} Scheiben, geschnitten: ${out.ueberlappung.geschnitten} Paare, beruehrend: ${out.ueberlappung.beruehrend}, tiefster Schnitt ${out.ueberlappung.tiefsterSchnitt} Welt-Einheiten`);
      const n = out.ueberlappungNachZug;
      console.log(`nach-zug       ${n.scheiben} Scheiben, geschnitten: ${n.geschnitten} Paare, beruehrend: ${n.beruehrend}, tiefster Schnitt ${n.tiefsterSchnitt} Welt-Einheiten${n.geschnitten ? "  — der Zug hat etwas ueberlappend zurueckgelassen" : ""}`);
    }
    // Die Paare namentlich, nicht nur ihre Zahl: "1 Paar" ist ein Befund ohne Ort, und
    // ohne Ort ist keine Ursache zu pruefen (gemessen 4.11. 16:10 MEZ bei 3 000 Notizen).
    // Seit diesem Lauf auch mit der Farbe, in der gemalt wird: zwei Scheiben mit Radius 26
    // koennen Knoten sein (dann schuldet das Ruhe-Feld die Trennung) oder ein Ring (dann kann keine Kollision
    // sie trennen, weil er kein Knoten ist).
    for (const pb of out.ueberlappung.proben || []) {
      console.log(`    Paar bei (${pb.x},${pb.y}) und (${pb.dx},${pb.dy}) — Abstand ${pb.d}, Radien ${pb.r1} + ${pb.r2}, Schnitt ${pb.schnitt}, gemalt in ${pb.stil1} und ${pb.stil2}`);
    }
    console.log(`bestand        ${out.bestand.notizen} notes · ${out.bestand.konzepte} concepts · ${out.bestand.kanten} links   (die Flaeche sagt das selbst)`);
    console.log(`maschine         vorher: ${out.maschine.vorDemStart}`);
    console.log(`                 nachher: ${out.maschine.nachDerMessung}${out.maschine.ruhigUeberAlles ? "" : "  — NICHT RUHIG, Zahl nicht veröffentlichen"}`);
    // Jeder Wurf einzeln, damit ein Nachgeben hoerbar bleibt: die Schwelle ist
    // unveraendert, nur der Moment ist der, in dem kein eignes Kind mehr lebt.
    for (const w of out.maschine.wuerfe) console.log(`                   Wurf ${w.wurf}: ${w.zeile} — ${w.ruhig ? "ruhig" : "unruhig"}`);
    console.log(`befehl         ${out.befehl}`);
  }
  fs.writeFileSync(`${ARBEIT}/ergebnis.json`, JSON.stringify(out, null, 1));
  // Der Stapel nach sich selbst: Profil und Datenordner sind Wegwerfware, der
  // Profil und Datenordner sind Wegwerfware, der Bund wird jeden Lauf neu gebaut.
  // Ohne diesen Schritt haette jeder Lauf
  // ~110 MB hinterlassen — der Anfang dieses Nachtrags.
  if (!BEHALTEN) {
    for (const weg of [`${ARBEIT}/profil`, `${ARBEIT}/d`, `${ARBEIT}/brave.log`]) {
      try { fs.rmSync(weg, { recursive: true, force: true }); } catch { /* schon weg */ }
    }
    console.error(`aufgeraeumt: ${ARBEIT}/profil, ${ARBEIT}/d (der Bund wird jeden Lauf neu gebaut; --behalten laesst alles liegen)`);
  }
}

main().catch((e) => { console.error("ABGEBROCHEN:", e.message); process.exitCode = 1; })
  .finally(machZu);
