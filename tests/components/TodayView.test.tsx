// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TodayView } from "../../src/components/TodayView";
import { ToastProvider } from "../../src/components/ui/Toast";

// Derselbe Vertrag wie am Dossier: die Fläche liest daten.created.total,
// daten.todos.total, daten.contradictions.length — eine Teilantwort darf sie
// nicht umwerfen.

describe("Eine Teilantwort wirft Today nicht raus", () => {
  it("hält durch, wenn das Briefing nur teilweise da ist", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      since: 1, created: { total: 2 }, todos: {}, contradictions: null, expiring: "keine",
    }), { status: 200 })));
    const { container } = render(
      <ToastProvider><TodayView aktiv onOpenMemory={() => {}} onGo={() => {}} /></ToastProvider>
    );
    // Ein leerer container ist hier der Befund: die Fläche ist nicht nur ohne
    // Zahl, sie ist weg — React hat sie nach dem Fehler ausgehängt.
    expect(container.textContent, "Today ist von der Seite verschwunden").not.toBe("");
    // Der Beleg, dass die Antwort wirklich in der Fläche angekommen ist: die
    // zwei neuen Notizen stehen da. Ohne diesen Nachweis besteht der Test
    // gegen einen leeren Bildschirm.
    await waitFor(() => expect(container.textContent).toMatch(/2 new\b/));
    expect(container.textContent).not.toMatch(/Cannot read/);
  });
});
