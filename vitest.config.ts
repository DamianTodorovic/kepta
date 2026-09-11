import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test-Discovery: alle *.test.ts im Repo (Quelle: tests/).
    include: ["tests/**/*.test.ts"],
    // Forks-Pool (nicht Threads) — SQLite/Datei-Tests laufen isoliert pro Prozess.
    // @ts-ignore — vitest-Typen unterscheiden sich zwischen Versionen
    pool: "forks",
    testTimeout: 20_000,
    // Headless-Core: node-Umgebung, keine Browser-Komponenten im Repo.
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Der Headless-Core ist das ganze Repo: Engine, Verschluesselung,
      // MCP-Server und der Memory-API-Server. GUI-/Browser-Glue existiert hier
      // nicht (die Desktop-App lebt im kepta-enterprise-Repository).
      include: [
        "src/core/**",
        "server.ts",
      ],
      exclude: ["src/**/types.ts", "**/*.d.ts"],
      thresholds: {
        // Startwerte: gemessen am ersten CI-Lauf dieses Repos (8.9.2026),
        // mit Puffer darunter — sie wandern nur nach oben. Der Kern ist das
        // Produkt; Branch etwas niedriger, da defensive DB-ROLLBACK/catch-
        // Zweige bewusst nicht per kuenstlicher Sabotage getestet werden.
        statements: 66,
        functions: 72,
        branches: 56,
        lines: 70,
        "src/core/**": {
          statements: 85,
          functions: 89,
          branches: 74,
          lines: 87,
        },
      },
    },
  },
});
