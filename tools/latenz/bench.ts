/**
 * Latenz-Benchmark für KEPTA — misst den EINEN Suchpfad (`searchMemories`)
 * und den Produkt-Schreibpfad (`saveWithIndex`) bei kontrollierbarer
 * Erinnerungszahl.
 *
 * Methodik (bewusst ehrlich):
 * - Echter Store auf Temp-Datei, ohne Verschlüsselung (Default-Extensions),
 *   damit die Messung die Engine und nicht die Krypto misst.
 * - Schreiben über den Produkt-Pfad saveWithIndex (Chunks, FTS, Graph) in
 *   Transaktionen zu 1.000 — so schreibt auch MCP.
 * - Suchen über searchMemories() — inklusive loadActive() (lädt ALLE aktiven
 *   Erinnerungen je Abfrage) und inklusive Reranking. Nichts ausgeschaltet.
 * - Embedder: ein lokaler Stub-HTTP-Server antwortet auf /api/embed mit einem
 *   deterministischen 768-dim-Vektor (nomic-embed-text-Dimension). So läuft
 *   der Vektor-Suchpfad reproduzierbar, ohne GPU/Ollama — die gemessene
 *   Latenz enthält den vollen Engine-Pfad, nicht die Netzwerkwartezeit eines
 *   Modells. Optional abschaltbar (--kein-vektor).
 * - Abfrage-Mix: 70 % Begriffe aus dem Korpus (Treffer-Fälle), 30 %
 *   Zufalls-Kombinationen (Verfehlen-Fälle). Deterministisch per Seed.
 *
 * Nutzung:
 *   npx tsx tools/latenz/bench.ts --n 100000 --out ergebnisse/latenz-100k.json
 *   npx tsx tools/latenz/bench.ts --n 1000000 --vec-chunks 20000 --out ergebnisse/latenz-1m.json
 */
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------- Args ----------
const args = process.argv.slice(2);
const argZahl = (name: string, dflt: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const N = argZahl("n", 100_000);
const QUERIES = argZahl("queries", 300);
const VEC_CHUNKS = args.includes("--kein-vektor") ? 0 : argZahl("vec-chunks", Math.min(20_000, N));
const OUT = args[args.indexOf("--out") + 1] ?? `ergebnisse/latenz-${N}.json`;

// ---------- Disk-Wache ----------
const stat = fs.statfsSync(os.tmpdir());
const freiB = stat.bsize * stat.bavail;
if (freiB < 3 * 1024 * 1024 * 1024) {
  console.error(`[latenz] Abbruch: nur ${(freiB / 1e9).toFixed(1)} GB frei in /tmp — >= 3 GB nötig.`);
  process.exit(1);
}

// ---------- Stub-Ollama (deterministische 768-dim Vektoren) ----------
const DIM = 768;
function vektorAusText(text: string): Float32Array {
  const v = new Float32Array(DIM);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < DIM; i++) {
    h = Math.imul(h ^ (i + 1), 2654435761);
    v[i] = ((h >>> 0) % 10000) / 10000 - 0.5;
  }
  const norm = Math.hypot(...v) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return v;
}
const ollama = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    let eingabe = "";
    try {
      const parsed = JSON.parse(body);
      eingabe = Array.isArray(parsed.input) ? parsed.input.join(" ") : String(parsed.input ?? "");
    } catch { /* leer lassen */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ model: "bench-stub", embeddings: [Array.from(vektorAusText(eingabe))] }));
  });
});
await new Promise<void>((ok) => ollama.listen(0, "127.0.0.1", ok));
const ollamaPort = (ollama.address() as { port: number }).port;
process.env.KEPTA_OLLAMA_URL = `http://127.0.0.1:${ollamaPort}`;
console.log(`[latenz] Stub-Ollama auf ${process.env.KEPTA_OLLAMA_URL} (${DIM} dim)`);

// ---------- Imports erst nach Env-Setzung ----------
const { KeptaStore } = await import("../../src/core/store.js");
const { searchMemories, aktiviereSuchCacheDelta } = await import("../../src/core/engine.js");
const { saveWithIndex } = await import("../../src/core/mcp.js");
const { DEFAULT_EMBED_MODEL } = await import("../../src/core/embeddings.js");

// ---------- Deterministischer Korpus ----------
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260930);
const WOERTER = ("kanzlei mandant rechnung frist backup deployment release server kunde vertrag projekt sprint budget "
  + "meeting notiz idee bericht analyse kunde aktien fonds steuer abgabe kündigung wohnung umzug pass "
  + "vertrag versicherung arzt rezept impfung urlaub flug hotel restaurant rezeptur kochen backen brot "
  + "client invoice deadline backup deploy release server customer contract project budget report "
  + "docker kubernetes datenbank migration indizierung verschlüsselung schlüssel zertifikat firewall").split(" ");
const SATZ = (n: number) => {
  const teile: string[] = [];
  for (let i = 0; i < n; i++) teile.push(WOERTER[Math.floor(rng() * WOERTER.length)]);
  return teile.join(" ");
};

const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-latenz-"));
const dbPfad = path.join(ordner, "kepta.db");
const store = new KeptaStore(dbPfad);
aktiviereSuchCacheDelta(store); // Cache wächst mit dem Ingest — der erste Suchlauf zahlt keinen Volllauf

// ---------- Phase A: Ingest über den Produkt-Pfad ----------
// Bewusst OHNE äußere Transaktion: indexMemory() → replaceChunks() führt selbst
// BEGIN/COMMIT (store.ts), Verschachtelung wirft SQLITE_ERROR. Gemessen wird also
// die echte Produkt-Konfiguration (WAL, Default-Pragmas) — nichts beschönigt.
console.log(`[latenz] Ingest: ${N} Erinnerungen über saveWithIndex (Produkt-Pfad, WAL) …`);
const tIngest0 = Date.now();
let erstellt = 0;
for (let i = 0; i < N; i++) {
  saveWithIndex(store, {
    title: `Notiz ${i}: ${SATZ(3)}`,
    content: `${SATZ(12)}. ${SATZ(10)}. ${
      rng() < 0.1 ? `Siehe [[Notiz ${Math.floor(rng() * N)}]].` : ""
    } Erstellt für Benchmark-Zweck, Datensatz ${i}.`,
    tags: rng() < 0.5 ? [WOERTER[Math.floor(rng() * WOERTER.length)]] : [],
    confidence: 0.5 + rng() * 0.5,
  });
  erstellt++;
  if (erstellt % 5000 === 0) {
    const rate = erstellt / ((Date.now() - tIngest0) / 1000);
    process.stdout.write(`\r  ${erstellt.toLocaleString("de-DE")} · ${rate.toFixed(0)} Erinnerungen/s   `);
  }
}
const ingestMs = Date.now() - tIngest0;
console.log(`\n  Ingest fertig: ${ingestMs} ms → ${(N / (ingestMs / 1000)).toFixed(0)} Erinnerungen/s (Produkt-Pfad, autocommit)`);

// Referenz: roher Schreibpfad (createMemory) auf Wegwerf-Store
const refDir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-latenz-raw-"));
const refStore = new KeptaStore(path.join(refDir, "ref.db"));
const tRaw0 = Date.now();
refStore.db.transaction(() => {
  for (let i = 0; i < 5000; i++) {
    refStore.createMemory({ title: `Raw ${i}`, content: SATZ(12), tags: [] });
  }
})();
const rawRate = 5000 / ((Date.now() - tRaw0) / 1000);
refStore.close();
fs.rmSync(refDir, { recursive: true, force: true });
console.log(`  Referenz roher Pfad (createMemory): ${rawRate.toFixed(0)} Erinnerungen/s`);

// ---------- Vektor-Bein bestücken ----------
let vektorChunks = 0;
if (VEC_CHUNKS > 0) {
  const ids = store.db.prepare("SELECT id FROM memories ORDER BY rowid LIMIT ?").all(VEC_CHUNKS) as { id: string }[];
  const vektor = vektorAusText("bench basisvektor");
  const tV0 = Date.now();
  store.db.transaction(() => {
    for (const { id } of ids) store.setEmbedding(id, 0, vektor, DEFAULT_EMBED_MODEL);
  })();
  vektorChunks = ids.length;
  console.log(`  Vektor-Bein: ${vektorChunks} Chunks bestückt in ${Date.now() - tV0} ms`);
}

// ---------- Abfragen erzeugen ----------
const titel = store.db.prepare("SELECT title FROM memories ORDER BY rowid LIMIT 20000").all() as { title: string }[];
const abfragen: string[] = [];
for (let i = 0; i < QUERIES; i++) {
  if (rng() < 0.7) {
    const basis = titel[Math.floor(rng() * titel.length)].title.replace(/^Notiz \d+: /, "");
    abfragen.push(basis);
  } else {
    abfragen.push(`${SATZ(2)} ${WOERTER[Math.floor(rng() * WOERTER.length)]}`);
  }
}

// ---------- Phase B: Suchen über DEN einen Suchpfad ----------
async function messeSuchen(label: string): Promise<Record<string, number | boolean | null>> {
  const t0 = Date.now();
  const latenz: number[] = [];
  let mitVektoren = 0;
  // Der erste Aufruf traegt den kalten Cache-Aufbau — der ist die Zahl, die beim
  // Delta-Cache interessiert. Bisher wurde sie nur auf die Konsole geschrieben und
  // dann verworfen, und zitierbare Warmup-Zahlen standen damit in keinem Record.
  let warmupErsteAbfrageMs: number | null = null;
  for (let i = 0; i < QUERIES; i++) {
    const s0 = performance.now();
    const res = await searchMemories(store, { query: abfragen[i], limit: 10 });
    latenz.push(performance.now() - s0);
    if (res.usedVectors) mitVektoren++;
    if (i === 0) {
      warmupErsteAbfrageMs = Date.now() - t0;
      console.log(`  [${label}] Warmup (inkl. first-load) ${warmupErsteAbfrageMs} ms`);
      latenz.length = 0; // Warmup fliegt raus
      mitVektoren = 0;
    }
  }
  latenz.sort((a, b) => a - b);
  const p = (q: number) => Number(latenz[Math.min(latenz.length - 1, Math.floor(q * latenz.length))].toFixed(2));
  const mittel = Number((latenz.reduce((a, b) => a + b, 0) / latenz.length).toFixed(2));
  console.log(`  [${label}] n=${latenz.length} p50=${p(0.5)} p95=${p(0.95)} p99=${p(0.99)} ms (Mittel ${mittel}) · mit Vektoren: ${mitVektoren}/${latenz.length}`);
  return { p50: p(0.5), p95: p(0.95), p99: p(0.99), mittel, n: latenz.length, mitVektoren, warmupErsteAbfrageMs };
}

console.log(`[latenz] Suche: ${QUERIES} Abfragen über searchMemories() …`);
const suche = await messeSuchen("alle Beine");

// ---------- Speichergröße & Meta ----------
store.close();
const dbMB = Number((fs.statSync(dbPfad).size / 1024 / 1024).toFixed(1));
fs.rmSync(ordner, { recursive: true, force: true });

const ergebnis = {
  datum: new Date().toISOString(),
  hardware: {
    modell: os.cpus()[0]?.model ?? "unbekannt",
    kerne: os.cpus().length,
    ramGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    node: process.version,
  },
  konfiguration: {
    erinnerungen: N,
    abfragen: QUERIES,
    vektorChunks: vektorChunks,
    vektorDimension: DIM,
    embedder: "lokaler Stub (deterministisch, 768 dim) — Engine-Pfad inklusive, Modellwartezeit nicht",
    verschluesselung: "aus (Default-Extensions, Klartext) — misst die Engine, nicht die Krypto",
    schreibpfad: "saveWithIndex (Produkt-Pfad: Chunks + FTS5 + Graph) in Transaktionen zu 1.000",
    suchpfad: "searchMemories() inkl. loadActive aller aktiven Erinnerungen je Abfrage + Reranking",
  },
  ingest: {
    produktPfadProSekunde: Number((N / (ingestMs / 1000)).toFixed(0)),
    produktPfadMs: ingestMs,
    rohPfadCreateMemoryProSekunde: Number(rawRate.toFixed(0)),
  },
  suche,
  dbMB,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(ergebnis, null, 2) + "\n");
console.log(`[latenz] OK → ${OUT} (DB ${dbMB} MB)`);
ollama.close();
