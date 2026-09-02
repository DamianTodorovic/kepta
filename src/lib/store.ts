import { Memory } from '../types';

// Alle Knoten liegen jetzt serverseitig in ~/.ki-gehirn/memories.json
// (kein localStorage-Limit mehr). Der alte localStorage-Bestand wird
// einmalig automatisch migriert.

const LEGACY_KEY = 'ki_gehirn_memories';
const MIGRATED_KEY = 'ki_gehirn_memories_migrated_v2';

const listeners = new Set<(memories: Memory[]) => void>();
let cache: Memory[] = [];

// ---------- Performance: Request-Dedup + 300ms Debounce für refresh ----------
let pendingRefresh: Promise<Memory[]> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let debounceWaiters: Array<{ resolve: (v: Memory[]) => void; reject: (e: unknown) => void }> = [];

function notify() {
  listeners.forEach(fn => fn(cache));
}

export function getMemoriesSync(): Memory[] {
  return cache;
}

async function doRefresh(): Promise<Memory[]> {
  // Request-Dedup: wiederverwende pending promise
  if (pendingRefresh) return pendingRefresh;
  pendingRefresh = (async () => {
    try {
      await migrateLegacyIfNeeded();
      const res = await fetch('/api/memories');
      const data = await res.json();
      // API liefert ein nacktes Array (ältere Clients erwarteten {memories:[]})
      cache = Array.isArray(data) ? data : Array.isArray(data?.memories) ? data.memories : [];
    } catch {
      // Server nicht erreichbar (oder Storage defekt) -> Cache behalten.
      // doRefresh verspricht: rejected NIE — so darf die Konvergenz einfach
      // mit `void doRefresh()` feuern, ohne unhandled rejections zu riskieren.
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
  void refreshMemories();
  return () => {
    listeners.delete(callback);
  };
}

export async function saveMemory(memoryData: Partial<Memory>): Promise<Memory | null> {
  // Optimistic Update: sofort in Cache einfügen/aktualisieren
  const previous = [...cache];
  const now = Date.now();
  const optimisticId = memoryData.id || `optimistic-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const isUpdate = !!memoryData.id && cache.some(m => m.id === memoryData.id);
  const optimisticMemory: Memory = {
    id: optimisticId,
    userId: (memoryData.userId as string) || 'local',
    title: memoryData.title || 'Ohne Titel',
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
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    // Server-Antwort abgleichen: optimistischen Eintrag durch echte Daten ersetzen (Debounce 300ms)
    await refreshMemories();
    return data.memory;
  } catch {
    // Rollback: optimistischen Stand zurücknehmen...
    cache = previous;
    notify();
    // ...und danach auf den serverseitigen Stand konvergieren (der Snapshot
    // könnte konkurrierende Agenten-Änderungen verdecken). doRefresh rejected nie.
    void doRefresh();
    return null;
  }
}

export async function deleteMemory(id: string): Promise<void> {
  // Optimistic Update: sofort aus Cache entfernen
  const previous = [...cache];
  cache = cache.filter(m => m.id !== id);
  notify();
  try {
    await fetch(`/api/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refreshMemories();
  } catch {
    // Rollback: Snapshot zurücknehmen, dann auf Server-Stand konvergieren
    cache = previous;
    notify();
    void doRefresh();
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
  if (!res.ok) throw new Error(data.error || 'Import fehlgeschlagen');
  await refreshMemories();
  return data;
}
