// Pfade des Servers — gebündelt (CJS: __dirname = dist/) und im Dev-Lauf (tsx-ESM:
// kein __dirname, Repo-Verzeichnis). Geteilt von Health, Einrichtungs-Routen,
// pdf.js und dem Bootstrap, damit keiner einen Zirkel-Import bauen muss.
import path from "path";
import fs from "fs";

export function serverVerzeichnis(): string {
  // Gebaut (CJS-Bundle): __dirname. Dev (tsx/ESM): das Repo-Verzeichnis.
  if (typeof __dirname !== "undefined") return __dirname;
  return process.cwd();
}

export function resolveDistDir(): string {
  try {
    if (typeof __dirname === "string" && fs.existsSync(path.join(__dirname, "server.cjs"))) return __dirname;
  } catch { /* tsx-ESM: kein __dirname */ }
  return path.join(process.cwd(), "dist");
}
