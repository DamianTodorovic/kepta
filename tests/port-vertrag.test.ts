// Die Wache ueber den Port-Vertrag dieser Suite.
//
// Der Vertrag, den `vitest.config.ts` bis 12.10. hielt, war: **eine Datei nach der
// andern**, weil mehrere Testdateien eigene Server starten und zwei sich ins Gehege
// gerieten — und weil eine von ihnen einen geschriebenen Port hatte. Dieser Fall haelt
// jetzt die andere Seite: **jede Datei, die horcht, bekommt ihren Port aus ihrem
// Namen**, und zwar so, dass ein Konflikt hoerbar scheitert, statt still auf einen
// freien Ausweichport zu gehen oder — schlimmer — den Server eines anderen Laufs zu
// bedienen und gut auszusehen.
//
// Warum das eine Wache sein muss und kein Kommentar: ohne sie kann morgen eine Datei
// `const PORT = 8811` zurueckbringen, die Suite bleibt gruen, und der naechste
// Parallel-Lauf misst gegen den Nachbarn. Genau der Fall, der 11.10. als „POST mit
// ungueltiger ID -> 400 bekam 401" aussah.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { HORCHENDE_KENNUNGEN, PORT_AUSNAHME, PORT_BASIS, PORT_BEREICH, portErzwingen, portFuerDatei, portFuerHorer, portZulaessig } from "./helfer/port-vergabe";

const wurzel = process.cwd();

/** Jede Datei unter tests/, die einen Port selbst nennt — literal oder ueber die Vergabe. */
function dateienMitLiteralPort(): { datei: string; zeile: number; grund: string }[] {
  const funde: { datei: string; zeile: number; grund: string }[] = [];
  const muster = [/\.listen\(\s*(\d{2,5})\b/, /\bconst\s+PORT\s*=\s*(\d{2,5})\b/];
  const durchlauf = (ordner: string) => {
    for (const eintrag of fs.readdirSync(path.join(wurzel, ordner), { withFileTypes: true })) {
      const relativ = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) {
        if (eintrag.name !== "node_modules") durchlauf(relativ);
        continue;
      }
      if (!/\.(test\.ts|ts)$/.test(eintrag.name)) continue;
      // Die Vergabe selbst und ihre Wache muessen Zahlen zeigen duerfen.
      if (relativ.endsWith("helfer/port-vergabe.ts") || relativ.endsWith("port-vertrag.test.ts")) continue;
      const text = fs.readFileSync(path.join(wurzel, relativ), "utf-8").split("\n");
      text.forEach((zeile, i) => {
        for (const re of muster) {
          const m = zeile.match(re);
          if (m && !/\blisten\(\s*0\s*[,)]/.test(zeile)) {
            funde.push({ datei: relativ, zeile: i + 1, grund: `${m[0].trim()} — Port ${m[1]}` });
          }
        }
      });
    }
  };
  durchlauf("tests");
  return funde;
}

/** Wie viele Testdateien ueberhaupt den Server importieren — der Boden unter dem Fall. */
function importierendeServerDateien(): number {
  const must = /from "\.\.\/server"|import\("\.\.\/server"\)/;
  let n = 0;
  const durchlauf = (ordner: string) => {
    for (const e of fs.readdirSync(path.join(wurzel, ordner), { withFileTypes: true })) {
      const relativ = path.join(ordner, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") durchlauf(relativ);
        continue;
      }
      if (e.name.endsWith(".test.ts") && must.test(fs.readFileSync(path.join(wurzel, relativ), "utf-8"))) n++;
    }
  };
  durchlauf("tests");
  return n;
}

describe("port-vertrag: jede horchende Datei bekommt ihre Zahl aus ihrem Namen", () => {
  it("keine Testdatei nennt einen Port als Zahl", () => {
    const funde = dateienMitLiteralPort();
    expect(
      funde.map((f) => `${f.datei}:${f.zeile} ${f.grund}`),
      `${funde.length} Datei(en) horchen auf eine geschriebene Zahl — das ist der geteilte Port, der die Suite seriell hielt`
    ).toEqual([]);
  });

  it("der Port einer Datei ist dieselbe Zahl in jedem Lauf", () => {
    const datei = "tests/server-einstellungs-maske.test.ts";
    const einmal = portFuerDatei(datei);
    expect(portFuerDatei(datei)).toBe(einmal);
    expect(portFuerDatei(datei)).toBe(einmal);
    // Und er haengt nicht an der Schreibweise des Pfads, sondern an der Datei.
    expect(portFuerDatei("./tests/server-einstellungs-maske.test.ts")).not.toBe(0);
  });

  it("die Vergabe bleibt im Fenster und meidet die Nachbarn", () => {
    // 200 Namen durch die Funktion — nicht weil sie zufaellig waeren, sondern weil
    // ein Bereich, der nur fuer eine Datei paßt, morgen umfaellt.
    const namen = Array.from({ length: 200 }, (_, i) => `tests/datei-${i}.test.ts`);
    const ports = namen.map(portFuerDatei);
    for (const p of ports) {
      expect(p).toBeGreaterThanOrEqual(PORT_BASIS);
      expect(p).toBeLessThan(PORT_BASIS + PORT_BEREICH);
      expect(PORT_AUSNAHME).not.toContain(p);
      expect(portZulaessig(p)).toBe(true);
    }
    // Kollisionen im Fenster: bei 200 Namen in 4 000 Plaetzen sind ein paar normal,
    // was die Wache verlangt, ist die Groessenordnung — und dass die echten
    // horchenden Dateien untereinander frei bleiben.
    expect(new Set(ports).size).toBeGreaterThan(150);
  });

  it("die Liste, die sagt, wer horcht, ist die Suite selbst — in beide Richtungen", () => {
    // Die Liste in `tests/helfer/port-vergabe.ts` ist der einzige Ort, an dem die Suite
    // weiss, wer auf welcher Zahl sitzt. Sie war per Hand gepflegt und wurde von einem
    // Satz als gewaehnt bezeichnet, den keine Wache hielt. Das ist die gefaehrliche Art
    // von Vertrag: waechst die Suite, bleibt die Liste stehen, und zwei Dateien horchen
    // auf derselben Zahl — was wie ein Produktfehler aussieht, der keiner ist.
    const ruft: string[] = [];
    for (const name of fs.readdirSync(path.join(wurzel, "tests"))) {
      if (!name.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(path.join(wurzel, "tests", name), "utf8");
      // Zwei Formen, dasselbe Versprechen: die Datei nimmt ihren Port aus ihrem Namen —
      // ueber den Horcher-Helfer, oder direkt, weil sie ihren Server selbst hoert
      // (`tests/server-einstellungs-maske.test.ts`).
      for (const m of text.matchAll(/(?:hoererDerDatei|portFuerHorer)\(\s*["'`]([^"'`]+)["'`]/g)) ruft.push(m[1]!);
    }
    const ruftSet = [...new Set(ruft)].sort();
    expect(ruftSet.length, "kein einziger Aufruf von hoererDerDatei — dann prueft dieser Fall nichts").toBeGreaterThan(0);
    const gelistet = [...HORCHENDE_KENNUNGEN].sort();
    // Wer horcht, muss gelistet sein.
    expect(gelistet, `${ruftSet.filter((k) => !HORCHENDE_KENNUNGEN.includes(k)).join(", ")} horcht, fehlt aber in der Liste`)
      .toEqual(ruftSet);
    // Und ein Eintrag ohne Horcher macht rot — sonst verdeckt die Liste eine Datei, die
    // langst keine ist, und ihr Port bleibt reserviert.
    for (const kennung of HORCHENDE_KENNUNGEN) {
      expect(ruftSet, `Listeneintrag ${kennung} hat keinen Aufruf mehr in der Suite`).toContain(kennung);
    }
    // Verschiedene Zahlen, eine je Kennung.
    const ports = gelistet.map(portFuerHorer);
    expect(new Set(ports).size, `doppelte Port unter ${gelistet.length} Kennungen`).toBe(gelistet.length);
    for (const p of ports) expect(portZulaessig(p), `Port ${p} ausserhalb des erlaubten Fensters`).toBe(true);
  });

  it("keine Datei importiert den Server ohne die Automarke, die seinen Start verhindert", () => {
    // Der zweite Arm desselben Vertrags: `server.ts:1717` startet beim Import einen
    // echten Server auf `PORT ?? 3000`. Eine Suite-Datei, die ihn importiert, ohne
    // `KEPTA_NO_AUTOSTART = "1"` zu setzen, horcht also auf 3000 — und die 3000 ist
    // der Port, auf dem ein anderer Lauf, die Entwickler-Instanz oder ein fremder
    // Agent bedient wird. Das ist genau der Fall „400 bekommen die 401 des Nachbarn".
    const must = /from "\.\.\/server"|import\("\.\.\/server"\)/;
    const fehlend: string[] = [];
    const durchlauf = (ordner: string) => {
      for (const e of fs.readdirSync(path.join(wurzel, ordner), { withFileTypes: true })) {
        const relativ = path.join(ordner, e.name);
        if (e.isDirectory()) {
          if (e.name !== "node_modules") durchlauf(relativ);
          continue;
        }
        if (!e.name.endsWith(".test.ts")) continue;
        const text = fs.readFileSync(path.join(wurzel, relativ), "utf-8");
        if (must.test(text) && !/KEPTA_NO_AUTOSTART\s*=\s*"1"/.test(text)) fehlend.push(relativ);
      }
    };
    durchlauf("tests");
    expect(fehlend, `${fehlend.length} Datei(en) importieren server.ts ohne KEPTA_NO_AUTOSTART`).toEqual([]);
    // Die Wache darf nicht ins Leere laufen: ein Zaehlen der importierenden Dateien
    // macht sichtbar, ob der Fall ueberhaupt etwas sieht.
    expect(importierendeServerDateien(), "kein Test importiert server.ts — dann prueft dieser Fall nichts")
      .toBeGreaterThan(0);
  });

  it("ein belegter Port scheitert hoerbar, statt still auszuweichen", async () => {
    const datei = "tests/port-vertrag.test.ts";
    const port = portFuerDatei(datei);
    const besetzer = http.createServer((_anfrage, antwort) => antwort.end("fremder Lauf"));
    await new Promise<void>((los) => besetzer.listen(port, "127.0.0.1", () => los()));
    try {
      let fehler: Error | null = null;
      try {
        await portErzwingen(port, datei);
      } catch (e) {
        fehler = e as Error;
      }
      expect(fehler, `portErzwingen hat Port ${port} trotz Besetzer freigegeben`).not.toBeNull();
      expect(fehler!.message).toContain(String(port));
      expect(fehler!.message).toContain(datei);
      // Der Text nennt die Deutung, nicht nur den Errno — sonst steht in einem
      // Jahr ein EADDRINUSE im Bericht und niemand weiss, welcher Lauf ihn warf.
      expect(fehler!.message).toContain("portFuerDatei");
    } finally {
      await new Promise<void>((los) => besetzer.close(() => los()));
    }
  });

  it("der freie Fall geht durch — dieselbe helper-Funktion, eine Zeile Abstand", async () => {
    const port = portFuerDatei("tests/port-vertrag-frei.test.ts");
    await expect(portErzwingen(port, "tests/port-vertrag-frei.test.ts")).resolves.toBeUndefined();
  });
});
