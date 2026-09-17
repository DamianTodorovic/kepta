// Query-Erweiterung fuer die Suche: deutsche Fragen gegen englische Notizen
// (und umgekehrt). Damian fragt „Wie oft wird gesichert?" — die Notiz heisst
// „Backup schedule". Ohne dieses Lexikon finden sich solche Treffer nicht:
// BM25, Vektor und Reranking sehen „gesichert", die Notiz „backup" — nichts
// matcht. Die Erweiterung HAENGT die Synonyme an die Query (ersetzt nichts),
// eine Ebene tief, keine Ketten — der Nutzer schreibt wie immer, die Suche
// versteht beide Sprachen.
//
// Nur Ganzwörter (\\b-Grenzen) — „vat" soll nicht in „private" zünden.

const PAARE: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["gesichert", ["backup", "sicherung", "snapshot"]],
  ["backup", ["gesichert", "sicherung", "snapshot"]],
  ["sicherung", ["backup", "gesichert"]],
  ["snapshot", ["momentaufnahme", "backup"]],
  ["momentaufnahme", ["snapshot"]],
  ["umsatzsteuer", ["vat", "ust"]],
  ["vat", ["umsatzsteuer"]],
  ["abgegeben", ["filing", "einreichen", "deadline"]],
  ["einreichen", ["filing", "abgegeben"]],
  ["filing", ["einreichen", "abgegeben"]],
  ["passwort", ["password"]],
  ["password", ["passwort"]],
  ["kennwort", ["password", "passwort"]],
  ["datenbank", ["database", "db"]],
  ["database", ["datenbank"]],
  ["produktion", ["production"]],
  ["production", ["produktion"]],
  ["mandant", ["client", "kunde"]],
  ["kunde", ["client", "mandant"]],
  ["client", ["mandant", "kunde"]],
  ["rechnung", ["invoice"]],
  ["invoice", ["rechnung"]],
  ["frist", ["deadline"]],
  ["deadline", ["frist"]],
  ["steuer", ["tax"]],
  ["tax", ["steuer"]],
  ["loeschen", ["delete"]],
  ["löschen", ["delete"]],
  ["delete", ["loeschen", "löschen"]],
  ["wiederherstellen", ["restore"]],
  ["restore", ["wiederherstellen"]],
  ["aufbewahrung", ["retention"]],
  ["retention", ["aufbewahrung"]],
  ["vertrag", ["contract", "agreement"]],
  ["contract", ["vertrag"]],
  ["verschlüsselung", ["encryption"]],
  ["verschluesselung", ["encryption"]],
  ["encryption", ["verschlüsselung", "verschluesselung"]],
  ["server", ["host", "server"]],
  ["veranstaltung", ["event"]],
  ["event", ["veranstaltung"]],
  ["kosten", ["cost", "expenses"]],
  ["umsatz", ["revenue", "turnover"]],
  ["passwörter", ["passwort", "password", "manager"]],
  ["zugangsdaten", ["passwort", "password", "zugang", "login"]],
  ["wissensgraph", ["graph", "knowledge", "entitäten"]],
  ["nudeln", ["pasta", "spaghetti"]],
  ["koche", ["kochen", "rezept"]],
  ["kochen", ["rezept"]],
  ["fahrzeug", ["auto", "werkstatt"]],
  ["instand", ["werkstatt", "auto"]],
];

const LEXIKON = new Map<string, readonly string[]>(PAARE);

/**
 * Hängt für jeden Ganzwort-Term der Query seine Synonyme an — in gleicher
 * Reihenfolge wie das Original, Erweiterungen dahinter. Woher die Query kommt
 * (MCP, HTTP, Suchleiste) ist egal: die Erweiterung sitzt am Einstieg.
 */
export function erweitereQuery(query: string): string {
  const roh = query.trim();
  if (!roh) return roh;
  const terme = roh.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);
  const zusatz: string[] = [];
  for (const t of terme) {
    for (const synonym of LEXIKON.get(t) ?? []) {
      // Nicht doppeln, wenn der Nutzer das Synonym schon selbst schrieb.
      if (!terme.includes(synonym) && !zusatz.includes(synonym)) zusatz.push(synonym);
    }
  }
  return zusatz.length ? `${roh} ${zusatz.join(" ")}` : roh;
}
