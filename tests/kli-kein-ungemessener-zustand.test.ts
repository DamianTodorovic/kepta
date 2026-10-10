// Z2 / R8 — kein Satz auf dem Schirm behauptet einen Zustand, den dieser Lauf
// nicht gemessen hat. Der Härtetest ist die Prüffrage aus D2: mit
// KEPTA_ENCRYPTION=off darf nirgends „encrypted" stehen außer „NOT encrypted".
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { KeptaStore } from "../src/core/store";
import { defaultExtensions } from "../src/core/extensions";
import { remember } from "../src/cli-erlebnis";
import { bild, lauf, notizenSetzen, ohneFarbe, pfadOhneClaude, sandkiste, speicher } from "./kli-helfer";

/** D2-04 war gemessen: setup endete in JEDEM Lauf mit „local, encrypted and unlimited". */
describe("Z2 — die Verschlüsselung aus, jede Fläche redet davon anders", () => {
  const flaechen: [string, string[]][] = [
    ["stats", []],
    ["recall", ["weber"]],
    ["timeline", ["weber"]],
    ["contradict", []],
    ["remember", ["Notiz über Weber"]],
    ["ui", []],
    ["help", []],
    ["--version", []],
    ["", []],
    ["setup", ["--yes"]],
  ];

  for (const [befehl, args] of flaechen) {
    it(`“kepta ${[befehl, ...args].join(" ")}" benutzt das Wort nur, wo es NOT heisst`, async () => {
      const k = sandkiste();
      k.umgebung.KEPTA_ENCRYPTION = "off";
      // setup ruft im echten Leben `claude` auf und schreibt Client-Configs —
      // hier gekappt, damit der Pfad nicht in den echten Dateien landet.
      if (befehl === "setup") k.umgebung.PATH = pfadOhneClaude();
      if (befehl === "recall" || befehl === "timeline") notizenSetzen(k, ["Ms. Weber is billed quarterly, never monthly"]);
      const l = await lauf([befehl, ...args], k);
      const funde = ohneFarbe(`${l.aus}\n${l.fehl}`)
        .split("\n")
        .filter((z) => /encrypted/i.test(z) && !/NOT encrypted/i.test(z));
      expect(funde, `Behauptet „encrypted" bei ausgeschalteter Verschlüsselung:\n${funde.join("\n")}`).toEqual([]);
    });
  }

  it("setup verspricht keine Grenzenlosigkeit, die es nicht geprüft hat", async () => {
    const k = sandkiste();
    k.umgebung.PATH = pfadOhneClaude();
    const l = await lauf(["setup", "--yes"], k);
    expect(l.code, l.fehl).toBe(0);
    const text = `${l.aus}\n${l.fehl}`.toLowerCase();
    expect(text).not.toMatch(/unlimited/);
    expect(text).not.toMatch(/no limits/);
  });
});

/** D2-10: der Leerzustand erzählte eine Bedingung, die schon erfüllt war. */
describe("Z2 — der leere Treffer sagt, was gemessen ist", () => {
  it("er behauptet kein Ollama, während er die Notizen zählt", async () => {
    const s = speicher();
    const { aus } = await bild(s, "recall", ["Zauberpilz"]);
    const text = ohneFarbe(aus);
    expect(text).not.toMatch(/with Ollama running/i);
    // Gezählt ist die Datei: 0 Notizen, und die Suche lief ohne Vektoren.
    expect(text).toMatch(/0 notes/i);
    expect(text).toMatch(/next:/);
    s.close();
  });

  it("wo Notizen da sind, sagt er das auch", async () => {
    const s = speicher();
    remember(s, "Production runs on the Hetzner CX42 in Nuremberg", ["infra"]);
    const { aus } = await bild(s, "recall", ["Zauberpilz"]);
    expect(ohneFarbe(aus)).toMatch(/1 note/i);
    s.close();
  });
});

/** D2-11: „Nothing about AI yet" während die Notiz da ist — Wörter unter drei
 *  Buchstaben flogen still raus, und die leere Nadelmenge konnte nie treffen. */
describe("Z2 — timeline erfindet kein leeres Gedächtnis", () => {
  it("ein zu kurzes Thema heisst zu kurz, nicht nichts gefunden", async () => {
    const s = speicher();
    remember(s, "The AI assistant answers with AI-generated text about AI", ["ai"]);
    const { aus } = await bild(s, "timeline", ["AI"]);
    const text = ohneFarbe(aus);
    expect(text).not.toMatch(/Nothing about/i);
    expect(text).toMatch(/too short/i);
    expect(text).toMatch(/3 letters/i);
    s.close();
  });

  it("ein echtes Thema trifft wirklich", async () => {
    const s = speicher();
    remember(s, "The AI assistant answers with AI-generated text about AI", ["ai"]);
    const { aus } = await bild(s, "timeline", ["assistant"]);
    expect(ohneFarbe(aus)).toMatch(/1 entry/);
    s.close();
  });
});

/** D2-18: die Zeitreise-Behauptung stand im Drehbuch, nicht in der Datei. */
describe("Z2 — die Demo liest ihre Ergebnisse aus den Treffern", () => {
  it("was die Vergangenheit sagte, steht in der Notiz und nicht im Skript", async () => {
    const { starteDemoShow } = await import("../src/demo-show");
    const log: string[] = [];
    const original = console.log;
    console.log = (t = "") => void log.push(t);
    try {
      await starteDemoShow(["--fast"]);
    } finally {
      console.log = original;
    }
    const text = ohneFarbe(log.join("\n"));
    // Das Wort, das die Demo über die Vergangenheit behauptet, muss aus dem
    // Treffer kommen — hier: aus dem Inhalt der Notiz, die asOf liefert.
    const zeile = text.split("\n").find((z) => z.trim().startsWith("→") && /QUARTERLY/.test(z)) ?? "";
    expect(zeile, "kein Vergangenheits-Treffer auf dem Schirm:\n" + text).not.toBe("");
    expect(text).not.toMatch(/QUARTERLY was the truth/);
  });

  it("kein Satz der Demo nennt eine Zahl, die der Lauf nicht zählt", async () => {
    const { starteDemoShow } = await import("../src/demo-show");
    const log: string[] = [];
    const original = console.log;
    console.log = (t = "") => void log.push(t);
    try {
      await starteDemoShow(["--fast"]);
    } finally {
      console.log = original;
    }
    const text = ohneFarbe(log.join("\n"));
    expect(text).not.toMatch(/undefined|NaN/);
    const notizen = Number(text.match(/(\d+) notes? active/)?.[1]);
    expect(Number.isFinite(notizen), "keine gezählte Notizzahl").toBe(true);
    // Der Wegwerf-Bestand ist gemessen: 32 Korpus-Notizen plus zwei gespielte.
    expect(notizen).toBeGreaterThanOrEqual(33);
  });
});

/** D2-15: ohne Ort weiß ein Nutzer nicht, welche Datei er gerade repariert. */
describe("Z2 — stats sagt, welche Datei dieser Lauf gelesen hat", () => {
  it("der Pfad und die letzte Schreibzeit stehen da, weil sie gelesen wurden", async () => {
    const k = sandkiste();
    notizenSetzen(k, ["Ms. Weber is billed quarterly, never monthly"]);
    const l = await lauf(["stats"], k);
    const text = ohneFarbe(l.aus);
    expect(text).toMatch(/file\s+\S*kepta\.db/);
    expect(text).toMatch(/wrote\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(fs.existsSync(k.dbPfad), "die Datei, die stats nennt, existiert nicht").toBe(true);
  });
});

// D2-01/R2 an der härtesten Meldung des Produkts: der Konflikt „die Datei ist
// verschlüsselt, aber ihr Schlüssel ist nicht da". Sie war gemessen 250 Zeichen
// auf einer Zeile. Geändert werden darf ihre Bühne, nicht ihr Satz — der gehört
// F7. Die Prüfung holt sich den Satz deshalb aus dem Kern und vergleicht.
describe("der Kern-Konflikttext: gebrochen, nicht umgeschrieben", () => {
  it("keine Zeile länger als 80, das Wortlaut bleibt Wort für Wort erhalten", async () => {
    const k = sandkiste();
    notizenSetzen(k, ["Ms. Weber is billed quarterly, never monthly"]);
    // Dieselbe verschlüsselte Datei, kein Schlüssel: der Kern wirft seinen Satz.
    // So kommt der Vergleichstext aus dem Kern und nicht aus meinem Kopf.
    let kern = "";
    try {
      const konflikt = new KeptaStore(k.dbPfad, { ...defaultExtensions(), keys: { keyFor: () => null } });
      konflikt.close();
    } catch (e) {
      kern = e instanceof Error ? e.message : String(e);
    }
    expect(kern, "der Kern wirft den Konflikt nicht — Prüfung liefe ins Leere").toMatch(/encrypted/i);

    k.umgebung.KEPTA_ENCRYPTION = "off";
    const l = await lauf(["stats"], k);
    const meldung = ohneFarbe(l.fehl);
    for (const z of meldung.split("\n").filter((x) => x.trim())) {
      expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    }
    const zusammen = meldung.replace(/^\[kepta\]\s*/, "").replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ").trim();
    expect(zusammen, `der Satz wurde verändert:\n  erwartet: ${kern}\n  bekommen: ${zusammen}`).toBe(kern.replace(/\s+/g, " ").trim());
  });
});
