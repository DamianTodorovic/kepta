import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test-Discovery: alle *.test.ts im Repo (Quelle: tests/).
    include: ["tests/**/*.test.ts"],
    // Die Umwelt-Grundlage vor jeder Datei — der Vertrag steht in
    // `tests/helfer/umwelt-basis.ts`, gewacht von `tests/umwelt-vertrag.test.ts`.
    // Geroettet wird hier nur die Reihenfolge: eine setupFile laeuft, BEVOR die Datei
    // importiert, also vor jedem `process.env.…` und jedem `vi.stubEnv` der Datei.
    setupFiles: ["tests/helfer/umwelt-setup.ts"],
    // Forks-Pool (nicht Threads) — SQLite/Datei-Tests laufen isoliert pro Prozess.
    // @ts-ignore — vitest-Typen unterscheiden sich zwischen Versionen
    pool: "forks",
    // Parallellauf, seit 12.10. — und das ist eine Vertragsänderung, keine
    // Tempomatfrage. Die Suite lief seriell (`fileParallelism: false`), weil
    // mehrere Testdateien eigene HTTP-Server starten und zwei sich ins Gehege
    // gerieten: der Befund sah wie ein Produktfehler aus („POST mit ungültiger
    // ID → 400" bekam 401 — die Antwort des *anderen* Servers). Gemessen damals:
    // `tests/server.test.ts` allein 50/50 grün, dieselbe Suite parallel 3 rot,
    // mit `--no-file-parallelism` 982 grün; Kosten 25,2 s parallel gegen 46,3 s
    // seriell. Die Ursache war nicht die Reihenfolge, sondern eine geschriebene
    // Zahl: `tests/server-einstellungs-maske.test.ts` band 8811, und ein zweiter
    // Lauf auf diesem Baum traf ihn.
    //
    // Jetzt gilt der andere Vertrag, und er ist gewacht
    // (`tests/port-vertrag.test.ts`, 7 Fälle): keine Testdatei nennt einen Port
    // als Zahl, keine importiert `server.ts` ohne `KEPTA_NO_AUTOSTART`, jeder
    // Port kommt aus dem Dateinamen (`tests/helfer/port-vergabe.ts` — Basis
    // 41000, Bereich 4000, Ausnahmen 3000/3001/3478/3479/5173/8811/11434), und
    // ein belegter Port scheitert hörbar, statt still auszuweichen. Die Dauer
    // dieser Umstellung ist unten am jeweiligen Lauf gemeldet, nicht hier.
    fileParallelism: true,
    // Die Geduld des Laufers, nicht ein Budget: 20 s waren der Default, und die
    //Suite hat 83 Dateien auf zehn Kernen, die sich ein Buero teilen. Gemessen am
    // Lauf 18:49:07 — `mobileassetd` 90,7 % CPU seit 42 Minuten, load1 92,8 auf 10
    // Kernen: die ganze Suite 388,76 s statt 101,64 s im gruenen Lauf eine halbe
    // Stunde vorher, und zwei fremde Import-Dateien (`import-claude`,
    // `import-ordner`, je 1 200 Dateien) rissen bei 20 000 ms ab, ohne dass ihr
    // Pfad etwas falsch machte. Ein Abbruch mitten im Fall ist ausserdem die
    // Kaskade von 18:02: der abgebrochene Fall schreibt weiter in den Bestand des
    // naechsten. Die zeitmessenden Faelle dieser Suite stehen deshalb einzeln auf
    // 180 000 ms, und ihr Urteil faellt trotzdem nicht die Maschine, sondern die
    // Ruhe-Klammer mit der Zusage-Pforte (`tests/helfer/zeit-zusage.ts`).
    testTimeout: 60_000,
    // Headless-Core: node-Umgebung, keine Browser-Komponenten im Repo.
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      // Der Headless-Core ist das ganze Repo: Engine, Verschluesselung,
      // MCP-Server und der Memory-API-Server. GUI-/Browser-Glue existiert hier
      // nicht (die Desktop-App lebt im kepta-app-Repository).
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
