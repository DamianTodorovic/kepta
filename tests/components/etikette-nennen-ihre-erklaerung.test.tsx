// @vitest-environment jsdom
/* Punkt 7: jedes Etikett muss sagen, was dahinter liegt.

   Gemessen 4.11. 00:05 MEZ mit scripts/verstaendlichkeit-im-fenster.mjs und
   scripts/wortschatz-zaehlen.mjs am gebauten Stand: 17 Fachwort-Familien stehen auf der
   Flaeche, 13 davon erklaert, 4 nicht (semantic, embedding, dossier, activity). Nach der
   Wort-Arbeit: 17 von 17 erklaert, 0 nicht.

   Die Zahl selbst ist ein Lauf im Fenster, kein Fall in der Suite. Was die Suite haelt,
   sind die Traeger: jeder Nav-Knopf und jedes Tab muss einen title tragen, der (a) ein
   echter Satz ist und (b) das Wort selbst nennt. Ein title, der das Wort nicht nennt,
   erklaert es nicht — dieselbe Regel, nach der die Sonde zaehlt. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Sidebar } from "../../src/components/Sidebar";
import { ActivityView } from "../../src/components/ActivityView";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";

const worter = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

type Props = React.ComponentProps<typeof Sidebar>;
function zeigeLeiste(over: Partial<Props> = {}) {
  const props: Props = {
    tags: [],
    selectedTags: [],
    onSelectTag: vi.fn(),
    onClearTags: vi.fn(),
    currentView: "memories",
    onNavigate: vi.fn(),
    totalMemories: 0,
    isFocusMode: false,
    toggleFocusMode: vi.fn(),
    ...over,
  };
  return render(<AuthProvider><ThemeProvider><Sidebar {...props} /></ThemeProvider></AuthProvider>);
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, entries: [], events: [] }), { status: 200 })));
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Punkt 7: die Etikette tragen ihren eignen Satz", () => {
  it("jeder Nav-Knopf nennt in seinem title dasselbe Wort, das er zeigt", async () => {
    zeigeLeiste();
    await waitFor(() => expect(document.querySelectorAll(".sidebar-nav-btn").length).toBeGreaterThan(4));
    const knopfe = [...document.querySelectorAll<HTMLButtonElement>(".sidebar-nav-btn")];
    for (const k of knopfe) {
      const label = (k.textContent || "").trim();
      const titel = k.getAttribute("title") || "";
      expect(worter(titel), `${label}: der title ist kein Satz (${titel})`).toBeGreaterThan(5);
      expect(titel.toLowerCase(), `${label}: der title nennt das Wort selbst nicht (${titel})`).toContain(label.toLowerCase());
    }
  });

  it("Team fuehrt seinen Satz weiter, wenn die Rolle den Punkt aufmacht", async () => {
    zeigeLeiste({ teamVisible: true });
    await waitFor(() => expect(document.querySelectorAll(".sidebar-nav-btn").length).toBeGreaterThan(5));
    const team = [...document.querySelectorAll<HTMLButtonElement>(".sidebar-nav-btn")]
      .find((k) => (k.textContent || "").trim() === "Team");
    expect(team, "kein Team-Knopf, obwohl Rollen gesetzt sind").toBeTruthy();
    expect(worter(team!.getAttribute("title") || ""), "der Team-Knopf steht ohne Satz da").toBeGreaterThan(5);
  });

  it("die beiden Tab-Worte der Aktivitaet erklaeren sich selbst", async () => {
    render(<ThemeProvider><AuthProvider><ActivityView aktiv={false} onOpenMemory={() => {}} /></AuthProvider></ThemeProvider>);
    await waitFor(() => expect(document.querySelectorAll('[role="tab"]').length).toBeGreaterThan(1));
    for (const tab of [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]) {
      const label = (tab.textContent || "").trim();
      const titel = tab.getAttribute("title") || "";
      expect(worter(titel), `${label}: kein Satz im title (${titel})`).toBeGreaterThan(5);
      expect(titel.toLowerCase(), `${label}: der title nennt "${label}" nicht (${titel})`).toContain(label.toLowerCase());
    }
  });
});
