// P196: die Typ-Farben — eine Wahl, die ANGENOMMEN wird, und ein Ton, der überall liest.
//
// Der alte Weg verwies still aus dem Regal, was die Lesbarkeits-Leiter (4,5:1 als
// Schrift auf beiden dunklen Papieren) nicht hielt: ein großer Teil des Farbrads
// (Beeren, Dunkles, Gesättigtes) wurde wortlos zurückgewiesen, der Regler sprang
// sichtbar zurück — Damian: „man kann die Farben nicht ändern." Gemessen 18.10.:
// #cc00bb hielt 3,9:1, #007bff 3,1:1 — die Wahl verschwand.
//
// Der neue Weg nimmt JEDE `#rrggbb`-Wahl an und führt nur ihre Helligkeit so weit,
// bis der Ton auf beiden Papieren liest (Farbton bleibt, Wiedererkennen bleibt).
// Der Ton trägt als CSS-Variable `--type-<rolle>` (+ `-hex`) app-weit: Graph-Punkte,
// Karten-Grat, Typ-Etikett, Legende — eine Wahl, alle Flächen.

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
 * Führt eine gewählte Farbe auf die Lesbarkeits-Leiter — der Farbton bleibt.
 * Eine Wahl, die schon liest, kommt unverändert zurück; eine zu dunkle wird
 * schrittweise mit Weiß angereichert, bis sie auf beiden Papieren 4,5:1 hält.
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

/** Die gespeicherten Wahlen — jede normalisiert, keine verworfen. */
export function leseTypFarben(): Record<string, string> {
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) || "{}") as Record<string, string>;
    const aus: Record<string, string> = {};
    for (const [rolle, wert] of Object.entries(roh)) {
      if (!TYP_ROLLEN.includes(rolle as TypRolle)) continue;
      const ton = tinteAufLeiter(wert);
      if (ton) aus[rolle] = ton;
    }
    return aus;
  } catch { return {}; }
}

/** Die Variable tragen — Graph-Punkte, Karten-Grat, Etikett und Legende lesen sie alle. */
export function trageTypVar(rolle: string, wert: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(`--type-${rolle}`, wert);
  document.documentElement.style.setProperty(`--type-${rolle}-hex`, wert);
}

/** Eine Wahl annehmen, normalisieren, speichern und app-weit tragen. */
export function schreibeTypFarbe(rolle: string, wert: string): string | null {
  if (!TYP_ROLLEN.includes(rolle as TypRolle)) return null;
  const ton = tinteAufLeiter(wert);
  if (!ton) return null;
  try {
    const bisher = leseTypFarben();
    const neu = { ...bisher, [rolle]: ton };
    localStorage.setItem(SCHLUESSEL, JSON.stringify(neu));
  } catch { /* privates Fenster — die Var trägt trotzdem für diese Sitzung */ }
  trageTypVar(rolle, ton);
  return ton;
}

/** Beim Aufwachen alle gespeicherten Wahlen auf die Variablen tragen. */
export function trageGespeicherteTypFarben(): void {
  for (const [rolle, ton] of Object.entries(leseTypFarben())) trageTypVar(rolle, ton);
}
