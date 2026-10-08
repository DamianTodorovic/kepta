import { describe, it, expect } from "vitest";
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
// npm-Bündel wandern zusammen (3.1.4), die Registry-Datei darf nur eine
// veröffentlichte Engine-Version nennen. Stand gemessen 08.10.2026 über
// registry.npmjs.org/kepta-mcp (dist-tags.latest) und über die MCP-Registry
// (neuester Eintrag von io.github.DamianTodorovic/kepta): 3.1.2.
const VEROEFFENTLICHTE_ENGINE = "3.1.2";

describe("MCP-Registry: Versionen an ihrem rechten Ort", () => {
  it("App und ihr npm-Bündel wandern zusammen", () => {
    expect(npmPaket.version).toBe(app.version);
  });

  it("server.json nennt innen und außen dieselbe Version", () => {
    expect(server.packages[0].version).toBe(server.version);
  });

  it("server.json nennt eine Engine-Version, die es auf npm wirklich gibt", () => {
    expect(
      server.version,
      `server.json verspricht npx kepta-mcp@${server.version} — veröffentlicht ist ${VEROEFFENTLICHTE_ENGINE}`
    ).toBe(VEROEFFENTLICHTE_ENGINE);
  });
});
