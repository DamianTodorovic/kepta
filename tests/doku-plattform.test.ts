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
