#!/usr/bin/env node
// Probe am veroeffentlichten Paket — nicht am Baum.
//
// Warum: `publish.yml` baut das npm-Paket, stellt es zu und wartet auf die
// Verbreitung. Kein Schritt danach installiert es je wieder. Alles, was diese
// Datei prueft, ist also die einzige Antwort auf die Frage, die ein Kunde stellt:
// "funktioniert das Ding, wenn ich es hole?" — und die Antwort muss aus dem
// Register kommen, nicht aus dem Repository, das schon laeuft.
//
// Sie hoert auf, wenn etwas nicht stimmt, und sagt, was: Exit 1.
//
// Usage:
//   node scripts/probe-veroeffentlicht.mjs            // neueste `latest`
//   node scripts/probe-veroeffentlicht.mjs 3.4.0      // eine benannte Version
//
// Isolation: eigenes HOME, eigener Datenordner, eigener 64-Zeichen-Schluessel.
// Der echte Anmelde-Schluesselbund und ~/.kepta werden nicht angefasst.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const WUNSCH = process.argv[2] ?? "latest";
const PAKET = "kepta-mcp";

const heim = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-probe-home-"));
const arbeits = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-probe-arbeit-"));
const schluessel = Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
const umgebung = { ...process.env, HOME: heim, KEPTA_DB_KEY: schluessel, KEPTA_NO_AUTOSTART: "1", KEPTA_DB: path.join(arbeits, "probe.db") };
delete umgebung.KEPTA_MAX_ACTIVE;

const fehl = [];
const sage = (t) => console.log(`  ${t}`);
function pruefe(bedingung, text) {
  if (bedingung) sage(`OK   ${text}`);
  else {
    sage(`FEHLER ${text}`);
    fehl.push(text);
  }
}

try {
  console.log(`npm-Paket: ${PAKET}@${WUNSCH}`);
  const version = execFileSync("npm", ["view", `${PAKET}@${WUNSCH}`, "version"], { encoding: "utf8" }).trim();
  sage(`gefragte Version im Register: ${version}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Register antwortet nicht mit einer Version: ${version}`);

  const installations = path.join(arbeits, "paket");
  fs.mkdirSync(installations, { recursive: true });
  execFileSync("npm", ["install", "--prefix", installations, "--no-audit", "--no-fund", "--loglevel=error", `${PAKET}@${version}`], {
    env: umgebung,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 300_000,
  });
  // Das Paket heisst kepta-mcp, aber sein binar heuert unter einem anderen namen —
  // geholt aus der installierten package.json, nicht geraten. Ein hartcodierter
  // name ware genau der fehler, den diese probe sucht: eine anleitung, die nicht
  // das ausfuehrt, was das paket liefert.
  const paketpfad = path.join(installations, "node_modules", PAKET);
  const paketjson = JSON.parse(fs.readFileSync(path.join(paketpfad, "package.json"), "utf8"));
  const binfeld = typeof paketjson.bin === "string" ? { [paketjson.name]: paketjson.bin } : paketjson.bin ?? {};
  const binname = Object.keys(binfeld)[0];
  const bin = path.join(paketpfad, binfeld[binname] ?? "");
  sage(`binar im paket: ${binname} -> ${binfeld[binname]} | main: ${paketjson.main}`);
  pruefe(!!binname && fs.existsSync(bin), `binar existiert nach Installation: ${binname}`);

  // JSON-RPC ueber stdio, wie ein Client es tut.
  const prozess = spawn(process.execPath, [bin], { env: umgebung, stdio: ["pipe", "pipe", "pipe"] });
  const sterbend = [];
  prozess.on("error", (e) => sterbend.push(`spawn: ${e.message}`));
  prozess.stderr.on("data", (d) => sterbend.push(String(d).trim()));
  let puffer = "";
  let naechster = 1;
  const wartend = new Map();
  const protokoll = [];
  prozess.stdout.on("data", (d) => {
    puffer += d.toString();
    let i;
    while ((i = puffer.indexOf("\n")) >= 0) {
      const zeile = puffer.slice(0, i).trim();
      puffer = puffer.slice(i + 1);
      if (!zeile) continue;
      let nachricht;
      try {
        nachricht = JSON.parse(zeile);
      } catch {
        continue;
      }
      protokoll.push(nachricht.id ?? nachricht.method ?? "?");
      const w = nachricht.id !== undefined ? wartend.get(nachricht.id) : null;
      if (w) {
        wartend.delete(nachricht.id);
        w(nachricht);
      }
    }
  });
  const senden = (methode, params, id) => {
    prozess.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method: methode, params })}\n`);
  };
  const ruf = (methode, params, zeit = 60_000) =>
    new Promise((los, fehler) => {
      const id = naechster++;
      const uhr = setTimeout(() => {
        wartend.delete(id);
        fehler(new Error(`${methode}: keine Antwort in ${zeit} ms`));
      }, zeit);
      wartend.set(id, (n) => {
        clearTimeout(uhr);
        los(n);
      });
      senden(methode, params, id);
    });

  const begruesst = await ruf("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "kepta-probe", version: "1.0.0" },
  });
  const info = begruesst.result?.serverInfo ?? {};
  sage(`initialize: serverInfo ${JSON.stringify(info)}`);
  pruefe(!!info.name, "der Server nennt einen Namen");
  prozess.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const werkzeuge = await ruf("tools/list", {});
  const namen = (werkzeuge.result?.tools ?? []).map((t) => t.name).sort();
  sage(`tools/list (${namen.length}): ${namen.join(", ")}`);
  pruefe(namen.length === 8, `acht Werkzeuge advertised — es sind ${namen.length}`);
  pruefe(namen.includes("memory_search") && namen.includes("memory_save"), "suchen und speichern sind dabei");

  const gespeichert = await ruf("tools/call", {
    name: "memory_save",
    arguments: { title: "Probe der veroeffentlichten 3.4.0", content: "Invoked from npm, not from the repository.", tags: ["probe"] },
  });
  const text = (gespeichert.result?.content ?? []).map((c) => c.text ?? "").join(" ");
  let knoten = null;
  try {
    knoten = JSON.parse(text);
  } catch {
    /* unten */
  }
  const knotenId = knoten?.id ?? knoten?.memory?.id ?? null;
  pruefe(!!knotenId, `speichern liefert eine id (antwort: ${text.slice(0, 120)})`);

  const gefunden = await ruf("tools/call", { name: "memory_search", arguments: { query: "Invoked from npm", limit: 5 } });
  const fundText = (gefunden.result?.content ?? []).map((c) => c.text ?? "").join(" ");
  pruefe(/Probe der veroeffentlichten/.test(fundText), `suchen findet die Notiz wieder (antwort: ${fundText.slice(0, 120)})`);

  // Wo die datenbank wirklich liegt: das paket setzt ihren ort selbst, und die
  // anleitung sagt nur, dass sie verschluesselt ist. Also gesucht statt geraten —
  // im eigenen HOME, nicht im echten.
  const kandidaten = [];
  const durchlauf = (ordner, tiefe) => {
    if (tiefe > 4 || kandidaten.length > 3) return;
    let eintraege = [];
    try {
      eintraege = fs.readdirSync(ordner, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      const voll = path.join(ordner, e.name);
      if (e.isDirectory()) durchlauf(voll, tiefe + 1);
      else if (/\.(db|sqlite|sqlite3)$/i.test(e.name)) kandidaten.push(voll);
    }
  };
  durchlauf(heim, 0);
  durchlauf(arbeits, 0);
  sage(`datenbank-Dateien im sandkasten: ${kandidaten.map((k) => path.basename(k)).join(", ") || "keine"}`);
  pruefe(kandidaten.length > 0, "die installation legt eine datenbank an, und zwar im sandkasten");
  if (kandidaten.length) {
    const kopf = fs.readFileSync(kandidaten[0]).subarray(0, 16).toString("latin1");
    pruefe(!kopf.startsWith("SQLite format 3"), `die datenbank ist nicht im Klartext (kopf: ${JSON.stringify(kopf.slice(0, 15))})`);
  }

  prozess.kill();
  if (sterbend.filter(Boolean).length) sage(`stderr/fehler des servers: ${sterbend.join(" | ").slice(0, 300)}`);
} catch (e) {
  fehl.push(String(e?.message ?? e));
  sage(`FEHLER ${e?.message ?? e}`);
} finally {
  for (const d of [heim, arbeits]) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ein aufraeumfehler ist kein urteil ueber das paket */
    }
  }
}

console.log(fehl.length === 0 ? "\nPROBE HAELT — das veroeffentlichte Paket installiert, antwortet, verschluesselt." : `\nPROBE FÄLLT DURCH — ${fehl.length} Punkt(e):\n  ${fehl.join("\n  ")}`);
process.exit(fehl.length === 0 ? 0 : 1);
