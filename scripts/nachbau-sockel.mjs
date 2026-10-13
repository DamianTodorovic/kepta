#!/usr/bin/env node
// Nachbau der Sockel-Klasse — vier Faelle, jeder sagt, was er gesehen hat.
//
// Warum diese Datei im Repo liegt und nicht in einem Temporaryon: sie ist der Grund
// fuer `tests/helfer/hoerer.ts`. Ein Nachbau, dessen Ausgabe nur auf einem Schreibtisch
// steht, ist fuer jeden anderen ein toter Link (docs/belege/LESEFADEN.md, Regel 6).
//
// Die Klasse (13.10., Leitung): `request(app)` horcht je Anfrage neu, und supertest
// ruft dafuer `app.listen(0)` OHNE Host (`node_modules/superagent`/`supertest/lib/test.js`).
// Node bindet ohne Host auf `::` — auf diesem Rechner dual-stack. Ein fremder Hoerer
// konnte sich auf dieselbe Zahl, aber ausdruecklich v4, setzen und hat dann die
// Anfragen auf `http://127.0.0.1:<port>` beantwortet. Das ist die Signatur der beiden
// Roetungen, die diese Suite hatten: `Schreiblauf 27: 401 {}` und `Schreiblauf 30:
// 404 {}` — ein leerer Leib, weil superagent `res.body` leer laesst, wenn der
// beantwortende Server `text/plain` schickt. Dieser Repo wirft nirgends eine 401.
//
// Usage:  node scripts/nachbau-sockel.mjs            // alle vier Faelle
//         node scripts/nachbau-sockel.mjs 3          // nur ein Fall
import http from "node:http";
import net from "node:net";
import { spawn, execSync } from "node:child_process";

const chiffrern = (n) => String(n).padStart(2, "0");

/** Ein Hoerer auf einer ausdruecklichen Adresse; meldet, wie er wirklich sitzt. */
function horche(port, adresse, antwort = "eigener") {
  return new Promise((los, fehler) => {
    const s = http.createServer((_, res) => {
      if (antwort === "fremd") {
        res.writeHead(401, { "content-type": "text/plain" });
        res.end("Unauthorized");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ geo: antwort }));
    });
    s.once("error", (e) => fehler(e));
    const fertig = () => {
      const sitz = s.address();
      los({ server: s, sitz });
    };
    if (adresse === undefined) s.listen(port, fertig);
    else s.listen(port, adresse, fertig);
  });
}

function frage(url) {
  return new Promise((los) => {
    const anfang = Date.now();
    http
      .get(url, (res) => {
        let leib = "";
        res.on("data", (d) => (leib += d));
        res.on("end", () =>
        los({ status: res.statusCode, typ: res.headers["content-type"], leib, dauer: Date.now() - anfang })
        );
      })
      .on("error", (e) => los({ fehler: e.code ?? e.message }));
  });
}

function sage(fall, text) {
  console.log(`FALL ${fall}: ${text}`);
}

const nur = Number(process.argv[2] ?? 0);
const faellig = (n) => !nur || nur === n;
const frei = async () => {
  const { server } = await horche(0, "127.0.0.1");
  const port = server.address().port;
  server.closeAllConnections?.();
  await new Promise((l) => server.close(l));
  return port;
};

// FALL 1 — supertest-Form: horchen ohne Host. Wie sitzt der Hoerer wirklich?
if (faellig(1)) {
  const { server, sitz } = await horche(0);
  sage(1, `listen(0) ohne Host -> { address: ${JSON.stringify(sitz.address)}, family: ${sitz.family}, port: ${sitz.port} }`);
  sage(1, `  supertest tut genau das: app.listen(0) ohne Host (node_modules/supertest/lib/test.js:63)`);
  server.closeAllConnections?.();
  await new Promise((l) => server.close(l));
}

// FALL 2 — Bindordnung v4 zuerst, dann v6-Wildcard auf derselben Zahl.
if (faellig(2)) {
  const port = await frei();
  const a = await horche(port, "127.0.0.1", "eigener");
  let b;
  try {
    b = await horche(port, "::", "fremd");
    sage(2, `v6-Wildcard-Bind auf ${port} trotz bestehendem v4-Hoerer: DURCHGEHEN (sitzt als ${b.sitz.address} ${b.sitz.family})`);
  } catch (e) {
    sage(2, `v6-Wildcard-Bind auf ${port} trotz bestehendem v4-Hoerer: ${e.code ?? e.message}`);
  }
  const antwort = await frage(`http://127.0.0.1:${port}/`);
  sage(2, `  Anfrage http://127.0.0.1:${port}/ -> ${antwort.status ?? antwort.fehler}, ${antwort.typ ?? "-"}, leib=${JSON.stringify(antwort.leib ?? "")}`);
  for (const h of [a, b]) {
    h?.server.closeAllConnections?.();
    await new Promise((l) => h?.server.close(l));
  }
}

// FALL 3 — umgekehrte Ordnung: erst v6-Wildcard (die supertest-Form), dann fremd v4.
if (faellig(3)) {
  const port = await frei();
  const eigen = await horche(port, "::", "eigener");
  let fremd = null;
  try {
    fremd = await horche(port, "127.0.0.1", "fremd");
    sage(3, `fremder v4-Bind auf ${port} NACH einem v6-Wildcard-Hoerer: DURCHGEHEN`);
  } catch (e) {
    sage(3, `fremder v4-Bind auf ${port} NACH einem v6-Wildcard-Hoerer: ${e.code ?? e.message}`);
  }
  const antwort = await frage(`http://127.0.0.1:${port}/`);
  sage(3, `  Anfrage http://127.0.0.1:${port}/ -> ${antwort.status ?? antwort.fehler}, ${antwort.typ ?? "-"}, leib=${JSON.stringify(antwort.leib ?? "")}`);
  sage(3, `  wer antwortet: ${antwort.status === 401 ? "DER FREMDE (401 text/plain — unser Server kennt keine 401)" : "unser Hoerer"}`);
  for (const h of [eigen, fremd]) {
    h?.server.closeAllConnections?.();
    await new Promise((l) => h?.server.close(l));
  }
}

// FALL 4 — derselbe Satz, aber durch einen echten Kindprozess, ohne dass unser
// Hoerer die Zahl hergibt: ein zweiter Prozess setzt sich auf eine Zahl, die ein
// fluechtiger Bind gleich bekommen koennte. Ein Kindprozess wurde gewaehlt, weil nur
// er beweist, dass kein gemeinsamer Loop dazwischenfunkt.
if (faellig(4)) {
  const port = await frei();
  const kind = `
    const http = require("node:http");
    http.createServer((_, res) => { res.writeHead(401, {"content-type":"text/plain"}); res.end("Unauthorized"); })
      .listen(${port}, "127.0.0.1", () => console.log("kind: gebunden auf 127.0.0.1:${port}"));
  `;
  const prozess = spawn(process.execPath, ["-e", kind], { stdio: ["ignore", "pipe", "pipe"] });
  const zeile = await new Promise((los) => {
    let gesammelt = "";
    prozess.stdout.on("data", (d) => {
      gesammelt += d;
      if (gesammelt.includes("gebunden")) los(gesammelt.trim());
    });
    prozess.stderr.on("data", (d) => (gesammelt += d));
    setTimeout(() => los(gesammelt.trim() || "(keine Meldung)"), 2_000);
  });
  sage(4, `Kindprozess: ${zeile}`);
  const antwort = await frage(`http://127.0.0.1:${port}/`);
  sage(4, `  Anfrage -> ${antwort.status ?? antwort.fehler}, ${antwort.typ ?? "-"}, leib=${JSON.stringify(antwort.leib ?? "")}`);
  sage(4, `  ein leerer {}-Leib bei 401 ist genau die Signatur aus tests/server-mcp-spiegel.test.ts (Schreiblauf 27: 401 {})`);
  prozess.kill();
}

// FALL 5 — die dichte Richtung, die tests/helfer/hoerer.ts waehlt: sitzen wir selbst
// ausdruecklich auf 127.0.0.1, dann kann ein zweiter v4-Hoerer auf derselben Zahl nicht
// mehr durchkommen. Der Bind scheitert hoerbar, statt still daneben zulauern.
if (faellig(5)) {
  const port = await frei();
  const eigen = await horche(port, "127.0.0.1", "eigener");
  try {
    const zweiter = await horche(port, "127.0.0.1", "fremd");
    zweiter.server.closeAllConnections?.();
    await new Promise((l) => zweiter.server.close(l));
    sage(5, `zweiter v4-Bind auf ${port} trotz unserem v4-Hoerer: DURCHGEHEN — die Wache unten ist die einzige Stelle, die das sieht`);
  } catch (e) {
    sage(5, `zweiter v4-Bind auf ${port} trotz unserem v4-Hoerer: ${e.code ?? e.message} — genau das will der Horcher, darum bindet er 127.0.0.1`);
  }
  eigen.server.closeAllConnections?.();
  await new Promise((l) => eigen.server.close(l));
}

// Die Zahl darunter erklaert, warum tests/helfer/port-vergabe.ts bei 41000 anfaengt:
// das Vergabefenster 41000..44999 liegt unter der ephemeren Untergrenze dieses
// Rechners, und in der ephemeren Zone gehen fremde Programme ein und aus.
let ephemere = "nicht lesbar";
try {
  ephemere = execSync("sysctl -n net.inet.ip.portrange.first", { encoding: "utf8" }).trim();
} catch {
  // ein Rechner ohne sysctl (Linux, CI) meldet den Wert anders — notiert wird das,
  // nicht geraten
}
console.log(`NACHBAU-STAND: ${process.version} auf ${process.platform}, ephemere Untergrenze net.inet.ip.portrange.first = ${ephemere}`);
