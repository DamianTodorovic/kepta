import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Forks-Pool (nicht Threads) — SQLite/Datei-Tests laufen isoliert pro Prozess.
    // Der GitHub-CI-Hänger (Sept. 2026) war NICHT die Poolwahl: fs.mkdirSync auf
    // einem /proc-Pfad im Audit-Test blockiert auf procfs endlos synchron (Test
    // behoben). singleFork entfiel: vitest 4 hat poolOptions entfernt.
    // @ts-ignore — vitest-Typen unterscheiden sich zwischen Versionen
    pool: "forks",
    // 60 s statt 20 s — nicht weil ein Test langsam wäre, sondern weil die
    // Suite auf diesem Rechner mitläuft, während andere Agenten Browser- und
    // Build-Arbeit fahren. Gemessen am 6.10.: der 400-Knoten-Physikfall braucht
    // allein 1,3 s; in einem vollen Parallel-Lauf bei gesättigter Maschine lief
    // seine Datei in 43 s und der Fall fiel als Zeitüberschreitung aus — ein
    // rotes Ergebnis ohne Fehler im Code. Vitest 5 kennt keine Obergrenze für
    // Forks mehr (--fileParallelism schaltet nur ganz ab, --maxConcurrency
    // zählt Tests innerhalb einer Datei), also ist das die einzige Schraube,
    // die eine Überbelegung nicht als Defekt aussehen lässt.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Default-Umgebung node (src/core, server.ts).
    // src/lib ist Browser-Code → die betroffenen Testdateien setzen oben
    // den Docblock `// @vitest-environment jsdom` (vitest 4: pro Datei statt Glob).
    environment: "node",
    setupFiles: ["tests/setup.http.ts", "tests/setup.ui.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Nur die testbare Logik zählt in den Nenner — kein Build, keine reinen Typen, kein Electron-Bootstrap.
      // Bei Komponenten sind gezielt die getesteten gelistet. KnowledgeGraph galt lange als
      // nicht prüfbar (jsdom hat keinen 2D-Kontext) — genau dort landeten dann die Fehler.
      // Mit der buchführenden Leinwand aus tests/helfer/canvas.ts steht sie jetzt mit drin;
      // offen bleiben Dashboard und Chat.
      include: [
        "src/core/**",
        "src/lib/**",
        "src/scan/**",
        "server.ts",
        // Die zerlegte Server-App (Refactoring 2026-09): Middleware-Kette,
        // Helfer und Fachrouten zählen mit — nicht aber der Bootstrap, der
        // Ports bindet und in Unit-Läufen nie startet (kein testbarer Wert).
        "server/app.ts",
        "server/helfer/**",
        "server/router/**",
        // Alle Komponenten. Es gibt keine ausgenommenen "grossen Container"
        // mehr — genau dort sassen die Fehler, die erst beim Hinsehen auffielen.
        "src/components/**",
      ],
      exclude: [
        "src/**/types.ts",
        "**/*.d.ts",
        // Browser-Glue um pdf.js (Worker + CMap-URL) — in jsdom nicht treibbar;
        // der Pfad wird indirekt über den Dashboard-PDF-Import-Test gedeckt.
        "src/lib/pdfText.ts",
      ],
      thresholds: {
        // Global über core + lib + scan + server + ALLE Komponenten. server.ts ist
        // zur Hälfte externer LLM-Provider-Proxy + Bootstrap (listen/Vite) — daher
        // global etwas unter den Kern-Werten. Schwellen mit kleinem Puffer unter
        // dem real Erreichten, damit sie nur nach oben wandern können.
        statements: 85,
        functions: 82,
        branches: 74,
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
        // src/scan ist die Regelbasis des Rechner-Scans. Eine Lücke dort ist kein
        // Schönheitsfehler, sondern ein Datenleck — daher Vollabdeckung.
        "src/scan/**": {
          statements: 98,
          functions: 100,
          branches: 90,
          lines: 98,
        },
        // src/lib (Browser-Logik unter jsdom) — hohe Abdeckung der Geschäftslogik.
        "src/lib/**": {
          statements: 90,
          functions: 90,
          branches: 80,
          lines: 92,
        },
        // ALLE UI-Komponenten (Testing-Library unter jsdom, Canvas ueber die
        // buchfuehrende Leinwand in tests/helfer/canvas.ts).
        //
        // Die Zahlen liegen niedriger als frueher — aber sie messen jetzt etwas
        // anderes: vorher zaehlten nur sechs handverlesene Komponenten in den
        // Nenner, die grossen Container Dashboard, Chat und Settings waren
        // ausgenommen. Genau dort sassen die Fehler, die erst beim Hinsehen
        // auffielen (ein Absturz des ganzen Einstellungs-Bildschirms bei einer
        // unvollstaendigen /api/health-Antwort). Ein niedrigerer Wert ueber
        // alles ist mehr wert als ein hoher ueber die einfachen Teile.
        "src/components/**": {
          statements: 80,
          functions: 72,
          branches: 71,
          lines: 84,
        },
      },
    },
  },
});
