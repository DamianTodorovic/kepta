import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    testTimeout: 20_000,
    // Default-Umgebung node (src/core, server.ts).
    // src/lib ist Browser-Code → die betroffenen Testdateien setzen oben
    // den Docblock `// @vitest-environment jsdom` (vitest 4: pro Datei statt Glob).
    environment: "node",
    setupFiles: ["tests/setup.ui.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Nur die testbare Logik zählt in den Nenner — kein Build, keine reinen Typen, kein Electron-Bootstrap.
      // Bei Komponenten sind gezielt die getesteten gelistet (nicht die großen UI-Container
      // Dashboard/Chat/KnowledgeGraph, die separater E2E-Arbeit bedürfen).
      include: [
        "src/core/**",
        "src/lib/**",
        "server.ts",
        "src/components/KeptaMark.tsx",
        "src/components/MemoryCard.tsx",
        "src/components/CommandPalette.tsx",
        "src/components/ui/Toast.tsx",
      ],
      exclude: ["src/**/types.ts", "**/*.d.ts"],
      thresholds: {
        // Global über core + lib + server. server.ts ist zur Hälfte externer
        // LLM-Provider-Proxy + Bootstrap (listen/Vite) — daher global etwas unter
        // den Kern-Werten. Schwellen mit kleinem Puffer unter dem real Erreichten.
        statements: 84,
        functions: 90,
        branches: 68,
        lines: 89,
        // Der Kern ist das Produkt — praktisch Vollabdeckung.
        // Funcs 100% (jede Kernfunktion getestet), Lines/Stmts hoch; Branch etwas
        // niedriger, da defensive DB-ROLLBACK/catch-Zweige bewusst nicht per
        // künstlicher Sabotage getestet werden (ehrliche Gates statt Alibi-Tests).
        "src/core/**": {
          statements: 94,
          functions: 100,
          branches: 78,
          lines: 97,
        },
        // src/lib (Browser-Logik unter jsdom) — hohe Abdeckung der Geschäftslogik.
        "src/lib/**": {
          statements: 90,
          functions: 90,
          branches: 80,
          lines: 92,
        },
        // Getestete UI-Komponenten (Testing-Library unter jsdom).
        "src/components/**": {
          statements: 88,
          functions: 85,
          branches: 65,
          lines: 88,
        },
      },
    },
  },
});
