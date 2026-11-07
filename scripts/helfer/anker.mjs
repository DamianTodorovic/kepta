/* P154 — die Anker-Wache: ein `Datei:Zeile`-Zeuge muss zeigen, was er sagt.

   Drei Nächte lang war der häufigste eigne Fehler das Setzen von Ankern aus dem Kopf: P151
   schrieb `:158` statt :137/:165, P152 :131 statt :132, P153 hinterließ ein Heilungszug, der
   `messregel.mjs:15` auf :143 stehen ließ, während der describe auf :158 saß. Dazu zwei tote
   Zeiger, die die Wache am ersten Lauf fand: README.md:145 nennt
   `graph-fit-390-keine-verlust.test.ts:73`, die Datei heißt `.test.tsx`; und README.md:261 nannte
   `src/core/store.ts:1201` für das SQLCipher-Pragma — gemessen eine Leerzeile, das Pragma sitzt
   heute auf :1929 und im Erstcommit dieses Baums auf `281f5a1:src/core/store.ts:992`.

   Regel — drei Ankerformen, eine Prüfung:
     1. Baum-Anker   `pfad:Zeile` oder `pfad:Zeile-bis-Zeile`
     2. Kurzform     `:Zeile` — hängt sich an den nächstvorangehenden Anker derselben Blattzeile,
                     wenn der eine Zeile nannte, höchstens 120 Zeichen zurückliegt und kein `|`
                     (Zellgrenze) dazwischensteht; sonst erbt er den Commit des Vorbilds.
     3. Blob-Anker   `Commit:pfad:Zeile` — für eine Aussage über eine frühere Fassung; geprüft mit
                     `git show`, denn ein Beleg, den kein Leser öffnen kann, ist keiner.
   Jeder muss (1) eine Datei treffen, (2) eine Zeile innerhalb ihrer Länge nennen und (3) dort
   Inhalt finden: keine Leerzeile und kein nackter Schluss-Strich — die beiden Formen, in die ein
   verrutschter Anker fällt. Bei einem Bereich gilt der Anfang; das Ende darf den Block schließen
   (es muss existieren und darf nicht leer sein). Bewusste Zeiger auf eine Mock- oder
   Deklarationszeile sind erlaubt: verlangt wird Inhalt, nicht ein Fallanfang.

   Zwei blinde Stellen nennt die Wache beim Namen, statt sie zu verschweigen: eine Kurzform ohne
   Vorbild in derselben Zeile (sie ist nicht auflösbar, `kurzformVerwaisungen` zählt sie) und ein
   Pfad, der aus diesem Baum herauszeigt (absolut, `~`, `../`) — für ihn ist kein Zeuge zu holen.
   Ein Blob-Anker mit einer Kennung, die dieser Baum nicht hat, meldet dagegen: er ist hier nicht
   zu öffnen. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** Endungen, die ein Anker im Text tragen muss, damit er als Datei-Zeiger gilt. */
const ENDE = String.raw`(?:\.log\.txt|\.md|\.mjs|\.cjs|\.jsonl|\.json|\.tsx|\.ts|\.jsx|\.js|\.css|\.html|\.yml|\.yaml|\.sh)`;
const PFAD = String.raw`[A-Za-z0-9_.\/@-]+`;
const ZAHL = String.raw`\d{1,5}`;
const BEREICH = String.raw`(?::L? ?(?:[Zz]eilen? )?(?:(${ZAHL})(?:\s*[-–]\s*(${ZAHL}))?)?)?`;

/** Baum-Anker (1-3), Blob-Anker (4-7), Kurzform (8-9). */
const NENNUNG = new RegExp(
  `(${PFAD}${ENDE})${BEREICH}|([0-9a-f]{7,40}):(${PFAD}${ENDE})${BEREICH}|(?<![A-Za-z0-9.]):(${ZAHL})(?:\\s*[-–]\\s*(${ZAHL}))?`,
  "g",
);

/** Wurzelordner, in denen ein nackter Dateiname gesucht wird, wenn der relative Pfad nicht steht. */
const WURZELN = ["tests", "src", "server", "scripts", "docs"];

/** Wie weit eine Kurzform von ihrem Vorbild höchstens entfernt stehen darf, damit sie es meint. */
const NAHE = 120;

const leer = (s) => !s || !s.trim();
const schluss = (s) => /^\s*[)}\]]\s*[)}\]]*\s*;?\s*$/.test(s);
const ausserHaus = (n) => n.startsWith("/") || n.startsWith("~") || n.startsWith("../");

/** Zeilen eines Texts, ohne das leere Feld, das ein abschließender Umbruch hinterlässt. */
function zeilenVon(text) {
  const zeilen = text.split("\n");
  if (zeilen.length > 1 && zeilen.at(-1) === "") zeilen.pop();
  return zeilen;
}

/**
 * Die Anker eines Blatts in Lesereihenfolge: mit der gemeinten Datei (und ihrem Commit, wenn der
 * Anker einen nennt), der von-bis-Zeile und der Blattzeile, die ihn nennt — damit jeder Befund
 * dorthin zeigt, wo er nachzulesen ist.
 */
export function ankerInText(text) {
  const funde = [];
  String(text)
    .split("\n")
    .forEach((zeile, i) => {
      let vorbild = null;
      for (const m of zeile.matchAll(NENNUNG)) {
        const anfang = m.index;
        const [ganz, baum, von, bis, rev, blob, bVon, bBis, kurz, kBis] = m;
        let nennung, commit, start, ende;
        if (baum) {
          nennung = baum;
          commit = null;
          vorbild = { nennung, commit, bis: anfang + ganz.length, mitZeile: Boolean(von) };
          if (!von) continue; // ohne Zeilennummer darf die Nennung nur die Datei meinen
          start = Number(von);
          ende = bis ? Number(bis) : start;
        } else if (rev) {
          nennung = blob;
          commit = rev;
          vorbild = { nennung, commit, bis: anfang + ganz.length, mitZeile: Boolean(bVon) };
          if (!bVon) continue;
          start = Number(bVon);
          ende = bBis ? Number(bBis) : start;
        } else {
          const reichweite = Boolean(vorbild) && anfang - vorbild.bis <= NAHE && !zeile.slice(vorbild.bis, anfang).includes("|");
          if (!reichweite || !vorbild.mitZeile) continue; // verwaiste Kurzform: nicht aufloesbar
          nennung = vorbild.nennung;
          commit = vorbild.commit;
          start = Number(kurz);
          ende = kBis ? Number(kBis) : start;
        }
        funde.push({ nennung, commit, zeile: start, bis: ende, imBlatt: i + 1, roh: ganz });
      }
    });
  return funde;
}

/**
 * Kurzformen ohne Vorbild in derselben Zeile — die blinde Stelle der Regel, in Zahlen, damit sie
 * nicht wächst, ohne dass jemand danach fragt.
 */
export function kurzformVerwaisungen(text) {
  let zahl = 0;
  String(text)
    .split("\n")
    .forEach((zeile) => {
      let vorbild = null;
      for (const m of zeile.matchAll(NENNUNG)) {
        const [ganz, baum, von, , rev, , bVon] = m; // Elision: hier zaehlt nur, ob eine Zeile genannt war
        if (baum || rev) {
          vorbild = { bis: m.index + ganz.length, mitZeile: Boolean(von ?? bVon) };
          continue;
        }
        const reichweite = Boolean(vorbild) && vorbild.mitZeile && m.index - vorbild.bis <= NAHE && !zeile.slice(vorbild.bis, m.index).includes("|");
        if (!reichweite) zahl += 1;
      }
    });
  return zahl;
}

/** Kandidaten für eine Baum-Nennung: exakt, dann unter bekannten Wurzeln, dann im ganzen Baum. */
function kandidaten(wurzel, nennung, alle) {
  const direkt = path.resolve(wurzel, nennung);
  if (fs.existsSync(direkt) && fs.statSync(direkt).isFile()) return [direkt];
  const basis = path.basename(nennung);
  const unterWurzeln = [];
  for (const w of WURZELN) {
    const kandidat = path.join(wurzel, w, basis);
    if (fs.existsSync(kandidat) && fs.statSync(kandidat).isFile()) unterWurzeln.push(kandidat);
  }
  if (unterWurzeln.length) return unterWurzeln;
  return alle(basis);
}

/** Einmal je Baum und Basename der ganze Baum nach dem Namen — für nackte Nennungen. */
function BAUMSUCHE() {
  const cache = new Map();
  return (wurzel, basis) => {
    const schluessel = `${wurzel}|${basis}`;
    if (cache.has(schluessel)) return cache.get(schluessel);
    const gefunden = [];
    const durchsuche = (ordner) => {
      let eintraege;
      try {
        eintraege = fs.readdirSync(ordner, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of eintraege) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        const p = path.join(ordner, e.name);
        if (e.isDirectory()) durchsuche(p);
        else if (e.name === basis) gefunden.push(p);
      }
    };
    durchsuche(wurzel);
    cache.set(schluessel, gefunden);
    return gefunden;
  };
}

/**
 * Der Text, den ein Blob-Anker meint — aus genau diesem Baum, mit dem Commit der Nennung.
 * Eine Absage von git ist ein Befund; ein eigner Fehler wirft.
 */
function blobText(wurzel, commit, nennung) {
  try {
    return execFileSync("git", ["-C", wurzel, "show", `${commit}:${nennung}`], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // nur git's eigne Absage (Exit-Code plus stderr) ist ein Befund ueber das Blatt
    if (typeof e.status === "number" && e.stderr) return null;
    throw e; // ein eigner Fehler wirft, sonst meldet die Wache einen toten Anker statt ihres eigenen Bruchs
  }
}

/**
 * Befunde über die Anker eines Blatts, als Zeilen Text; ein leeres Feld ist das saubere Urteil.
 * `wurzel` ist der Baum, gegen den die Pfade und Blob-Kennungen gelöst werden.
 */
export function ankerFunde(wurzel, text) {
  const alle = BAUMSUCHE();
  const inhalte = new Map();
  const funde = [];
  for (const a of ankerInText(text)) {
    if (ausserHaus(a.nennung)) continue;
    const her = `Blattzeile ${a.imBlatt}: `;
    const genannt = a.commit ? `${a.commit}:${a.nennung}` : a.nennung;
    let zeilen;
    if (a.commit) {
      const ausDemBlob = blobText(wurzel, a.commit, a.nennung);
      if (ausDemBlob === null) {
        funde.push(`${her}${genannt}:${a.zeile} — diesen Blob gibt es in diesem Baum nicht (git show ${a.commit}:${a.nennung} scheitert)`);
        continue;
      }
      zeilen = zeilenVon(ausDemBlob);
    } else {
      const kinder = kandidaten(wurzel, a.nennung, (basis) => alle(wurzel, basis));
      if (kinder.length === 0) {
        funde.push(`${her}kennt die Datei nicht: ${a.nennung}:${a.zeile} — im Baum ist keine Datei dieses Namens`);
        continue;
      }
      if (kinder.length > 1) {
        funde.push(
          `${her}${a.nennung}:${a.zeile} nennt ${kinder.length} Dateien dieses Namens (${kinder
            .map((k) => path.relative(wurzel, k))
            .join(", ")}) — der Zeiger ist nicht eindeutig`,
        );
        continue;
      }
      const ziel = kinder[0];
      if (!inhalte.has(ziel)) inhalte.set(ziel, zeilenVon(fs.readFileSync(ziel, "utf8")));
      zeilen = inhalte.get(ziel);
      a.nennung = path.relative(wurzel, ziel);
    }
    const relativ = a.nennung;
    if (a.zeile > zeilen.length) {
      funde.push(`${her}${relativ}:${a.zeile} — die Datei hat ${zeilen.length} Zeilen`);
      continue;
    }
    if (leer(zeilen[a.zeile - 1])) {
      funde.push(`${her}${relativ}:${a.zeile} ist eine leere Zeile — hier sitzt kein Zeuge`);
      continue;
    }
    if (a.bis > a.zeile) {
      if (a.bis > zeilen.length) {
        funde.push(`${her}${relativ}:${a.bis} — der Bereich endet jenseits der Datei (${zeilen.length} Zeilen)`);
      } else if (leer(zeilen[a.bis - 1])) {
        funde.push(`${her}${relativ}:${a.bis} — das Bereichsende ist leer, der Block schließt früher`);
      }
      continue; // ein Schluss-Strich am Ende eines Bereichs ist sein letzter Strich, keine Drift
    }
    if (schluss(zeilen[a.zeile - 1])) {
      funde.push(`${her}${relativ}:${a.zeile} ist nur ein Schluss-Strich (${zeilen[a.zeile - 1].trim()}) — der Anker ist verrutscht`);
    }
  }
  return funde;
}
