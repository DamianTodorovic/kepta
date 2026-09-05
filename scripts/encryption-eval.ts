// F5 — Verschlüsselung-Eval (Mess-Skript). Belegt die Befunde aus
// docs/encryption-eval.md mit Zahlen vom eigenen Rechner:
//   1. Klartext der Memory-Daten liegt in DB-/WAL-Datei auf der Platte
//   2. PRAGMA key läuft still durch und verschlüsselt NICHT (kein SQLCipher)
//   3. Die KeyProvider-Naht kostet praktisch nichts (fire-and-forget beim Öffnen)
import path from "node:path";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";

const MARKER = "unverwechselbarer-klartext-marker-203";

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function dbFilesContent(dbPath: string): string {
  let out = fs.readFileSync(dbPath, "utf8");
  try {
    out += fs.readFileSync(dbPath + "-wal", "utf8");
  } catch {
    /* keine WAL */
  }
  return out;
}

// --- 1 + 2: Klartext und PRAGMA key ---
const dir = fs.mkdtempSync(path.join(tmpdir(), "kepta-crypteval-"));
const dbPath = path.join(dir, "t.db");
const store = new KeptaStore(dbPath);
store.createMemory({ title: "Streng vertraulich", content: MARKER });
store.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");

const klartextInDb = dbFilesContent(dbPath).includes(MARKER);
console.log(`[1] Klartext in DB-/WAL-Datei nachweisbar: ${klartextInDb ? "JA" : "nein"}`);

let pragmaKeyWurf = "nein";
try {
  store.db.exec("PRAGMA key = 'irgendein-schluessel';");
} catch (e) {
  pragmaKeyWurf = e instanceof Error ? e.message : String(e);
}
console.log(`[2] PRAGMA key wirft auf node:sqlite: ${pragmaKeyWurf === "nein" ? "NEIN (läuft still durch — kein SQLCipher dahinter)" : pragmaKeyWurf}`);
const nochKlartext = dbFilesContent(dbPath).includes(MARKER);
console.log(`    ... und danach immer noch Klartext in der Datei: ${nochKlartext ? "JA" : "nein"}`);

// --- 3: Naht-Overhead: Öffnen mit/ohne KeyProvider-Callback ---
const N = 30;
const ohneNaht: number[] = [];
const mitNaht: number[] = [];
for (let i = 0; i < N; i++) {
  let t = performance.now();
  const a = new KeptaStore(dbPath);
  ohneNaht.push(performance.now() - t);
  a.db.close();
  t = performance.now();
  const b = new KeptaStore(dbPath, { ...defaultExtensions(), keys: { keyFor: async () => null } });
  mitNaht.push(performance.now() - t);
  b.db.close();
}
console.log(`[3] Öffnen ohne Naht (Median, ${N}×): ${median(ohneNaht).toFixed(2)} ms`);
console.log(`    Öffnen mit keyFor-Callback (Median): ${median(mitNaht).toFixed(2)} ms — Nahtkosten ~0 (fire-and-forget)`);

store.db.close();
console.log("Fazit: siehe docs/encryption-eval.md — die Naht ist da, die Verschlüsselung dahinter fehlt (Welle 2).");
