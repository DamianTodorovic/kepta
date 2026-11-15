// Der Nachzug: dem Bestand das Netz geben, das sein Produzenten-Alter ihm schuldete.
//
// Warum diese Datei existiert: `indexMemory` verknuepft die eigene Notiz erst seit
// dem Paritaets-Commit (Kern `43aa0ba`, App-Zwilling davor). Was vorher geschrieben
// wurde — bei Damian 14.701 Notizen aus dem Rechner-Scan — steht bis heute als Blatt
// ohne Kante. Gemessen 15.10. durch die Tuer: 21.066 Notizen, 1.018 davon an einem
// Begriff = 4,83 %. Die Flaeche zeigt dafuer keinen Fehler, sondern genau das, was
// drin steht: einen Kreis vereinzelpter Punkte um einen kleinen Klumpen.
//
// A1x hat den Nachzug an der Kopie gefahren (`A1X-NACHZIEHEN-14702.md`) und vier
// Sachen gemessen, die dieser Weg hier übernimmt und nicht erfindet:
//   · 0,21–0,24 ms je Notiz, 3,1 s fuer 14.701 — ein Nachzug ist kein Grossprojekt
//   · idempotent: zwei Laeufe, derselbe Endstand (`verknuepfeNotiz` ist setzend)
//   · abbruchfest: je Notiz eine eigene Transaktion, zurueck bleibt ein gueltiger
//     Zwischenstand, kein halber Rand
//   · die Graph-Tuer antwortete waehrend des Laufs in 10–18 ms — WAL haelt Leser und
//     Schreiber auseinander, die App bedient sich selbst weiter
//
// Die fuenfte Sache ist neu und eine Wand: **vor dem ersten Strich liegt eine
// Sicherung.** `datenbanksicherung()` schrieb bisher nur vor einem ersetzten Import.
// Schlaegt sie fehl, wird hier nichts geschrieben — ein Rueckweg, den man nicht
// pruefen kann, ist keine Behauptung wert.
//
// Die Marke (`NACHZUG_MARKE`) haelt den Lauf an die Regel, nicht an den Kalender:
// wer die Begriffsregel aendert, hebt die Marke, und jede Installation fuellt ihr
// Netz noch einmal auf. Wer nichts aendert, faehrt denselben Stand kein zweites Mal.
import path from "node:path";
import type express from "express";
import { indexMemory } from "../../src/core/engine";
import { backupAufbewahrung, datenbanksicherung, halteSicherungen } from "../helfer/sicherung";
import type { AppKontext } from "../kontext";

/** Regelstand des Begriff-Produzenten. Erhoehen, sobald `begiffe.ts` anders liest. */
export const NACHZUG_MARKE = 1;

/** Notizen je Stapel. 500 sind ~100 ms — lang genug fuer Fortschritt, kurz genug fuer keinen Riegel. */
const NOTIZEN_PRO_STAPEL = 500;

const MARKE_FELD = "graphNachzugMarke";

interface NachzugLage {
  laeuft: boolean;
  phase: "idle" | "backup" | "indexing" | "done" | "aborted" | "refused" | "failed";
  gesehen: number;
  gesamt: number;
  start: { knoten: number; kanten: number } | null;
  sicherung: string | null;
  fehler: string | null;
}

const LEER: NachzugLage = {
  laeuft: false, phase: "idle", gesehen: 0, gesamt: 0, start: null, sicherung: null, fehler: null,
};

let lage: NachzugLage = { ...LEER };
let abbruch = false;

export function mountNachzug(app: express.Express, ctx: AppKontext): void {
  const { store } = ctx;

  const markeGesetzt = (): number => {
    const roh = store.einstellungen()[MARKE_FELD];
    const wert = Number(roh);
    return Number.isFinite(wert) && wert > 0 ? Math.floor(wert) : 0;
  };

  const antwort = () => {
    const bestand = store.graphBestand();
    const gesetzt = markeGesetzt();
    const notizen = store.countMemories().active;
    return {
      running: lage.laeuft,
      phase: lage.phase,
      seen: lage.gesehen,
      total: lage.gesamt,
      concepts: bestand.knoten,
      edges: bestand.kanten,
      addedConcepts: lage.start ? bestand.knoten - lage.start.knoten : 0,
      addedEdges: lage.start ? bestand.kanten - lage.start.kanten : 0,
      backupFile: lage.sicherung,
      error: lage.fehler,
      marke: NACHZUG_MARKE,
      markeGesetzt: gesetzt,
      // Ein leerer Bestand hat nichts aufzufuellen. Ohne diese Zeile hätte eine
      // frische Installation ihren ersten Graph-Besuch mit einer Sicherung und
      // einem leeren Lauf beantwortet.
      needed: gesetzt < NACHZUG_MARKE && notizen > 0,
    };
  };

  app.get("/api/graph/nachzug", (_req, res) => {
    res.json(antwort());
  });

  app.post("/api/graph/nachzug", ctx.limiter.write, (_req, res) => {
    if (lage.laeuft) {
      res.status(409).json({ ...antwort(), error: "A backfill is already running" });
      return;
    }
    const ids = ctx.listAllMemories().map((m) => m.id);
    if (ids.length === 0) {
      // Nichts zu schreiben, also auch keine Sicherung: ein leerer Bestand wird
      // nicht angefasst, und die Antwort sagt das, statt einen Lauf vorzuspielen.
      res.json({ started: false, total: 0, reason: "the store holds no notes to link" });
      return;
    }

    // Der Rueckweg vor der ersten Zeile Arbeit: fehlgeschlagene Sicherung =
    // fehlgeschlagener Auftrag, und der Bestand bleibt, wie er war.
    lage = { ...LEER, laeuft: true, phase: "backup", gesamt: ids.length };
    abbruch = false;
    const ziel = datenbanksicherung(store);
    if (!ziel) {
      lage = { ...LEER, phase: "refused", gesamt: ids.length, fehler: "No database backup could be written — the backfill refuses to touch the store without one" };
      res.status(503).json({ error: lage.fehler });
      return;
    }
    const raeum = halteSicherungen(path.dirname(ziel), backupAufbewahrung().behalten);
    lage = { ...lage, phase: "indexing", sicherung: ziel, start: store.graphBestand() };
    res.status(202).json({ started: true, total: ids.length, backup: ziel, keptBackups: raeum.gehalten });

    void (async () => {
      try {
        for (let i = 0; i < ids.length; i += NOTIZEN_PRO_STAPEL) {
          if (abbruch) {
            lage = { ...lage, laeuft: false, phase: "aborted" };
            ctx.markiereEigeneAenderung();
            return;
          }
          for (const id of ids.slice(i, i + NOTIZEN_PRO_STAPEL)) indexMemory(store, id);
          lage = { ...lage, gesehen: Math.min(i + NOTIZEN_PRO_STAPEL, ids.length) };
          // Der Stapel ist geschrieben; die Schleife abgeben, damit die Tuer
          // zwischen den Stapeln antworten kann statt erst am Ende.
          await new Promise((los) => setImmediate(los));
        }
        store.setzeEinstellungen({ [MARKE_FELD]: String(NACHZUG_MARKE) });
        lage = { ...lage, laeuft: false, phase: "done", gesehen: ids.length };
        ctx.markiereEigeneAenderung();
      } catch (e) {
        // Kein Marker, keine fertige Marke: beim naechsten Start wird erneut
        // angeboten, weil der Stand unvollstaendig ist.
        lage = { ...lage, laeuft: false, phase: "failed", fehler: e instanceof Error ? e.message : "backfill failed" };
        ctx.markiereEigeneAenderung();
      }
    })();
  });

  app.post("/api/graph/nachzug/cancel", ctx.limiter.write, (_req, res) => {
    abbruch = true;
    res.json({ cancelling: lage.laeuft });
  });
}
