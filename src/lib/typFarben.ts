// P196b: die Typ-Farben — die Wahl des Menschen gilt EXAKT auf der Fläche.
//
// Erste Fassung (heute früh): jede Wahl wurde angenommen, aber ihre Helligkeit
// wurde auf die Lesbarkeits-Leiter geführt — der gespeicherte Ton sah anders aus
// als die Wahl. Damian, 22:32: „ich kann nicht die Farben nehmen die ich nehmen
// möchte." Richtig: der PUNKT und der Karten-Grat tragen den Roh-Ton, exakt wie
// gewählt; nur wo die Farbe als SCHRIFT steht (Typ-Etikett in der Liste), trägt
// eine automatisch abgeleitete, lesbare Fassung (`--type-<rolle>-text`).

export const TYP_ROLLEN = ["semantic", "episodic", "procedural", "reference"] as const;
export type TypRolle = (typeof TYP_ROLLEN)[number];

const SCHLUESSEL = "kepta_type_colors";
/** #070708 Tisch, #38383a Blatt — die beiden dunklen Papiere des Themas. */
const PAPIERE = [0.00213, 0.0396];

/** Zerlegt `#rrggbb` in drei Kanäle 0..255 — oder null. */
function kanäle(wert: string): [number, number, number] | null {
  const m = (wert || "").trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const stück = m[1];
  const zwei = (i: number) => parseInt(stück.slice(i, i + 2), 16);
  return [zwei(0), zwei(2), zwei(4)];
}

/** relative Helligkeit (WCAG), 0..1 */
export function leuchtkraft(hex: string): number | null {
  const trio = kanäle(hex);
  if (!trio) return null;
  const srgb = (n: number) => { const s = n / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const [r, g, b] = trio.map(srgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Hält der Ton als Schrift auf beiden dunklen Papieren 4,5:1? */
export function tintetauglich(hex: string): boolean {
  const tinte = leuchtkraft(hex);
  if (tinte === null) return false;
  return PAPIERE.every((grund) => (Math.max(tinte, grund) + 0.05) / (Math.min(tinte, grund) + 0.05) >= 4.5);
}

function hexAus(trio: [number, number, number]): string {
  const zwei = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + trio.map(zwei).join("");
}

function mischeNachWeiss(hex: string, anteil: number): string {
  const trio = kanäle(hex)!;
  const heller = trio.map((v) => Math.round(v + (255 - v) * anteil)) as [number, number, number];
  return hexAus(heller);
}

/**
 * Führt eine Farbe auf die Lesbarkeits-Leiter — NUR für die Schrift-Stellen.
 * Der Farbton bleibt; die Fläche (Punkte, Grat, Wähler) trägt den Roh-Ton.
 */
export function tinteAufLeiter(wert: string): string | null {
  const trio = kanäle(wert || "");
  if (!trio) return null;
  const roh = hexAus(trio);
  if (tintetauglich(roh)) return roh;
  for (let schritt = 1; schritt <= 20; schritt++) {
    const kandidat = mischeNachWeiss(roh, schritt / 20);
    if (tintetauglich(kandidat)) return kandidat;
  }
  return "#ffffff";
}

/** Die gespeicherten Wahlen — der Roh-Ton, exakt wie gewählt. */
export function leseTypFarben(): Record<string, string> {
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) || "{}") as Record<string, string>;
    const aus: Record<string, string> = {};
    for (const [rolle, wert] of Object.entries(roh)) {
      if (!TYP_ROLLEN.includes(rolle as TypRolle)) continue;
      const ton = kanäle(wert) ? hexAus(kanäle(wert)!) : null;
      if (ton) aus[rolle] = ton;
    }
    return aus;
  } catch { return {}; }
}

/**
 * Die Variablen tragen: `--type-<rolle>` (+ `-hex`) = der ROH-Ton für Flächen
 * (Graph-Punkte, Karten-Grat, Wähler); `--type-<rolle>-text` = die lesbare
 * Fassung für Schrift (Typ-Etikett in der Liste).
 */
export function trageTypVar(rolle: string, roh: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(`--type-${rolle}`, roh);
  document.documentElement.style.setProperty(`--type-${rolle}-hex`, roh);
  document.documentElement.style.setProperty(`--type-${rolle}-text`, tinteAufLeiter(roh) ?? roh);
}

/** Eine Wahl annehmen (roh!), speichern und tragen. Rückgabe: der Roh-Ton. */
export function schreibeTypFarbe(rolle: string, wert: string): string | null {
  if (!TYP_ROLLEN.includes(rolle as TypRolle)) return null;
  const trio = kanäle(wert);
  if (!trio) return null;
  const roh = hexAus(trio);
  try {
    const neu = { ...leseTypFarben(), [rolle]: roh };
    localStorage.setItem(SCHLUESSEL, JSON.stringify(neu));
  } catch { /* privates Fenster — die Var trägt trotzdem für diese Sitzung */ }
  trageTypVar(rolle, roh);
  return roh;
}

/** Beim Aufwachen alle gespeicherten Wahlen (roh + Text-Fassung) tragen. */
export function trageGespeicherteTypFarben(): void {
  for (const [rolle, ton] of Object.entries(leseTypFarben())) trageTypVar(rolle, ton);
}
