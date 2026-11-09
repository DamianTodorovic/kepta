/* P186 (#44, Damian-Befund): der Schild-Schalter „springt zurück" — und wenn
   die zentrale Richtlinie privacy_shield=force_on trägt, geschieht das STILL:
   die Antwort sagt „an", die Fläche erklärte den Zwang nie. Der Nutzer sieht
   einen kaputten Knopf. Die Route nennt den Zwang jetzt (erzwungen: true),
   die Fläche zeigt ihn („Your organization keeps the shield on…"), und eine
   Wache hält beides zusammen — der Zwang ist enterprise-echt, aber kein
   stiller mehr. */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("P186: der Schild-Zwang ist sichtbar, nicht still", () => {
  it("die Route nennt ein erzwungen-Feld, wenn die Richtlinie greift", () => {
    const route = fs.readFileSync(path.join(process.cwd(), "server/router/schild.ts"), "utf8");
    expect(route).toContain("erzwungen");
    expect(route).toContain("privacy_shield");
    // Der Zwang setzt BEIDE Felder — die Antwort muss das gleiche Bild zeigen,
    // das der Nutzer am Schalter sieht.
    expect(route).toContain("neu.chat = true");
  });

  it("die Fläche erklärt den Zwang statt still zurückzuspringen", () => {
    const flaeche = fs.readFileSync(path.join(process.cwd(), "src/components/PrivacyShield.tsx"), "utf8");
    expect(flaeche).toContain("erzwungen");
    expect(flaeche).toContain("Your organization keeps the shield on");
  });
});
