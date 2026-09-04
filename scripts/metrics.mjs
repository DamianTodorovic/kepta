// Sammelt die Zahlen, die es ohne Telemetrie schon gibt.
//
// KEPTA misst seine Nutzer bewusst nicht — der Server bindet an 127.0.0.1 und
// sonst nichts. Belege gibt es trotzdem: npm zaehlt Downloads, GitHub zaehlt
// Sterne, Klone, Seitenaufrufe und Release-Downloads. Genau diese Zahlen sehen
// sich Geldgeber bei quelloffenen Projekten an.
//
// Aufruf:  node scripts/metrics.mjs           lesbare Uebersicht
//          node scripts/metrics.mjs --json    Rohdaten zum Weiterverarbeiten
//
// Sterne und Downloads gehen ohne Anmeldung. Klone und Seitenaufrufe verlangen
// Schreibrechte am Repo; liegt ein Token in GITHUB_TOKEN oder ist die GitHub-CLI
// angemeldet, werden sie mitgeholt, sonst bleiben sie leer.

import { execFileSync } from "node:child_process";

const REPO = "DamianTodorovic/kepta";
const NPM = "kepta-mcp";
const PYPI = "kepta";
const MCP_NAME = "io.github.DamianTodorovic/kepta";

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  for (const bin of [process.env.GH_PATH, "gh"].filter(Boolean)) {
    try {
      return execFileSync(bin, ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { /* naechster Versuch */ }
  }
  return null;
}

const TOKEN = token();

async function gh(pfad) {
  const kopf = { "User-Agent": "kepta-metrics", Accept: "application/vnd.github+json" };
  if (TOKEN) kopf.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}${pfad}`, { headers: kopf });
  if (!res.ok) return { fehler: `${res.status}` };
  return res.json();
}

async function json(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "kepta-metrics" } });
    if (!res.ok) return { fehler: `${res.status}` };
    return await res.json();
  } catch (e) {
    return { fehler: e.message };
  }
}

const [repo, releases, views, clones, npmTag, npmWoche, npmMonat, pypi, registry] = await Promise.all([
  gh(""),
  gh("/releases?per_page=100"),
  gh("/traffic/views"),
  gh("/traffic/clones"),
  json(`https://api.npmjs.org/downloads/point/last-day/${NPM}`),
  json(`https://api.npmjs.org/downloads/point/last-week/${NPM}`),
  json(`https://api.npmjs.org/downloads/point/last-month/${NPM}`),
  json(`https://pypi.org/pypi/${PYPI}/json`),
  json(`https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(MCP_NAME)}/versions/latest`),
]);

const releaseListe = Array.isArray(releases) ? releases : [];
const proDatei = new Map();
let downloadsGesamt = 0;
for (const r of releaseListe) {
  for (const a of r.assets ?? []) {
    downloadsGesamt += a.download_count;
    const system = /mac/.test(a.name) ? "macOS" : /win/.test(a.name) ? "Windows" : /linux|AppImage|deb/.test(a.name) ? "Linux" : "sonstige";
    proDatei.set(system, (proDatei.get(system) ?? 0) + a.download_count);
  }
}

const daten = {
  erhoben: new Date().toISOString(),
  github: {
    sterne: repo.stargazers_count ?? null,
    forks: repo.forks_count ?? null,
    watcher: repo.subscribers_count ?? null,
    offeneIssues: repo.open_issues_count ?? null,
    releaseDownloads: downloadsGesamt,
    downloadsProSystem: Object.fromEntries(proDatei),
    releases: releaseListe.length,
    // Klone und Aufrufe decken die letzten 14 Tage ab — GitHub speichert nicht laenger.
    // ACHTUNG bei den Klonen: GitHub zaehlt jeden CI-Checkout mit. Bei mehreren
    // Release-Laeufen pro Tag stammt der Grossteil aus den eigenen Workflows, nicht
    // von Menschen. Die ehrlichere menschliche Zahl sind die eindeutigen Aufrufer.
    aufrufe14Tage: views.count ?? null,
    aufruferEindeutig: views.uniques ?? null,
    klone14Tage: clones.count ?? null,
    klonerEindeutig: clones.uniques ?? null,
  },
  npm: {
    paket: NPM,
    tag: npmTag.downloads ?? null,
    woche: npmWoche.downloads ?? null,
    monat: npmMonat.downloads ?? null,
  },
  pypi: { paket: PYPI, version: pypi?.info?.version ?? null },
  mcpRegistry: {
    name: registry?.server?.name ?? registry?.name ?? null,
    version: registry?.server?.version ?? registry?.version ?? null,
  },
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(daten, null, 2));
} else {
  const z = (w, n) => `  ${String(w).padEnd(26)} ${n ?? "—"}`;
  console.log(`\nKEPTA — Zahlen vom ${daten.erhoben.slice(0, 16).replace("T", " ")}\n`);
  console.log("GitHub");
  console.log(z("Sterne", daten.github.sterne));
  console.log(z("Forks", daten.github.forks));
  console.log(z("Watcher", daten.github.watcher));
  console.log(z("Seitenaufrufe (14 Tage)", daten.github.aufrufe14Tage === null ? "— (Token noetig)" : `${daten.github.aufrufe14Tage} (${daten.github.aufruferEindeutig} eindeutig)`));
  console.log(z("Klone (14 Tage)", daten.github.klone14Tage === null ? "— (Token noetig)" : `${daten.github.klone14Tage} (${daten.github.klonerEindeutig} eindeutig) — enthaelt CI-Checkouts`));
  console.log(z("Release-Downloads", `${daten.github.releaseDownloads} (nur noch bestehende Releases)`));
  for (const [s, n] of Object.entries(daten.github.downloadsProSystem)) console.log(z(`  davon ${s}`, n));
  console.log("\nnpm — " + daten.npm.paket);
  console.log(z("gestern", daten.npm.tag));
  console.log(z("letzte 7 Tage", daten.npm.woche));
  console.log(z("letzte 30 Tage", daten.npm.monat));
  console.log("\n  Belastbar als Mensch-Signal: eindeutige Aufrufer und npm-Downloads.");
  console.log("  Klone enthalten CI, Sterne sind traege, Release-Downloads zaehlen nur");
  console.log("  bestehende Releases — geloeschte nehmen ihre Zaehler mit.");
  console.log("\nWeitere Kanaele");
  console.log(z("PyPI", `${daten.pypi.paket} ${daten.pypi.version ?? ""}`));
  console.log(z("MCP-Registry", daten.mcpRegistry.name ? `${daten.mcpRegistry.name} ${daten.mcpRegistry.version}` : "nicht gefunden"));
  console.log();
}
