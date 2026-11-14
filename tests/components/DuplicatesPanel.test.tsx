// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DuplicatesPanel, loadDismissed, groupPairKeys } from "../../src/components/DuplicatesPanel";
import { findDuplicateGroups, pairKey } from "../../src/lib/duplicates";
import type { Memory } from "../../src/types";

// Das Dashboard meldete "9 duplicates" und bot einen Knopf, der die erste
// betroffene Notiz im Editor oeffnete. Welche Notizen gemeint waren, stand
// nirgends — und entfernen konnte man nichts. Beides pruefen diese Tests.

let zaehler = 0;
function note(over: Partial<Memory> = {}): Memory {
  zaehler++;
  return {
    id: `m${zaehler}`,
    userId: "local",
    title: `Titel ${zaehler}`,
    content: `Inhalt ${zaehler}`,
    tags: [],
    createdAt: 1000 + zaehler,
    updatedAt: 1000 + zaehler,
    ...over,
  };
}

beforeEach(() => {
  localStorage.clear();
});

function oeffne(memories: Memory[], over: Partial<React.ComponentProps<typeof DuplicatesPanel>> = {}) {
  const onDelete = vi.fn();
  const onDeleteMany = vi.fn();
  const onClose = vi.fn();
  const onOpenMemory = vi.fn();
  const view = render(
    <DuplicatesPanel memories={memories} open onClose={onClose} onDelete={onDelete} onDeleteMany={onDeleteMany} onOpenMemory={onOpenMemory} {...over} />
  );
  return { onDelete, onDeleteMany, onClose, onOpenMemory, ...view };
}

describe("DuplicatesPanel: die Duplikate werden sichtbar", () => {
  it("zeigt nichts, solange es geschlossen ist", () => {
    const { container } = render(
      <DuplicatesPanel memories={[note({ title: "G" }), note({ title: "G" })]} open={false} onClose={() => {}} onDelete={() => {}} onDeleteMany={() => {}} onOpenMemory={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("nennt beide Seiten eines Paares beim Namen — nicht nur eine Zahl", () => {
    const a = note({ title: "Docker Setup", content: "Erste Fassung mit ein wenig Text." });
    const b = note({ title: "docker setup", content: "Zweite Fassung, kuerzer." });
    oeffne([a, b]);
    expect(screen.getByText("Docker Setup")).toBeTruthy();
    expect(screen.getByText("docker setup")).toBeTruthy();
    // P202, Mockup-Grammatik (s-duplicates): die flachen Zeilen tragen Name und
    // Zustand — der Gruppen-Grund („Same title") lebt im Server-Response und in
    // der Statuszeile des Fensters, nicht mehr als Kopf-Kasten im Dialog.
  });

  it("zaehlt die ueberzaehligen Notizen, nicht die Gruppen", () => {
    const ms = [note({ title: "G" }), note({ title: "G" }), note({ title: "G" })];
    oeffne(ms);
    // Die Zahl lebt in der Statuszeile des Fensters („2 duplicates in 1 group“);
    // das Dialog-Bild trägt die zwei Kopien-Zeilen selbst (der Titel-Buchstabe
    // im Icon zählt nicht mit).
    expect(screen.getAllByText(/Move this note to the trash/i).length).toBe(2);
  });

  it("markiert den Vorschlag zum Behalten", () => {
    const kurz = note({ title: "Gleich", content: "kurz" });
    const lang = note({ title: "Gleich", content: "Deutlich mehr Inhalt in dieser Fassung, die erhalten bleiben soll." });
    oeffne([kurz, lang]);
    const keep = screen.getByText(/^Suggested keeper/).closest(".app-zeile")!;
    expect(within(keep).getByText("Gleich")).toBeTruthy();
    expect(within(keep).getByText(/Not a duplicate/i)).toBeTruthy();
    expect(within(keep).getByText(/Open this note/i)).toBeTruthy();
  });

  it("sagt klar, dass geloeschte Notizen im Papierkorb landen", () => {
    oeffne([note({ title: "G" }), note({ title: "G" })]);
    expect(screen.getByText(/moves a note to the trash/i)).toBeTruthy();
  });

  it("zeigt einen ruhigen Leerzustand, wenn nichts doppelt ist", () => {
    oeffne([note(), note()]);
    expect(screen.getByText(/No duplicates found/i)).toBeTruthy();
    // Der Kopf heißt jetzt immer „Duplicates" (s-duplicates); die Zahl-Zeile
    // steht in der Statuszeile des Fensters, nicht im Dialog.
    expect(screen.getByRole("heading", { name: "Duplicates" })).toBeTruthy();
  });
});

describe("DuplicatesPanel: aussortieren", () => {
  it("loescht eine einzelne Kopie auf Knopfdruck", async () => {
    const user = userEvent.setup();
    const basis = "Docker startet den Dienst im Hintergrund und legt ein Volume an, damit die Datenbank einen Neustart ueberlebt.";
    const a = note({ title: "Fassung Alpha", content: basis, updatedAt: 9000 });
    const b = note({ title: "Fassung Beta", content: basis, updatedAt: 1000 });
    const { onDelete } = oeffne([a, b]);
    await user.click(screen.getByRole("button", { name: /Delete Fassung Beta/i }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(b.id));
  });

  it("„Keep suggested“ entfernt alle Kopien ausser der vorgeschlagenen", async () => {
    const user = userEvent.setup();
    const lang = note({ title: "Gleich", content: "Die ausfuehrliche Fassung, die bleiben soll." });
    const kurz1 = note({ title: "Gleich", content: "kurz" });
    const kurz2 = note({ title: "Gleich", content: "auch kurz" });
    const { onDelete, onDeleteMany } = oeffne([lang, kurz1, kurz2]);

    // EIN Sammelaufruf, nicht einer je Notiz: einzeln lief das Aufraeumen in
    // die Schreibdrossel des Servers und brach nach sechzig Notizen lautlos ab.
    // P202: die Massen-Funktion sitzt am Gefahr-Wort des Fußes (s-duplicates).
    await user.click(screen.getByRole("button", { name: /Delete every copy except the suggested one/i }));
    await user.click(screen.getByRole("button", { name: /Yes, move 2 to the trash/i }));
    await waitFor(() => expect(onDeleteMany).toHaveBeenCalledTimes(1));
    expect(onDelete).not.toHaveBeenCalled();
    const geloescht = onDeleteMany.mock.calls[0][0] as string[];
    expect(geloescht).toContain(kurz1.id);
    expect(geloescht).toContain(kurz2.id);
    expect(geloescht).not.toContain(lang.id);
  });

  it("raeumt erst nach ausdruecklicher Bestaetigung alles auf", async () => {
    const user = userEvent.setup();
    const ms = [
      note({ title: "A", content: "Die lange Fassung von A." }), note({ title: "A", content: "kurz" }),
      note({ title: "B", content: "Die lange Fassung von B." }), note({ title: "B", content: "kurz" }),
    ];
    const { onDelete, onDeleteMany } = oeffne(ms);

    await user.click(screen.getByRole("button", { name: /Delete every copy except the suggested one/i }));
    expect(onDeleteMany).not.toHaveBeenCalled();
    expect(screen.getByText(/This moves 2 notes to the trash/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Yes, move 2 to the trash/i }));
    // Zwei Gruppen, zwei Ueberzaehlige — trotzdem genau EIN Aufruf.
    await waitFor(() => expect(onDeleteMany).toHaveBeenCalledTimes(1));
    expect((onDeleteMany.mock.calls[0][0] as string[]).length).toBe(2);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("laesst sich das Aufraeumen wieder abwaehlen", async () => {
    const user = userEvent.setup();
    const { onDelete, onDeleteMany } = oeffne([note({ title: "G" }), note({ title: "G" })]);
    await user.click(screen.getByRole("button", { name: /Delete every copy except the suggested one/i }));
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(onDeleteMany).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Delete every copy except the suggested one/i })).toBeTruthy();
  });

  it("oeffnet eine Notiz im Editor", async () => {
    const user = userEvent.setup();
    const a = note({ title: "Gleich", content: "lange Fassung mit mehr Inhalt" });
    const b = note({ title: "Gleich", content: "kurz" });
    const { onOpenMemory } = oeffne([a, b]);
    await user.click(screen.getAllByRole("button", { name: /Open Gleich/i })[0]);
    await waitFor(() => expect(onOpenMemory).toHaveBeenCalled());
  });
});

describe("DuplicatesPanel: „kein Duplikat“ bleibt merkbar", () => {
  it("nimmt eine abgelehnte Gruppe sofort aus der Liste", async () => {
    const user = userEvent.setup();
    oeffne([note({ title: "Gleich" }), note({ title: "Gleich" })]);
    // Die Kopf-Zahl steht in der Statuszeile des Fensters; das Dialog-Bild trägt
    // die Zeilen selbst (s-duplicates).
    expect(screen.getAllByText("Gleich").length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole("button", { name: /Not a duplicate/i }));
    await waitFor(() => expect(screen.getByText(/No duplicates found/i)).toBeTruthy());
  });

  it("merkt sich die Ablehnung ueber einen Neustart hinweg", async () => {
    const user = userEvent.setup();
    const a = note({ title: "Gleich" });
    const b = note({ title: "Gleich" });
    oeffne([a, b]);
    await user.click(screen.getByRole("button", { name: /Not a duplicate/i }));
    await waitFor(() => expect(loadDismissed().has(pairKey(a.id, b.id))).toBe(true));
    // Frisches Panel, gleiche Daten -> die Gruppe bleibt draussen.
    expect(findDuplicateGroups([a, b], { dismissed: loadDismissed() })).toEqual([]);
  });

  it("liefert bei kaputtem Speicher eine leere Menge statt eines Fehlers", () => {
    localStorage.setItem("kepta_duplicates_dismissed", "{ kaputt ]");
    expect(loadDismissed().size).toBe(0);
    localStorage.setItem("kepta_duplicates_dismissed", JSON.stringify({ nicht: "array" }));
    expect(loadDismissed().size).toBe(0);
    localStorage.setItem("kepta_duplicates_dismissed", JSON.stringify(["a|b", 42]));
    expect([...loadDismissed()]).toEqual(["a|b"]);
  });

  it("groupPairKeys deckt alle Paare einer Dreiergruppe ab", () => {
    const ms = [note({ title: "G" }), note({ title: "G" }), note({ title: "G" })];
    const g = findDuplicateGroups(ms)[0];
    expect(groupPairKeys(g)).toHaveLength(3);
  });
});

describe("DuplicatesPanel: schliessen", () => {
  it("schliesst mit Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = oeffne([note({ title: "G" }), note({ title: "G" })]);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("schliesst ueber den Knopf", async () => {
    const user = userEvent.setup();
    const { onClose } = oeffne([note({ title: "G" }), note({ title: "G" })]);
    await user.click(screen.getByRole("button", { name: /^Close$/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
