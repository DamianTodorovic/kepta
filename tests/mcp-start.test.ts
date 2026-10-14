// @vitest-environment node
//
// Der MCP-Server steckt in der fertigen App: das K3PTA-Programm startet ihn
// selbst als Node. Damit brauchen Agenten weder Node.js noch npm — und
// stolpern nicht über eine npm-Fassung, die die verschlüsselte Datei nicht
// öffnen kann.
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { KeptaStore } from "../src/core/store";

let server: typeof import("../server");

beforeAll(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kepta-mcp-start-"));
  process.env.HOME = dir;
  process.env.KEPTA_DATA_DIR = dir;
  process.env.KEPTA_NO_AUTOSTART = "1";
// Hermetisch: Tests dürfen nie den echten Schlüsselbund berühren (22.9. gelernt —
// ein Keychain-Zugriff aus Tests hat den echten Datenbank-Schlüssel überschrieben).
// Die Nebendateien-Verschlüsselung selbst deckt tests/nebendateien.test.ts mit
// eigenen Schlüsseln ab.
process.env.KEPTA_ENCRYPTION = "off";
  server = await import("../server");
});

describe("mcpStartInDerApp", () => {
  it("gibt es nur in der fertigen App", () => {
    expect(server.mcpStartInDerApp(undefined, "/usr/local/bin/node", "/repo/dist")).toBeNull();
  });

  it("startet den mitgelieferten Server mit dem K3PTA-Programm als Node", () => {
    expect(server.mcpStartInDerApp("44.0.0", "/Applications/KEPTA.app/Contents/MacOS/KEPTA", "/Applications/KEPTA.app/Contents/Resources/app.asar/dist")).toEqual({
      command: "/Applications/KEPTA.app/Contents/MacOS/KEPTA",
      args: ["/Applications/KEPTA.app/Contents/Resources/app.asar/dist/mcp-server.cjs"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
    });
  });

  it("/api/health meldet den Weg — außerhalb der App ist er leer", async () => {
    const store = new KeptaStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kepta-mcp-start-")), "t.db"));
    const res = await request(server.createApp(store)).get("/api/health");
    expect(res.body.mcp).toMatchObject({ http: "/mcp", stdio: null });
    store.close();
  });
});
