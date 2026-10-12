/**
 * Der Umwelt-Vertrag. Er hält, was `tests/helfer/umwelt-basis.ts` verspricht: keine
 * Testdatei erbt eine Produktgrenze, die eine andere gelockert hat.
 *
 * Zwei Arme, weil einer nicht reicht:
 *  (1) die **Grundlage** — `setupFiles` setzt vor jeder Datei die Grundwerte (das heilt
 *      auch Dateien, die es nicht wissen, und fremde Feder darf ich nicht anfassen);
 *  (2) die **Wache** — eine Datei, die eine Grenze lockert, muss denselben Satz
 *      zurueckbauen. Der zweite Arm ist nicht uberfluessig: die Grundlage trennt nur
 *      *zwischen* Dateien, nicht *innerhalb* einer Datei, und ein Fall, der in demselben
 *      Lauf eine Grenze setzt und nicht zuruecknimmt, vergleicht am Ende seine eigenen
 *      fruehen Antworten gegen spaete.
 *
 * Fund, der hier steht, weil er ohne Wache wieder als Tuer-Streit erschiene (12.10.):
 * `tests/server.test.ts:145,170`, `tests/import-claude.test.ts:368`,
 * `tests/import-ordner.test.ts:333`, `tests/import-tabelle.test.ts:257`,
 * `tests/engine.test.ts:451,471`, `tests/mcp.test.ts:326`,
 * `tests/server-import-ersatz.test.ts` (`KEPTA_BACKUP_KEEP`) lockern Grenzen; sie bauen
 * zurueck (`vi.unstubAllEnvs()`), und dieser Vertrag sorgt dafuer, dass das so bleibt.
 * Ausnahmelisten gibt es keine: die Pruefung laeuft ueber den ganzen Baum.
 */
import fs from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { UMWELT_GRENZEN, UMWELT_GRUND, UMWELT_LAUFZEIT, umweltGrundlegen } from "./helfer/umwelt-basis";

const WURZEL = process.cwd();
const AUSSCHLUESS = new Set(["node_modules", ".git", "dist", "coverage", "test-results"]);
const EIGENE_FEDER = ["helfer/umwelt-basis.ts", "helfer/umwelt-setup.ts", "umwelt-vertrag.test.ts"];

/** Alle Dateien unter einem Ordner, relativ zur Wurzel, mit .ts-Endung. */
function dateien(ordner: string): string[] {
  const out: string[] = [];
  const lauf = (abs: string, relativ: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!e.isDirectory() && !e.name.endsWith(".ts")) continue;
      if (e.isDirectory() && AUSSCHLUESS.has(e.name)) continue;
      const rp = relativ ? `${relativ}/${e.name}` : e.name;
      if (e.isDirectory()) lauf(path.join(abs, e.name), rp);
      else out.push(rp);
    }
  };
  lauf(path.join(WURZEL, ordner), ordner === "." ? "" : ordner);
  return out;
}

/** Welche Schluessel die Datei schreibt — per `vi.stubEnv` oder direkt an `process.env`. */
function schreibt(text: string): string[] {
  const s = new Set<string>();
  for (const m of text.matchAll(/stubEnv\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) s.add(m[1]!);
  for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)/g)) s.add(m[1]!);
  for (const m of text.matchAll(/process\.env\[["']([A-Za-z_][A-Za-z0-9_]*)["']\]\s*=(?!=)/g)) s.add(m[1]!);
  return [...s];
}

function lies(text: string): string[] {
  const s = new Set<string>();
  for (const m of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*=)/g)) s.add(m[1]!);
  for (const m of text.matchAll(/process\.env\[["']([A-Za-z_][A-Za-z0-9_]*)["']\]/g)) s.add(m[1]!);
  return [...s];
}

/** Ein Zurueckbau gilt, wenn die Datei die Grenze zuruecknimmt, loescht oder schnuesst. */
function zurueckgebaut(text: string, schluessel: string): boolean {
  if (/vi\.unstubAllEnvs\(\)/.test(text) && new RegExp(`stubEnv\\(\\s*"${schluessel}"`).test(text)) return true;
  if (new RegExp(`delete process\\.env\\.${schluessel}\\b`).test(text)) return true;
  if (new RegExp(`delete process\\.env\\["'${schluessel}"'\\]`).test(text)) return true;
  // Zuruecksetzung aus einer gemerkten Variablen oder einem Schnappschuss
  if (new RegExp(`process\\.env\\.${schluessel}\\s*=\\s*[A-Za-z_][A-Za-z0-9_.\\[\\]]*`).test(text)) return true;
  if (new RegExp(`${schluessel}:\\s*process\\.env\\.${schluessel}`).test(text)) return true;
  if (new RegExp(`process\\.env\\[[^\\]]*${schluessel}[^\\]]*\\]\\s*=\\s*(wert|vorher|alt)`).test(text)) return true;
  if (/Object\.entries\((vorgemerkt|vorher|umgebung|snapshot)/.test(text) && /process\.env\[name\]/.test(text)) return true;
  return false;
}

/** Die Befunde eines Ordners: eine Datei lockert eine Grenze, ohne sie zurueckzubauen. */
function befundeAus(ordner: string): { datei: string; schluessel: string; leser: string[] }[] {
  const namen = dateien(ordner).filter((n) => !EIGENE_FEDER.some(e => n.endsWith(e)));
  const texte = new Map(namen.map((n) => [n, readFileSync(path.join(WURZEL, n), "utf-8")]));
  const out: { datei: string; schluessel: string; leser: string[] }[] = [];
  for (const [name, text] of texte) {
    for (const schluessel of schreibt(text)) {
      if (!UMWELT_GRENZEN.includes(schluessel)) continue; // KEPTA_NO_AUTOSTART ist eine Sicherung, keine Lockerung
      if (zurueckgebaut(text, schluessel)) continue;
      const leser = [...texte.entries()]
        .filter(([anderer, t]) => anderer !== name && lies(t).includes(schluessel))
        .map(([anderer]) => anderer);
      out.push({ datei: name, schluessel, leser });
    }
  }
  return out;
}

describe("umwelt-vertrag: keine Datei erbt eine Grenze, die eine andere gelockert hat", () => {
  it("die Grundlage ist verdrahtet — `setupFiles` nennt sie, und sie ist eine Datei", () => {
    const konfig = readFileSync(path.join(WURZEL, "vitest.config.ts"), "utf-8");
    expect(konfig, "vitest.config.ts setzt keine setupFiles — der Vertrag waere ein Kommentar").toMatch(/setupFiles:\s*\[[^\]]*umwelt-setup\.ts/);
    expect(() => readFileSync(path.join(WURZEL, "tests/helfer/umwelt-setup.ts"), "utf-8")).not.toThrow();
  });

  it("die Grundlage gilt in beide Richtungen: gesetzt wird der Grundwert, zurueckkommt das Vorher", () => {
    const umgebung: Record<string, string | undefined> = {
      KEPTA_MAX_ACTIVE: "3",
      KEPTA_WRITE_GATE: "on",
      KEPTA_NO_AUTOSTART: undefined,
    };
    const zurueck = umweltGrundlegen(umgebung);
    expect(umgebung.KEPTA_MAX_ACTIVE, "die Kappe wurde nicht auf den Grundwert gesetzt").toBeUndefined();
    expect(umgebung.KEPTA_WRITE_GATE, "die Schleuse wurde nicht auf den Grundwert gesetzt").toBeUndefined();
    expect(umgebung.KEPTA_NO_AUTOSTART, "die Autostart-Sicherung fehlt — beim Import wuerde ein echter Server auf 3000 starten").toBe("1");
    zurueck();
    expect(umgebung.KEPTA_MAX_ACTIVE).toBe("3");
    expect(umgebung.KEPTA_WRITE_GATE).toBe("on");
  });

  it("der ganze Baum ist sauber — jede lockernde Datei baut zurueck", () => {
    const funde = befundeAus("tests").filter((f) => !f.datei.includes("/fixtures/"));
    expect(
      funde.map((f) => `${f.datei} lockert ${f.schluessel}, ohne zurueckzubauen (Leser: ${f.leser.join(", ") || "keine"})`),
      `${funde.length} Datei(en) verlassen eine lockere Umwelt — die naechste Datei in diesem Fork erbt sie`
    ).toEqual([]);
  });

  it("die Wache findet etwas: ein gesetzter Fall, der eine Grenze lockert und eine Datei davon abhaengt", () => {
    // Ohne diesen Nachweis ist der Vertrag ein Kommentar mit dem Wort Vertrag.
    const funde = befundeAus("tests/fixtures/umwelt");
    expect(funde.length, "der gesetzliche Fall wurde nicht gefunden").toBeGreaterThan(0);
    const setzer = funde.find((f) => f.datei.endsWith("locker-ohne-rueckbau.fixture.ts"));
    expect(setzer, "der gesetzliche Setzer fehlt in der Meldung").toBeDefined();
    expect(setzer!.schluessel).toBe("KEPTA_MAX_ACTIVE");
    expect(setzer!.leser.join(" "), "die abhaengige Datei wird nicht genannt").toContain("liest-die-grenze.fixture.ts");
  });

  it("die Autostart-Sicherung wird nirgends geloescht — sie ist kein Fall von Lockerung", () => {
    const geloescht = dateien("tests")
      .filter((n) => !EIGENE_FEDER.some((e) => n.endsWith(e)))
      .filter((n) => /delete process\.env\.KEPTA_NO_AUTOSTART|KEPTA_NO_AUTOSTART\s*=\s*(undefined|["']["'])/.test(readFileSync(path.join(WURZEL, n), "utf-8")));
    expect(geloescht, `${geloescht.length} Datei(en) loeschen die Autostart-Sicherung — ein Import ohne sie startet einen echten Server`).toEqual([]);
    expect(Object.keys(UMWELT_GRUND).length, "die Grundlage nennt weniger Schluessel als die Wache prueft + 1")
      .toBe(UMWELT_GRENZEN.length + 1);
    expect(UMWELT_LAUFZEIT.NODE_ENV, "die Betriebsart ist ohne Begruendung freigegeben").toMatch(/setzt ihn nicht/);
  });

  it("die Grundlage deckt jede Grenze ab, die in diesem Repo gelesen wird", () => {
    // Ein key, den der Kern liest und den die Grundlage nicht kennt, waere eine Luecke
    // im Vertrag — gefunden durch einen Suchlauf ueber server.ts und src/.
    const gelesen = new Set<string>();
    for (const quelldatei of ["server.ts", "src/core/store.ts", "src/core/engine.ts", "src/core/mcp.ts", "src/core/embeddings.ts", "src/core/cli.ts", "src/core/import-claude.ts", "src/core/import-ordner.ts", "src/core/import-tabelle.ts"]) {
      const p = path.join(WURZEL, quelldatei);
      let text = "";
      try {
        text = readFileSync(p, "utf-8");
      } catch {
        continue; // diese Quelle existiert nicht (mehr) — kein Grund, der Vertrag blinzelt
      }
      for (const m of text.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) gelesen.add(m[1]!);
      for (const m of text.matchAll(/process\.env\[["']([A-Z_][A-Z0-9_]*)["']\]/g)) gelesen.add(m[1]!);
    }
    const fehlen = [...gelesen].filter((k) => !(k in UMWELT_GRUND) && !(k in UMWELT_LAUFZEIT));
    expect(
      fehlen.sort(),
      `die Kern-Quellen lesen ${fehlen.join(", ")} — die Grundlage kennt diese Grenze nicht, also vererbt sie die Suite weiter`
    ).toEqual([]);
  });
});
