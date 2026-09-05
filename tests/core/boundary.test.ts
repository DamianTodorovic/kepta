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
      "extensions.ts",
      "mcp.ts",
      "migrate.ts",
      "obsidian.ts",
      "praxissync.ts",
      "stopwords.ts",
      "store.ts",
      "types.ts",
      "version.ts",
    ]);
  });

  // A relative specifier is not automatically an own module: "../lib/ai" starts
  // with "../" and reaches the sixteen third-party providers. Testing the prefix
  // therefore proves nothing — the specifier has to be resolved, and the result
  // has to land inside src/core.
  function escapesCore(file: string, spec: string): boolean {
    if (spec.startsWith("node:")) return false;
    if (!spec.startsWith(".")) return true; // runtime package
    const resolved = path.resolve(path.dirname(file), spec);
    return resolved !== CORE_DIR && !resolved.startsWith(CORE_DIR + path.sep);
  }

  it("imports only node built-ins and files inside src/core", () => {
    const violations: string[] = [];
    for (const file of coreFiles) {
      for (const spec of importSpecifiers(file)) {
        if (escapesCore(file, spec)) violations.push(`${path.basename(file)} → ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("actually catches an import that leaves the core (guard against a green no-op)", () => {
    const probe = path.join(CORE_DIR, "engine.ts");
    // The exact violation that used to slip through: relative, yet outside src/core.
    expect(escapesCore(probe, "../lib/ai")).toBe(true);
    expect(escapesCore(probe, "../../src/lib/ai")).toBe(true);
    expect(escapesCore(probe, "openai")).toBe(true);
    // ...while the legitimate cases stay allowed.
    expect(escapesCore(probe, "./store")).toBe(false);
    expect(escapesCore(probe, "node:crypto")).toBe(false);
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
