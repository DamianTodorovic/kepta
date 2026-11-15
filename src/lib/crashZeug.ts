// P190: die Fenster-Wache — ein Absturz zeigt sich als Text, nicht als Schwarz.
//
// Der React-Fehlerschirm (components/Fehlerschirm) fängt nur Render-Würfe. Ein
// Absturz in einem Klick-Handler oder einer Nebenläufigkeit fliegt an ihm
// vorbei: React bleibt stehen, das Fenster zeigt schwarz — und niemand, auch
// Damian nicht, kann lesen, WARUM. Damian meldete genau das (9.11., Blackscreen
// in den Einstellungen bei den Spuren-Schaltern).
//
// Diese Wache hängt an window.onerror und unhandledrejection und malt den
// Fehler als rohes DOM über die Fläche — unabhängig von React, mit der
// Fundstelle (Datei:Zeile) und einem Kopier-Knopf. Damian fotografiert den
// Text, die Stelle ist benannt.

const ID = "kepta-crash-zeichnung";

/** Eine Zeile für Damian: Meldung + Fundstelle, ohne Stack-Rauschen. */
export function crashZeile(meldung: string, fundstelle: string): string {
  return `${meldung}\n${fundstelle}\n— bitte diesen Text (oder ein Foto davon) an Damian schicken.`;
}

function zeichne(meldung: string, fundstelle: string, stapel: string): void {
  // Der Grund beim Betreiber (P47-Form: der rohe Wortlaut gehört nicht auf die
  // Fläche — aber in die Konsole und in die Zwischenablage, damit Damian ihn
  // mit EINEM Knopf schicken kann, ohne ihn lesen oder abschreiben zu müssen).
  console.error(`K3PTA-Absturz: ${meldung}\n${stapel}`);
  const zeile = crashZeile(meldung, fundstelle);
  let zeichnung = document.getElementById(ID);
  if (zeichnung) {
    const text = zeichnung.querySelector('[data-testid="crash-text"]');
    if (text) text.textContent = zeile;
    return;
  }
  zeichnung = document.createElement("div");
  zeichnung.id = ID;
  zeichnung.setAttribute("data-testid", "crash-zeichnung");
  zeichnung.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;background:var(--eb-0,#141210);color:var(--text-1,#f3efe9);" +
    "padding:32px;overflow:auto;";
  zeichnung.innerHTML = `
    <h1 class="fs-3" style="margin:0 0 12px">K3PTA ist an dieser Stelle abgestürzt</h1>
    <p class="fs-4" style="margin:0 0 12px;color:var(--text-2,#c9c2b6)">Bitte Damian diesen Text schicken (oder ein Foto davon) — er nennt die genaue Stelle.</p>
    <pre data-testid="crash-text" class="fs-4" style="white-space:pre-wrap;background:var(--eb-2,#1f1c19);padding:16px;border-radius:12px;overflow:auto"></pre>
    <div style="margin-top:14px;display:flex;gap:10px">
      <button data-testid="crash-kopieren" class="fs-4" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border-subtle,#57534e);background:var(--eb-1,#292524);color:var(--text-1,#f3efe9);cursor:pointer">Text kopieren</button>
      <button data-testid="crash-schliessen" class="fs-4" style="padding:8px 14px;border-radius:10px;border:1px solid var(--border-subtle,#57534e);background:transparent;color:var(--text-2,#c9c2b6);cursor:pointer">Schließen — weiter versuchen</button>
    </div>`;
  document.body.appendChild(zeichnung);
  const text = zeichnung.querySelector('[data-testid="crash-text"]');
  if (text) text.textContent = zeile;
  zeichnung.querySelector('[data-testid="crash-kopieren"]')?.addEventListener("click", () => {
    void navigator.clipboard?.writeText(`K3PTA-Absturz\n${stapel}`).catch(() => { /* der Nutzer fotografiert dann */ });
  });
  zeichnung.querySelector('[data-testid="crash-schliessen"]')?.addEventListener("click", () => {
    zeichnung?.remove();
  });
}

/** Die Wache an das Fenster hängen — einmal beim Start. */
export function spanneCrashWachter(): void {
  window.addEventListener("error", (e) => {
    const meldung = e.message || "unbekannter Fehler";
    const fundstelle = e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : "(keine Fundstelle)";
    const stapel = e.error instanceof Error ? e.error.stack : `${meldung}\n${fundstelle}`;
    zeichne(String(meldung), String(fundstelle), String(stapel));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const grund = e.reason;
    const meldung = "unerledigte Zusage";
    const stapel = grund instanceof Error ? grund.stack ?? "" : String(grund ?? "");
    const ort = stapel.split("\n").find((z) => z.includes("at ") && !z.includes("node_modules")) ?? "(keine Fundstelle)";
    zeichne(meldung, ort.trim(), stapel);
  });
}
