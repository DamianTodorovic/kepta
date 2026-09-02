import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 20_000,
    // Default-Umgebung node (src/core, server.ts).
    // src/lib ist Browser-Code → die betroffenen Testdateien setzen oben
    // den Docblock `// @vitest-environment jsdom` (vitest 4: pro Datei statt Glob).
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Nur die testbare Logik zählt in den Nenner — kein Build, keine reinen Typen, kein Electron-Bootstrap.
      include: ["src/core/**", "src/lib/**", "server.ts"],
      exclude: ["src/**/types.ts", "**/*.d.ts"],
      thresholds: {
        statements: 95,
        functions: 95,
        branches: 88,
        lines: 95,
        // Der Kern ist das Produkt — hier gilt praktisch Vollabdeckung.
        "src/core/**": {
          statements: 98,
          functions: 100,
          branches: 92,
          lines: 98,
        },
      },
    },
  },
});
