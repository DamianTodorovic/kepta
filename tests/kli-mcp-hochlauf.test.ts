// D2-19, D2-20, D2-21 — der Hochlauf, den ein Mensch sieht, wenn er
// `npx -y kepta-mcp` tippt. Gemessen stand dort der Datenbankpfad in zwei
// Zeilen, die Umwandlung von Klartext nach verschlüsselt als Beilsatz in einer
// Klammer, und danach Stille: kein Wort darüber, dass der Prozess auf einen
// MCP-Klienten wartet. Ein Mensch ohne Terminal weiß dann nicht, ob er succeeds
// or hangs.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { KeptaStore } from "../src/core/store";
import { APP_VERSION } from "../src/core/version";
import { lauf, ohneFarbe, sandkiste, stackZeilen } from "./kli-helfer";

describe("der stdio-Hochlauf", () => {
  it("nennt Version, Datei und Zustand in EINER Zeile — und den Pfad kein zweites Mal", async () => {
    const k = sandkiste();
    const l = await lauf([], k);
    expect(l.code, l.fehl).toBe(0);
    const zeilen = l.fehl.split("\n").filter((z) => z.trim() !== "");
    expect(stackZeilen(l.fehl), l.fehl).toEqual([]);
    const mitPfad = zeilen.filter((z) => z.includes(k.dbPfad));
    expect(mitPfad.length, `der Pfad steht ${mitPfad.length} Mal:\n${l.fehl}`).toBeLessThanOrEqual(1);
    const kopf = zeilen.find((z) => /kepta/.test(z)) ?? "";
    expect(kopf, `kein Kopf mit Version: ${l.fehl}`).toContain(APP_VERSION);
    expect(kopf).toMatch(/·/);
  });

  it("sagt dem Wartenden, worauf er wartet — und wie er herauskommt", async () => {
    const l = await lauf([], sandkiste());
    expect(l.fehl.toLowerCase()).toMatch(/waiting|stdin/);
    expect(l.fehl).toMatch(/ctrl\+c/i);
    expect(l.fehl).toMatch(/--help|help/);
  });

  it("jede Log-Zeile trägt dasselbe Präfix, keins nennt eine andere Senderin", async () => {
    const l = await lauf([], sandkiste());
    for (const z of l.fehl.split("\n").filter((x) => x.trim() !== "")) {
      expect(/^\[kepta\]/.test(z), `Log-Zeile ohne Präfix: ${z}`).toBe(true);
    }
    expect(l.fehl).not.toMatch(/\[kepta MCP\]/);
  });

  // Die Umwandlung ist ein Ereignis, kein Beilsatz: wer nicht weiß, dass seine
  // Datei eben umgeschrieben wurde, kann den Notfall nicht rekonstruieren.
  it("meldet eine Umwandlung von Klartext als eigene Zeile, nicht in einer Klammer", async () => {
    const k = sandkiste();
    fs.mkdirSync(path.dirname(k.dbPfad), { recursive: true });
    const vorher = new KeptaStore(k.dbPfad);
    vorher.close();
    expect(fs.readFileSync(k.dbPfad).subarray(0, 15).toString()).toBe("SQLite format 3");
    const l = await lauf([], k);
    const umgewandelt = l.fehl.split("\n").filter((z) => /converted|plaintext/i.test(z));
    expect(umgewandelt.length, `kein Ereignis-Text:\n${l.fehl}`).toBeGreaterThan(0);
    for (const z of umgewandelt) {
      expect(z, `das Ereignis steckt in einer Klammer: ${z}`).not.toMatch(/\([^)]*converted/);
      expect([...z].length, `länger als die Bühne: ${z}`).toBeLessThanOrEqual(80);
    }
  });
});

// D2-42: der ui-Block verwies auf „the website" ohne Adresse und nannte nur
// Enterprise — während README und App sagen, dass die KOSTENLOSE Desktop-App die
// Fläche mit Fenster ist. Ein Satz, der nach außen zeigt, nennt das Ziel beim
// Namen. Die Adresse ist nicht erfunden: sie ist der verifizierte origin-Remote
// dieses Repos (git remote get-url origin), und die App-Releases liegen dort.
describe("kepta ui — die Flächenfrage", () => {
  it("nennt Kern, kostenlose App und Enterprise, jede Zeile unter 80", async () => {
    const l = await lauf(["ui"], sandkiste());
    expect(l.code, l.fehl).toBe(0);
    const text = ohneFarbe(l.aus);
    for (const z of text.split("\n")) expect([...z].length, `länger als 80: ${z}`).toBeLessThanOrEqual(80);
    expect(text, text).toMatch(/has no window/i);
    expect(text, text).toMatch(/free desktop app/i);
    expect(text, "keine Adresse, auf die ein Mensch klicken kann").toMatch(/github\.com\/DamianTodorovic\/kepta\/releases/);
    expect(text, text).toMatch(/Enterprise .*by agreement/i);
    expect(text).not.toMatch(/see the website/);
    // Z2: ui misst nichts — also darf kein Zustandssatz fallen.
    expect(text.toLowerCase()).not.toMatch(/encrypted|unlimited/);
  });

  it("weist den Weg, statt nur abzustellen: die letzte Zeile ist ein next", async () => {
    const l = await lauf(["ui"], sandkiste());
    const zeilen = ohneFarbe(l.aus).split("\n").filter((z) => z.trim() !== "");
    expect(zeilen.at(-1) ?? "", l.aus).toMatch(/^next:/);
  });
});
