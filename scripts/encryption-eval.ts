// F5 — Verschluesselung-Eval (Mess-Skript). Belegt die Befunde aus
// docs/encryption-eval.md mit Zahlen vom eigenen Rechner:
//   1. Ohne Schluessel liegt der Klartext in DB-/WAL-Datei (Tests, KEPTA_ENCRYPTION=off)
//   2. Mit Schluessel: kein Klartext in DB oder WAL, kein SQLite-Kopf
//   3. Oeffnen mit und ohne Schluessel (Median) — roher 256-Bit-Schluessel, keine Ableitung
//   4. Umwandlung eines Klartext-Bestands mit 2000 Notizen: Dauer, Zeilen gleich
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";

const MARKER = "unverwechselbarer-klartext-marker-203";
const SCHLUESSEL = crypto.randomBytes(32);
const mitSchluessel = { ...defaultExtensions(), keys: { keyFor: () => SCHLUESSEL } };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function dbFilesContent(dbPath: string): string {
  let out = "";
  for (const f of [dbPath, dbPath + "-wal"]) {
    try { out += fs.readFileSync(f, "latin1"); } catch { /* keine WAL */ }
  }
  return out;
}

const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-crypteval-"));

// --- 1: ohne Schluessel ---
const klar = path.join(dir, "klar.db");
const a = new KeptaStore(klar);
a.createMemory({ title: "Streng vertraulich", content: MARKER });
a.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
console.log(`[1] Ohne Schluessel — Klartext in DB-/WAL-Datei: ${dbFilesContent(klar).includes(MARKER) ? "JA" : "nein"}`);
a.close();

// --- 2: mit Schluessel ---
const geheim = path.join(dir, "geheim.db");
const b = new KeptaStore(geheim, mitSchluessel);
b.createMemory({ title: "Streng vertraulich", content: MARKER });
const vorCheckpoint = dbFilesContent(geheim).includes(MARKER);
b.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
console.log(`[2] Mit Schluessel — Klartext vor/nach Checkpoint: ${vorCheckpoint ? "JA" : "nein"} / ${dbFilesContent(geheim).includes(MARKER) ? "JA" : "nein"}; Dateikopf: ${fs.readFileSync(geheim).subarray(0, 8).toString("hex")} (SQLite waere 53514c69746520666f)`);
b.close();

// --- 3: Kosten beim Oeffnen ---
const N = 30;
const ohne: number[] = [];
const mit: number[] = [];
for (let i = 0; i < N; i++) {
  let t = performance.now();
  new KeptaStore(klar).close();
  ohne.push(performance.now() - t);
  t = performance.now();
  new KeptaStore(geheim, mitSchluessel).close();
  mit.push(performance.now() - t);
}
console.log(`[3] Oeffnen (Median, ${N}x): ohne Schluessel ${median(ohne).toFixed(2)} ms, mit Schluessel ${median(mit).toFixed(2)} ms`);

// --- 4: Umwandlung eines Bestands ---
const bestand = path.join(dir, "bestand.db");
const c = new KeptaStore(bestand);
for (let i = 0; i < 2000; i++) c.createMemory({ title: `Notiz ${i}`, content: `${MARKER} ${"Inhalt ".repeat(40)} ${i}` });
c.close();
const mb = (fs.statSync(bestand).size / 1024 / 1024).toFixed(1);
const t0 = performance.now();
const d = new KeptaStore(bestand, mitSchluessel);
const dauer = performance.now() - t0;
console.log(`[4] Umwandlung von ${mb} MB / ${d.countMemories().active} Notizen: ${dauer.toFixed(0)} ms, umgewandelt=${d.verschluesselung.umgewandelt === true}, Klartext danach: ${dbFilesContent(bestand).includes(MARKER) ? "JA" : "nein"}`);
d.close();

fs.rmSync(dir, { recursive: true, force: true });
console.log("Fazit: siehe docs/encryption-eval.md — mit Schluessel liegt nichts Lesbares mehr auf der Platte.");
