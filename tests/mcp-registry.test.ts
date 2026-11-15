import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";

// Die offizielle MCP-Registry ist der Ort, an dem Menschen nach MCP-Servern suchen.
// Ein Eintrag dort haengt an vier Angaben, die zusammenpassen muessen — und die an
// vier verschiedenen Stellen stehen. Laeuft eine davon weg, wird die
// Veroeffentlichung abgelehnt, und man erfaehrt es erst beim Hochladen.
const wurzel = process.cwd();
const lies = (p: string) => JSON.parse(fs.readFileSync(path.join(wurzel, p), "utf-8"));

const server = lies("server.json");
const npmPaket = lies("npm/package.json");
const app = lies("package.json");

describe("server.json: das Schema", () => {
  it("erfuellt das offizielle MCP-Schema", () => {
    // Die Schemakopie liegt im Repo, damit der Test ohne Netz laeuft. Sie stammt aus
    // https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
    const schema = lies("schemas/mcp-server.schema.json");
    const ajv = new Ajv({ strict: false, allErrors: true });
    const pruefe = ajv.compile(schema);
    const gueltig = pruefe(server);
    const fehler = (pruefe.errors ?? []).map((f) => `${f.instancePath || "/"} ${f.message}`);
    expect(fehler).toEqual([]);
    expect(gueltig).toBe(true);
  });

  it("haelt die Laengenbegrenzung der Beschreibung ein", () => {
    // 100 Zeichen, hart. Daran scheitert die Veroeffentlichung sonst wortlos.
    expect(server.description.length).toBeGreaterThan(0);
    expect(server.description.length).toBeLessThanOrEqual(100);
  });

  it("traegt einen Namen im Reverse-DNS-Format mit genau einem Schraegstrich", () => {
    expect(server.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
    expect(server.name.split("/")).toHaveLength(2);
  });
});

describe("MCP-Registry: der Besitznachweis", () => {
  it("npm mcpName entspricht dem Servernamen", () => {
    // Die Registry prueft ueber dieses Feld, dass das npm-Paket wirklich zu diesem
    // Eintrag gehoert. Weichen die beiden ab, wird der Eintrag abgelehnt.
    expect(npmPaket.mcpName).toBe(server.name);
  });

  it("nennt den GitHub-Nutzer buchstabengenau so wie das Repository", () => {
    // Die Registry vergleicht den Namensraum zeichengenau: "io.github.damiantodorovic"
    // wurde mit 403 abgelehnt, obwohl GitHub-Namen sonst gross-/kleinschreibungsblind
    // sind. Der Repository-Pfad ist die einzige Quelle im Repo, die die richtige
    // Schreibweise kennt — also wird dagegen geprueft.
    const url: string = npmPaket.repository?.url ?? "";
    const besitzer = url.match(/github\.com\/([^/]+)\//)?.[1];
    expect(besitzer).toBeTruthy();
    expect(server.name).toBe(`io.github.${besitzer}/kepta`);
  });

  it("verweist auf das Paket, das wirklich veroeffentlicht wird", () => {
    const paket = server.packages[0];
    expect(paket.registryType).toBe("npm");
    expect(paket.identifier).toBe(npmPaket.name);
    expect(paket.transport.type).toBe("stdio");
  });
});

// Die Registry-Beschreibung ist eine Installationsanweisung, kein Tagebuch:
// `npx kepta-mcp@<version>` muss es auf npm wirklich geben. App und ihr eigenes
// npm-Bündel wandern zusammen, die Registry-Datei darf nur eine veröffentlichte
// Engine-Version nennen.
//
// Die Zahl darunter war bis 13.10. eine in diesem Datei versteckte Abschrift
// ("3.3.0", mit Datum und Publish-Lauf im Kommentar) — ein Kommentar, der eine
// Behauptung über die Welt festschreibt, und die Wache hätte sie auch dann
// bestätigt, als npm längst weiter war. Seit 13.10. fragt der Fall die Welt selbst:
// `npm view kepta-mcp version` ist die Wahrheit des Registers, und server.json muss
// sie treffen. Ohne Netz vergleicht der Fall, was er ohne Netz sehen kann (die zwei
// Felder derselben Datei), und sagt im Fehltext, dass die Außenprüfung nicht lief —
// ein stiller Fallback, der wie eine Prüfung aussieht, wäre der Fehler, den dieser
// Fall gerade heilt.
function veroeffentlichteEngine(): string | null {
  try {
    return execFileSync("npm", ["view", "kepta-mcp", "version"], {
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

describe("MCP-Registry: Versionen an ihrem rechten Ort", () => {
  it("App und ihr npm-Bündel wandern zusammen", () => {
    expect(npmPaket.version).toBe(app.version);
  });

  it("server.json nennt innen und außen dieselbe Version", () => {
    expect(server.packages[0].version).toBe(server.version);
  });

  it("server.json nennt eine Engine-Version, die es auf npm wirklich gibt", () => {
    const registrier = veroeffentlichteEngine();
    if (!registrier) {
      // Kein Netz: die Innenpruefung bleibt, die Aussenpruefung ist nicht erfolgt.
      expect(server.packages[0].version, "ohne Netz: mindestens die beiden Felder derselben Datei").toBe(server.version);
      console.warn("mcp-registry: npm nicht erreichbar — die Aussenpruefung lief nicht, verglichen wurden nur die Felder derselben Datei.");
      return;
    }
    expect(
      server.version,
      `server.json verspricht npx kepta-mcp@${server.version} — der Register meldet latest ${registrier}`
    ).toBe(registrier);
  });
});
