/* P145 — das Siegel des Beleg-Registers, an einem Ort, damit die Suite es fahren kann,
   ohne es nachzubauen.

   `docs/belege/REGISTER.md` weist zu jedem Mess-Artefakt Bytes und sha256(16) aus und
   verspricht damit: dieser Beleg ist dieser Lauf. Kontrolliert wurde das nicht — die
   Zahlen-Wache `scripts/zahlen-belege.mjs` oeffnet jedes zitierte Artefakt und verlangt
   die *Zahl* darin, nicht das Siegel. Gemessen 7.11. 01:39:50 MEZ wiesen damit 2 von 126
   Zeilen (1,6 %) Bytes aus, die auf keiner Datei der Platte standen, in beiden Faellen
   geschrieben im selben Commit wie die Datei selbst (4895aa9): die Laeufe waren nach dem
   Notieren noch einmal gefahren worden. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Erste Zelle: ein Pfad in Backticks, relativ zum Beleg-Ordner. */
const PFAD = /^`([^`]+)`$/;
/** Zweite Zelle: eine ganze Zahl mit moeglichen Tausendertrenn-Leerzeichen, dann " B". */
const BYTES = /^([\d  ]+) B$/;
/** Dritte Zelle: 16 Hex-Zeichen und die Auslassung, in Backticks — das Hausformat. */
const SHA = /^`([0-9a-f]{16})\u2026`$/;

/**
 * Die Siegel-Zeilen des Registers, in Lesereihenfolge, mit ihrer Zeilennummer.
 *
 * Gelesen wird nach BAUART, nicht nach Ueberschrift: das Register hat auch Ergebnis-
 * Tabellen (Hit@1 in Prozent), und nach einer Ueberschrift zu suchen war bis zum 7.11.
 * die uebersehene Stelle — genau dort liefen die Siegel unter einer fremden Tabelle
 * weiter. Die Ueberschneidung ist geheilt und wird von `blockKopfFunde` gehalten; an
 * der BAUART-Lesweise halte ich fest, weil ein Blatt mit mehreren Tabellen nicht
 * verlaesslich nach Ueberschriften zu parieren ist. Also: genau drei Zellen, und jede
 * muss ihre eigene Form haben.
 */
export function siegelZeilen(text) {
  const zeilen = [];
  text.split("\n").forEach((roh, i) => {
    const t = roh.trim();
    if (!t.startsWith("|")) return;
    const zellen = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((z) => z.trim());
    if (zellen.length !== 3) return;
    const pfad = PFAD.exec(zellen[0]);
    const bytes = BYTES.exec(zellen[1]);
    const sha = SHA.exec(zellen[2]);
    if (!pfad || !bytes || !sha) return;
    zeilen.push({ zeile: i + 1, pfad: pfad[1], bytes: Number(bytes[1].replace(/ /g, "")), sha: sha[1] });
  });
  return zeilen;
}

/** Zellen einer Markdown-Tabellenzeile, oder null, wenn es keine Tabellenzeile ist. */
function zellen(roh) {
  const t = (roh || "").trim();
  if (!t.startsWith("|")) return null;
  return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((z) => z.trim());
}

const TRENNZEILE = (z) => z.length > 0 && z.every((c) => /^:?-{2,}:?$/.test(c));

/**
 * Steht jede Siegel-Zeile unter ihrer eignen Kopfzeile?
 *
 * P145 meldete den Befund, P150 haelt ihn: seit dem 3.11. liefen die Siegel-Zeilen direkt unter
 * einer Ergebnistabelle mit vier Zellen weiter (`docs/belege/REGISTER.md`, Sprachuebergriff-
 * Abschnitt), und in Markdown hoeren sie damit fuer einen Leser nicht auf, Teil dieser Tabelle zu
 * sein — er sieht sha256-Präfixe in einer Hit@1-Spalte. Der Inhalt war durch die BAUART-Lesart des
 * Pruefers geschuetzt, das Blatt nicht. Ein Befund pro Block, der keine eigne Kopfzeile hat.
 */
export function blockKopfFunde(text) {
  const zeilen = text.split("\n");
  const siegel = new Set(siegelZeilen(text).map((z) => z.zeile));
  const funde = [];
  zeilen.forEach((roh, i) => {
    const nr = i + 1;
    if (!siegel.has(nr)) return;
    if (siegel.has(nr - 1)) return; // kein Blockanfang, sondern die Fortsetzung
    const vorher = zellen(zeilen[i - 1]);
    if (vorher && TRENNZEILE(vorher) && vorher.length === 3) {
      const kopf = zellen(zeilen[i - 2]);
      if (kopf && kopf.length === 3 && !TRENNZEILE(kopf)) return; // Kopf + Trennzeile + Siegel
      funde.push(`Zeile ${nr}: Siegelblock unter einer Trennzeile ohne dreizelligen Kopf (Zeile ${nr - 2})`);
      return;
    }
    if (vorher && vorher.length !== 3) {
      // fremde Tabelle: ihr Kopf ist die erste Zeile des zusammenhaengenden Blocks
      let k = i - 1;
      while (k > 0) {
        const c = zellen(zeilen[k - 1]);
        if (!c || c.length !== vorher.length) break;
        k -= 1;
      }
      funde.push(
        `Zeile ${nr}: Siegelblock beginnt unter Zeile ${k + 1}: Kopf bei Zeile ${k + 1} mit ${vorher.length} Zellen — ` +
          "fuer einen Leser gehoeren die Siegel zu dieser Tabelle, nicht zu einer eignen",
      );
      return;
    }
    const vorgaenger = vorher ? `einer Tabellenzeile mit ${vorher.length} Zellen` : "Fliesstext";
    funde.push(`Zeile ${nr}: Siegelblock ohne Kopfzeile, direkt unter ${vorgaenger} (Zeile ${i})`);
  });
  return funde;
}

/**
 * Jede Siegel-Zeile gegen den Byte, den sie ausweist. Ein Befund pro Zeile als eine
 * Zeile Text; ein leeres Feld ist das einzige saubere Urteil.
 */
export function siegelPruefen(wurzel, text) {
  const funde = [];
  for (const z of siegelZeilen(text)) {
    const absolut = path.join(wurzel, z.pfad);
    let inhalt;
    try {
      inhalt = fs.readFileSync(absolut);
    } catch {
      funde.push(`Zeile ${z.zeile}: ${z.pfad} fehlt auf der Platte — das Register weist ${z.bytes} B und sha ${z.sha} aus`);
      continue;
    }
    if (inhalt.length !== z.bytes) {
      funde.push(`Zeile ${z.zeile}: ${z.pfad} wiegt ${inhalt.length} B, ausgewiesen sind ${z.bytes} B`);
    }
    const gemessen = crypto.createHash("sha256").update(inhalt).digest("hex").slice(0, 16);
    if (gemessen !== z.sha) {
      funde.push(`Zeile ${z.zeile}: ${z.pfad} hat sha ${gemessen}, ausgewiesen ist sha ${z.sha}`);
    }
  }
  return funde;
}
