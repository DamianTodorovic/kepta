// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "../../src/components/OnboardingWizard";

// Der Assistent bot acht feste Kategorien an, die ersten beiden aus dem Umfeld
// des Autors: "Fishing — Bait, rods, spots" und "Dropshipping". Wer KEPTA fuer
// eine Kanzlei ansah, bekam als Erstes Angelkoeder angeboten — und jede
// Kategorie schrieb fremde Fachnotizen in die eigene Datenbank.
//
// Im Browser laesst sich das schlecht pruefen: AnimatePresence wartet auf die
// Ausblend-Animation, die in einem nicht gemalten Fenster nie fertig wird.
// Hier laeuft es deterministisch — und bleibt dauerhaft abgesichert.

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function oeffne() {
  return render(<OnboardingWizard open onClose={() => {}} onComplete={() => {}} />);
}

async function zuSchrittVier(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
  for (let i = 0; i < 3; i++) {
    await user.click(screen.getByRole("button", { name: /Next/i }));
  }
  await screen.findByText(/Almost there/i, undefined, { timeout: 4000 });
}

async function zuSchrittZwei(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
  await user.click(screen.getByRole("button", { name: /Next/i }));
  return await screen.findByPlaceholderText(/Type a topic/i);
}

describe("OnboardingWizard: keine fremden Fachgebiete mehr", () => {
  it("bietet nirgends Angeln, Dropshipping oder aehnliche Vorgaben an", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await zuSchrittZwei(user);

    const text = container.textContent ?? "";
    for (const fremd of ["Fishing", "Angeln", "Bait", "rods", "Dropshipping", "Shopify", "carp", "Trout"]) {
      expect(text, `Assistent nennt weiterhin: ${fremd}`).not.toMatch(new RegExp(fremd, "i"));
    }
  });

  it("kuendigt an, dass nur Notizen ueber KEPTA selbst angelegt werden", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittZwei(user);
    expect(screen.getByText(/notes about itself/i)).toBeTruthy();
  });
});

describe("OnboardingWizard: eigene Themen", () => {
  it("legt Themen per Enter ab und zeigt sie als entfernbare Chips", async () => {
    const user = userEvent.setup();
    oeffne();
    const feld = await zuSchrittZwei(user);

    await user.type(feld, "Mandatsakten{Enter}");
    await waitFor(() => expect(screen.getByRole("button", { name: /Remove Mandatsakten/i })).toBeTruthy());
    expect((feld as HTMLInputElement).value).toBe("");
  });

  it("trennt eine Komma-Liste in mehrere Themen", async () => {
    const user = userEvent.setup();
    oeffne();
    const feld = await zuSchrittZwei(user);

    await user.type(feld, "Fristen, Gebuehrenrecht{Enter}");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Remove Fristen/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /Remove Gebuehrenrecht/i })).toBeTruthy();
    });
  });

  it("entfernt ein Thema wieder, wenn man den Chip anklickt", async () => {
    const user = userEvent.setup();
    oeffne();
    const feld = await zuSchrittZwei(user);

    await user.type(feld, "Fristen{Enter}");
    const chip = await screen.findByRole("button", { name: /Remove Fristen/i });
    await user.click(chip);
    await waitFor(() => expect(screen.queryByRole("button", { name: /Remove Fristen/i })).toBeNull());
  });

  it("nimmt dasselbe Thema nicht zweimal auf", async () => {
    const user = userEvent.setup();
    oeffne();
    const feld = await zuSchrittZwei(user);

    await user.type(feld, "Fristen{Enter}");
    await user.type(feld, "fristen{Enter}");
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /Remove Fristen/i })).toHaveLength(1);
    });
  });

  it("laesst sich ohne ein einziges Thema weiterfuehren — die Angabe ist freiwillig", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittZwei(user);
    const weiter = screen.getByRole("button", { name: /Next/i }) as HTMLButtonElement;
    expect(weiter.disabled).toBe(false);
  });
});

describe("OnboardingWizard: Angebot, den Rechner anzusehen", () => {
  // Der Wunsch des Nutzers: schon beim ersten Start bestaetigen koennen, dass
  // KEPTA den Rechner durchsieht. Der Haken hier ist bewusst NUR eine Anfrage —
  // die eigentliche Zustimmung holt der Scan-Dialog mit Vorschau und dem Hinweis
  // auf MCP-Agenten. Ein Haken im Assistenten darf keine Festplatte lesen.
  it("bietet es an und sagt dabei, was nie gelesen wird", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittVier(user);
    expect(screen.getByText(/Also look through this computer for documents/i)).toBeTruthy();
    expect(screen.getByText(/Keys, passwords, credentials and browser data are never read/i)).toBeTruthy();
    expect(screen.getByText(/You will see exactly what would be imported/i)).toBeTruthy();
  });

  it("ist von sich aus abgewaehlt", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittVier(user);
    const haken = screen.getAllByRole("checkbox").at(-1) as HTMLInputElement;
    expect(haken.checked).toBe(false);
  });

  it("merkt den Wunsch nur, wenn er auch gesetzt wurde", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittVier(user);
    await user.click(screen.getByRole("button", { name: /Create my brain/i }));
    await waitFor(() => expect(localStorage.getItem("kepta_scan_wunsch")).toBeNull());
  });

  it("reicht den Wunsch weiter, wenn der Haken gesetzt ist", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittVier(user);
    await user.click(screen.getAllByRole("checkbox").at(-1) as HTMLInputElement);
    await user.click(screen.getByRole("button", { name: /Create my brain/i }));
    await waitFor(() => expect(localStorage.getItem("kepta_scan_wunsch")).toBe("1"));
  });
});

describe("OnboardingWizard: KI-Erkennung (Schritt 3)", () => {
  function stubLocalAI(ollamaOk: boolean, lmstudioOk: boolean) {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const ziel = String(url);
      if (ziel.includes("11434")) {
        if (!ollamaOk) throw new Error("kein Ollama");
        return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }), { status: 200 });
      }
      if (ziel.includes("1234")) {
        if (!lmstudioOk) throw new Error("kein LM Studio");
        return new Response(JSON.stringify([{ id: "mistral" }]), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    }));
  }

  it("zeigt Ollama als verfügbar mit Latenz und Empfehlung", async () => {
    const user = userEvent.setup();
    stubLocalAI(true, false);
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(container.textContent).toMatch(/available/), { timeout: 4000 });
    const text = container.textContent ?? "";
    expect(text).toMatch(/Ollama/);
    expect(text).toMatch(/free and offline/);
    expect(text).toMatch(/\d+ms/);
    await user.click(screen.getByRole("button", { name: /Scan again/i }));
    await waitFor(() => expect(container.textContent).toMatch(/\d+ms/), { timeout: 4000 });
  });

  it("erklaert bei gar keiner lokaler KI, dass KEPTA trotzdem funktioniert", async () => {
    const user = userEvent.setup();
    stubLocalAI(false, false);
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(container.textContent).toMatch(/not found/), { timeout: 4000 });
    expect(container.textContent).toMatch(/KEPTA works anyway/);
  });
});

describe("OnboardingWizard: Rueckwaerts und freiwillige Angaben", () => {
  it("Back fuehrt einen Schritt zurueck; Hinweis-Feld bleibt freiwillig", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByPlaceholderText(/Type a topic/i);
    // freiwilliges Hinweis-Feld ausfuellen (Schritt 2)
    const hinweis = [...container.querySelectorAll("input")].find((i) =>
      (i.getAttribute("placeholder") || "").includes("constraint")
    );
    if (hinweis) await user.type(hinweis, "Nie nach thetaering fragen");
    // Zurueck auf Schritt 1, dann wieder vor
    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    await screen.findByPlaceholderText("e.g. Alex");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByPlaceholderText(/Type a topic/i);
    expect(container.textContent).toMatch(/KEPTA adapts to you/);
  });
});

// A7-10, im echten Browser gemessen (a7-screens/12-wizard2-erschienen.png): der
// Assistent lag als Schicht ueber dem ganzen Fenster — `fixed inset-0` mit einem
// flaechendeckenden Dimmer dahinter. Wer nach dem Import zum ersten Mal in den
// Graphen sah, sah zuerst den Dialog. Der Assistent soll das Bild nicht
// beruehren, also steht er als Taefelchen an der Seite und laesst die Flaeche
// frei. Die Geometrie selbst ist im Browser nachgemessen; was hier haelt, ist
// die Struktur, aus der sie kommt: keine Schicht ueber dem ganzen Fenster.
describe("A7-10: der Assistent verdeckt die Fläche nicht", () => {
  it("tritt als Seitentäfelchen auf, nicht als Schicht über dem ganzen Fenster", () => {
    const { container } = oeffne();
    const schicht = container.firstElementChild as HTMLElement;
    expect(schicht.getAttribute("data-testid"), "die Schicht hat keinen Namen fuer die Stilregel").toBe("wizard-taefelchen");
    const klassen = schicht.className.split(/\s+/);
    expect(klassen, "die Schicht spannt sich ueber das ganze Fenster").not.toContain("inset-0");
    expect(container.querySelector(".hud-backdrop"), "ein Dimmer legt sich ueber das Bild").toBeNull();
  });

  it("bleibt erreichbar: Later und der Titel stehen im Taefelchen", async () => {
    const { container } = oeffne();
    const schicht = container.firstElementChild as HTMLElement;
    expect(schicht.textContent).toMatch(/Set up KEPTA/);
    expect([...schicht.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Later")).toBe(true);
  });
});
