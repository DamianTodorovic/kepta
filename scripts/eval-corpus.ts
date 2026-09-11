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
  /**
   * Wofuer diese Anfrage steht. Ein Mittelwert ueber alle Kategorien versteckt,
   * welches Bein wobei traegt — genau deshalb konnte die alte Auswertung nicht
   * entscheiden, ob die Fusion etwas beitraegt.
   *
   * lexikalisch — die Frage benutzt die Woerter der Notiz. BM25 gewinnt hier.
   * umschreibung — anders gefragt als notiert. Nur Vektoren finden das.
   * graph      — die Verbindung traegt, nicht das Wort. Nur der Graph findet es.
   * temporal   — veraltet gegen aktuell.
   * ablenkung  — mehrere Notizen teilen die Woerter, nur eine ist gemeint.
   */
  kategorie: "lexikalisch" | "umschreibung" | "graph" | "temporal" | "ablenkung";
}

// Referenzzeit: 2026-09-01 (Fixdatum für deterministische temporale Fälle)
export const EVAL_NOW = Date.parse("2026-09-01T12:00:00Z");
const DAY = 24 * 3600 * 1000;

export const CORPUS: EvalMemory[] = [
  { id: "m01", title: "Server Deployment", content: "Die Produktions-App läuft auf Hetzner CPX31, Deploy via PM2 und GitHub Actions. Domain kepta.app über Cloudflare.", tags: ["devops", "server"] },
  { id: "m02", title: "Datenbank Auswahl", content: "PostgreSQL 17 für die Hauptdatenbank, Redis für Sessions und Caching. Backups täglich 3 Uhr.", tags: ["datenbank", "devops"] },
  { id: "m03", title: "Wohnort", content: "Alex wohnt in Hamburg Altona.", tags: ["personal"], updatedAt: EVAL_NOW - 400 * DAY },
  { id: "m04", title: "Wohnort aktuell", content: "Alex ist im August 2026 nach Leipzig umgezogen, Wohnort jetzt Leipzig Suedvorstadt.", tags: ["personal"], updatedAt: EVAL_NOW - 30 * DAY },
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
  { id: "m23", title: "Auto Werkstatt", content: "Vertragswerkstatt Nordring in Leipzig-Plagwitz, Terminvereinbarung online, Ersatzwagen auf Anfrage.", tags: ["auto"] },
  { id: "m24", title: "Sperrmüll Abholung", content: "Sperrmüll-Termin war am 15. Mai 2026, abgeschlossen.", tags: ["haushalt"], validTo: EVAL_NOW - 100 * DAY },
  { id: "m25", title: "Keller Renovierung", content: "Keller wird im Oktober 2026 renoviert, Handwerker Anton Bauer, Kostenvoranschlag 8500 Euro.", tags: ["haushalt"] },
  { id: "m26", title: "LLM Kontext", content: "Kontextfenster: GPT-5 400k Tokens, Claude Sonnet 1M, Gemini 2M. RAG reduziert Kosten um 90 Prozent.", tags: ["ki", "llm"] },
  { id: "m27", title: "Zettelkasten Methode", content: "Literaturnotizen und permanente Notizen, jede Notiz hat eine Quelle, Verlinkungen schlagen Kategorien.", tags: ["wissen", "methode"] },
  { id: "m28", title: "Obsidian Export", content: "Obsidian Vault liegt unter ~/Dokumente/Vault, Notizen als Markdown mit Frontmatter, Tags in YAML.", tags: ["obsidian", "tools"] },
  { id: "m29", title: "React 19 Features", content: "Server Components, use() Hook, Actions. Vite als Build-Tool, Tailwind 4 für Styling.", tags: ["web", "react"] },
  { id: "m30", title: "Vermieter Kontakt", content: "Vermieterin Frau Scholz, Instandsetzungsmeldungen schriftlich per E-Mail, Kaution 3 Nettokaltmieten.", tags: ["wohnung", "finanzen"], updatedAt: EVAL_NOW - 200 * DAY },
  // --- Ab hier: Erweiterung, damit sich die Retrieval-Beine trennen lassen ---
  // Die urspruenglichen 30 Notizen benutzen dieselben Woerter wie die Anfragen.
  // Unter der Bedingung kann BM25 nicht verlieren und die Messung nichts sagen.
  // Diese Notizen bringen drei Dinge mit, die im Alltag eines Gedaechtnisses
  // vorkommen: [[Wiki-Links]] als Verbindung ohne Wortgleichheit, Ablenker mit
  // ueberlappendem Vokabular, und Inhalte, nach denen man anders fragt als man
  // sie notiert hat.

  // Verbunden ueber [[Anton Bauer]] — der Name steht nur in m25 im Text
  { id: "m31", title: "Kostenvoranschlag freigegeben", content: "Der Voranschlag fuer den Kellerausbau liegt bei 8500 Euro. Geprueft, freigegeben, Anzahlung 30 Prozent. [[Anton Bauer]]", tags: ["haushalt", "finanzen"] },
  { id: "m32", title: "Termin Rueckruf", content: "Rueckruf wegen der Trockenbauwaende vereinbart, Dienstag vormittags. [[Anton Bauer]]", tags: ["haushalt"] },
  { id: "m33", title: "Materialliste Untergeschoss", content: "Rigips, Daemmwolle, Dampfsperre. Wird vom Betrieb mitgebracht, steht nicht im Angebot. [[Anton Bauer]]", tags: ["haushalt"] },

  // Verbunden ueber [[Weber]] — Steuerberater, Name nur in m08 im Text
  { id: "m34", title: "Belege nachreichen", content: "Fehlende Bewirtungsbelege bis Monatsende einreichen, sonst faellt die Abgabe auseinander. [[Weber]]", tags: ["finanzen"] },
  { id: "m35", title: "Honorarnote Q3", content: "Quartalsabrechnung liegt vor, 640 Euro, faellig in 14 Tagen. [[Weber]]", tags: ["finanzen"] },

  // Verbunden ueber [[Hetzner]] — Name nur in m01 und m16 im Text
  { id: "m36", title: "Monitoring Alarme", content: "Alarm bei CPU ueber 80 Prozent fuenf Minuten lang, Benachrichtigung per Signal. [[Hetzner]]", tags: ["devops"] },
  { id: "m37", title: "Snapshot Zeitplan", content: "Taegliche Momentaufnahme um 4 Uhr, sieben Tage Aufbewahrung, monatlich eine Langzeitkopie. [[Hetzner]]", tags: ["devops", "backup"] },

  // Ablenker: teilen Vokabular mit bestehenden Anfragen, sind aber nicht gemeint
  { id: "m38", title: "Backup Strategie privat", content: "Private Fotos auf zwei externe Platten, eine davon beim Bruder. Keine Cloud.", tags: ["backup", "privat"] },
  { id: "m39", title: "Datenbank Kurs", content: "Onlinekurs zu Datenbanken angefangen, Kapitel ueber Normalformen und Indizes noch offen.", tags: ["lernen", "datenbank"] },
  { id: "m40", title: "Server Zimmerpflanze", content: "Die Pflanze neben dem Schreibtisch heisst Server, weil sie immer laeuft. Alle zwei Wochen giessen.", tags: ["scherz", "haushalt"] },
  { id: "m41", title: "Passwort Zurücksetzen Ablauf", content: "Beim Kunden laeuft das Zuruecksetzen ueber die Hotline, nicht ueber Selbstbedienung. Dauert bis zu 48 Stunden.", tags: ["arbeit", "prozess"] },
  { id: "m42", title: "Rust Buch", content: "Kapitel ueber Lebenszeiten zweimal gelesen, immer noch unklar. Uebungsaufgaben im Anhang machen.", tags: ["rust", "lernen"] },
  { id: "m43", title: "Auto Waschen", content: "Waschanlage an der Tankstelle Suedstrasse, Programm 3 reicht, Felgen von Hand nacharbeiten.", tags: ["auto"] },
  { id: "m44", title: "Geburtstagsliste Kollegen", content: "Im Team wird nur bis Ende des Jahres gesammelt, danach neue Regel.", tags: ["arbeit"] },

  // Inhalte, nach denen man anders fragt als man sie notiert hat
  { id: "m45", title: "Bandscheibe", content: "Physiotherapie zweimal woechentlich, Uebungen fuer den unteren Ruecken, kein schweres Heben ueber 15 Kilo.", tags: ["gesundheit"] },
  { id: "m46", title: "Reifen", content: "Winterbereifung ab Oktober, Sommersatz liegt eingelagert bei der Werkstatt, Profiltiefe noch 4,5 Millimeter.", tags: ["auto"] },
  { id: "m47", title: "Mietvertrag Abschnitt 7", content: "Schoenheitsreparaturen sind Sache der Mietpartei, Fristen: Kueche alle drei Jahre, Wohnraeume alle fuenf.", tags: ["wohnung"] },
  { id: "m48", title: "Weihnachtsessen", content: "Ente mit Rotkohl und Kloessen, Ente vier Stunden bei 160 Grad, vorher trocken tupfen.", tags: ["kochen", "rezept"] },
  { id: "m49", title: "Sparplan", content: "Monatlich 400 Euro in einen Welt-ETF, Ausfuehrung am zweiten Werktag, Kosten 0,2 Prozent.", tags: ["finanzen"] },
  { id: "m50", title: "Notfallnummern", content: "Hausarzt, Zahnarzt und der Bereitschaftsdienst stehen auf dem Zettel am Kuehlschrank.", tags: ["gesundheit", "familie"] },
  { id: "m51", title: "Schluesseluebergabe", content: "Zweitschluessel liegt bei den Nachbarn im dritten Stock, links.", tags: ["wohnung"] },
  { id: "m52", title: "Kamera Einstellungen", content: "Fuer Innenaufnahmen Blende 2.8, ISO 800, Weissabgleich manuell auf Kunstlicht.", tags: ["foto"] },

  // Zeitliche Faelle: veraltet gegen aktuell
  { id: "m53", title: "Telefonnummer alt", content: "Erreichbar unter der Festnetznummer im Buero, ab 9 Uhr.", tags: ["kontakt"], validTo: EVAL_NOW - 200 * DAY },
  { id: "m54", title: "Telefonnummer aktuell", content: "Nur noch mobil erreichbar, Festnetz abgemeldet seit Juni 2026.", tags: ["kontakt"] },
  { id: "m55", title: "Laufschuhe alt", content: "Modell aus 2024, Daempfung durchgelaufen, aussortiert.", tags: ["sport"], validTo: EVAL_NOW - 60 * DAY },
  { id: "m56", title: "Laufschuhe neu", content: "Seit August 2026 neues Paar, Groesse 44, bisher 60 Kilometer gelaufen.", tags: ["sport"] },

  // Zwei Notizen, die sich nur im Detail unterscheiden
  { id: "m57", title: "Zugangsdaten Testsystem", content: "Testumgebung: Anmeldung ueber den gemeinsamen Zugang, Passwort rotiert monatlich.", tags: ["arbeit", "security"] },
  { id: "m58", title: "Zugangsdaten Produktivsystem", content: "Produktivumgebung: persoenlicher Zugang mit zweitem Faktor, kein gemeinsames Passwort.", tags: ["arbeit", "security"] },
];

export const QUERIES: EvalQuery[] = [
  { query: "Wo läuft die Produktion?", relevant: ["m01"] , kategorie: "lexikalisch" },
  { query: "Welche Datenbank nutzen wir?", relevant: ["m02"] , kategorie: "lexikalisch" },
  { query: "Wo wohnt Alex gerade?", relevant: ["m04"] , kategorie: "lexikalisch" },
  { query: "Umsatzsteuer Frist", relevant: ["m08"] , kategorie: "lexikalisch" },
  { query: "Wie ist die hybride Suche implementiert?", relevant: ["m14"] , kategorie: "lexikalisch" },
  { query: "Welche Embedding-Modelle lokal?", relevant: ["m13"] , kategorie: "lexikalisch" },
  { query: "Wie funktioniert der Wissensgraph?", relevant: ["m15"] , kategorie: "lexikalisch" },
  { query: "Serverzugang und Passwort", relevant: ["m16", "m17"] , kategorie: "lexikalisch" },
  { query: "Fitness Trainingsplan", relevant: ["m19"] , kategorie: "lexikalisch" },
  { query: "Impfungen Auffrischung", relevant: ["m20"] , kategorie: "lexikalisch" },
  { query: "Warum Rust statt Go?", relevant: ["m21"] , kategorie: "lexikalisch" },
  { query: "Autoversicherung kündigen", relevant: ["m22"] , kategorie: "lexikalisch" },
  { query: "Werkstatt Termin Auto", relevant: ["m23"] , kategorie: "lexikalisch" },
  { query: "Keller Umbau Kosten", relevant: ["m25"] , kategorie: "lexikalisch" },
  { query: "Welche LLM Kontextfenster?", relevant: ["m26"] , kategorie: "lexikalisch" },
  { query: "Obsidian Notizen Format", relevant: ["m28"] , kategorie: "lexikalisch" },
  { query: "React Build Setup", relevant: ["m29"] , kategorie: "lexikalisch" },
  { query: "Kaution Vermieter", relevant: ["m30"] , kategorie: "lexikalisch" },
  { query: "Carbonara Zutaten", relevant: ["m06"] , kategorie: "lexikalisch" },
  { query: "KEPTA MCP Architektur", relevant: ["m11", "m12"] , kategorie: "lexikalisch" },
  { query: "Passwörter sicher verwalten", relevant: ["m10"] , kategorie: "lexikalisch" },
  { query: "Rechnungen Buchhaltung Tool", relevant: ["m09"] , kategorie: "lexikalisch" },
  { query: "Zettelkasten Notizen Methode", relevant: ["m27"] , kategorie: "lexikalisch" },
  { query: "Geburtstag Familie", relevant: ["m18"] , kategorie: "lexikalisch" },
  { query: "Deployment und Domain", relevant: ["m01"] , kategorie: "lexikalisch" },
  // --- Umschreibungen: anders gefragt, als notiert wurde ---
  // Kein gemeinsames Inhaltswort mit der Zielnotiz. BM25 kann hier nur ueber
  // Zufall treffen; wenn Vektoren nichts beitragen, zeigt es sich genau hier.
  { query: "Was koche ich mit Nudeln?", relevant: ["m06"], kategorie: "umschreibung" },
  { query: "Wie bewahre ich meine Zugangsdaten sicher auf?", relevant: ["m10"], kategorie: "umschreibung" },
  { query: "Wo lasse ich mein Fahrzeug instand setzen?", relevant: ["m23"], kategorie: "umschreibung" },
  { query: "Was mag meine Grossmutter?", relevant: ["m18"], kategorie: "umschreibung" },
  { query: "Was tue ich fuer meinen Ruecken?", relevant: ["m45"], kategorie: "umschreibung" },
  { query: "Wie lege ich Geld an?", relevant: ["m49"], kategorie: "umschreibung" },
  { query: "Wer hilft bei einem medizinischen Notfall?", relevant: ["m50"], kategorie: "umschreibung" },
  { query: "Wie fotografiere ich drinnen richtig?", relevant: ["m52"], kategorie: "umschreibung" },
  { query: "Was muss ich beim Auszug renovieren?", relevant: ["m47"], kategorie: "umschreibung" },
  { query: "Was gibt es an Heiligabend zu essen?", relevant: ["m48"], kategorie: "umschreibung" },

  // --- Graph: die Verbindung traegt, nicht das Wort ---
  // Der Name steht nur in einer Notiz im Text; die uebrigen haengen ueber
  // [[Wiki-Links]] daran. Ohne Graph findet man sie nicht.
  { query: "Anton Bauer", relevant: ["m25", "m31", "m32", "m33"], kategorie: "graph" },
  { query: "Weber", relevant: ["m08", "m34", "m35"], kategorie: "graph" },
  { query: "Hetzner", relevant: ["m01", "m16", "m36", "m37"], kategorie: "graph" },

  // --- Ablenkung: mehrere Notizen teilen die Woerter, nur eine ist gemeint ---
  { query: "Wie oft wird gesichert?", relevant: ["m02", "m37"], kategorie: "ablenkung" },
  { query: "Welches Passwort gilt in der Produktion?", relevant: ["m58"], kategorie: "ablenkung" },
  { query: "Welcher Server ist gemeint?", relevant: ["m01"], kategorie: "ablenkung" },
  { query: "Was steht zur Datenbank an?", relevant: ["m02"], kategorie: "ablenkung" },

  // --- Zeitlich: veraltet gegen aktuell ---
  { query: "Wie bin ich erreichbar?", relevant: ["m54"], kategorie: "temporal" },
  { query: "Welche Laufschuhe habe ich?", relevant: ["m56"], kategorie: "temporal" },
  { query: "Bis wann muss die Umsatzsteuer abgegeben werden?", relevant: ["m08"], kategorie: "temporal" },

];
