// Die Kapsel-Rueckgabe ausserhalb eines Laufs — Aufgabe #112, zweite Haelfte.
//
// Warum hier und nicht in der Kapsel selbst: `tests/setup.kapsel.ts` legt pro
// Testdatei ein eigenes HOME an (gemessen 26.10.: 104 922 Ordner, 16,66 GiB unter
// $TMPDIR; zwei Volllaeufe legten 1 729 neue an). Ein Exit-Handler darin wurde
// 22:28 Uhr gefahren und nachgemessen — die Ordner blieben stehen (1 199 vor zwei
// Dateien, 1 201 nachher), weil der Fork-Pool seine Kinder mit einem Signal beendet
// und `exit` dann nicht laeuft. Der einzige Prozess, der diesen Lauf ueberlebt und
// alle seine Kinder kennt, ist der Parent, der ihn gestartet hat: das ist diese
// Datei.
//
// Was sie tut: vor dem Lauf ein Manifest-Ordner fuer genau diesen Lauf anlegen und
// seinen Pfad in die Umgebung stellen, damit jedes Kind seine Kapsel dort eintragen
// kann; nach dem Lauf jede Kapsel zurueckgeben, die (a) im Manifest steht, (b) ein
// unmittelbares Kind von $TMPDIR ist und (c) mit `kepta-kapsel-` beginnt. Eine
// Liste, die einen andern Pfad nennt, wird nicht angefasst — geloescht wird nur,
// was dieser Lauf selbst ausgewuerfelt hat.
//
// Zwei Laeufe kommen sich nicht in die Quere: das Manifest traegt Lauf-Marke und
// Parent-Pid, und ein Lauf liest ausschliesslich seine eigne Liste.
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KAPSEL_PRAEFIX = "kepta-kapsel-";

export default async function kapselRueckgabe() {
  const start = Date.now();
  const markt = join(tmpdir(), "kepta-kapseln", `${start}-${process.pid}`);
  const grund = tmpdir();
  let tragfahig = true;
  try {
    mkdirSync(markt, { recursive: true });
    process.env.KEPTA_KAPSEL_MANIFEST = markt;
  } catch {
    // Kein Manifest: die Kapseln werden weiter angelegt (sie sind die Isolation
    // selbst), aber niemand raehmt sie hinterher. Das ist der Stand vor diesem
    // Schlag — meldepflichtig, nicht schweigend hingenommen.
    tragfahig = false;
    console.warn("[kapsel-rueckgabe] Manifest nicht anlegbar — Kapseln bleiben in dieser Runde liegen");
  }

  return async function rueckgabe() {
    if (!tragfahig) return;
    let geloescht = 0;
    let verschont = 0;
    let fehler = 0;
    let eintraege: string[];
    try {
      eintraege = readdirSync(markt);
    } catch {
      console.warn("[kapsel-rueckgabe] Manifest nicht lesbar — nichts geloescht");
      return;
    }
    for (const eintrag of eintraege) {
      // Ein unmittelbares Kind von $TMPDIR, mit dem eignen Präfix, sonst nichts.
      if (!eintrag.startsWith(KAPSEL_PRAEFIX) || eintrag.includes("/") || eintrag.includes("..")) {
        verschont++;
        continue;
      }
      const pfad = join(grund, eintrag);
      try {
        if (!existsSync(pfad)) continue;
        if (!statSync(pfad).isDirectory()) { verschont++; continue; }
        rmSync(pfad, { recursive: true, force: true });
        geloescht++;
      } catch {
        fehler++;
      }
    }
    try {
      rmSync(markt, { recursive: true, force: true });
    } catch {
      fehler++;
    }

    // Die zweite Quelle derselben Klasse: vierzig Testdateien werfeln eigne Tempel-
    // Ordner unter andern Praefixen (`kepta-embed-`, `kepta-engine-`, `kepta-ext-` …)
    // und geben sie nicht zurueck. Statt vierzig Dateien zu verbiegen, fegt dieser
    // Parent, was **waehrend seines eignen Laufs** unter $TMPDIR mit dem Haus-Praefix
    // `kepta-` entstanden ist — und nur, wenn kein zweiter vitest-Lauf lebt. Die
    // Zeitkante ist der Schutz vor fremder Arbeit: ein Ordner, der vor diesem Lauf
    // da war, bleibt stehen (dafür ist scripts/raeume-stapel.mjs mit Altersschwelle).
    let gefegt = 0;
    let fremdeLaeufe = 0;
    try {
      const tafel = execFileSync("/bin/ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" })
        .split("\n")
        .map((z) => z.trim().split(/\s+/))
        .filter((t) => t.length >= 3 && Number.isFinite(Number(t[0])))
        .map((t) => ({ pid: Number(t[0]), ppid: Number(t[1]), args: t.slice(2).join(" ") }));
      const eltern = new Map(tafel.map((r) => [r.pid, r.ppid]));
      const meine = new Set<number>([process.pid]);
      // Meine Vorfahren: `npm test` -> `sh -c vitest run` -> dieser Parent. Einer von
      // ihnen ist kein Nebenlauf, er ist der Auftrag zu diesem Lauf.
      let oben = process.pid;
      for (let i = 0; i < 12 && oben; i++) {
        oben = eltern.get(oben) ?? 0;
        if (oben) meine.add(oben);
      }
      // Und meine Kinder, über drei Generationen.
      for (let tiefe = 0; tiefe < 3; tiefe++) {
        for (const r of tafel) if (meine.has(r.ppid)) meine.add(r.pid);
      }
      fremdeLaeufe = tafel.filter((r) => /vitest/.test(r.args) && !meine.has(r.pid)).length;
    } catch {
      fremdeLaeufe = 1; // die Sonde selbst ist kein Grund zu fegen
    }
    if (fremdeLaeufe === 0) {
      for (const eintrag of readdirSync(grund)) {
        if (!eintrag.startsWith("kepta-") || eintrag.startsWith(KAPSEL_PRAEFIX)) continue;
        const pfad = join(grund, eintrag);
        try {
          const st = statSync(pfad);
          // Die Kante ist die **Geburts**-Zeit, nicht die Aenderungszeit: ein Ordner,
          // der vor diesem Lauf entstand und waehrend ihm beschrieben wird, gehoert
          // nicht diesem Lauf. Auf einem Dateisystem ohne birthtime zaehlt die
          // Aenderungszeit mit — dann bleibt der Sweep konservativ.
          const geboren = st.birthtimeMs > 0 ? st.birthtimeMs : st.mtimeMs;
          if (!st.isDirectory() || geboren < start - 1000) continue;
          rmSync(pfad, { recursive: true, force: true });
          gefegt++;
        } catch {
          fehler++;
        }
      }
    }

    const zeit = new Date().toLocaleTimeString("en-GB", { hour12: false, timeZone: "Europe/Berlin" });
    console.log(
      `[kapsel-rueckgabe] ${geloescht} Kapseln zurueckgegeben, ${verschont} verschont, ${gefegt} Tempel-Ordner gefegt` +
        `${fremdeLaeufe ? ` (Sweep aus: ${fremdeLaeufe} fremde vitest-Laeufe)` : ""}, ${fehler} Fehler — ${zeit}`
    );
  };
}
