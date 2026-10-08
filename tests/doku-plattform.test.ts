// @vitest-environment node
//
// Die README verspricht Downloads. Ein Download, den es nicht gibt, ist kein
// Tippfehler, sondern eine Seite, vor der ein Mensch stehen bleibt: hier nannte
// die Download-Tabelle Windows-Installer (inklusive „take this one if unsure")
// und einen Windows-Erstantlauf, während jeder veröffentlichte Stand nur
// macOS-Artefakte trägt — dieselbe Sorte Außenlüge, die auf der Website schon
// entfernt wurde, nur im Repo-Text übersehen.
//
// Regel, die maschinell hält: die README darf nur Paketnamen nennen, die im
// veröffentlichten Release liegen. Was nur selbst gebaut wird, steht als Bauanleitung da,
// nicht als Download.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const README = fs.readFileSync(path.join(process.cwd(), "README.md"), "utf-8");
const zeilen = README.split("\n");

/** Zeilen, in denen ein fertiges Paket für eine Plattform versprochen wird. */
function versprochenePakete(): string[] {
  return zeilen
    .map((z, i) => ({ z, n: i + 1 }))
    .filter(({ z }) => /KEPTA-<version>-(win|linux)|win-x64\.exe|win-arm64\.exe|AppImage|\.deb\b/i.test(z))
    .filter(({ z }) => !/build:win|build:linux|baue|build them|selbst/i.test(z))
    .map(({ z, n }) => `${n}: ${z.trim()}`);
}

describe("README: kein versprochener Installer, den es nicht gibt", () => {
  it("nennt nur Plattformen, deren Paket veröffentlicht wird", () => {
    expect(versprochenePakete()).toEqual([]);
  });

  it("sagt an einer Stelle ausdrücklich, dass die Desktop-App nur für macOS gebaut ausgeliefert wird", () => {
    const ehrlich = zeilen.some((z) => /desktop app.*mac[oo]S.*only|only for macOS|nur für macOS/i.test(z));
    expect(ehrlich, "die README muss sagen, was sie nicht liefert").toBe(true);
  });

  it("zeigt im Plattform-Schild nur macOS", () => {
    const schild = zeilen.find((z) => z.includes("img.shields.io/badge/platform-")) ?? "";
    expect(schild).toContain("platform-macOS");
    expect(schild).not.toContain("Windows");
    expect(schild).not.toContain("Linux");
  });

  // „Gebaut" und „geliefert" sind zwei verschiedene Sätze. Ein Absatz über
  // Windows-Pfade im Richtlinien-Leser ist wahr, wenn daneben steht, dass die App
  // nur macOS verlässt — sonst liest jemand eine Windows-App heraus, die es nicht gibt.
  it("nennt Windows und Linux nur zusammen mit dem Lieferstand", () => {
    const unverdraeumelt = zeilen
      .filter((z) => /\bWindows\b|\bLinux\b/.test(z))
      .filter((z) => !/ship|publish|nur macOS|only|self-build|build it|engine|when you build|no app file/i.test(z))
      .map((z) => z.trim().slice(0, 90));
    expect(unverdraeumelt).toEqual([]);
  });
});
