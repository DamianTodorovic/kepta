// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Settings } from "../../src/components/Settings";

// Punkt 8/43, 25.10.2026: der Textgroessen-Regler. Der Fall bedient das benannte
// Steuer (#display-textgroesse) und misst den Effekt am Blatt: document.body traegt
// danach zoom 1.15. Die Gegenprobe stellt 100 und raeumt den Zoom. Kein Spion, kein
// Default, kein Schreiben ins Feld - der Regler muss selbst ziehen.

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/api/health")) {
      return new Response(JSON.stringify({ ok: true, count: 7, uptime: 12 }), { status: 200 });
    }
    if (String(url).includes("/api/models")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
}

beforeEach(() => {
  localStorage.clear();
  document.body.style.zoom = "";
  stubFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.zoom = "";
});

describe("Settings: Textgroesse wirkt am Blatt (Punkt 8/43)", () => {
  it("115 skaliert das Blatt, die Gegenprobe 100 raeumt es", async () => {
    const user = userEvent.setup();
    render(<Settings />);
    const feld = () => screen.getByLabelText(/Text size/i) as HTMLSelectElement;

    expect(feld().value).toBe("100");
    expect(document.body.style.zoom).toBe("");

    await user.selectOptions(feld(), "115");
    expect(feld().value).toBe("115");
    expect(localStorage.getItem("ki_gehirn_zoom")).toBe("115");
    await waitFor(() => expect(document.body.style.zoom).toBe("1.15"));

    await user.selectOptions(feld(), "100");
    expect(feld().value).toBe("100");
    expect(localStorage.getItem("ki_gehirn_zoom")).toBe("100");
    await waitFor(() => expect(document.body.style.zoom).toBe(""));
  });
});
