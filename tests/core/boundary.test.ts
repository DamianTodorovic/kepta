import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// The keeper test for the confidentiality claim: the memory core (src/core)
// may only reach Node built-ins and its own files. No UI imports, no runtime
// packages, no network clients. If any import line here starts failing, the
// "your data never leaves the machine" property has lost its guard.

const CORE_DIR = path.resolve(__dirname, "../../src/core");

function importSpecifiers(file: string): string[] {
  const src = fs.readFileSync(file, "utf-8");
  const out: string[] = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?from\s+)?"([^"]+)"/g,
    /(?:^|\n)\s*export\s+[^;]*?from\s+"([^"]+)"/g,
    /(?:^|\n)\s*(?:const|let|var)\s+[\s\S]*?require\("([^"]+)"\)/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) out.push(m[1]!);
  }
  return out;
}

describe("memory core boundary (src/core)", () => {
  const coreFiles = fs
    .readdirSync(CORE_DIR)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.join(CORE_DIR, f));

  it("contains exactly the known core files (no silent additions)", () => {
    const names = coreFiles.map((f) => path.basename(f)).sort();
    expect(names).toEqual([
      "embeddings.ts",
      "engine.ts",
      "mcp.ts",
      "migrate.ts",
      "obsidian.ts",
      "stopwords.ts",
      "store.ts",
      "types.ts",
      "version.ts",
    ]);
  });

  it("imports only node built-ins and its own modules", () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      for (const spec of importSpecifiers(file)) {
        const isBuiltIn = spec.startsWith("node:");
        const isOwnModule = spec.startsWith("./") || spec.startsWith("../");
        if (!isBuiltIn && !isOwnModule) violations.push(`${path.basename(file)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains no network endpoints outside localhost", () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      const src = fs.readFileSync(file, "utf-8");
      for (const m of src.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
        const url = m[0]!;
        if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
          violations.push(`${path.basename(file)} → ${url}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
