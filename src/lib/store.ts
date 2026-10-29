import { Memory } from '../types';
import type { BehauptungEingabe } from '../core/wortschatz';

// All nodes liegen jetzt serverseitig in ~/.ki-gehirn/memories.json
// (kein localStorage-Limit mehr). Der alte localStorage-Bestand wird
// einmalig automatisch migriert.

const LEGACY_KEY = 'ki_gehirn_memories';
const MIGRATED_KEY = 'ki_gehirn_memories_migrated_v2';

const listeners = new Set<(memories: Memory[]) => void>();
let cache: Memory[] = [];

/**
 * Punkt 126 — der Grund, warum ein Speichern abgewiesen wurde.
 *
 * Die Signatur `saveMemory -> Memory | null` ist seit Wochen ausgeliefert und von mehreren
 * Flächen benutzt; ihre Quittung heisst "Save failed — your changes were not applied" und
 * nennt keine Ursache. Fuer eine Behauptung, die ein Wort enthält, das der Graph schon fuer
 * Mitennungen braucht, ist das ein Rat los ohne Antwort: die Person tippt noch einmal
 * dasselbe. Also liegt der Grund jetzt an einer eignen Stelle, und die Flächen, die ihn
 * kennen wollen, lesen ihn — ohne dass jede Speichern-Kuelle ihre Signatur andert.
 */
let ablehnungsGrund: string | null = null;
function merkeAblehnung(grund: string | null): void {
  ablehnungsGrund = grund;
}
export function letzteAblehnung(): string | null {
  return ablehnungsGrund;
}

// ---------- Performance: Request-Dedup + 300ms Debounce für refresh ----------
let pendingRefresh: Promise<Memory[]> | null = null;
// Der ETag der letzten geladenen Antwort — Grundlage für If-None-Match (304).
// Jeder eigene Schreibvorgang wirft ihn weg: der nächste Refresh lädt dann
// garantiert den neuen Bestand, statt sich auf einen alten ETag zu verlassen.
let etag: string | null = null;
let letzterLadefehler: string | null = null;
function etagVergessen(): void {
  etag = null;
}
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const debounceWaiters: Array<{ resolve: (v: Memory[]) => void; reject: (e: unknown) => void }> = [];

function notify() {
  listeners.forEach(fn => fn(cache));
}

// ---------- Was die Tür über den Bestand sagt, nicht was die Seite brachte ----------
//
// `GET /api/memories` antwortet seit F12 mit einer Seite (Default 100) und führt
// die Größe des Bestands im Kopf `x-kepta-total`. Eine Fläche, die daraus
// „100 entries" macht, gibt ihre Seitenlänge als Bestand aus — die stille
// Kappe, gegen die diese Welle antritt. `null` heißt: die Tür sagt nichts; dann
// weiß die Fläche nichts und darf nichts behaupten. Ein alter Wert wird
// bewusst nicht weitergereicht, denn nach Löschen wäre er eine Lüge.
let bestand: number | null = null;
let begrenzt = false;

// Die Kappe der Tuer, nicht eine eigne Zahl: `SEITE_MAX` in `server/helfer/api-form.ts:79` ist 200,
// und die Route klemmt jeden Wunsch selbst dorthin (`server/router/memories.ts:274`). `alle=1` bleibt
// verboten — die Tuer warnt in ihrem eignen Hinweis vor dem schweren Pfad (`memories.ts:375`).
export const SEITE_NACHLAD = 200;
let pendingMehr: Promise<number> | null = null;
let letzterSeitenfehler: string | null = null;
// Eine Seite, die nichts Neues bringt, obwohl die Tür mehr meldet, ist ein Widerspruch — nicht eine
// Einladung zum Wiederholen. Bis zum naechsten Erfolg gilt hier: Sackgasse.
let seitenSackgasse = false;

function zahl(wert: unknown): number | null {
  if (typeof wert === 'number') return Number.isFinite(wert) && wert >= 0 ? wert : null;
  if (typeof wert === 'string' && wert.trim() !== '') {
    const n = Number(wert);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return null;
}

function kopfZahl(res: Response, name: string): number | null {
  const roh = (res as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.(name);
  return zahl(roh);
}

/** Größe des Bestands, wie die Tür sie nennt — oder null, wenn sie schweigt. */
export function bestandGroesse(): number | null {
  return bestand;
}

/** Sagt die Tür, dass noch mehr hinter der Seite liegt? */
export function seiteIstBegrenzt(): boolean {
  return begrenzt;
}

export function getMemoriesSync(): Memory[] {
  return cache;
}

/* Grund der letzten Tuer-Antwort, oder null, wenn die letzte Antwort galt. */
export function ladeFehler(): string | null {
  return letzterLadefehler;
}

/* Grund des letzten Seiten-Nachladens, oder null, wenn die Seite galt. Ein stummer Fang war der
 * Zweitbefund des Briefs — hier wird der Grund weitergereicht, statt verschluckt. */
export function seitenFehler(): string | null {
  return letzterSeitenfehler;
}

/**
 * Holt die naechste Seite und **haengt an**, statt die Seite still zu ersetzen. Gibt die Zahl der
 * neu aufgenommenen Knoten zurueck (0, wenn die Tür keine Kappe mehr meldet oder nichts bringt).
 *
 * Warum das existiert: `doRefresh` ruft `/api/memories` ohne Parameter, die Tür antwortet mit ihrem
 * Default (100), und die Blätter-Fläche hat nie wieder gefragt — von 21 066 Notizen waren die ersten
 * hundert erreichbar (`BRIEF-SEITE-100-20-10.md`). Der Abgleich der `id` haelt Doppelknoten fern:
 * ein Offset verschiebt sich, wenn zwischen zwei Seiten etwas geschrieben oder geloescht wird.
 */
export function mehrAnholen(): Promise<number> {
  if (pendingMehr) return pendingMehr;
  if (!begrenzt || seitenSackgasse) return Promise.resolve(0);
  pendingMehr = (async () => {
    const offset = cache.length;
    try {
      const res = await fetch(`/api/memories?limit=${SEITE_NACHLAD}&offset=${offset}`);
      // Status zuerst: eine Antwort ab 400 darf weder die Zahl umbiegen noch den Cache antasten.
      const status = (res as { status?: number }).status ?? 200;
      if (status >= 400) throw new Error(`the local server answered HTTP ${status} on the next page`);
      bestand = kopfZahl(res, 'x-kepta-total') ?? bestand;
      const kapp = kopfZahl(res, 'x-kepta-begrenzt');
      if (kapp !== null) begrenzt = kapp === 1;
      const data = await res.json();
      // Der Leib gewinnt ueber den Kopf — derselbe Vertrag, den `doRefresh` liest (F12).
      const totalAusLeib = zahl(data?.total);
      if (totalAusLeib !== null) bestand = totalAusLeib;
      if (typeof data?.begrenzt === 'boolean') begrenzt = data.begrenzt;
      const neue = Array.isArray(data) ? data : Array.isArray(data?.memories) ? data.memories : [];
      const gesehen = new Set(cache.map((m) => m.id));
      const frisch = (neue as Memory[]).filter((m) => m && typeof m.id === 'string' && !gesehen.has(m.id));
      if (frisch.length > 0) {
        cache = [...cache, ...frisch];
        letzterSeitenfehler = null;
        notify();
      } else if (begrenzt) {
        letzterSeitenfehler = `the door says more notes follow at offset ${offset} but this page sent none — the page stops here`;
        seitenSackgasse = true;
      }
      return frisch.length;
    } catch (err: unknown) {
      letzterSeitenfehler = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      pendingMehr = null;
    }
  })();
  return pendingMehr;
}

async function doRefresh(): Promise<Memory[]> {
  // Request-Dedup: wiederverwende pending promise
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    try {
      await migrateLegacyIfNeeded();
      // ETag-Sparen: Der Server berechnet über den ganzen Bestand einen ETag.
      // Ohne If-None-Match kamen bei JEDEM Refresh (Start, Fensterfokus,
      // Agent-Ereignis) die vollen ~7,5 MB zurück, die der Renderer dann
      // parsen und in den State schieben musste — bei 3.000+ Notizen ein
      // spürbarer Ruck, und der GC-Druck machte die ganze Oberfläche träge.
      // Mit ETag antwortet der Server bei unverändertem Bestand mit 304 und
      // leerem Körper: kein Transfer, kein Parse, kein Re-Render.
      const res = await fetch('/api/memories', etag ? { headers: { 'If-None-Match': etag } } : undefined);
      // Die Köpfe zuerst lesen: eine 304-Antwort bringt keinen Leib, aber sie
      // nennt Bestand und Kappung weiter — und ein leerer Leib darf die Zahl
      // nicht tilgen, indem er übersprungen wird.
      // Der Status entscheidet zuerst: eine Antwort ab 400 darf weder die Zahl
      // tilgen noch die Kappung umbiegen noch den Cache ueberschreiben — ein
      // kaputter Bestand sieht sonst aus wie ein leerer Anfang.
      const status = (res as { status?: number }).status ?? 200;
      if (status >= 400) throw new Error(`the local server answered HTTP ${status}`);
      bestand = kopfZahl(res, 'x-kepta-total');
      begrenzt = kopfZahl(res, 'x-kepta-begrenzt') === 1;
      // Defensiv gelesen: ältere Test-Mocks bauen Responses ohne status/headers.
      if (status === 304) {
        // Bestand unverändert — Cache behalten, die Oberfläche nicht anfassen.
        // Eine 304 heisst: die Tuer hat geantwortet und der Bestand gilt.
        letzterLadefehler = null;
        return cache;
      }
      const neuesEtag = res.headers?.get?.('etag') ?? null;
      const data = await res.json();
      // Der Leib nennt den Vertrag seit F12 selbst (`{count,total,limit,offset,
      // begrenzt,hinweis,memories}`). Die Zahl aus dem Leib gewinnt über den
      // Kopf: sie nimmt denselben Weg wie die Daten und hängt nicht an einem
      // Kopf-Zugang. Der Kopf bleibt der Arm für die 304 ohne Leib.
      const totalAusLeib = zahl(data?.total);
      if (totalAusLeib !== null) bestand = totalAusLeib;
      if (typeof data?.begrenzt === 'boolean') begrenzt = data.begrenzt;
      // API liefert ein nacktes Array (ältere Clients erwarteten {memories:[]})
      cache = Array.isArray(data) ? data : Array.isArray(data?.memories) ? data.memories : [];
      etag = neuesEtag;
      letzterLadefehler = null;
      // Ein frischer Anfang ist eine frische Geschichte: die Sackgasse einer Seite gilt nur bis zur
      // nächsten ganzen Antwort, sonst sperrt ein einzelner Widerspruch das Nachladen für immer.
      letzterSeitenfehler = null;
      seitenSackgasse = false;
    } catch (err: unknown) {
      // Ein Fehler der Tuer ist kein leerer Anfang: Cache behalten, Grund
      // merken, die Subscriber holen beides — und der Grund wird weiterge-
      // gereicht. `doRefresh` versprach 'rejected NIE' und machte damit jede
      // Absage unsichtbar; genau dieses Versprechen ist der Defekt.
      letzterLadefehler = err instanceof Error ? err.message : String(err);
      notify();
      throw err;
    }
    notify();
    return cache;
  })();
  try {
    return await pendingRefresh;
  } finally {
    pendingRefresh = null;
  }
}

export function refreshMemories(): Promise<Memory[]> {
  // Dedup: laufende Anfrage wiederverwenden
  if (pendingRefresh) return pendingRefresh;
  // Debounce 300ms: sammle parallele Aufrufe
  if (debounceTimer) {
    return new Promise<Memory[]>((resolve, reject) => {
      debounceWaiters.push({ resolve, reject });
    });
  }
  return new Promise<Memory[]>((resolve, reject) => {
    debounceWaiters.push({ resolve, reject });
    debounceTimer = setTimeout(async () => {
      debounceTimer = null;
      const waiters = debounceWaiters.splice(0, debounceWaiters.length);
      try {
        const result = await doRefresh();
        waiters.forEach(w => w.resolve(result));
      } catch (e) {
        waiters.forEach(w => w.reject(e));
      }
    }, 300);
  });
}

async function migrateLegacyIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY)) return;
  localStorage.setItem(MIGRATED_KEY, '1');
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const legacy = JSON.parse(raw) as Memory[];
    if (!Array.isArray(legacy) || legacy.length === 0) return;
    await fetch('/api/memories/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memories: legacy, mode: 'merge' }),
    });
  } catch {
    // Migration darf den Betrieb nie blockieren
  }
}

export function subscribeMemories(callback: (memories: Memory[]) => void): () => void {
  listeners.add(callback);
  callback(cache);
  void refreshMemories().catch(() => { /* gemalt durch ladeFehler(), nicht durch diesen Fang */ });
  return () => {
    listeners.delete(callback);
  };
}

export async function saveMemory(memoryData: Partial<Memory> & { beziehungen?: BehauptungEingabe[] }): Promise<Memory | null> {
  etagVergessen();
  // Optimistic Update: sofort in Cache einfügen/aktualisieren
  const previous = [...cache];
  const now = Date.now();
  const optimisticId = memoryData.id || `optimistic-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const isUpdate = !!memoryData.id && cache.some(m => m.id === memoryData.id);
  const optimisticMemory: Memory = {
    id: optimisticId,
    userId: (memoryData.userId as string) || 'local',
    title: memoryData.title || 'Untitled',
    content: memoryData.content || '',
    tags: memoryData.tags || [],
    createdAt: (memoryData.createdAt as number) || now,
    updatedAt: now,
    ...(memoryData as object),
  } as Memory;
  // force optimistic id + timestamp (avoid TS duplicate property error)
  optimisticMemory.id = optimisticId;
  optimisticMemory.updatedAt = now;

  if (isUpdate) {
    cache = cache.map(m => (m.id === memoryData.id ? { ...m, ...memoryData, updatedAt: now } as Memory : m));
  } else {
    cache = [optimisticMemory, ...cache];
  }
  notify();

  try {
    const res = await fetch('/api/memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memoryData),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      merkeAblehnung(
        typeof data?.error === "string" && data.error.trim() !== ""
          ? data.error.trim()
          : `The server answered ${res.status} without saying why.`
      );
      throw new Error(ablehnungsGrund ?? "Save failed");
    }
    merkeAblehnung(null);
    // Server-Antwort abgleichen: optimistischen Eintrag durch echte Daten ersetzen (Debounce 300ms)
    await refreshMemories().catch(() => { /* die Schreibzung gelang; der Grund der Liste liegt im Speicher */ });
    return data.memory;
  } catch {
    // Rollback: optimistischen Stand zurücknehmen...
    cache = previous;
    notify();
    // ...und danach auf den serverseitigen Stand konvergieren (der Snapshot
    // könnte konkurrierende Agenten-Änderungen verdecken). der Grund der Liste liegt im Speicher (ladeFehler),
    // diese Zung bleibt bei ihrem Erfolg — eine gelungene Schreibaktion darf
    // nicht als Fehlschlag gemalt werden.
    void doRefresh().catch(() => { /* Konvergenz-Resync bleibt still: der neue Stand kommt mit der
        naechsten Antwort, und ein Wurf hier waere eine unhandled rejection hinter der Quittung. */ });
    return null;
  }
}

/**
 * Punkt 126 — was dieses Blatt schon behauptet. Vier Zustände, nicht zwei: die Liste kann
 * leer sein (dann sagt der Grund des Tors es), und sie kann **nicht lesbar** sein (dann
 * raet die Flaeche nicht, sie warnt). Ein Feld, das nur schreibt, laesst die Person ihre
 * eigne Aussage erneut tippen, weil sie nicht sieht, was steht.
 */
export async function holeBehauptungen(
  id: string
): Promise<{ liste: BehauptungEingabe[]; hinweis: string; grund: string | null }> {
  const leer = { liste: [] as BehauptungEingabe[], hinweis: "", grund: null as string | null };
  if (!id) return { ...leer, hinweis: "Nothing claimed yet - write the first one below, it saves with the note." };
  try {
    const res = await fetch(`/api/memories/${encodeURIComponent(id)}/behauptungen`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ...leer,
        grund: typeof data?.error === "string" && data.error.trim() !== ""
          ? data.error.trim()
          : `The server answered ${res.status} without saying why.`,
      };
    }
    const liste = Array.isArray(data?.behauptungen)
      ? (data.behauptungen as unknown[])
          .map((x) => {
            const o = (x ?? {}) as Record<string, unknown>;
            return {
              quelle: typeof o.quelle === "string" ? o.quelle : "",
              ziel: typeof o.ziel === "string" ? o.ziel : "",
              wort: typeof o.wort === "string" ? o.wort : "",
            };
          })
          .filter((x) => x.quelle && x.ziel && x.wort)
      : [];
    return {
      liste,
      hinweis: typeof data?.hinweis === "string" ? data.hinweis : "",
      grund: null,
    };
  } catch (fehler) {
    return { ...leer, grund: `Could not read the claims of this note (${String((fehler as Error)?.message ?? "no answer")}).` };
  }
}

export async function deleteMemory(id: string): Promise<void> {
  etagVergessen();
  // Optimistic Update: sofort aus Cache entfernen
  const previous = [...cache];
  cache = cache.filter(m => m.id !== id);
  notify();
  try {
    await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshMemories().catch(() => { /* die Schreibzung gelang; der Grund der Liste liegt im Speicher */ });
  } catch {
    // Rollback: Snapshot zurücknehmen, dann auf Server-Stand konvergieren
    cache = previous;
    notify();
    void doRefresh().catch(() => { /* Konvergenz-Resync bleibt still: der neue Stand kommt mit der
        naechsten Antwort, und ein Wurf hier waere eine unhandled rejection hinter der Quittung. */ });
  }
}

/**
 * Viele Notizen auf einmal in den Papierkorb — EIN Aufruf.
 *
 * Einzeln geloescht scheiterte das Aufraeumen von Duplikaten an der
 * Schreibdrossel des Servers (60/min): die ersten sechzig verschwanden, alles
 * Weitere bekam einen 429, und weil der Fehler verworfen wurde, meldete die
 * Oberflaeche trotzdem Erfolg.
 *
 * Gibt die Kennungen zurueck, die wirklich im Papierkorb gelandet sind — nur
 * die lassen sich sinnvoll wieder zurueckholen.
 */
export async function deleteMemories(ids: string[]): Promise<{
  deleted: number; ids: string[] }> {
  etagVergessen();
  if (ids.length === 0) return { deleted: 0, ids: [] };
  const weg = new Set(ids);
  const previous = [...cache];
  cache = cache.filter((m) => !weg.has(m.id));
  notify();
  try {
    const res = await fetch('/api/memories/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) throw new Error(`bulk-delete: ${res.status}`);
    const daten = (await res.json()) as { deleted?: number; ids?: string[] };
    await refreshMemories().catch(() => { /* die Schreibzung gelang; der Grund der Liste liegt im Speicher */ });
    return { deleted: daten.deleted ?? 0, ids: daten.ids ?? [] };
  } catch {
    cache = previous;
    notify();
    void doRefresh().catch(() => { /* Konvergenz-Resync bleibt still: der neue Stand kommt mit der
        naechsten Antwort, und ein Wurf hier waere eine unhandled rejection hinter der Quittung. */ });
    return { deleted: 0, ids: [] };
  }
}

/** Das Gegenstueck zu deleteMemories — holt eine ganze Aufraeumaktion zurueck. */
export async function restoreMemories(ids: string[]): Promise<number> {
  etagVergessen();
  if (ids.length === 0) return 0;
  try {
    const res = await fetch('/api/memories/bulk-restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) return 0;
    const daten = (await res.json()) as { restored?: number };
    await refreshMemories().catch(() => { /* die Schreibzung gelang; der Grund der Liste liegt im Speicher */ });
    return daten.restored ?? 0;
  } catch {
    return 0;
  }
}

export async function importMemories(
  memories: Partial<Memory>[],
  mode: 'merge' | 'replace'
): Promise<{ imported: number; total: number }> {
  const res = await fetch('/api/memories/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memories, mode }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Import failed');
  await refreshMemories().catch(() => { /* die Schreibzung gelang; der Grund der Liste liegt im Speicher */ });
  return data;
}
