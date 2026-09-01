// KEPTA Eval-Corpus — deterministisches Fixkorpus für Precision@5-Tests.
// Enthält temporale Fälle (abgelaufen/ersetzt), Near-Duplicates und Kreuzthemen.
export interface EvalMemory {
  id: string;
  title: string;
  content: string;
  tags: string[];
  validTo?: number | null;
  supersededBy?: string | null;
  updatedAt?: number;
}

export interface EvalQuery {
  query: string;
  /** Als relevant geltende Memory-IDs */
  relevant: string[];
}

// Referenzzeit: 2026-09-01 (Fixdatum für deterministische temporale Fälle)
export const EVAL_NOW = Date.parse("2026-09-01T12:00:00Z");
const DAY = 24 * 3600 * 1000;

export const CORPUS: EvalMemory[] = [
  { id: "m01", title: "Server Deployment", content: "Die Produktions-App läuft auf Hetzner CPX31, Deploy via PM2 und GitHub Actions. Domain kepta.app über Cloudflare.", tags: ["devops", "server"] },
  { id: "m02", title: "Datenbank Auswahl", content: "PostgreSQL 17 für die Hauptdatenbank, Redis für Sessions und Caching. Backups täglich 3 Uhr.", tags: ["datenbank", "devops"] },
  { id: "m03", title: "Wohnort", content: "Damian wohnt in Berlin Mitte.", tags: ["personal"], updatedAt: EVAL_NOW - 400 * DAY },
  { id: "m04", title: "Wohnort aktuell", content: "Damian ist im August 2026 nach München umgezogen, Wohnort jetzt München Schwabing.", tags: ["personal"], updatedAt: EVAL_NOW - 30 * DAY },
  { id: "m05", title: "Rust Projekt Skeleton", content: "Axum Webserver mit Tokio Runtime, Fehlerbehandlung über anyhow und thiserror.", tags: ["rust", "web"] },
  { id: "m06", title: "Rezept Carbonara", content: "Spaghetti Carbonara: Guanciale, Pecorino Romano, Eigelb, schwarzer Pfeffer. Kein Sahne!", tags: ["kochen", "rezept"] },
  { id: "m07", title: "Steuerabgabe Termin", content: "Umsatzsteuererklärung muss bis 31. Juli 2026 abgegeben werden.", tags: ["finanzen", " Deadlines"], validTo: EVAL_NOW - 30 * DAY },
  { id: "m08", title: "Steuerabgabe verlängert", content: "Frist der Umsatzsteuererklärung wurde auf 30. September 2026 verlängert, Steuerberater Weber kümmert sich.", tags: ["finanzen"] },
  { id: "m09", title: "Buchhaltungssoftware", content: "Lexoffice wird für Rechnungen genutzt, API-Token im Passwort-Manager.", tags: ["finanzen", "tools"] },
  { id: "m10", title: "Passwort Manager", content: "Bitwarden Vault, Master-Prompt 2FA via Yubikey. Notfall-Kit im Bankschließfach.", tags: ["security", "tools"] },
  { id: "m11", title: "KEPTA Architektur", content: "KEPTA ist eine lokale Electron-App: React Frontend, Express Server, SQLite Speicher, MCP-Server für Agenten.", tags: ["kepta", "architektur"] },
  { id: "m12", title: "MCP Protokoll", content: "Model Context Protocol 2026-07-28: stateless core, server/discover, Streamable HTTP Transport, strukturierte Tool-Outputs.", tags: ["mcp", "standards"] },
  { id: "m13", title: "Embedding Modelle", content: "nomic-embed-text für lokale Embeddings via Ollama, 1024 Dimensionen, 8k Kontext. Alternative: bge-m3 multilingual.", tags: ["ki", "embeddings"] },
  { id: "m14", title: "Suche Implementierung", content: "Hybride Suche: BM25 aus FTS5 plus Vektor-KNN, fusioniert mit Reciprocal Rank Fusion k=60, Reranking via Cross-Encoder optional.", tags: ["kepta", "suche"] },
  { id: "m15", title: "Knowledge Graph Setup", content: "Entitäten und Relationen in SQLite, Wiki-Links [[So]] werden beim Speichern zu Knoten, Relationen haben Gültigkeit.", tags: ["kepta", "graph"] },
  { id: "m16", title: "Server Passwort", content: "Root-Passwort des Hetzner-Servers: im Bitwarden Eintrag 'Hetzner Prod'. SSH-Key-Login bevorzugt.", tags: ["security", "server"] },
  { id: "m17", title: "Server Passwort (Kopie)", content: "Root-Passwort des Hetzner-Servers: im Bitwarden Eintrag 'Hetzner Prod'. SSH-Key-Login bevorzugt.", tags: ["security"] },
  { id: "m18", title: "Oma's Geburtstag", content: "Oma Hilde hat am 14. März Geburtstag, liebt Narzissen.", tags: ["familie"] },
  { id: "m19", title: "Fitness Plan", content: "Montag Push, Dienstag Pull, Mittwoch Beine, Donnerstag Ruhetag. 5g Kreatin täglich.", tags: ["sport", "gesundheit"] },
  { id: "m20", title: "Impfpass", content: "Tetanus-Auffrischung war 2019, nächste fällig 2029. Grippeimpfung jährlich im Oktober.", tags: ["gesundheit"] },
  { id: "m21", title: "Go vs Rust Entscheidung", content: "Für das CLI-Tool bleibt Rust, Go wurde verworfen weil Cross-Compilation zwar einfacher, aber Generics fehlen.", tags: ["rust", "go", "entscheidung"] },
  { id: "m22", title: "Autoversicherung", content: "Kfz-Versicherung bei HUK24, VW Golf, Kennzahl 4711, jährlich kündbar zum 31.12.", tags: ["auto", "finanzen"] },
  { id: "m23", title: "Auto Werkstatt", content: "Vertragswerkstatt Auto Eder in München-Pasing, Ansprechpartner Herr Kilic, Terminvereinbarung online.", tags: ["auto"] },
  { id: "m24", title: "Sperrmüll Abholung", content: "Sperrmüll-Termin war am 15. Mai 2026, abgeschlossen.", tags: ["haushalt"], validTo: EVAL_NOW - 100 * DAY },
  { id: "m25", title: "Keller Renovierung", content: "Keller wird im Oktober 2026 renoviert, Handwerker Anton Bauer, Kostenvoranschlag 8500 Euro.", tags: ["haushalt"] },
  { id: "m26", title: "LLM Kontext", content: "Kontextfenster: GPT-5 400k Tokens, Claude Sonnet 1M, Gemini 2M. RAG reduziert Kosten um 90 Prozent.", tags: ["ki", "llm"] },
  { id: "m27", title: "Zettelkasten Methode", content: "Literaturnotizen und permanente Notizen, jede Notiz hat eine Quelle, Verlinkungen schlagen Kategorien.", tags: ["wissen", "methode"] },
  { id: "m28", title: "Obsidian Export", content: "Obsidian Vault liegt unter ~/Dokumente/Vault, Notizen als Markdown mit Frontmatter, Tags in YAML.", tags: ["obsidian", "tools"] },
  { id: "m29", title: "React 19 Features", content: "Server Components, use() Hook, Actions. Vite als Build-Tool, Tailwind 4 für Styling.", tags: ["web", "react"] },
  { id: "m30", title: "Vermieter Kontakt", content: "Vermieterin Frau Scholz, Instandsetzungsmeldungen schriftlich per E-Mail, Kaution 3 Nettokaltmieten.", tags: ["wohnung", "finanzen"], updatedAt: EVAL_NOW - 200 * DAY },
];

export const QUERIES: EvalQuery[] = [
  { query: "Wo läuft die Produktion?", relevant: ["m01"] },
  { query: "Welche Datenbank nutzen wir?", relevant: ["m02"] },
  { query: "Wo wohnt Damian gerade?", relevant: ["m04"] },
  { query: "Umsatzsteuer Frist", relevant: ["m08"] },
  { query: "Wie ist die hybride Suche implementiert?", relevant: ["m14"] },
  { query: "Welche Embedding-Modelle lokal?", relevant: ["m13"] },
  { query: "Wie funktioniert der Wissensgraph?", relevant: ["m15"] },
  { query: "Serverzugang und Passwort", relevant: ["m16", "m17"] },
  { query: "Fitness Trainingsplan", relevant: ["m19"] },
  { query: "Impfungen Auffrischung", relevant: ["m20"] },
  { query: "Warum Rust statt Go?", relevant: ["m21"] },
  { query: "Autoversicherung kündigen", relevant: ["m22"] },
  { query: "Werkstatt Termin Auto", relevant: ["m23"] },
  { query: "Keller Umbau Kosten", relevant: ["m25"] },
  { query: "Welche LLM Kontextfenster?", relevant: ["m26"] },
  { query: "Obsidian Notizen Format", relevant: ["m28"] },
  { query: "React Build Setup", relevant: ["m29"] },
  { query: "Kaution Vermieter", relevant: ["m30"] },
  { query: "Carbonara Zutaten", relevant: ["m06"] },
  { query: "KEPTA MCP Architektur", relevant: ["m11", "m12"] },
  { query: "Passwörter sicher verwalten", relevant: ["m10"] },
  { query: "Rechnungen Buchhaltung Tool", relevant: ["m09"] },
  { query: "Zettelkasten Notizen Methode", relevant: ["m27"] },
  { query: "Geburtstag Familie", relevant: ["m18"] },
  { query: "Deployment und Domain", relevant: ["m01"] },
];
