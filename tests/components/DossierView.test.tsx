// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { DossierView } from "../../src/components/DossierView";
import { ToastProvider } from "../../src/components/ui/Toast";

// Das Dossier ist der Ort, wohin ein Klick im Graphen führt. Damit diese Tür
// nicht nur behauptet ist, wird hier gemessen, was wirklich abgeholt wird.

const anfragen: string[] = [];

beforeEach(() => {
  anfragen.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    anfragen.push(String(url));
    if (String(url).includes("/api/dossier/suggestions")) {
      return new Response(JSON.stringify({ tags: [], topics: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({
      topic: "Elena Weiss", total: 0, kinds: {}, facts: [], timeline: [], howtos: [], documents: [],
      todos: [], contradictions: [], related: [], first: null, last: null, markdown: "",
    }), { status: 200 });
  }));
});

afterEach(() => { vi.unstubAllGlobals(); });

function zeige(props: Parameters<typeof DossierView>[0]) {
  return render(
    <ToastProvider>
      <DossierView {...props} />
    </ToastProvider>
  );
}

describe("Ein Dossier von außen öffnen", () => {
  it("holt das Dossier des Begriffs, der gesetzt wurde", async () => {
    zeige({ onOpenMemory: () => {}, dossierThema: { text: "Elena Weiss", nr: 1 } });
    await waitFor(() => expect(anfragen.some((u) => u.includes("/api/dossier?topic=Elena%20Weiss"))).toBe(true));
  });

  it("lädt von selbst nichts, wenn kein Begriff gesetzt ist", async () => {
    zeige({ onOpenMemory: () => {} });
    await waitFor(() => expect(anfragen.some((u) => u.includes("/api/dossier/suggestions"))).toBe(true));
    expect(anfragen.some((u) => u.includes("/api/dossier?topic="))).toBe(false);
  });

  it("holt denselben Begriff erneut, wenn jemand zweimal klickt", async () => {
    const { rerender } = zeige({ onOpenMemory: () => {}, dossierThema: { text: "Elena Weiss", nr: 1 } });
    await waitFor(() => expect(anfragen.filter((u) => u.includes("/api/dossier?topic="))).toHaveLength(1));
    rerender(
      <ToastProvider>
        <DossierView onOpenMemory={() => {}} dossierThema={{ text: "Elena Weiss", nr: 2 }} />
      </ToastProvider>
    );
    await waitFor(() => expect(anfragen.filter((u) => u.includes("/api/dossier?topic="))).toHaveLength(2));
  });
});
