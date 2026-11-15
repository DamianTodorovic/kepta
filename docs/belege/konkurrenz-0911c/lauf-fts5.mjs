// P179: SQLite FTS5 am selben 45-Anfragen-Korpus — das Lexik-Verfahren, das die
// lokalen Gedächtnis-Produkte unter der Haube fahren (better-sqlite3 baut FTS5
// standardmäßig ein; claude-mem und diverse MCP-Gedächtnis-Server dokumentieren
// SQLite als Speicher). Die Zeile misst das Verfahren, nicht ein Produkt — wie
// sqlite-vec und chroma (P110/P118).
//
// Faire Konfiguration, entschieden: FTS5 so, wie es aus der Schachtel kommt —
// Standard-Tokenizer unicode61 (kein Stemming, keine Stoppwörter), implizites
// UND über die Fragewörter, bm25-Rang. Die Frage wird nur von Satzzeichen
// befreit, sonst nichts. Indexiert wird der Notiz-Text (derselbe Weg wie im
// fairen mem0-Lauf: kein Titel, keine Tags, keine Metadaten-Zufuhr).
//
// Läuft mit dem Treiber der App (better-sqlite3-multiple-ciphers) in einer
// Kapsel-DB unter /tmp/kepta-fts5; rückgängig mit `rm -rf /tmp/kepta-fts5`.
// Kein Netz, kein Fremd-Paket.
import Database from "better-sqlite3-multiple-ciphers";
import fs from "node:fs";
import path from "node:path";

const BELEG = path.dirname(new URL(import.meta.url, "file://").pathname);
const LAUF = process.argv[2] === "zwei" ? "zwei" : "eins";
// Zwei Stufen, entschieden weil die Roh-Messung (20:22) zeigte, dass das UND
// der Schachtel an den Fragenwörtern stirbt ("Wo läuft die Produktion" verlangt
// wo AND läuft AND die AND produktion — die Notiz enthält wo/die nicht): das
// misst die Fragenwörter, nicht das Verfahren. Stufe "stopp" fährt die
// Minimal-Praxis, die jedes FTS5-Produkt fährt: Funktionswörter raus (kein
// Stemming, keine Synonyme, kein OR — sonst nichts).
const MODUS = ["stopp", "oder"].includes(process.argv[3]) ? process.argv[3] : "roh";
const SPUR = path.join(BELEG, `spur-fts5-0911-${MODUS}-${LAUF}.jsonl`);
const ERG = path.join(BELEG, `ergebnis-fts5-0911-${MODUS}-${LAUF}.json`);
const KAPSEL = `/tmp/kepta-fts5/run-${MODUS}-${LAUF}.db`;
const STOPP = new Set(("wo was wie welche wann wer die der das den dem ein eine einen ist sind waren ich " +
  "meine mein meinen zu in im auf für und oder von mit dem es sie er wir ihr über unter aus bei nach vor " +
  "what where when who whom which how the a an is are was were my i me do does did of in on for and or to with " +
  "am pm by at as that this these those there their his her its").split(" "));

const _K = JSON.parse(fs.readFileSync(path.join(BELEG, "korpus-aus-repo.json"), "utf8"));
const KORPUS = _K.korpus, FRAGEN = _K.fragen;

const zeit = () => new Date().toLocaleTimeString("de-DE");
const out = fs.createWriteStream(SPUR);
const schreibe = (z) => out.write(JSON.stringify(z) + "\n");

const t0 = Date.now();
schreibe({ art: "start", zeit: zeit(), verfahren: "fts5-unicode61-bm25", notizen: KORPUS.length, anfragen: FRAGEN.length });
console.log(`START ${zeit()} | FTS5 (${LAUF}) | Notizen ${KORPUS.length} | Anfragen ${FRAGEN.length}`);

fs.rmSync(KAPSEL, { force: true });
fs.mkdirSync(path.dirname(KAPSEL), { recursive: true });
const db = new Database(KAPSEL);
db.exec("CREATE VIRTUAL TABLE notizen USING fts5(id UNINDEXED, text)");
const einsetzen = db.prepare("INSERT INTO notizen (id, text) VALUES (?, ?)");
const tx = db.transaction(() => { for (const n of KORPUS) einsetzen.run(n.id, n.text); });
const tSetzen = Date.now();
tx();
console.log(`gesetzt ${KORPUS.length} in ${Date.now() - tSetzen} ms`);

// Die Frage von Satzzeichen befreit; im Modus "stopp" fallen danach die
// Funktionswörter — sonst nichts (kein Stemming, keine Anführungs-Phrase).
const frageZuMatch = (f) => {
  const tokens = f.frage.replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/);
  const geblieben = MODUS === "roh" ? tokens : tokens.filter((t) => !STOPP.has(t.toLowerCase()));
  if (geblieben.length === 0) return null;
  // Stufe "oder": die übliche Fallback-Praxis, wenn das UND stirbt — alle
  // Begriffe mit ODER verbinden, der bm25-Rang entscheidet.
  return MODUS === "oder" ? geblieben.join(" OR ") : geblieben.join(" ");
};
const suchen = db.prepare("SELECT id FROM notizen WHERE notizen MATCH ? ORDER BY rank LIMIT 5");

let treffer = 0, r5 = 0, leereListen = 0;
const nach_kat = {};
for (const q of FRAGEN) {
  const t = Date.now();
  const match = frageZuMatch(q);
  let liste = [];
  try {
    liste = suchen.all(match).map((r) => r.id);
  } catch (e) {
    schreibe({ art: "fehler", frage: q.frage, match, meldung: String(e.message).slice(0, 120) });
  }
  if (liste.length === 0) leereListen += 1;
  const top = liste[0] ?? null;
  const hit = top !== null && q.erwartet.includes(top);
  const in5 = liste.slice(0, 5).some((id) => q.erwartet.includes(id));
  treffer += hit ? 1 : 0;
  r5 += in5 ? 1 : 0;
  const k = q.kategorie;
  nach_kat[k] ??= [0, 0];
  nach_kat[k][0] += hit ? 1 : 0;
  nach_kat[k][1] += 1;
  schreibe({ art: "suche", frage: q.frage, kategorie: k, erwartet: q.erwartet, top, treffer: hit, liste, sek: (Date.now() - t) / 1000 });
  console.log(`Q: ${hit ? "TREFFER" : "daneben"} | ${q.frage.slice(0, 60)}`);
}

const n = FRAGEN.length;
const ergebnis = {
  lauf: `fts5-0911-${LAUF}`,
  zeit: zeit(),
  werkzeug: `SQLite FTS5 (${db.prepare("select sqlite_version() v").get().v})`,
  konfiguration: { tokenizer: "unicode61 (Standard)", modus: MODUS, semantics: MODUS === "oder" ? "ODER über die Begriffe (Fallback-Praxis), bm25-Rang" : "implizites UND" + (MODUS === "stopp" ? ", Funktionswörter entfernt" : ""), rang: "bm25 (Standard)", indexierter_text: "Notiz-Text", top_k: 5 },
  korpus: { notizen: KORPUS.length, anfragen: n },
  hit1: treffer,
  hit1_prozent: Math.round(1000 * treffer / n) / 10,
  recall5_in_den_5: r5,
  recall5_prozent: Math.round(1000 * r5 / n) / 10,
  leere_listen: leereListen,
  nach_kategorie: Object.fromEntries(Object.entries(nach_kat).map(([k, v]) => [k, `${v[0]}/${v[1]}`])),
  dauer_sek: Math.round((Date.now() - t0) / 100) / 10,
};
fs.writeFileSync(ERG, JSON.stringify(ergebnis, null, 1));
schreibe({ art: "fertig", ...ergebnis });
out.end();
console.log(JSON.stringify(ergebnis, null, 1));
