// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Sidebar } from "../../src/components/Sidebar";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";

beforeEach(() => { localStorage.clear(); });

type Props = React.ComponentProps<typeof Sidebar>;
function zeige(over: Partial<Props> = {}) {
  const props: Props = {
    tags: [{ tag: "kanzlei", count: 12 }, { tag: "steuer", count: 3 }, { tag: "einzeln", count: 1 }],
    selectedTags: [],
    onSelectTag: vi.fn(),
    onClearTags: vi.fn(),
    currentView: "memories",
    onNavigate: vi.fn(),
    totalMemories: 42,
    isFocusMode: false,
    toggleFocusMode: vi.fn(),
    ...over,
  };
  const view = render(
    <AuthProvider><ThemeProvider><Sidebar {...props} /></ThemeProvider></AuthProvider>
  );
  return { ...view, props };
}

describe("Sidebar: Navigation", () => {
  it("bietet die vier Ansichten an", () => {
    zeige();
    for (const label of ["Knowledge", "Chat", "Graph", "Settings"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}$`) })).toBeTruthy();
    }
  });

  it("meldet einen Wechsel zurueck", async () => {
    const user = userEvent.setup();
    const { props } = zeige();
    await user.click(screen.getByRole("button", { name: /^Graph$/ }));
    expect(props.onNavigate).toHaveBeenCalledWith("graph");
  });

  it("markiert die aktive Ansicht", () => {
    const { container } = zeige({ currentView: "chat" });
    const aktiv = [...container.querySelectorAll("button[data-active='true']")].map((b) => b.textContent?.trim());
    expect(aktiv).toContain("Chat");
    expect(aktiv).not.toContain("Knowledge");
  });
});

describe("Sidebar: Zaehlung und Tags", () => {
  it("zaehlt Eintraege im Singular und Plural", () => {
    const { unmount } = zeige({ totalMemories: 1 });
    expect(screen.getByText("1 note")).toBeTruthy();
    unmount();
    zeige({ totalMemories: 42 });
    expect(screen.getByText("42 notes")).toBeTruthy();
  });

  it("zeigt Tags mit ihrer Haeufigkeit", () => {
    zeige();
    expect(screen.getByRole("button", { name: /kanzlei/ })).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("laesst die Zahl bei einem einzelnen Vorkommen weg", () => {
    const { container } = zeige();
    const einzeln = [...container.querySelectorAll("button")].find((b) => /einzeln/.test(b.textContent ?? ""));
    expect(einzeln?.textContent?.trim()).toBe("#einzeln");
  });

  it("meldet die Auswahl eines Tags", async () => {
    const user = userEvent.setup();
    const { props } = zeige();
    await user.click(screen.getByRole("button", { name: /kanzlei/ }));
    expect(props.onSelectTag).toHaveBeenCalledWith("kanzlei");
  });

  it("zeigt 'Reset' nur bei getroffener Auswahl", async () => {
    const user = userEvent.setup();
    const { unmount } = zeige();
    expect(screen.queryByRole("button", { name: /Reset/ })).toBeNull();
    unmount();
    const { props } = zeige({ selectedTags: ["kanzlei"] });
    await user.click(screen.getByRole("button", { name: /Reset/ }));
    expect(props.onClearTags).toHaveBeenCalled();
  });

  it("blendet den Tag-Bereich ohne Tags ganz aus", () => {
    zeige({ tags: [] });
    expect(screen.queryByText("Tags")).toBeNull();
  });
});

describe("Sidebar: viele Tags", () => {
  // Befund: die Liste schnitt bei 40 Tags ab, ohne das zu sagen. Wer viel Wissen
  // hat, sah den Rest schlicht nicht — dieselbe Sorte stiller Deckel wie
  // frueher bei der Suche.
  const viele = Array.from({ length: 120 }, (_, i) => ({ tag: `thema${i}`, count: 120 - i }));

  it("sagt, wenn nicht alle Tags gezeigt werden", () => {
    zeige({ tags: viele });
    expect(screen.getByText(/more/i)).toBeTruthy();
  });

  it("laesst den Rest aufklappen", async () => {
    const user = userEvent.setup();
    const { container } = zeige({ tags: viele });
    const vorher = [...container.querySelectorAll("button")].filter((b) => /^#?thema\d+/.test(b.textContent ?? "")).length;
    await user.click(screen.getByText(/more/i));
    await waitFor(() => {
      const nachher = [...container.querySelectorAll("button")].filter((b) => /^#?thema\d+/.test(b.textContent ?? "")).length;
      expect(nachher).toBeGreaterThan(vorher);
    });
  });

  it("sagt bei wenigen Tags nichts von 'mehr'", () => {
    zeige();
    expect(screen.queryByText(/more/i)).toBeNull();
  });
});

describe("Sidebar: Fusszeile", () => {
  it("nennt die Marke und sagt nichts von Grenzen oder Schlüsseln", () => {
    zeige();
    expect(screen.getAllByText(/^K3PTA$/).length).toBeGreaterThan(0);
    // Die Marke nennt zwei Dinge, die immer stimmen, und keinen gemessenen
    // Zustand: „encrypted" stand hier, während dieselbe Instanz im selben
    // Fenster einen Chip „Not encrypted" trug (gemessen 10.10., leerer
    // Datenordner mit KEPTA_ENCRYPTION=off — e3-screens/
    // vorher-dark-1440px-erststart.png). Der Zustand gehört dorthin, wo er
    // gemessen wird: Systemstatus und die Statuszeile der Flächen (P202,
    // Mockup-Fuß: die Marke trägt keine Unterzeile mehr).
    expect(screen.queryByText(/^local · private$/)).toBeNull();
    expect(screen.queryByText(/encrypt/i)).toBeNull();
    // Die alte Fußzeile warb mit „A key removes the limits". Es gibt weder
    // Grenzen noch Schlüssel (09.10.2026), also darf kein Wort davon bleiben.
    expect(screen.queryByText(/key|limit|unlimited/i)).toBeNull();
  });

  it("zeigt keine Person und keine Stufe — beides existiert nicht mehr", () => {
    zeige();
    expect(screen.queryByText(/Sarah Mandel/)).toBeNull();
    expect(screen.queryByText(/business|enterprise|seats/i)).toBeNull();
  });

  it("zeigt in der Fusszeile NIE eine Versionsnummer (Damian, 25.9.)", () => {
    zeige();
    expect(screen.queryByText(/\d+\.\d+\.\d+/)).toBeNull();
  });

  it("schaltet das Thema über die zwei Ikons (P202, Mockup-Fuß)", async () => {
    const user = userEvent.setup();
    zeige();
    const dunkel = screen.getByRole("button", { name: /Dark theme/i });
    await user.click(dunkel);
    // Nach dem Wechsel trägt das andere Ikon seine Färbung — beide stehen immer.
    await waitFor(() => expect(screen.getByRole("button", { name: /Light theme/i })).toBeTruthy());
  });

  it("schaltet den Fokusmodus", async () => {
    const user = userEvent.setup();
    const { props } = zeige();
    await user.click(screen.getByRole("button", { name: /Focus mode/i }));
    expect(props.toggleFocusMode).toHaveBeenCalled();
  });

  it("zeigt den Einrichtungs-Knopf nur, wenn die Ersteinrichtung offen ist", async () => {
    const user = userEvent.setup();
    const { unmount } = zeige();
    expect(screen.queryByRole("button", { name: /Open setup/i })).toBeNull();
    unmount();
    const onOpenSetup = vi.fn();
    zeige({ showSetup: true, onOpenSetup });
    await user.click(screen.getByRole("button", { name: /Open setup/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });

  it("klappt im Fokusmodus auf Breite null zusammen", () => {
    const { container } = zeige({ isFocusMode: true });
    expect(container.firstElementChild?.className).toMatch(/w-0/);
  });
});
