// Die Einstellungen lagen bis 2.10 als settings.json im Klartext neben der
// Datenbank — mit dem KI-Zugangsschluessel darin. Beim ersten Start wandern sie
// in die Datenbank (mit ihr verschluesselt). Die Datei wird erst genullt und
// entfernt, wenn jeder Wert so wieder herauskommt, wie er hineinging; was schon
// in der Datenbank steht, gewinnt. Eine unlesbare Datei bleibt unberuehrt liegen.
import fs from "fs";
import type { KeptaStore } from "../../src/core/store";

export function uebernimmSettingsDatei(store: KeptaStore, datei: string): number {
  let roh: string;
  let alt: unknown;
  try {
    roh = fs.readFileSync(datei, "utf-8");
    alt = JSON.parse(roh);
  } catch {
    return 0;
  }
  if (!alt || typeof alt !== "object" || Array.isArray(alt)) return 0;
  const vorhanden = store.einstellungen();
  const neu: Record<string, string> = {};
  for (const [k, v] of Object.entries(alt as Record<string, unknown>)) {
    if (typeof v === "string" && k.length > 0 && k.length <= 120 && !(k in vorhanden)) neu[k] = v.slice(0, 20000);
  }
  if (Object.keys(neu).length) store.setzeEinstellungen(neu);
  const danach = store.einstellungen();
  if (Object.entries(neu).some(([k, v]) => danach[k] !== v)) return 0;
  try {
    const laenge = Buffer.byteLength(roh);
    const fd = fs.openSync(datei, "r+");
    try {
      fs.writeSync(fd, Buffer.alloc(laenge), 0, laenge, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.rmSync(datei, { force: true });
  } catch {
    // Nicht entfernbar: die Werte stehen schon in der Datenbank, beim naechsten Start neuer Versuch.
  }
  return Object.keys(neu).length;
}
