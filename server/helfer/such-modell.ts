// P184 (#44): die Maschine hinter dem Settings-Schalter für das Such-Modell.
// Die Validation ist rein (Tags als Argument — kein Netz hier), die Wirkung
// dreifach: Wahl im Store persistieren (einstellungen.such_modell), die
// EmbeddingQueue umstellen (ihr tick re-embeddet Mismatch-Chunks im
// Hintergrund) und ehrlich zählen, was danach neu eingebettet werden muss.
import type { KeptaStore } from "../../src/core/store";

export interface WechselErgebnis {
  ok: boolean;
  modell?: string;
  neuZuEinbetten?: number;
  fehler?: string;
}

export interface WechselFähigeQueue {
  wechselModell(model: string): void;
}

export function aktivesModellAusStore(store: KeptaStore): string | undefined {
  const wert = store.einstellungen()["such_modell"];
  return typeof wert === "string" && wert.length > 0 ? wert : undefined;
}

/** Der Wechsel selbst: valide gegen die Ollama-Tags, sonst nichts geschrieben. */
export function suchModellWechseln(
  store: KeptaStore,
  queue: WechselFähigeQueue | null | undefined,
  modell: unknown,
  tags: string[],
): WechselErgebnis {
  if (typeof modell !== "string" || modell.trim().length === 0 || modell.length > 80) {
    return { ok: false, fehler: "The model field is missing or not a valid name." };
  }
  const name = modell.trim();
  const bekannt = tags.some((t) => t === name || t.startsWith(`${name}:`));
  if (!bekannt) {
    const kandidaten = tags
      .filter((t) => !t.startsWith("llama") && !t.startsWith("qwen"))
      .slice(0, 6)
      .join(", ");
    return { ok: false, fehler: `Ollama does not know "${name}". Available search models: ${kandidaten}.` };
  }
  store.setzeEinstellungen({ such_modell: name });
  queue?.wechselModell(name);
  const neuZuEinbetten = store.chunksNeedingEmbedding(1_000_000, name).length;
  return { ok: true, modell: name, neuZuEinbetten };
}
