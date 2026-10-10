#!/usr/bin/env node
/**
 * KEPTA — MCP Server (stdio)
 * Protokoll: MCP 2026-07-28 (stateless core) mit Legacy-Fallback (2025-06-18, 2024-11-05).
 * 8 Tools mit structuredContent — Logik geteilt mit dem HTTP-Server über src/core/mcp.ts.
 *
 * Start:  npx tsx src/mcp-server.ts   |   node dist/mcp-server.cjs
 * Kein Browser-UI:  npx kepta-mcp ui erklaert den Weg in den AI-Client.
 * Mit Claude, Cursor & Co. verbinden:  npx kepta-mcp setup [--yes]
 */
import { KeptaStore, defaultDataDir } from "./core/store";
import { defaultExtensions } from "./core/extensions";
import { schluesselbundKeyProvider } from "./core/schluessel";
import { migrateFromLegacyJson } from "./core/migrate";
import { EmbeddingQueue } from "./core/embeddings";
import { handleRpc, SERVER_INFO, type JsonRpcRequest, type JsonRpcResponse, type McpContext } from "./core/mcp";
import { protokolliereEreignis } from "./aktivitaet";
import { einrichten, standardUmgebung } from "./einrichtung";
import { importChatgptKommando } from "./core/chatgpt-import";
import { starteDemoShow } from "./demo-show";
import { erlebnisKommando, hilfeText, versionText, FLAG_LISTE, heimat, bricht } from "./cli-erlebnis";
import readline from "node:readline";

/**
 * D2-01: schließt der Leser die Pipe früh (`| head`, `less`, `fzf`, ein Skript,
 * das nur Zeile 1 will), meldet Node das als 'error'-Event auf dem Strom. Ohne
 * Empfänger wird daraus ein Stacktrace auf dem Schirm — bei recall/timeline kam
 * deshalb gar keine Antwort mehr an. Abbestellung ist kein Fehler: kein Wort,
 * Exit 0. Alle Ausgaben laufen über dieselben beiden Ströme, also fängt sie
 * dieser eine Handler und keine Einzelschreiberei.
 */
function leserAbbestellung(): void {
  for (const strom of [process.stdout, process.stderr]) {
    strom.on("error", (e: unknown) => {
      const code = (e as NodeJS.ErrnoException | null)?.code;
      if (code === "EPIPE" || code === "ERR_STREAM_DESTROYED" || code === "ECONNRESET") process.exit(0);
      console.error(`[kepta] could not write the output: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
  }
}
leserAbbestellung();

/** Die Befehle, die dieser Einstieg kennt. Etwas anderes ist ein Tippfall, kein Serverstart. */
const BEFEHLE = ["remember", "recall", "timeline", "contradict", "stats", "demo", "import", "ui", "setup"] as const;

/** Editier-Distanz — fuer "rember" ist der naechstliegende Befehl "remember". */
function abstand(a: string, b: string): number {
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i];
    for (let j = 1; j <= b.length; j++) {
      jetzt[j] = Math.min(jetzt[j - 1]! + 1, vorher[j]! + 1, vorher[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vorher = jetzt;
  }
  return vorher[b.length]!;
}

/**
 * Ein unbekanntes Wort war bisher der stillste Fehler des Produkts: es fiel in
 * starteMcp() und der Prozess hing an stdin — ohne Meldung, ohne Exit-Code. Hier
 * endet er hoerbar. stderr, weil stdout der MCP-Kanal ist.
 *
 * D2-03: alles, was mit `-` beginnt, ist ein Schalter. Ein Schalter hat keine
 * Editier-Distanz zu einem Befehl — „did you mean ui?" fuer `-h` ist Quatsch,
 * und die Distanz-Maschine hat ihn trotzdem geraten.
 */
function weiseAb(wort: string): void {
  if (wort.startsWith("-") && wort.length > 1) {
    const name = wort.includes("=") ? wort.slice(0, wort.indexOf("=")) : wort;
    console.error(`[kepta] unknown flag: ${name}`);
    // R2: die Liste ist länger als die Bühne — sie bricht, statt umzukippen.
    for (const z of bricht(`KEPTA knows: ${FLAG_LISTE}`, { einzug: 2 })) console.error(z);
    console.error("[kepta] next: run kepta --help, or drop the switch");
    return;
  }
  const naechste = [...BEFEHLE].sort((a, b) => abstand(wort.toLowerCase(), a) - abstand(wort.toLowerCase(), b))[0];
  const vorschlag = naechste && abstand(wort.toLowerCase(), naechste) <= Math.max(2, Math.floor(naechste.length / 2));
  console.error(`[kepta] unknown command: ${wort}${vorschlag ? ` — did you mean "${naechste}"?` : ""}`);
  console.error(`[kepta] commands: ${BEFEHLE.join(", ")}`);
  console.error("[kepta] with no argument KEPTA runs the MCP server on stdin — that is how Claude, Cursor & Co. connect.");
}

/** Derselbe Schluessel wie in der App: aus dem Schluesselbund des Systems. */
function oeffneStore(): KeptaStore {
  try {
    return new KeptaStore(undefined, { ...defaultExtensions(), keys: schluesselbundKeyProvider(defaultDataDir()) });
  } catch (e) {
    // Der Kernsatz nennt Quelle, Wirkung und Ausweg und war gemessen 250 Zeichen
    // lang auf einer Zeile. Sein Wortlaut gehoert F7 — hier wird nur die Bühne
    // gehalten (R2), nicht der Satz.
    const meldung = e instanceof Error ? e.message : String(e);
    // Die Bühne zählt inklusive Präfix: 8 Zeichen gehören dem Kanal, der Rest dem Satz.
    const zeilen = bricht(meldung, { einzug: 0, rueck: 2, breite: 80 - "[kepta] ".length });
    zeilen.forEach((z, i) => console.error(i === 0 ? `[kepta] ${z.trimStart()}` : `  ${z.trim()}`));
    process.exit(1);
  }
}

/** Der MCP-Server ueber stdio — so starten ihn Claude Desktop, Cursor und Co. */
function starteMcp(): void {
  const store = oeffneStore();
  const v = store.verschluesselung;
  // D2-19: einmal sagen, was gilt. Vorher stand der Pfad in zwei Zeilen, und
  // die wichtigste Meldung — dass diese Datei in diesem Moment von Klartext auf
  // verschlüsselt umgeschrieben wurde — steckte als Beisatz in einer Klammer.
  const zustand = v.aktiv ? `encrypted${v.ablage ? ` (${v.ablage})` : ""}` : "NOT encrypted";
  console.error(`[kepta] kepta ${SERVER_INFO.version} · ${heimat(store.dbPath)} · ${zustand}`);
  if (v.aktiv && v.umgewandelt) {
    console.error("[kepta] converted this file from plaintext to encrypted just now");
  }
  if (!v.aktiv && v.hinweis) console.error(`[kepta] NOT encrypted — ${v.hinweis}`);
  const migration = migrateFromLegacyJson(store);
  if (!migration.skipped) {
    console.error(`[kepta] Migration: ${migration.migrated} nodes taken over from memories.json (backup: ${migration.backupPath ?? "none"})`);
  }
  const queue = new EmbeddingQueue(store);
  queue.start();
  store.db.exec("PRAGMA wal_checkpoint(PASSIVE)");

  // Die Oberfläche (npx kepta-mcp ui) zeigt live, was die Agenten tun — der Weg
  // führt über die gemeinsame Datenbank, siehe src/aktivitaet.ts.
  const ctx: McpContext = { store, transport: "stdio", melde: (e) => protokolliereEreignis(store, e) };

  // Antworten SERIELL auf stdout schreiben: Verarbeitung (handleRpc) bleibt parallel,
  // aber die Writes dürfen sich nicht verschränken — sonst können parallele Antworten
  // in falscher Reihenfolge bzw. interleaved beim Client landen.
  let writeQueue: Promise<void> = Promise.resolve();
  function write(res: JsonRpcResponse | null) {
    if (!res) return;
    const payload = JSON.stringify(res) + "\n";
    writeQueue = writeQueue.then(
      () => new Promise<void>((done) => process.stdout.write(payload, () => done()))
    );
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  // Exit only after every pending response has been written — async tool calls
  // (search embeddings, duplicate checks) must never be lost on stdin close.
  let pending = 0;
  let stdinClosed = false;
  function finishIfDrained(): void {
    if (stdinClosed && pending === 0) {
      store.close();
      process.exit(0);
    }
  }

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      write({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: `Parse error: ${e instanceof Error ? e.message : String(e)}` },
      });
      return;
    }
    // Batch-Request (JSON-Array): MCP 2026-07-28 hat Batching gestrichen —
    // als einzelner Invalid-Request-Fehler beantworten statt still zu schlucken.
    if (Array.isArray(parsed)) {
      write({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Batching is not supported (MCP 2026-07-28 removed it)" },
      });
      return;
    }
    const req = parsed as JsonRpcRequest;
    pending++;
    void handleRpc(ctx, req)
      .then(write)
      .catch((e) => {
        write({
          jsonrpc: "2.0",
          id: (req.id as string | number | null) ?? null,
          error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
        });
      })
      .finally(() => {
        pending--;
        finishIfDrained();
      });
  });

  rl.on("close", () => {
    stdinClosed = true;
    finishIfDrained();
  });

  // D2-20: `npx -y kepta-mcp` ohne Argument ist der Weg aus der Anleitung — und
  // der Mensch sah danach nichts mehr. Vier Sekunden Stille sind kein „ready".
  // Die Zeile, die es erklärt, gehört an den Anfang des Wartens, nicht an eine
  // Abweisung.
  console.error("[kepta] waiting for an MCP client on stdin — this is how Claude, Cursor & Co. connect");
  console.error("[kepta] Ctrl+C stops it. Commands: npx -y kepta-mcp --help");
}

/**
 * `npx kepta-mcp ui`: KEPTA Core ist headless — es lebt im KI-Klienten (MCP) und
 * hat bewusst keine Browser-Oberfläche. D2-42 mass hier ein Satz, der nach aussen
 * zeigt, ohne das Ziel zu nennen („see the website") und ohne den kostenlosen
 * Weg: die Desktop-App mit Fenster ist ein Release **dieses** Repos, Enterprise ist
 * Vertrag. Die Adresse ist nicht erfunden — sie ist der Remote, den
 * `git remote get-url origin` nennt. Jede Zeile unter 80 (R2), der Schluss ein
 * Weg (R9), kein Zustand, den dieser Lauf nicht gemessen hat (R8).
 */
function uiHinweis(): void {
  console.log(`KEPTA Core has no window — your AI client is the interface.`);
  console.log(`The free desktop app adds the browser, the graph and time travel:`);
  console.log(`  github.com/DamianTodorovic/kepta/releases`);
  console.log(`KEPTA Enterprise — the team console with mandates and audit — is by agreement.`);
  console.log(``);
  console.log(`next: npx -y kepta-mcp setup — connects this file to the AI apps here`);
  // Kein process.exit: Node läuft natürlich aus, damit die Pipe die kurze
  // Nachricht vollständig flushen kann (stdio-Drain-Falle).
}

/**
 * Hilfe und Version sind Auskünfte, keine Zugriffe. Vor dem Store-Öffnen
 * abgezweigt, weil sonst schon `kepta help` eine Datenbank anlegt und einen
 * Schlüssel verlangt (D2-02). Kein process.exit, damit die Pipe die Antwort
 * vollständig flushen kann — dieselbe Regel wie bei `ui`.
 */
const Einstiegswort = process.argv[2];
if (Einstiegswort === "help" || Einstiegswort === "-h" || Einstiegswort === "--help") {
  for (const zeile of hilfeText()) console.log(zeile);
} else if (Einstiegswort === "-V" || Einstiegswort === "--version") {
  console.log(versionText());
}
/**
 * Das Erlebnis-CLI: remember / recall / timeline / contradict / stats.
 * Läuft auf derselben verschlüsselten Datenbank wie der MCP-Server.
 */
else if (process.argv[2] === "remember" || process.argv[2] === "recall" || process.argv[2] === "timeline" || process.argv[2] === "contradict" || process.argv[2] === "stats") {
  const store = oeffneStore();
  erlebnisKommando(store, process.argv[2], process.argv.slice(3)).then(
    async (code) => {
      store.close();
      // stdout ist auf Pipes asynchron — ohne Drain würde process.exit() die
      // Ausgabe abschneiden (beobachtet bei recall nach await).
      await new Promise<void>((ok) => process.stdout.write("", () => ok()));
      process.exit(code);
    },
    (e: unknown) => {
      console.error(`[kepta] ${e instanceof Error ? e.message : String(e)}`);
      store.close();
      process.exit(1);
    }
  );
}

/**
 * `npx kepta-mcp demo`: Wegwerf-Demodatenbank mit Kanzlei-Korpus, Oberfläche
 * öffnet sich — die 60-Sekunden-Führung, ohne die echte Datei zu berühren.
 */
else if (process.argv[2] === "demo") {
  starteDemoShow(process.argv.slice(3)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`[kepta] ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  );
}

/**
 * `npx -y kepta-mcp import chatgpt <pfad>`: den ChatGPT-Datenexport in Memories
 * verwandeln — die Kompatibilitätsfalle. Läuft auf derselben verschlüsselten
 * Datenbank wie UI und MCP-Server.
 */
else if (process.argv[2] === "import") {
  const store = oeffneStore();
  let code: number;
  try {
    code = importChatgptKommando(store, process.argv.slice(3));
  } catch (e) {
    console.error(`[kepta] ${e instanceof Error ? e.message : String(e)}`);
    code = 1;
  } finally {
    store.close();
  }
  process.exit(code);
} else if (process.argv[2] === "ui") {
  uiHinweis();
  // Kein process.exit: Node läuft natürlich aus, damit die Pipe die kurze
  // Nachricht vollständig flushen kann (stdio-Drain-Falle).
} else if (process.argv[2] === "setup") {
  // `npx kepta-mcp setup [--yes]`: KEPTA in Claude, Cursor & Co. eintragen.
  const rl = process.stdin.isTTY ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  einrichten(process.argv.slice(3), standardUmgebung(), {
    schreibe: (s) => process.stdout.write(s),
    frage: rl ? (f) => new Promise<string>((ok) => rl.question(f, ok)) : undefined,
  }).then(
    (code) => {
      rl?.close();
      // D2-04: hier hing ein Satz an JEDEM Ausgang — „local, encrypted and
      // unlimited" — auch bei einem setup, das die Datei nie geöffnet hat. Die
      // Tafel der Einrichtung sagt selbst, was getan wurde, und endet mit einem
      // Weg. Ein zweiter, ungeprüfter Schluss ist kein Schluss, sondern Lärm.
      // stdout auf Pipes asynchron — das letzte Write erst abwarten (Drain-Falle).
      process.stdout.write("", () => process.exit(code));
    },
    (e: unknown) => {
      console.error(`[kepta] ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
  );
} else if (process.argv[2] === undefined || process.argv[2] === "") {
  starteMcp();
} else {
  // Kein Argument ist der MCP-Weg; ein Wort, das wir nicht kennen, war bisher
  // derselbe Weg — still. stderr auf Pipes ist asynchron, also erst drainen.
  weiseAb(String(process.argv[2]));
  process.stderr.write("", () => process.exit(2));
}
