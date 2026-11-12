// ESLint 9 — flat config (seit 2026 Standard). Verstand: TypeScript-Logik und
// die Rules of React. Formatierung bleibt dem Editor überlassen — lint:eslint
// ist ein Gate gegen echte Fehler, kein Stil-Streit.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      // Die privaten Bauordner der Welle (`vite build --outDir dist-<kuerzel>`) sind
      // auch gebauter Haufen, nicht Quelltext. Ohne diese Zeile lintet das Gate
      // minifizierte Bundles: gemessen 11.10. ergaben acht getrackte Dateien aus
      // `dist-e1/` und `dist-e3/` zusammen 11.100 „Fehler".
      "dist-*/**",
      // Die Design-Skill-Bäume (P201-Schlag: hallmark, krehel, impeccable samt
      // absichtlich kaputter Proben in scripts/fixtures) sind Werkzeug-Wissen, kein
      // Produktquelltext — das Gate lintet sie nicht (gemessen 13.11.: 544 „Fehler"
      // aus zwei Bäumen, null aus src).
      "agent/**",
      ".agents/**",
      ".github/skills/**",
      ".claude/skills/**",
      "release/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "npm/**",
      "tools/license-studio/**",
      "public/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // JavaScript-Bestandteile (Electron-Hülle, Skripte) kennen ihre Globals
    // nicht aus dem Typsystem — daher hier gesetzt.
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // TypeScript kennt seine Globals selbst — no-undef produziert hier nur
      // Falschpositive (Empfehlung von typescript-eslint selbst).
      "no-undef": "off",
      // Die Rules of React sind das Fundament des React Compiler (neuere
      // Versionen brauchen sie unverletzt) — Verletzungen wären Runtime-Bugs.
      ...reactHooks.configs.recommended.rules,
      // Leere catch-Blöcke sind hier bewusste Abfänger (defensive Guards mit
      // Kommentar daneben) — kein Fehler, den der Compiler nicht fände.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // K3PTA schrubbt Steuerzeichen als Produktversprechen (NUL, \x00-\x1F
      // raus aus Notizen) — die Regexe, die sie finden, sind der legitime Einsatz.
      "no-control-regex": "off",
      // Ungenutzte Vars sind hier zu oft bewusste Dokumentation (verwerfende
      // Muster, optionale Parameter) — als Warn sichtbar, ohne Build zu brechen.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-ignore": "allow-with-description", "ts-expect-error": "allow-with-description" }],
    },
  },
  {
    // Tests dürfen require/CreateRequire nutzen (Native-Module, Paketprobe);
    // die CJS-Build-Skripte in scripts/ sind ohnehin CommonJS.
    files: ["tests/**", "scripts/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // In src/ bleibt der ungenutzte Name eine Warnung: dort versteckt sich dahinter ein
    // verwerfendes Muster oder ein optionaler Parameter. In scripts/ ist er ein Messfehler:
    // am 3.11. trug scripts/ablation.ts nach dem Umzug des Korpusaufbaus nach
    // scripts/eval-store.ts noch `tmpdir`, `path` und `fs` — drei Namen, die ein
    // halbfertiger Schnitt hinterlässt. Ein Werkzeug, das totes Gepäck mitschleppt, ist
    // nicht verlässlich genug, um eine Zahl zu tragen, die in der Oberfläche steht.
    files: ["scripts/**/*.ts", "scripts/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
