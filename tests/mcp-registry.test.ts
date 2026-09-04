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

  it("verweist auf das Paket, das wirklich veroeffentlicht wird", () => {
    const paket = server.packages[0];
    expect(paket.registryType).toBe("npm");
    expect(paket.identifier).toBe(npmPaket.name);
    expect(paket.transport.type).toBe("stdio");
  });
});

describe("MCP-Registry: eine Version an vier Stellen", () => {
  it("App, npm-Paket, server.json und Paketeintrag tragen dieselbe Version", () => {
    expect(server.version).toBe(app.version);
    expect(npmPaket.version).toBe(app.version);
    expect(server.packages[0].version).toBe(app.version);
  });
});
