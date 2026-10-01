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

const FREE: TeamInfo = { edition: null, seats: null, team: null };
const BUSINESS: TeamInfo = {
  edition: "business",
  seats: 5,
  team: { name: "Kanzlei Weber", rollen: { local: "admin", gast: "viewer" }, meineRolle: "admin" },
};

describe("TeamView", () => {
  it("Free/Pro: Upgrade-Karte statt Team, keine Rollen-Tabelle", async () => {
    stubFetch({ "/api/team": FREE, "/api/memories": { memories: [] } });
    render(<TeamView aktiv />);
    await waitFor(() => expect(screen.getByText(/part of KEPTA Enterprise/)).toBeTruthy());
    expect(screen.queryByTestId("team-rollen")).toBeNull();
  });

  it("Business: Workspace-Name, Edition, Seats, Rollen mit this-computer-Markierung", async () => {
    stubFetch({ "/api/team": BUSINESS, "/api/memories": { memories: [{ id: "1", scope: "team:weber", title: "Fristen" }, { id: "2", scope: "local", title: "privat" }] } });
    render(<TeamView aktiv />);
    await waitFor(() => expect(screen.getByTestId("team-edition").textContent).toBe("KEPTA Enterprise"));
    expect(screen.getByText("Kanzlei Weber")).toBeTruthy();
    expect(screen.getByTestId("team-seats").textContent).toBe("5 seats");
    const rollen = screen.getByTestId("team-rollen");
    expect(rollen.textContent).toContain("gast");
    expect(rollen.textContent).toContain("admin");
    expect(rollen.textContent).toContain("(this computer)");
    // Team-Notizen gezählt, lokale nicht mitgezählt:
    expect(screen.getByTestId("team-notizen-count").textContent).toContain("1 entry");
  });

  it("Enterprise ohne Seats-Angabe → per-agreement-Text", async () => {
    stubFetch({ "/api/team": { edition: "enterprise", seats: null, team: { rollen: {}, meineRolle: "viewer" } }, "/api/memories": { memories: [] } });
    render(<TeamView aktiv />);
    await waitFor(() => expect(screen.getByTestId("team-edition").textContent).toBe("KEPTA Enterprise"));
    expect(screen.getByTestId("team-seats").textContent).toContain("per agreement");
  });
});

describe("Sidebar: Team-Nav-Punkt nur mit Team-Edition", () => {
  const basis = { tags: [], selectedTags: [], onSelectTag: () => undefined, onClearTags: () => undefined, currentView: "memories" as const, onNavigate: vi.fn(), totalMemories: 0, isFocusMode: false, toggleFocusMode: () => undefined };

  afterEach(() => vi.restoreAllMocks());

  it("business → Team-Punkt vorhanden, Klick navigiert zu 'team'", async () => {
    const onNavigate = vi.fn();
    const { container } = render(<Sidebar {...basis} onNavigate={onNavigate} licenseEdition="business" />);
    const knopf = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Team");
    expect(knopf).toBeTruthy();
    knopf!.click();
    expect(onNavigate).toHaveBeenCalledWith("team");
  });

  it("free → kein Team-Punkt (keine Sackgasse)", () => {
    const { container } = render(<Sidebar {...basis} licenseEdition={null} />);
    const teamKnopf = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Team");
    expect(teamKnopf).toBeUndefined();
  });
});
