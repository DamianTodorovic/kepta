// K3PTA-Server — Einstiegspunkt.
//
// Diese Datei ist eine schlanke Fassade: seit dem Refactoring 2026-09 lebt die
// App in server/app.ts (Middleware-Kette) und server/router/* (Fachrouten),
// der Start in server/bootstrap.ts. Sie bleibt, damit der esbuild-Aufruf im
// Build (`esbuild server.ts --bundle`) unverändert bündelt und bestehende
// Abnehmer (Electron-Hülle, Tests) dieselben Exporte finden:
//   - createApp / AppOptionen        (Tests bauen die App daraus)
//   - mcpStartInDerApp               (tests/mcp-start.test.ts)
//   - uebernimmSettingsDatei         (öffentlicher Helfer, wird in settings.ts genutzt)
//   - serverStart                    (die Electron-Hülle fängt Startfehler damit)
export { createApp, type AppOptionen } from "./server/app";
export { mcpStartInDerApp } from "./server/helfer/mcp-start";
export { uebernimmSettingsDatei } from "./server/helfer/settings-datei";
export { startServer } from "./server/bootstrap";

import { startServer } from "./server/bootstrap";

// Nur automatisch starten, wenn direkt ausgeführt (nicht beim Import in Tests).
// Das Versprechen geht nach aussen: scheitert der Start — etwa weil der
// Schluessel nicht zur verschluesselten Datenbank passt —, zeigt die
// Electron-Huelle den Grund an, statt auf einen Server zu warten, den es nie gibt.
export const serverStart: Promise<void> | undefined =
  process.env.KEPTA_NO_AUTOSTART !== "1" ? startServer() : undefined;
serverStart?.catch((e: unknown) => {
  console.error(`K3PTA could not start: ${e instanceof Error ? e.message : String(e)}`);
  if (!process.versions.electron) process.exit(1);
});
