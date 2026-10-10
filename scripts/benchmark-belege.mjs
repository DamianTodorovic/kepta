// Benchmark-Belege: jede Qualitaetszahl in einem Papier haengt an einem Record —
// und der Record muss den STAND nennen, der ausgeliefert wurde.
//
// WARUM DAS EIGENEN CODE BRAUCHT: die Hauswache fragte bisher nur "steht die Zahl im
// Text". Am 10.10. war genau das der falsche Anspruch — die Serie in
// tools/longmemeval/ergebnisse/ war gegen 2.13.x gelaufen, ausgeliefert war 3.2.0
// (audit-2026-10-09/Q1-BENCHMARK-QUALITAET.md:34-35, 101). Ein Wächter, der eine
// erledigte Zahl *verlangt*, ist schlimmer als keiner: er zwingt die Doku zurück zur
// unredlichen Aussage. Hier gilt deshalb die Richtung umgekehrt:
//
//   Zahl da?    -> nur erlaubt, wenn ein Record sie trägt UND dessen kepta_version
//                  gleich der Version aus package.json ist — oder der Satz nennt die
//                  Lauf-Version und das Papier erklärt offen, dass der Nachlauf
//                  gegen den ausgelieferten Stand aussteht.
//   Zahl weg?   -> nur erlaubt als BEWUSSTER Rückzug: derselbe Erklärsatz, mit der
//                  ausgelieferten Version darin. "vergessen" und "zurückgezogen"
//                  abgeben nicht mehr dasselbe Bild.
//
// Umfang, ehrlich benannt: diese Regel greift die LongMemEval-Serie — sie ist die
// einzige mit Version in den Records. Ablation und `scripts/eval.ts` (Zeilen mit
// "71 %"/"78 %") haben noch keine versionierten Records; das ist eine offene Scheibe,
// kein grüner Befund.
import fs from "node:fs";
import path from "node:path";

const ERKLARUNG = /no score is quoted|kein Qualitaetswert|keine Qualitaetszahl|nicht als Messwert|nicht mehr als messwert/i;

/** Die Version, die dieses Repo ausliefert — package.json, nicht gefühlt. */
export function ausgelieferteVersion(wurzel = process.cwd()) {
  return String(JSON.parse(fs.readFileSync(path.join(wurzel, "package.json"), "utf-8")).version);
}

/**
 * Alle LongMemEval-Records mit ihrer Lauf-Version und den zwei Größen, die in
 * Papieren stehen dürfen.
 * @returns {{datei: string, version: string, prozente: number[], fragen: number}[]}
 */
export function rekorde(wurzel = process.cwd(), ordner = path.join("tools", "longmemeval", "ergebnisse")) {
  const voll = path.join(wurzel, ordner);
  if (!fs.existsSync(voll)) return [];
  const funde = [];
  for (const name of fs.readdirSync(voll).filter((f) => f.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(path.join(voll, name), "utf-8"));
    const b = j.bericht || {};
    const version = String(b.kepta_version ?? j.kepta_version ?? "unbekannt");
    const prozente = [];
    for (const feld of ["genauigkeit_gesamt", "verbatim_quote"]) {
      const wert = Number(b[feld]);
      if (Number.isFinite(wert)) prozente.push(Math.round(wert * 1000) / 10);
    }
    funde.push({ datei: `${ordner}/${name}`, version, prozente, fragen: Number(b.fragen ?? 0) });
  }
  return funde.sort((a, b) => a.datei.localeCompare(b.datei));
}

/** Prozente, die hier als unser Ergebnis auftreten. Fremde Vergleichszahlen (Zep, Mem0) nicht. */
export function eigeneProzente(text) {
  const benchmark = /longmemeval|bestwert|wörtlich|woertlich|verbatim|trefferquote|genauigkeit|accuracy/i;
  const fremd = /\bzep\w*\b|getzep|\bmem0\b|langmem|byterider|\blumine\b/i;
  const funde = [];
  text.split("\n").forEach((zeile, i) => {
    // Eine Zielgroesse ("Ziel: >= 70 %") ist keine Messbehauptung und braucht
    // keinen Record — sie verspricht nichts ueber einen gelaufenen Stand.
    if (!benchmark.test(zeile) || fremd.test(zeile) || /\bziel\b|\bgoal\b|zielwert/i.test(zeile)) return;
    for (const m of zeile.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*%/g)) {
      const wert = Number(m[1].replace(",", "."));
      if (Number.isFinite(wert)) funde.push({ prozent: wert, zeile: i + 1, satz: zeile.trim() });
    }
  });
  return funde;
}

/**
 * Der Zustand, den ein Papier verlassen muss: erklärte Zahl oder erklärter Rückzug.
 * Die Erklärung muss die ausgelieferte Version nennen — sonst ist sie Prosa, kein Stand.
 */
export function erklaert(text, version) {
  const absaetze = text.split(/\n\s*\n/).filter((a) => ERKLARUNG.test(a));
  if (absaetze.length === 0) return { ok: false, grund: 'kein Erklärsatz ("no score is quoted" / "kein Qualitaetswert") — die Zahl fehlt, ohne dass der Rückzug dastünde' };
  const mitVersion = absaetze.filter((a) => a.includes(version));
  if (mitVersion.length === 0) {
    return { ok: false, grund: `kein Erklärabsatz nennt die ausgelieferte Version ${version}`, saetze: absaetze.map((a) => a.trim().slice(0, 120)) };
  }
  return { ok: true, satz: mitVersion[0].trim().replace(/\s+/g, " ").slice(0, 160) };
}

/**
 * Die Prüfung eines Papiers gegen die Records.
 * @param {{text: string, datei: string, rekorde: ReturnType<typeof rekorde>, version: string}} eingabe
 * @returns {string[]} Fehler, leer wenn das Papier sich belegt
 */
export function pruefePapier({ text, datei, rekorde: alle, version }) {
  const funde = eigeneProzente(text);
  const erklaerung = erklaert(text, version);

  if (funde.length === 0) {
    // Keine eigene Zahl im Papier. Das ist nur dann in Ordnung, wenn der Rückzug
    // dasteht — sonst ist es die alte Krankheit in anderer Reihenfolge: die Zahl
    // fehlt, und niemand merkt, ob sie fehlt, weil sie bewusst weg ist oder weil
    // sie keiner nachgetragen hat.
    if (!erklaerung.ok) return [`${datei}: nennt keine Qualitaetszahl, erklaert den Rückzug aber nicht — ${erklaerung.grund}`];
    return [];
  }

  const fehler = [];
  for (const f of funde) {
    const tragend = alle.filter((r) => r.prozente.some((p) => Math.abs(p - f.prozent) < 0.06));
    if (tragend.length === 0) {
      fehler.push(`${datei}:${f.zeile} nennt ${f.prozent} %, aber kein Record in tools/longmemeval/ergebnisse/ trägt diesen Wert — Zahl ohne Beleg`);
      continue;
    }
    const aktuelle = tragend.filter((r) => r.version === version);
    if (aktuelle.length > 0) continue; // Zahl vom ausgelieferten Stand: in Ordnung
    const versionImSatz = tragend.some((r) => f.satz.includes(r.version));
    if (versionImSatz && erklaerung.ok) continue; // alter Wert, aber als solcher benannt und erklärter Rückzug
    fehler.push(
      `${datei}:${f.zeile} nennt ${f.prozent} % — getragen nur von Records mit kepta_version ` +
        `${[...new Set(tragend.map((r) => r.version))].join("/")}, ausgeliefert ist ${version}. ` +
        (versionImSatz
          ? "Die Lauf-Version steht im Satz, aber der Rückzug ist nicht erklärt: " + erklaerung.grund
          : "Der Satz nennt die Lauf-Version nicht, und ohne sie ist die Zahl eine Behauptung über den aktuellen Stand.")
    );
  }
  return fehler;
}
