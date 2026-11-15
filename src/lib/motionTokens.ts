// Das Haus-Maß für Bewegung (P199, Emil-Audit §7 „Cohesion & tokens"):
// vorher trugen vier Bausteine je eine handgetippte Feder — Toast 24/320,
// Tastatur-Blatt 24/300, Editor und Vorschau 25/200 zweimal kopiert, der
// Onboarding-Assistent tippte die Haus-Kurve als Literal. Jetzt rufen alle
// dieselben Namen, und ein Nachfedern bleibt eine Entscheidung, keine Streuung.
//
// Kompromisskurve: die Overlay-Feder liegt bei ζ ≈ 0,78 (knapp, fast ohne
// Nachschwingen) — die nüchterne App duldet kein Baumeln, aber ein Toast
// ohne jede Feder wirkt tot.
export const KURVE_APPLE = [0.2, 0.8, 0.2, 1] as const;

// Kurze Eintritte: Toasts, Blätter, Modale (200–300-ms-Budget).
export const FEDER_OVERLAY = {
  type: "spring",
  damping: 28,
  stiffness: 320,
} as const;

// Schubladen: Editor und Vorschau gleiten von der Kante — schwerer, ruhiger.
export const FEDER_SCHUBLADE = {
  type: "spring",
  damping: 25,
  stiffness: 200,
} as const;
