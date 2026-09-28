// LongMemEval-Datensatz von der offiziellen Quelle laden (Hugging Face,
// Wu et al., ICLR 2025) — NICHT ins Repo committed, nur der SHA-256 wird
// im Ergebnis-JSON ausgewiesen.
//
// Aufruf:  node tools/longmemeval/lade-datensatz.mjs [s|m|oracle]
//          (Standard: s — 278 MB, ~500 Fragen)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const split = (process.argv[2] ?? "s").toLowerCase();
const erlaubt = { s: "longmemeval_s", m: "longmemeval_m", oracle: "longmemeval_oracle" };
const datei = erlaubt[split];
if (!datei) {
  console.error(`Unbekannter Split "${split}" — erlaubt: s, m, oracle.`);
  process.exit(2);
}
const url = `https://huggingface.co/datasets/xiaowu0162/LongMemEval/resolve/main/${datei}`;
const zielVerzeichnis = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "datensatz");
fs.mkdirSync(zielVerzeichnis, { recursive: true });
const ziel = path.join(zielVerzeichnis, datei);

if (fs.existsSync(ziel)) {
  console.log(`Bereits vorhanden: ${ziel}`);
} else {
  console.log(`Lade ${url} …`);
  const antwort = await fetch(url, { redirect: "follow" });
  if (!antwort.ok) {
    console.error(`HTTP ${antwort.status} — Quelle prüfen: https://huggingface.co/datasets/xiaowu0162/LongMemEval`);
    process.exit(1);
  }
  // Streamend schreiben: der M-Split ist größer als 2 GB — Buffer.from(arrayBuffer)
  // stieß dort an Node's Buffer-Grenze (ERR_OUT_OF_RANGE, 26.9.).
  const gesamt = Number(antwort.headers.get("content-length") ?? 0);
  const dateiStream = fs.createWriteStream(ziel);
  let geladen = 0;
  const leser = Readable.fromWeb(antwort.body);
  leser.on("data", (stück) => {
    geladen += stück.length;
    if (gesamt && geladen - (geladen % (50e6)) !== (geladen - stück.length) - ((geladen - stück.length) % (50e6))) {
      console.log(`  ${(geladen / 1e6).toFixed(0)} / ${(gesamt / 1e6).toFixed(0)} MB`);
    }
  });
  await pipeline(leser, dateiStream);
  console.log(`Gespeichert: ${ziel} (${(fs.statSync(ziel).size / 1e6).toFixed(0)} MB)`);
}

const hash = crypto.createHash("sha256").update(fs.readFileSync(ziel)).digest("hex");
console.log(`SHA-256: ${hash}`);
console.log("\nVerwendung: npx tsx tools/longmemeval/harness.ts tools/longmemeval/datensatz/" + datei);
