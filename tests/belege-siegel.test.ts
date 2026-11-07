/* P145 — das Siegel im Beleg-Register: Bytes und sha256, die kein Leser kontrolliert.

   `docs/belege/REGISTER.md` fuehrt zu jedem Mess-Artefakt eine Zeile mit Pfad, Bytes und
   sha256(16), und seine eigne Kopfzeile verspricht: "ein Beleg, den ein Kunde nicht oeffnen
   kann, ist kein Beleg". Geprueft wurde keins der beiden Felder: `scripts/zahlen-belege.mjs`
   oeffnet jedes zitierte Artefakt und verlangt die *Zahl* darin, nicht das Siegel.

   Gemessen 7.11. 01:39:50 MEZ mit einer Wegwerf-Sonde (/tmp/p145-sonde.mjs, dieselbe Lesart,
   spaeter hier importiert statt nachgebaut): **126** Siegel-Zeilen, davon **2** falsch —
   `tag-0311/eval-bge-m3-1404.log.txt` (Zeile 19: 6144 B ausgewiesen, 6199 B auf der Platte)
   und `tag-0311/sprachuebergriff-bge-m3-1406.log.txt` (Zeile 21: 2631 B gegen 2720 B). Beide
   Dateien und beide Zeilen stammen aus DEMSELBEN Commit (4895aa9, 3.2.126, 3.11.), also war
   das Siegel schon im Augenblick des Schreibens falsch: die Laeufe wurden nach dem Notieren
   noch einmal gefahren. Die ausgewiesenen Hashes passen zu keiner Datei im Ordner.

   Die Substanz ist nicht verloren: die Zahlen in diesen beiden Artefakten prueft die
   Zahlen-Wache nach wie vor, und sie steht gruen. Was fehlt, ist der Ausweis, dass dieser
   Beleg dieser Lauf ist — und ein Ausweis ohne Pruefer ist eine Behauptung. */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { siegelPruefen, siegelZeilen } from "../scripts/helfer/belege-siegel.mjs";

const BELEG = path.resolve(import.meta.dirname, "..", "docs/belege");
const sha16 = (text: string) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Eine Kapsel ausser Haus: der Pruefer darf nie auf dem echten Beleg-Ordner laufen. */
function inKapsel<T>(baustelle: (ordner: string) => T): T {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "belege-siegel-"));
  try {
    return baustelle(ordner);
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true });
  }
}

function zeile(pfad: string, bytes: number, sha: string) {
  return `| \`${pfad}\` | ${bytes} B | \`${sha}\u2026\` |`;
}

describe("P145, das Siegel: was die REGISTER-Zeile ausweist, muss auf der Platte stehen", () => {
  it("ein ehrliches Siegel meldet nichts — und wird als eine Zeile gelesen", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tag-0000"), { recursive: true });
      const inhalt = "lauf\n";
      fs.writeFileSync(path.join(ordner, "tag-0000", "a.log.txt"), inhalt);
      const register = [
        "| Datei im Repo | Bytes | sha256 (16) |",
        "|---|---|---|",
        zeile("tag-0000/a.log.txt", Buffer.byteLength(inhalt), sha16(inhalt)),
      ].join("\n");
      expect(siegelZeilen(register).length, "die Zeile wurde nicht als Siegel gelesen").toBe(1);
      expect(siegelPruefen(ordner, register), "ein ehrliches Siegel findet etwas").toEqual([]);
    });
  });

  it("eine andere Groesse auf der Platte wird beim Namen genannt, mit beiden Zahlen", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tag-0000"), { recursive: true });
      const wirklich = "6199 bytes hier\n";
      fs.writeFileSync(path.join(ordner, "tag-0000", "a.log.txt"), wirklich);
      // Ausgewiesen sind eine fremde Groesse UND der Hash eines fremden Inhalts — so entsteht
      // Drift in der Wirklichkeit: jede Groessen-Aenderung ist zugleich eine Inhalts-Aenderung,
      // also meldet der Pruefer beide Befunde. Gepraedt wird hier der Groessen-Befund; der
      // sha-Befund allein (gleiche Laenge, anderer Inhalt) steht im naechsten Fall.
      const register = zeile("tag-0000/a.log.txt", 6144, sha16("ein andrer Lauf"));
      const funde = siegelPruefen(ordner, register);
      const groessen = funde.filter((f) => /wiegt/.test(f));
      expect(groessen.length, `Groessen-Drift blieb ungemeldet: ${JSON.stringify(funde)}`).toBe(1);
      expect(groessen[0]).toContain("tag-0000/a.log.txt");
      expect(groessen[0]).toContain("6144");
      expect(groessen[0]).toContain(String(Buffer.byteLength(wirklich)));
    });
  });

  it("gleiche Groesse, anderer Inhalt: das sha-Siegel beisst allein", () => {
    inKapsel((ordner) => {
      fs.mkdirSync(path.join(ordner, "tag-0000"), { recursive: true });
      fs.writeFileSync(path.join(ordner, "tag-0000", "a.log.txt"), "aaaa\n");
      // ausgewiesen wird dieselbe Laenge, aber der Inhalt eines andern Laufs
      const register = zeile("tag-0000/a.log.txt", 5, sha16("bbbb\n"));
      const funde = siegelPruefen(ordner, register);
      expect(funde.length, `Inhalts-Drift bei gleicher Groesse blieb ungemeldet: ${JSON.stringify(funde)}`).toBe(1);
      expect(funde[0], `kein sha-Hinweis im Befund: ${funde[0]}`).toMatch(/sha/);
    });
  });

  it("eine ausgewiesene Datei, die nicht da ist, ist ein Befund, kein stiller Erfolg", () => {
    inKapsel((ordner) => {
      const register = zeile("tag-0000/fehlt.log.txt", 1234, "0123456789abcdef");
      const funde = siegelPruefen(ordner, register);
      expect(funde.length).toBe(1);
      expect(funde[0]).toMatch(/fehlt/);
    });
  });

  it("Tabellenkopf, Trennzeile und eine Zahlen-Tabelle sind keine Siegel", () => {
    const register = [
      "| Lauf | deutsch Hit@1 | englisch Hit@1 | nur Vektor-Bein, englisch |",
      "|---|---|---|---|",
      "| `sprachuebergriff-nomic-1406` (Standard-Embedder) | 60,0 % | **26,7 %** = 4 von 15 | 26,7 % |",
      "| Datei im Repo | Bytes | sha256 (16) |",
      "|---|---|---|",
      "| `tag-0311` | 6144 B | kein Hash |",
    ].join("\n");
    expect(siegelZeilen(register), `Nicht-Siegel wurden gelesen: ${JSON.stringify(siegelZeilen(register))}`).toEqual([]);
    expect(siegelPruefen(BELEG, register)).toEqual([]);
  });

  it("am echten Register: 126 Siegel-Zeilen, und keine ist falsch", () => {
    const text = fs.readFileSync(path.join(BELEG, "REGISTER.md"), "utf8");
    // Gemessen 7.11. 01:39:50 MEZ (Sonde) und hier nachgezaehlt: 126 Zeilen mit
    // Pfad + Bytes + sha(16). Wer ein Artefakt eintraegt oder loescht, zieht diese Zahl nach.
    expect(siegelZeilen(text).length, "die Grundgesamtheit der Siegel hat sich bewegt").toBe(126);
    expect(siegelPruefen(BELEG, text), "das Register weist Bytes aus, die nicht auf der Platte stehen").toEqual([]);
  });
});
