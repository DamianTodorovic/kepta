// Punkt 4 (Abschnitt C, 20.10.) — ein Profil, ein Spiegel, ein POST.
// Gelesen am Quelltext, nicht gefahren: den Assistenten durchzuklicken ist diese
// Runde nicht frei (Tor zu). Darum verbietet diese Wache den zweiten Schreibenden
// strukturell. Hausform wie tests/huelle-farbvertrag.test.ts (path.join(process.cwd(), …)).
//
// NICHT GEFAHREN. Die Leitung faehrt sie, bevor sie den Flicken setzt:
//   cd ~/kepta-app && npx vitest run tests/kein-doppelter-profispiegel.test.ts
// Erwartung VOR dem Flicken (Stand aa32a97): beide Faelle rot —
//   OnboardingWizard.tsx nennt '/api/profile' einmal (Zeile 103) und
//   profile.ts gibt den Spiegel nicht zurueck (kein `return fetch`).
// Erwartung NACH dem Flicken: beide gruen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lese = (...teile: string[]) => readFileSync(path.join(process.cwd(), ...teile), "utf-8");
const WIZ = lese("src", "components", "OnboardingWizard.tsx");
const PROFIL = lese("src", "lib", "profile.ts");

describe("P4-21: das Profil spiegelt genau einmal", () => {
  it("kennt im Assistenten keinen POST an die Profil-Tuer", () => {
    expect(WIZ.includes("/api/profile"), "der Spiegel lebt in src/lib/profile.ts — die Flaeche ruft ihn nicht selbst").toBe(false);
  });

  it("gibt den Spiegel zurueck, damit Wartende ihn in der Hand halten", () => {
    expect(PROFIL.includes("): Promise<void> {"), "die Signatur nennt ein Versprechen").toBe(true);
    expect(PROFIL.includes("return fetch('/api/profile'")).toBe(true);
  });
});
