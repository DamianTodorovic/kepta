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
    .filter(({ z }) => /K3PTA-<version>-(win|linux)|win-x64\.exe|win-arm64\.exe|AppImage|\.deb\b/i.test(z))
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

  // Ein Download-Link ist keine Nebensache: er ist der Ort, an dem ein Mensch
  // landet, wenn er die App haben will. Die README zeigte auf
  // `DamianTodorovic/kepta-pro-releases` — anonym gemessen 404, und der Name trägt
  // eine Stufe, die es nicht mehr gibt. Dieselbe Adresse saß zweimal in dem Text,
  // der einem Käufer seinen Schlüssel bringt (`tools/lizenz-worker`, `tools/license-studio`).
  // Veröffentlichte Pakete liegen am Engine-Repo, also darf nur dorthin ein Download zeigen.
  it("verweist jeden Download auf das Repo, in dem die Pakete wirklich liegen", () => {
    const TEXT = ["README.md", "tools/lizenz-worker/worker.ts", "tools/license-studio/kern.ts"];
    const BELEG = (pfad: string) =>
      pfad === "README.md" ? README : fs.readFileSync(path.join(process.cwd(), pfad), "utf-8");
    const links = TEXT.flatMap((pfad) =>
      [...BELEG(pfad).matchAll(/https:\/\/github\.com\/DamianTodorovic\/[\w.-]+\/releases[^\s)"'`]/g)].map((m) => `${pfad}: ${m[0]}`)
    );
    expect(links.length, "mindestens ein Release-Link muss belegt sein").toBeGreaterThan(0);
    const falsch = links.filter((u) => !/\/kepta\/releases/.test(u));
    expect(falsch, `Downloads zeigen ins Leere:\n${falsch.join("\n")}`).toEqual([]);
  });

  // Und kein Text, der nach außen geht, darf einen Installer für eine Plattform
  // nennen, die nicht ausgeliefert wird — derselbe Maßstab wie oben, nur am
  // Schlüsseltext, den ein Käufer per Mail bekommt.
  it("verspricht in keinem außen gehenden Text ein Plattform-Paket, das es nicht gibt", () => {
    const TEXT = ["tools/lizenz-worker/worker.ts", "tools/license-studio/kern.ts"];
    const stellen = TEXT.flatMap((pfad) =>
      BELEGZEILEN(pfad)
        .filter((z) => /Windows|Linux|AppImage|\.exe\b/i.test(z))
        .filter((z) => !/self-build|build it|engine|source|nur macOS|macOS only/i.test(z))
        .map((z) => `${pfad}: ${z.trim().slice(0, 90)}`)
    );
    expect(stellen, `Plattformen ohne Paket versprochen:\n${stellen.join("\n")}`).toEqual([]);
  });
  // Der Satz direkt über der Tabelle ist der, den ein Mensch kopiert und liest,
  // bevor er scrollt. „Download the file for your system … explained per system
  // further down" sagt drei Systeme zu, von denen eines ein Fenster bekommt.
  it("nennt im erste-download-satz die plattform, die wirklich ein paket bekommt", () => {
    const stellen = zeilen
      .filter((z) => /download/i.test(z) && /releases\/latest/i.test(z))
      .map((z) => z.trim());
    expect(stellen.length, "der absatz muss den download zeigen").toBeGreaterThan(0);
    const vage = stellen.filter((z) => /your system|per system/i.test(z) && !/macOS/i.test(z));
    expect(vage, `Downloads werden als Mehrsystem verkauft: ${vage.join(" | ")}`).toEqual([]);
  });

  // „Run it from source" in der App-README wollte, dass jeder
  // `kepta-enterprise` klont — der Enterprise-Server, ein anderes produkt aus
  // einem anderen repo. Wer die App aus dem quelltext bauen will, braucht dieses
  // repo, und das ist seit 8.10.2026 privat mit zugang als lisenznehmer.
  it("lässt niemanden den Enterprise-Server als die App klonen", () => {
    const klon = zeilen.filter((z) => /git clone|git\+ssh:\/\//.test(z)).map((z) => z.trim());
    expect(klon.length, "die README muss einen Quelltext-weg zeigen").toBeGreaterThan(0);
    const fremd = klon.filter((z) => !/DamianTodorovic\/kepta-app/.test(z));
    expect(fremd, `clone-befehl zeigt auf ein anderes repo: ${fremd.join(" | ")}`).toEqual([]);
  });
});

function BELEGZEILEN(pfad: string): string[] {
  return fs.readFileSync(path.join(process.cwd(), pfad), "utf-8").split("\n");
}
