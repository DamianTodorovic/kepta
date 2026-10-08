// @vitest-environment jsdom
//
// Team-Ansicht (Enterprise E2) aus Sicht einer Person, die sie benutzt:
// Free/Pro sieht eine Upgrade-Karte statt einer Sackgasse; Business/Enterprise
// sieht Workspace, Seats, Rollen (mit "this computer"-Markierung) und die
// Anzahl der team:*-Notizen. Server nachgebildet (stubFetch wie EnterpriseViews).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TeamView, type TeamInfo } from "../../src/components/TeamView";
import { Sidebar } from "../../src/components/Sidebar";

function stubFetch(routen: Record<string, unknown>) {
  const schluessel = Object.keys(routen).sort((a, b) => b.length - a.length);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const k = schluessel.find((s) => url.startsWith(s));
    const body = k ? routen[k]! : { error: "not found" };
    return new Response(JSON.stringify(body), { status: k ? 200 : 404, headers: { "Content-Type": "application/json" } });
  }));
}

afterEach(() => vi.unstubAllGlobals());

const OHNE_ROLLEN: TeamInfo = { team: null };
const MIT_ROLLEN: TeamInfo = {
  team: { name: "Kanzlei Weber", rollen: { local: "admin", gast: "viewer" }, meineRolle: "admin" },
};

describe("TeamView", () => {
  it("ohne Rollen-Datei: die Ansicht sagt warum, statt eine Sackgasse zu sein", async () => {
    stubFetch({ "/api/team": OHNE_ROLLEN, "/api/memories": { memories: [] } });
    render(<TeamView aktiv />);
    await waitFor(() => expect(screen.getByTestId("team-keine-rollen")).toBeTruthy());
    expect(screen.getByTestId("team-keine-rollen").textContent).toContain("managed-settings.json");
    // Kein Angebot, kein Preis: die Ansicht wirbt für nichts.
    expect(screen.queryByText(/enterprise/i)).toBeNull();
    expect(screen.queryByTestId("team-rollen")).toBeNull();
  });

  it("mit Rollen: Workspace-Name, meine Rolle, Rollen mit this-computer-Markierung, Notizen gezählt", async () => {
    stubFetch({ "/api/team": MIT_ROLLEN, "/api/memories": { memories: [{ id: "1", scope: "team:weber", title: "Fristen" }, { id: "2", scope: "local", title: "privat" }] } });
    render(<TeamView aktiv />);
    await waitFor(() => expect(screen.getByText("Kanzlei Weber")).toBeTruthy());
    expect(screen.getByTestId("team-meine-rolle").textContent).toBe("admin");
    const rollen = screen.getByTestId("team-rollen");
    expect(rollen.textContent).toContain("gast");
    expect(rollen.textContent).toContain("admin");
    expect(rollen.textContent).toContain("(this computer)");
    // Team-Notizen gezählt, lokale nicht mitgezählt:
    expect(screen.getByTestId("team-notizen-count").textContent).toContain("1 entry");
    // Eine Stufe wird nirgends mehr behauptet.
    expect(screen.queryByTestId("team-edition")).toBeNull();
    expect(screen.queryByTestId("team-seats")).toBeNull();
  });
});

describe("Sidebar: Team-Nav-Punkt nur mit Rollen-Datei", () => {
  const basis = { tags: [], selectedTags: [], onSelectTag: () => undefined, onClearTags: () => undefined, currentView: "memories" as const, onNavigate: vi.fn(), totalMemories: 0, isFocusMode: false, toggleFocusMode: () => undefined };

  afterEach(() => vi.restoreAllMocks());

  it("Rollen vorhanden → Team-Punkt da, Klick navigiert zu 'team'", async () => {
    const onNavigate = vi.fn();
    const { container } = render(<Sidebar {...basis} onNavigate={onNavigate} teamVisible />);
    const knopf = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Team");
    expect(knopf).toBeTruthy();
    knopf!.click();
    expect(onNavigate).toHaveBeenCalledWith("team");
  });

  it("ohne Rollen-Datei → kein Team-Punkt (keine Sackgasse)", () => {
    const { container } = render(<Sidebar {...basis} />);
    const teamKnopf = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Team");
    expect(teamKnopf).toBeUndefined();
  });
});
