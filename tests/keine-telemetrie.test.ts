// @vitest-environment node
//
// P126 — "No account, no telemetry, no phone-home" (README.md:268) ist eine
// Maschine-Aussage, und die einzige Wache dafür war enger als der Satz:
// tests/core/boundary.test.ts:136 sucht URLs außerhalb von localhost nur in
// `src/core`. Dieses Blatt sucht in allem, was mitkommt (`src/`, `server/`,
// `main.ts`), und — das ist der Unterschied — es verbietet nicht jede
// fremde Adresse, weil 16 davon der Nutzer selbst wählt: die Anbieter-
// vorbelegung in `src/lib/ai.ts`. Erlaubt ist, was benannt und begründet
// ist; was sonst auftaucht, ist ein Anruf, den niemand gewählt hat.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const WURZEL = process.cwd();

function quelldateien(): string[] {
  const out: string[] = [];
  const geht = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (/node_modules|dist|release|test-results|\.git/.test(e.name)) continue;
        geht(p);
        continue;
      }
      if (/\.(ts|tsx|cjs|mjs|js)$/.test(e.name)) out.push(p);
    }
  };
  for (const o of ["src", "server"]) {
    const dir = path.join(WURZEL, o);
    if (fs.existsSync(dir)) geht(dir);
  }
  if (fs.existsSync(path.join(WURZEL, "main.ts"))) out.push(path.join(WURZEL, "main.ts"));
  return out;
}

/** Nicht-localhost-Hosts in einem Text, mit Datei und Zeile. */
function fremdeHoste(text: string, datei: string) {
  const funde: { host: string; datei: string; zeile: number; url: string }[] = [];
  for (const m of text.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)[^\s"'`)]*/g)) {
    const host = m[1]!;
    if (/^(127\.0\.0\.1|localhost|\[::1\])/.test(host)) continue;
    funde.push({ host, datei, zeile: text.slice(0, m.index!).split("\n").length, url: m[0]!.slice(0, 70) });
  }
  return funde;
}

/** Die Anbieter-Vorbelegung wird gelesen, nicht abgeschrieben. */
function vorgabeHosts(): Set<string> {
  const t = fs.readFileSync(path.join(WURZEL, "src/lib/ai.ts"), "utf-8");
  return new Set([...t.matchAll(/baseUrl:\s*'https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]!)
    .filter((h) => !/^(127\.0\.0\.1|localhost|\[::1\])/.test(h)));
}

/** Benannte Ausnahmen mit Grund — eine Toleranzliste ohne Grund wäre ein Versteck. */
const AUSNAHMEN: Record<string, string> = {
  "www.w3.org": "SVG-Namensraum in KeptaMark.tsx, kein Netzverkehr",
  "api.example.com": "Platzhalter in der Verbindungs-Maske (Settings.tsx), nie Adressziel",
  "spur.example": "Beispiel-URL in einem Kommentar der Bild-Politik",
  "kepta.local": "User-Agent-Text des Klippers (clip.ts), kein Ziel",
};

const ALLE = quelldateien();
const FUND = ALLE.flatMap((f) => fremdeHoste(fs.readFileSync(f, "utf-8"), path.relative(WURZEL, f)));
const VORGABE = vorgabeHosts();

describe("ferne Adressen in dem, was mitkommt", () => {
  it("die Sonde sieht die Vorbelegung wirklich", () => {
    expect(VORGABE.size, "src/lib/ai.ts nennt keine baseUrl-Hosts — die Sonde ist taub").toBeGreaterThan(10);
  });

  it("jede ferne Adresse ist Vorbelegung oder benannte Ausnahme", () => {
    const fremd = FUND.filter((f) => !VORGABE.has(f.host) && !(f.host in AUSNAHMEN));
    expect(fremd, `unbelegte Adressen im ausgelieferten Code:\n${fremd.map((f) => `  ${f.datei}:${f.zeile} ${f.url}`).join("\n")}`)
      .toEqual([]);
  });

  it("jede Vorbelegung ist wirklich im Code — kein Eintrag veraltet still", () => {
    const gefunden = new Set(FUND.map((f) => f.host));
    const spur = [...VORGABE].filter((h) => !gefunden.has(h));
    expect(spur, `Vorbelegung ohne Fund: ${spur.join(", ")}`).toEqual([]);
  });

  it("jede benannte Ausnahme liegt noch vor, sonst ist sie gestrichen", () => {
    const gefunden = new Set(FUND.map((f) => f.host));
    const tot = Object.keys(AUSNAHMEN).filter((h) => !gefunden.has(h));
    expect(tot, `Ausnahme ohne Fund, also zu streichen: ${tot.join(", ")}`).toEqual([]);
  });

  it("die Sonde faengt eine angebaute Telemetrie-Adresse (Kontrolle gegen gruenen Leerlauf)", () => {
    const angehaut = 'const k = fetch("https://telemetry.example.org/v1/event");';
    expect(fremdeHoste(angehaut, "probe.ts").map((f) => f.host)).toEqual(["telemetry.example.org"]);
  });

  it("localhost-Adressen bleiben erlaubt, ohne Zaehlung zu verraten", () => {
    const vor = FUND.length;
    expect(vor).toBeGreaterThan(0);
    expect(fremdeHoste('fetch("http://127.0.0.1:11434/api/tags")', "probe.ts")).toEqual([]);
  });
});

describe("die Zusage nach aussen nennt diese Wache", () => {
  // README.md:266 sagt "No account, no telemetry, no phone-home". Das ist dieselbe
  // Sorte Aussage, die vor diesem Blatt nur fuer src/core galt — der Leser darf
  // nicht aelter erfahren als die Maschine.
  const readme = fs.readFileSync(path.join(WURZEL, "README.md"), "utf-8").split("\n");
  // Nur der Gratis-App-Satz ist hier belegt. README.md:181 ("No license server, no
  // phone-home") gehoert zum Absatz ueber die verwaltete Enterprise-Ausfaltung, und
  // Enterprise ist auf Damians Wort zu (5.11. 13:24 MEZ) — dort wird auch Text nicht
  // angefasst. Die Zensus-Liste oben gilt trotzdem auch fuer diesen Pfad, weil sie
  // ausgelieferten Code liest, nicht Absaetze.
  const saetze = readme.filter((z) => /no account, no telemetry, no phone-home/i.test(z));

  it("der Satz ueber telemetrie und phone-home steht weiter da", () => {
    expect(saetze.length, "der Satz ist verschwunden — die Wache sieht nichts mehr").toBeGreaterThan(0);
  });

  it("er nennt die Wache ueber ferne Adressen", () => {
    const mit = saetze.filter((z) => z.includes("tests/keine-telemetrie.test.ts"));
    expect(mit.length, `keine Wache genannt:\n  ${saetze.map((s) => s.slice(0, 170)).join("\n  ")}`).toBe(saetze.length);
  });
});

describe("die Zaehlung dieses Laufs", () => {
  // Die Zahl steht jetzt auch nach aussen im README (Zeile 266). Sie ist hier
  // festgehalten, damit eine Aenderung an der Netzflaeche nicht still durchgeht:
  // wer einen Anbieter-Host hinzufigt oder streicht, sieht diesen Fall rot und
  // muss die Liste neu lesen, statt die Zahl nachzuziehen.
  it("ferne Adressen und Hosts sind die Zahl dieses Laufs", () => {
    expect(FUND.length, `fund ${FUND.length} ferne Adressen` ).toBe(26);
    expect(new Set(FUND.map((f) => f.host)).size).toBe(20);
    expect(ALLE.length, `${ALLE.length} Dateien gelesen`).toBeGreaterThan(140);
  });
});
