import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { APP_VERSION } from "../src/core/version";
import { SERVER_INFO } from "../src/core/mcp";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8")) as { version: string };

// Es gibt EINE Versions-Quelle: src/core/version.ts. Health-Endpoint und MCP SERVER_INFO
// importieren sie; dieser Test verhindert Versions-Drift zur package.json.
describe("Versions-Quelle", () => {
  it("package.json, APP_VERSION und MCP SERVER_INFO stimmen überein", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe(APP_VERSION);
    expect(SERVER_INFO.version).toBe(APP_VERSION);
  });
});
