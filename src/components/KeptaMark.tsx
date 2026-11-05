/**
 * Eine Marke, ein Radius. `public/kepta-logo.svg` trägt rx 112 auf 512 — das ist
 * dasselbe Verhältnis wie **7 auf 32** (0,21875, auf den Punkt), und die Tafel
 * darunter (72 auf 320 = 0,225) sagt, dass die Rundung am Master sitzt und nicht
 * an einem Wert. Der Baustein zeichnet in einem 32er Raster, also steht die
 * Rundung hier als Konstante und nicht als Prop: wer `size` ändert, ändert die
 * Rundung nicht. Vorher streuten neun Aufrufstellen über sechs verschiedene
 * Radien (6…10 von 32 = 0,188…0,313) — acht Markengesichter für eine Marke.
 */
const MARK_RX = 7;

export function KeptaMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="K3PTA Logo">
      <rect width="32" height="32" rx={MARK_RX} fill="#0f0f0f" />
      {/* K */}
      <path d="M11 9.5 V22.5 M11 16 L18.2 9.5 M11 16 L18.2 22.5" stroke="white" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.2" cy="9.8" r="1.7" fill="white" />
    </svg>
  );
}

export function KeptaWordmark({ className }: { className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 'var(--fw-fest)', letterSpacing: '-0.03em', fontSize: 'var(--fs-5)', lineHeight: 1, color: 'var(--text-1)' }}>
      K3PTA
    </span>
  );
}
