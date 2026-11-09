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

/**
 * #94 — die Route-Tabelle nannte `/api/memories/:id` ohne Methode. Gelesen als
 * „die Tür gibt mir eine Notiz" und die Tür antwortet 404: auf dem Pfad registriert
 * sind nur `DELETE` und `POST …/restore`. Dasselbe Fach wie die Installer-Zeile oben:
 * ein Versprechen im Text, das das Objekt nicht hält.
 */
function registrierteRouten(): Set<string> {
  const wurzel = process.cwd();
  const dateien = [path.join(wurzel, "server.ts")];
  const sammle = (ordner: string) => {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      const voll = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) sammle(voll);
      else if (eintrag.name.endsWith(".ts")) dateien.push(voll);
    }
  };
  sammle(path.join(wurzel, "server"));
  const menge = new Set<string>();
  const re = /\b(?:app|router)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
  for (const datei of dateien) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(fs.readFileSync(datei, "utf8"))) !== null) {
      menge.add(`${m[1]!.toUpperCase()} ${m[2]}`);
    }
  }
  return menge;
}

describe("README: keine Route, die die Tür nicht hat", () => {
  const echt = registrierteRouten();

  /**
   * Die Tabelle führt mehrere Pfade in EINER Zelle, durch Komma getrennt. Wer die Zelle
   * als Ganzes vergleicht, sieht keinen einzigen Pfad — und eine Wache, die nichts sieht,
   * meldet grün. Also: Zeile → Zellen → Stückchen, Klammer-Ticks und Leerzeichen ab.
   */
  function stucken(): string[] {
    const out: string[] = [];
    for (const z of zeilen) {
      if (!z.includes("| `")) continue;
      for (const zelle of z.split("|")) {
        for (const stueck of zelle.split(",")) {
          const glatt = stueck.trim().replace(/^`|`$/g, "");
          if (glatt.startsWith("/api/")) out.push(glatt);
          else if (/^(GET|POST|PUT|PATCH|DELETE)\s+\/api\//.test(glatt)) out.push(glatt);
        }
      }
    }
    return out;
  }

  it("nannt an der Einzel-Notiz keine Methode, die der Pfad nicht hat", () => {
    const betreff = stucken().filter((s) => s.endsWith("/api/memories/:id"));
    expect(betreff.length, "die Tabelle muss die Einzel-Notiz führen").toBeGreaterThan(0);
    const erlaubt = [...echt].filter((r) => r.endsWith(" /api/memories/:id")).sort();
    const erfunden = betreff.filter((s) => !erlaubt.includes(s));
    expect(
      erfunden,
      `kahl oder erfunden — die Tür hat auf dem Pfad nur: ${erlaubt.join(", ")}; die Tabelle nennt: ${betreff.join(", ")}`,
    ).toEqual([]);
  });

  it("sagt, wo der Körper einer einzelnen Notiz liegt, wenn es keinen Einzelabruf gibt", () => {
    const ehrlich = zeilen.some((z) =>
      /no single-note GET|GET \/api\/memories\/:id does not exist/i.test(z),
    );
    expect(ehrlich, "die README muss sagen, wie man eine Notiz wirklich liest (Liste, Suche)").toBe(true);
  });

  it("erfindet in der ganzen Tabelle keine Methode, die der Server nicht anmeldet", () => {
    const genannt = stucken().filter((s) => /^(GET|POST|PUT|PATCH|DELETE)\s/.test(s));
    expect(genannt.length, "die Tabelle muss methodenscharfe Routen nennen").toBeGreaterThan(0);
    const fremd = genannt.filter((r) => !echt.has(r));
    expect(fremd, `README behauptet Routen, die der Server nicht hat: ${fremd.join(", ")}`).toEqual([]);
  });
});

function BELEGZEILEN(pfad: string): string[] {
  return fs.readFileSync(path.join(process.cwd(), pfad), "utf-8").split("\n");
}

describe("README: die harte Sperre nennt ihren Zeugen", () => {
  // P122 zahlte 30 Saetze, die ein Werkzeug widerlegen koennte; dieser hier ist
  // der kundennaechste: „Keys, credentials, browser profiles, keychains and
  // system folders are never read, and that cannot be switched off". Die
  // Maschine haelt das — tests/scan/regeln.test.ts versucht ausdrecklich, die
  // Sperre mit einer freigeschalteten Endung zu oeffnen, und scheitert. Was
  // fehlte, war der Verweis: ein Satz nach aussen ohne Zeuge ist eine
  // Behauptung, und die Wache hier prueft beides — den Satz und seinen Zeugen.
  const satz = zeilen.filter((z) => /are never read, and that cannot be switched off/i.test(z));
  const zeuge = "tests/scan/regeln.test.ts";

  it("der Satz ueber die Sperre steht weiter in der README", () => {
    expect(satz.length, "der Satz ist verschwunden — die Wache sieht nichts mehr").toBeGreaterThan(0);
  });

  it("er nennt die Wache, die ihn haelt", () => {
    const mitZeuge = satz.filter((z) => z.includes(zeuge));
    expect(mitZeuge.length, `kein Satz der Sperre nennt ${zeuge}:\n  ${satz.map((s) => s.slice(0, 150)).join("\n  ")}`).toBe(satz.length);
  });

  it("der Zeuge existiert und versucht wirklich, die Sperre zu oeffnen", () => {
    const quelltext = fs.readFileSync(path.join(process.cwd(), zeuge), "utf-8");
    expect(quelltext).toMatch(/NICHT zum Lesen von Geheimnissen ueberreden/);
    expect(quelltext).toMatch(/endungen: \[".pem", ".md"\]/);
  });
});

describe("README: die Privatzusage nennt ihre Zeugen", () => {
  // README.md:103 verspricht zweierlei: eine private Notiz wird "never shown to an AI app"
  // (das ist der Privatheits-Floor ueber MCP) und "never sent to a cloud model" (das ist der
  // Chatweg, der sie vor dem Absenden aus dem Kontext nimmt). Beides ist gemessen beweisen —
  // im App-Repo und im Kern-Repo. Was fehlte, war der Verweis nach aussen: ohne Zeuge ist
  // auch eine wahre Zusage nur ein Wort.
  const privat = zeilen.filter((z) => /private note is never shown to an AI app/i.test(z));

  it("der Satz ueber private Notizen steht weiter in der README", () => {
    expect(privat.length, "der Satz ist verschwunden — die Wache sieht nichts mehr").toBeGreaterThan(0);
  });

  it("er nennt den Agenten-Zeugen und den Wolken-Zeugen", () => {
    const beide = privat.filter((z) => z.includes("tests/mcp.test.ts") && z.includes("tests/enterprise-api.test.ts"));
    expect(beide.length, `keine Zeugen genannt:\n  ${privat.map((s) => s.slice(0, 160)).join("\n  ")}`).toBe(privat.length);
  });

  it("beide Zeugen pruefen wirklich, was der Satz verspricht", () => {
    const agent = fs.readFileSync(path.join(process.cwd(), "tests/mcp.test.ts"), "utf-8");
    expect(agent).toMatch(/Privatheits-Floor: private Notizen verlassen K3PTA nie über MCP/);
    const wolke = fs.readFileSync(path.join(process.cwd(), "tests/enterprise-api.test.ts"), "utf-8");
    expect(wolke).toMatch(/privateNotes: 1/);
    expect(wolke).toMatch(/not\.toContain\("Private medical note"\)/);
  });

  it("der Kern-Teil der Zusage wird als Kern benannt, nicht als App-Beweis verkauft", () => {
    const mitKern = privat.filter((z) => /engine repo|source-available core|Kern-Repo/i.test(z));
    expect(mitKern.length, "die Haelfte ueber den Kern braucht einen eigenen, ortsbaren Zeugen").toBe(privat.length);
  });
});

describe("die Privatzusage hat zwei Traeger, und beide nennen Zeugen", () => {
  /* P125 bewaffnete README.md:103. Der Zensus der schmalen Klasse (21:16:29 MEZ) zeigte, dass
     dieselbe Zusage ein zweites Mal steht -- README.md:180, der Privacy-shield-Punkt der
     Funktions-Strasse, endet auf "Private notes never reach an app or a cloud model." ohne
     jeden Zeugen. Eine Wache, die auf einen Wortlaut-keyed ist, sieht den zweiten Traeger
     nicht; also wird hier nach der BEHAUPTUNG gesucht, nicht nach dem Satz.
     Gemessen 21:25:58 MEZ mit demselben Muster: genau zwei Traeger in den vier Texten --
     :103 (Zeuge ja) und :180 (Zeuge nein). ROADMAP.md:82 und README.md:28 erwaehnen private
     Notizen, behaupten aber kein "never", und fallen deshalb nicht in die Klasse. */
  const AUSSEN = ["README.md", "SECURITY.md", "ROADMAP.md", ".github/release-notes.md"];
  const behauptet = /\bprivate notes?\b[^.]{0,140}?\b(never|not)\b[^.]{0,90}\b(reach|shown|sent|visible|leave)\b/i;
  const zeug = /(tests\/|\.test\.tsx?\b|:[0-9]{2,4}\b|DamianTodorovic\/kepta)/i;

  const traeger: { datei: string; zeile: number; satz: string }[] = [];
  for (const datei of AUSSEN) {
    const text = fs.readFileSync(path.join(process.cwd(), datei), "utf-8").split("\n");
    text.forEach((zeile, i) => {
      if (!behauptet.test(zeile)) return;
      for (const satz of zeile.split(/(?<=[.!?])\s+/)) {
        if (behauptet.test(satz)) traeger.push({ datei, zeile: i + 1, satz: satz.replace(/\s+/g, " ") });
      }
    });
  }

  it("die Sonde sieht beide Traeger — sonst ist sie taub und meldet Erfolg", () => {
    expect(traeger.length, "die Behauptung ist verschwunden oder das Muster sieht sie nicht").toBeGreaterThanOrEqual(2);
    const orte = traeger.map((t) => `${t.datei}:${t.zeile}`);
    expect(orte, `erwartete beide Traeger, fand: ${orte.join(", ")}`).toContain("README.md:103");
    expect(orte, `erwartete beide Traeger, fand: ${orte.join(", ")}`).toContain("README.md:180");
  });

  it("jeder Traeger nennt im selben Satz ein Messzeug", () => {
    const nackt = traeger.filter((t) => !zeug.test(t.satz));
    expect(nackt, `${nackt.length} von ${traeger.length} Traegern nennen keinen Zeugen:\n  ${nackt.map((t) => `${t.datei}:${t.zeile} ${t.satz.slice(0, 120)}`).join("\n  ")}`).toHaveLength(0);
  });
});

// P159 — die Namens-Zusage der Downloads, gegen die veröffentlichten Namen selbst.
//
// README und Release-Notes sagten: "Every published file carries its platform and
// architecture in the name." Gemessen am gesiegelten Release-Zensus
// (docs/belege/aussendung-0611/github-releases-0611.json, 9 Releases, 58 Dateien):
// 47 tragen mac-arm64 oder mac-x64, **11 tragen keine Architektur** — sechsmal
// latest-mac.yml, fünfmal SHA256SUMS.txt. Die Zusage war für ein Fünftel der
// veröffentlichten Dateien falsch, und niemand hätte es gemerkt, weil die vorhandene
// Wache nur die *Abwesenheit* fremder Plattformen prüft, nicht die *Anwesenheit* der
// Architektur im Namen.
//
// Dieser Block hält beides: die Namen im Artefakt (mit Biss gegen einen eingeschleusten
// fremde Namen) und den Wortlaut der zwei Sätze, die daraus eine Zusage machen.
const RELEASE_ZENSUS = "docs/belege/aussendung-0611/github-releases-0611.json";
const OHNE_ARCHITEKTUR = ["latest-mac.yml", "SHA256SUMS.txt"];

function veroeffentlicht(): { tag: string; name: string }[] {
  const releases = JSON.parse(fs.readFileSync(path.join(process.cwd(), RELEASE_ZENSUS), "utf8")) as {
    tag_name: string;
    assets?: { name: string }[];
  }[];
  return releases.flatMap((r) => (r.assets ?? []).map((a) => ({ tag: r.tag_name, name: a.name })));
}

/** Namen, die die Zusage bricht: keine der zwei benannten Metadateien und ohne mac-arm64/x64. */
function namenOhneArchitektur(dateien: { name: string }[]): string[] {
  return dateien.filter((d) => !OHNE_ARCHITEKTUR.includes(d.name) && !/mac-(arm64|x64)/.test(d.name)).map((d) => d.name);
}

function zeilenMit(muster: RegExp): { datei: string; zeile: number; text: string }[] {
  return ["README.md", ".github/release-notes.md"].flatMap((datei) =>
    fs
      .readFileSync(path.join(process.cwd(), datei), "utf8")
      .split("\n")
      .map((text, i) => ({ datei, zeile: i + 1, text }))
      .filter((z) => muster.test(z.text)),
  );
}

describe("P159: die veröffentlichten Namen und die Zusage darüber", () => {
  it("kein veröffentlichtes Asset trägt eine fremde Plattform, und der Zensus ist nicht leer", () => {
    const dateien = veroeffentlicht();
    expect(dateien.length, "der Release-Zensus ist leer — die Sonde meldet Sauberkeit für Ungelesenes").toBeGreaterThan(40);
    expect(dateien.some((d) => d.tag === "app-3.2.1"), "der neueste veröffentlichte Stand fehlt im Zensus").toBe(true);
    const fremd = dateien.filter((d) => /win|linux|\.exe|\.deb|AppImage/i.test(d.name));
    expect(fremd.map((d) => `${d.tag} ${d.name}`), "ein veröffentlichter Name trägt eine fremde Plattform").toEqual([]);
  });

  it("jede Datei ausser den zwei benannten Metadateien nennt Plattform und Architektur", () => {
    const dateien = veroeffentlicht();
    expect(namenOhneArchitektur(dateien), "eine Datei bricht die Namens-Zusage").toEqual([]);
    for (const ausnahme of OHNE_ARCHITEKTUR) {
      expect(dateien.some((d) => d.name === ausnahme), `${ausnahme} kommt im Zensus nie vor — die Ausnahme wäre erfunden`).toBe(true);
    }
  });

  it("Biss: die Regel sieht einen fremden Namen und lässt einen echten durch", () => {
    const probe = [
      { name: "KEPTA-3.2.1-win-x64.exe" },
      { name: "KEPTA-3.2.1-mac-arm64.dmg" },
      { name: "KEPTA-3.2.1-mac-x64.zip.blockmap" },
      { name: "latest-mac.yml" },
    ];
    expect(namenOhneArchitektur(probe), "die Regel ist blind oder sie verbietet alles").toEqual(["KEPTA-3.2.1-win-x64.exe"]);
  });

  // Die positive Haelfte von "Apple silicon and Intel": nicht nur die Abwesenheit fremder
  // Plattformen, sondern die Anwesenheit beider Architekturen in jedem Release, der
  // ueberhaupt Dateien traegt. Drei der neun Releases sind Engine-Tags ohne jedes Asset
  // (v3.1.1, v3.0.0, v2.13.22) — sie zaehlen hier nicht mit, und das ist benannt.
  it("jeder Release mit Dateien traegt beide Architekturen", () => {
    const releases = JSON.parse(fs.readFileSync(path.join(process.cwd(), RELEASE_ZENSUS), "utf8")) as {
      tag_name: string;
      assets?: { name: string }[];
    }[];
    const mitDateien = releases.filter((r) => (r.assets ?? []).length > 0);
    expect(mitDateien.length, "kein Release mit Dateien — die Sonde prueft nichts").toBeGreaterThanOrEqual(5);
    const einseitig = mitDateien
      .filter((r) => {
        const namen = (r.assets ?? []).map((a) => a.name).join(" ");
        return !/mac-arm64/.test(namen) || !/mac-x64/.test(namen);
      })
      .map((r) => r.tag_name);
    expect(einseitig, "diese Releases versprechen eine Architektur, die sie nicht tragen").toEqual([]);
  });

  it("die zwei Namens-Sätze nennen die Ausnahmen und ihren Zeugen, nicht mehr 'every file'", () => {
    const traeger = zeilenMit(/About This Mac/);
    expect(traeger.length, "die Sonde findet die Namens-Sätze nicht — sonst meldet sie Erfolg für Ungelesenes").toBe(2);
    for (const t of traeger) {
      const wo = `${t.datei}:${t.zeile}`;
      expect(t.text, `${wo} behauptet weiter, jede Datei trage die Architektur`).not.toMatch(/Every (published )?file carries/i);
      for (const ausnahme of OHNE_ARCHITEKTUR) {
        expect(t.text.includes(ausnahme), `${wo} nennt die Ausnahme ${ausnahme} nicht`).toBe(true);
      }
      expect(t.text.includes(RELEASE_ZENSUS) || /tests\/doku-plattform\.test\.ts:\d+/.test(t.text), `${wo} nennt keinen Zeugen`).toBe(true);
    }
  });

  it("die vier macOS-only-Sätze nennen denselben Zeugen", () => {
    const traeger = zeilenMit(/only for macOS|macOS only|nur macOS/);
    expect(traeger.length, "die Sonde findet die Plattform-Sätze nicht").toBe(4);
    for (const t of traeger) {
      expect(t.text.includes(RELEASE_ZENSUS) || /tests\/doku-plattform\.test\.ts:\d+/.test(t.text), `${t.datei}:${t.zeile} nennt keinen Zeugen`).toBe(true);
    }
  });
});

// P160 — die zwei Rest-Träger der Download-Klasse. P159 hat die Namens-Zusage berichtigt
// und vier Plattform-Sätze bewaffnet; diese zwei standen weiter ohne Zeugen im Satz:
// README.md:403 (die Tabellenzelle) und .github/release-notes.md:34. Die dritte Zeile, die
// die Sonde findet (.github/release-notes.md:8), trägt den Zeugen schon — sie zählt mit,
// damit die Grundgesamtheit nicht auf das bequeme Paar schrumpft.
describe("P160: auch die Rest-Träger der Download-Klasse nennen den Release-Zensus", () => {
  it("die drei Zeilen über den fehlenden fremden Installer werden gefunden", () => {
    const traeger = zeilenMit(/No app file is published|no Windows or Linux installer is published/);
    expect(traeger.length, "die Sonde findet die Rest-Träger nicht — sonst meldet sie Erfolg für Ungelesenes").toBe(3);
  });

  it("jede dieser Zeilen nennt den Release-Zensus im selben Satz", () => {
    const traeger = zeilenMit(/No app file is published|no Windows or Linux installer is published/);
    const nackt = traeger.filter((t) => !t.text.includes(RELEASE_ZENSUS));
    expect(nackt.map((t) => `${t.datei}:${t.zeile}`), "diese Zeilen versprechen einen fehlenden Installer ohne Zeugen").toEqual([]);
  });
});

// P162 — die zwei Zeit-Film-Saetze in README:17. Beide sind im Nenner des Zensus
// (absolut via "every" und "no") und standen ohne Messzeug. Die Wache liest mit der
// LESART DES ZENSUS selbst — Satz-Riss und zeug-Regel importiert, nicht nachgebaut
// (Lehre P124/P128): was hier gruen ist, zaehlt `zaehlen.mjs` als bewaffnet.
import { satzeAusMarkdown } from "../docs/belege/aussendungsatz-0611/satz-riss.mjs";
import { zeug } from "../docs/belege/aussendungsatz-0611/messregel.mjs";

describe("P162: die zwei Zeit-Film-Saetze nennen ihre Zeugen", () => {
  const filmSaetze = () =>
    satzeAusMarkdown(README).filter((s) => /past moments show exactly what was true then|recorded on 18 September 2026/.test(s));

  it("die zwei Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(filmSaetze().length, `die Sonde findet ${filmSaetze().length} Film-Saetze`).toBe(2);
  });

  it("jeder der beiden traegt sein Messzeug im selben Satz", () => {
    const nackt = filmSaetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Film-Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P163 — die vier staerksten Kaufwirkungs-Saetze der Aussendung: das Audit-Log-Paar
// (README:179, Zugriff-Versprechen und Siegel-Kette), die Acht-Werkzeuge-Zusage
// (README:188) und der Einzel-GET-Absage-Satz (README:253). Alle vier sind im Nenner
// des Zensus (absolut via "every", "all", "no") und standen ohne Messzeug. Dieselbe
// Lesart wie P162: Satz-Riss und zeug-Regel importiert, nicht nachgebaut — was hier
// gruen ist, zaehlt `zaehlen.mjs` als bewaffnet.
describe("P163: Audit-Log-Paar, Acht-Werkzeuge-Zusage und Einzel-GET-Absage nennen ihre Zeugen", () => {
  const p163Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /every access to the knowledge base|sealed with the SHA-256 of the one before it|All eight tools ship an|no single-note GET/.test(s),
    );

  it("die vier Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p163Saetze().length, `die Sonde findet ${p163Saetze().length} P163-Saetze`).toBe(4);
  });

  it("jeder der vier traegt sein Messzeug im selben Satz", () => {
    const nackt = p163Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P164 — die zwei naechsten Kaufwirkungs-Saetze: der DELETE/restore-Satz (README:253,
// Satz 2, "are the only methods on that path") und der Rest-Satz der Audit-Klasse
// (README:180, "Both protections are on by default, and every cloud request is in the
// audit log"). Der Wolken-Chat-Zeuge lebt neu in tests/kette-deckt-nur-schreibwege.
// test.ts (chatSchutz protokolliert, bevor der Anbieter gefragt wird); der
// Default-Zeuge stand schon in tests/lib/schild.test.ts:106. Gleiche Lesart wie
// P162/P163: Satz-Riss und zeug-Regel importiert, nicht nachgebaut.
describe("P164: DELETE/restore-Satz und Both-protections-Satz nennen ihre Zeugen", () => {
  const p164Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /only methods on that path|Both protections are on by default/.test(s),
    );

  it("die zwei Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p164Saetze().length, `die Sonde findet ${p164Saetze().length} P164-Saetze`).toBe(2);
  });

  it("jeder der zwei traegt sein Messzeug im selben Satz", () => {
    const nackt = p164Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P165 — die zwei UI-Zusagen: die Quellen-Chips (README:211, "every answer shows which
// memories it used") und die Karten-Teil-Marke (README:230, "the number of parts that one
// file was split into"). Ihre Zeugen sind Komponenten-Wachen am gerenderten Objekt:
// tests/components/quellen-chips-und-teil-marke.test.tsx haelt die Chips (Sources:,
// sechs Titel, +N-Ueberlauf, leerer Fall) und die Teil-Marke (N = Chunk-Zahl derselben
// Datei, Ein-Stueck ohne Teil). Gleiche Lesart wie P162-P164: Satz-Riss und zeug-Regel
// importiert, nicht nachgebaut — was hier gruen ist, zaehlt `zaehlen.mjs` als bewaffnet.
describe("P165: Quellen-Chips-Zusage und Karten-Teil-Marke nennen ihre Zeugen", () => {
  const p165Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /every answer shows which memories it used|number of parts that one file was split into/.test(s),
    );

  it("die zwei Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p165Saetze().length, `die Sonde findet ${p165Saetze().length} P165-Saetze`).toBe(2);
  });

  it("jeder der zwei traegt sein Messzeug im selben Satz", () => {
    const nackt = p165Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P166 — die zwei asOf-/Zeitfenster-Saetze (README:41: das Gültigkeitsfenster mit
// Zeitregler, und dieselbe Frage in Suche und Editor) plus die Telemetrie-Triade
// (README:79, "No upload, no account, no telemetry"). Zeugen: die HTTP-Suche reicht
// asOf durch (tests/server.test.ts, neuer Fall am Dateiende — die Aussendung ankert
// auf diese Datei, darum wird nichts eingeschoben), die MCP-Tür prüft asOf echt
// (tests/mcp-paritaet.test.ts:128), der Editor zeigt und speichert beide Felder
// (tests/components/MemoryEditor.test.tsx:253), die Zeitregel nimmt nur auf, was zum
// Zeitpunkt schon da war (tests/lib/graphTime.test.ts:102), der Regler zieht rückwärts
// (tests/components/KnowledgeGraph.leiste.test.tsx:183), ferne Adressen sind nur
// gewählte Anbieter (tests/keine-telemetrie.test.ts:73), die Lizenzroute ist tot
// (tests/keine-grenzen.test.ts:102). Gleiche Lesart wie P162-P165: Satz-Riss und
// zeug-Regel importiert, nicht nachgebaut.
describe("P166: asOf-Paar und Telemetrie-Triade nennen ihre Zeugen", () => {
  const p166Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /Every memory carries a validity window, so the graph can be replayed|The same question works in search|No upload, no account, no telemetry/.test(s),
    );

  it("die drei Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p166Saetze().length, `die Sonde findet ${p166Saetze().length} P166-Saetze`).toBe(3);
  });

  it("jeder der drei traegt sein Messzeug im selben Satz", () => {
    const nackt = p166Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P167 — der Privat-Restcluster: die Keychain-Zelle (README:74, "K3PTA stores the
// database key there, so there is no password to type") und der Private-provably-Satz
// (README:91, "Everything lives in ~/.kepta/, encrypted on disk, no account, no
// telemetry"). Zeugen: tests/core/schluessel.test.ts:150 waehlt je Betriebssystem den
// eignen Geheimnis-Speicher (Keychain/DPAPI/Secret Service); tests/keine-telemetrie.test.ts:73
// haelt jede ferne Adresse fuer gewaehlten Anbieter oder benannte Ausnahme,
// tests/keine-grenzen.test.ts:102 haelt die Lizenzroute tot. Der dritte Kandidat
// (README:267, "not a single byte leaves the machine") hat KEINE bereite Wache und
// bleibt eigene Scheibe — hier wird nichts mit einem geborgten Zeugen bewaffnet.
// Gleiche Lesart wie P162-P166: Satz-Riss und zeug-Regel importiert.
describe("P167: Keychain-Zelle und Private-provably-Satz nennen ihre Zeugen", () => {
  const p167Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /K3PTA stores the database key there, so there is no password to type|Everything lives in/.test(s),
    );

  it("die zwei Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p167Saetze().length, `die Sonde findet ${p167Saetze().length} P167-Saetze`).toBe(2);
  });

  it("jeder der zwei traegt sein Messzeug im selben Satz", () => {
    const nackt = p167Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P168 — der in P167 vertagte Satz README:267 ("With no AI configured, not a single
// byte leaves the machine"). Der Zeuge war doch bereit: tests/electron-haertung.test.ts:107
// liest connect-src des Electron-Inhalts-Sicherheitsplans und weist jeden fremden Host
// ab — die Oberfläche darf nur zu sich selbst und diesem Rechner verbinden. Kein Neubau,
// sondern Bewaffnen. Die Server-Seite (Chat/Embed) ruft nur bei gewähltem Anbieter nach
// aussen, der Clipper nur auf Nutzeraktion; das beschreibt der Zeuge nicht mit — die
// Klammer nennt nur, was der Test hält. Gleiche Lesart wie P162-P167.
describe("P168: 'kein Byte ohne KI' nennt seine Egress-Wache", () => {
  const p168Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /With no AI configured, not a single byte leaves the machine/.test(s),
    );

  it("der Satz wird gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p168Saetze().length, `die Sonde findet ${p168Saetze().length} P168-Saetze`).toBe(1);
  });

  it("er traegt sein Messzeug im selben Satz", () => {
    const nackt = p168Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `dieser Satz steht ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 400)}`).toEqual([]);
  });
});

// P169 — der Sprach- und Embedding-Cluster (README:88 Satz 2: "On a four-note check...",
// README:88 letzter Satz: "Changing the default would also mean re-embedding every
// stored note...", README:126: "Persistent embeddings via Ollama...", und README:460
// Satz 1: "npm run eval:sprache — the same 58-note corpus, 15 pairs drawn from its 45
// queries..."). Zeugen: scripts/embed-sprachtest.ts + tests/embeddings.test.ts:298
// (vier zweisprachige Notiz-/Fragenpaare und Rang-1-Cosinus-Zählung auf nomic-embed-text),
// tests/store.test.ts:129 (chunksNeedingEmbedding wählt Modell-Mismatch zum Re-Embed),
// tests/engine.test.ts:115 (Fremdmodell-Chunks bleiben aus dem Vektor-Bein draussen),
// tests/konkurrenz-sprachstufen.test.ts:93 (beide Seiten von eval:sprache),
// tests/embeddings.test.ts:166/:229/:327 (Standardmodell nomic-embed-text, Queue-Tick
// schreibt Vektoren, Suche bettet danach nur den Suchtext ein), und
// scripts/eval-sprachuebergriff.ts + tests/embeddings.test.ts:354 (15 Paare aus 45
// Anfragen des 58-Notizen-Korpus mit geerbten Antwort-Sets). Gleiche Lesart wie P162-P168.
describe("P169: Sprach- und Embedding-Cluster nennt seine Zeugen", () => {
  const p169Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /On a four-note check|Changing the default would also mean re-embedding every stored note|computed by a background queue instead of re-embedding on every query|15 pairs drawn from its 45 queries/.test(
        s,
      ),
    );

  it("die vier Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p169Saetze().length, `die Sonde findet ${p169Saetze().length} P169-Saetze`).toBe(4);
  });

  it("jeder der vier traegt sein Messzeug im selben Satz", () => {
    const nackt = p169Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 600)}`).toEqual([]);
  });
});

// P170 (09.11.2026): Acht Feature-, Graph- und Pflege-Versprechen in README.md (:107,
// :112, :139, :150, :159, :169, :228, :231) waren im Aussendungssatz als "absolut,
// ohne_zeug" gezaehlt, obwohl ihre Zeugen im Baum stehen:
// - :107 (Re-read imported files counts first, writes after confirm): tests/server.test.ts:556
// - :112 (Import your AI history, searchable note with date and tag): tests/import-chat-api.test.ts:93/:110
// - :139 (Single-note title-echo left out of concept count): tests/components/KnowledgeGraph.render.test.tsx:3840 + tests/lib/graphLayout.begriffsaufnahme.test.ts:46
// - :150 (Schema panel counts kinds, concepts, claim types): tests/components/KnowledgeGraph.render.test.tsx:3415/:3430
// - :159 (Settings live in encrypted data directory, survive port change): tests/lib/ai-settings.test.ts:48/:76
// - :169 (Contradictions careful filter rules): tests/lib/widersprueche.test.ts:32
// - :228 (Duplicate review side by side, keep richest or dismiss): tests/components/DuplicatesPanel.test.tsx:51/:98/:164
// - :231 (Text size 100/115/130 % under Settings -> Display): tests/components/Settings-textgroesse-wirkt.test.tsx:36 + tests/components/Settings-textgroesse-ohne-ueberlauf.test.tsx:55
// Gleiche Lesart wie P162-P169.
describe("P170: Feature- und Pflege-Versprechen in README.md nennen ihre Zeugen", () => {
  const p170Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /Files imported with an older extraction can be read again|every conversation with at least one answer becomes a searchable note|a term that exists only because it repeats the title of the single note carrying it|what the store holds, counted: kinds of note, concepts, and every claim type by name|the desktop shell binds to a free port that changes on every launch|only facts and how-tos are compared, both sentences must share their meaningful words|every group side by side, one click to keep the richest copy or dismiss the pair for good|under \*Settings → Display\*/.test(
        s,
      ),
    );

  it("die acht Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p170Saetze().length, `die Sonde findet ${p170Saetze().length} P170-Saetze`).toBe(8);
  });

  it("jeder der acht traegt sein Messzeug im selben Satz", () => {
    const nackt = p170Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 900)}`).toEqual([]);
  });
});

// P171 (09.11.2026): Zwoelf Lokal-, Keine-Grenzen-, Team- und Eval-Versprechen in
// README.md (:168, :181, :209, :260, :266, :297 x2, :353, :357, :358, :362, :459)
// waren im Aussendungssatz als "absolut, ohne_zeug" gezaehlt, obwohl ihre Zeugen im
// Baum stehen:
// - :168 (Today read straight from local database): tests/enterprise-api.test.ts:207 + tests/electron-haertung.test.ts:107
// - :181 (No license server, no phone-home, one file): tests/richtlinien.test.ts:106 + tests/keine-telemetrie.test.ts:73
// - :209 (Model discovery for Ollama and LM Studio, no key required): tests/components/chat-custom-verbunden.test.tsx:108 + tests/lib/verbindung-lokal-ohne-schluessel.test.ts:12
// - :260 (All data in ~/.kepta/ — one SQLite file): tests/core/store-verschluesselung.test.ts:76 + tests/testkapsel.test.ts:107
// - :266 Satz 1 (No account, no telemetry, nothing to activate): tests/keine-grenzen.test.ts:102/:116
// - :297 Satz 1 (No service in between, no account, no telemetry): tests/keine-telemetrie.test.ts:73 + tests/herkunft.test.ts:151
// - :297 Satz 3 (Your memories are stored only in that encrypted SQLite file): tests/core/store-verschluesselung.test.ts:76 + tests/keine-telemetrie.test.ts:73
// - :353 Satz 1 (K3PTA Core free, K3PTA Enterprise by agreement): tests/doku-zahlen.test.ts:338 + tests/keine-grenzen.test.ts:72
// - :357 Satz 4 (no route, no header, no anchor, no strings): tests/keine-grenzen.test.ts:92/:102/:107/:116
// - :358 Satz 3 (Without that file there is no team workspace): tests/team.test.ts:161 + tests/components/TeamView.test.tsx:30
// - :362 Satz 2 (no self-serve checkout, no longer a key to issue): tests/doku-zahlen.test.ts:332 + tests/keine-grenzen.test.ts:102
// - :459 Satz 3 (eval's third leg lands on the same 76 %): docs/belege/tag-0311/eval-drei-beine-1352.log.txt + tests/doku-zahlen.test.ts:223
// Gleiche Lesart wie P162-P170.
describe("P171: Keine-Grenzen-, Lokal- und Eval-Versprechen in README.md nennen ihre Zeugen", () => {
  const p171Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /Read straight from the local database: no AI involved|No license server, no phone-home, no extra infrastructure|Model discovery for Ollama and LM Studio in one click|All data in ~\/\.kepta\/ — one SQLite file that belongs to you|the app validates no key, so there is no check of any kind to call home for|No service in between, no account, no telemetry|there is no server of mine for them to reach|There are two things in the world: K3PTA Core, free|no route, no header, no anchor, no strings|Without that file there is no team workspace|There is no self-serve checkout anywhere|The eval's third leg, measured independently on 2026-11-03, lands on the same 76 %/.test(
        s,
      ),
    );

  it("die zwoelf Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p171Saetze().length, `die Sonde findet ${p171Saetze().length} P171-Saetze`).toBe(12);
  });

  it("jeder der zwoelf traegt sein Messzeug im selben Satz", () => {
    const nackt = p171Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 1200)}`).toEqual([]);
  });
});

// P172 (09.11.2026): Alle 19 verbleibenden technischen, Architektur-, Paket-, SDK-
// und Beleg-Versprechen in README.md (:37 x3, :349, :359 x2, :371, :379, :385 x2,
// :397, :403, :405, :413, :450 x2, :454, :456, :461) nennen ihre Zeugen im selben
// Satz. (Die uebrigen 5 Einheiten in README.md sind reine Produktcopy/Ueberschriften/
// Glossar ueber fremde KI-Programme ohne K3PTA: :3, :5, :45, :70, :89.)
describe("P172: Architektur-, Paket-, SDK- und Beleg-Versprechen in README.md nennen ihre Zeugen", () => {
  const p172Saetze = () =>
    satzeAusMarkdown(README).filter((s) =>
      /The machine state printed in the same artefacts says why no millisecond|What a frame costs at each size is timed in|The third view, \*Semantic\*, places the same notes by what their texts mean|Standard library only, no dependencies|No plugin store, and that is not a lock|K3PTA loads no third-party code, so there is nothing to approve|The engine underneath this app is source-available — BUSL-1\.1|No path, nothing to build — npx fetches the server the first time it is needed|If you would rather not have npx check the registry on every start|In the installed app that page offers a third way first: the MCP server that ships inside K3PTA|No other platform has a downloadable app, and nothing here pretends otherwise|The engine itself runs on all three \(kepta-mcp on npm, or from source\)|The packages are self-contained; you only need Node ≥ 22\.13 to build them yourself|The fastest way through, and the one that works on every macOS version|The server code lives in server\/ — server\/app\.ts assembles|The gates sit a little below what is reached, so they can only move up|Obsidian is excellent for humans — but Markdown is not a memory|Every figure below is a run of this repository's own tools|An explanation counts only if the sentence names the word itself/.test(
        s,
      ),
    );

  it("die neunzehn Saetze werden gefunden — die Sonde meldet keinen Erfolg fuer Ungelesenes", () => {
    expect(p172Saetze().length, `die Sonde findet ${p172Saetze().length} P172-Saetze`).toBe(19);
  });

  it("jeder der neunzehn traegt sein Messzeug im selben Satz", () => {
    const nackt = p172Saetze().filter((s) => !zeug.test(s));
    expect(nackt, `diese Saetze stehen ohne Zeugen da:\n  ${nackt.join("\n  ").slice(0, 1500)}`).toEqual([]);
    expect(fs.readFileSync(path.join(process.cwd(), "python/pyproject.toml"), "utf8")).toContain("dependencies = []");
  });
});



