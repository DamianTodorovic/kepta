// Pfade der Inbox — geteilt vom Rechner-Scan (ausgeschlossene Pfade) und der
// Inbox selbst (Watcher, Archivierung).
import path from "path";
import fs from "fs";

export function inboxOrdner(datenOrdner: string): string {
  return path.join(datenOrdner, "inbox");
}

/**
 * Archivordner der Inbox. Der Ordner hiess frueher "archiv"; wo er existiert,
 * bleibt er in Benutzung, damit bereits archivierte Dateien nicht ploetzlich
 * woanders liegen. Neue Installationen nutzen "archive".
 */
export function archiveDir(datenOrdner: string): string {
  const alt = path.join(inboxOrdner(datenOrdner), "archiv");
  try { if (fs.existsSync(alt)) return alt; } catch { /* nicht lesbar — dann eben der neue */ }
  return path.join(inboxOrdner(datenOrdner), "archive");
}
