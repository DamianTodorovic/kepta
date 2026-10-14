// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnboardingWizard } from "../../src/components/OnboardingWizard";

// Der Assistent bot acht feste Kategorien an, die ersten beiden aus dem Umfeld
// des Autors: "Fishing — Bait, rods, spots" und "Dropshipping". Wer K3PTA fuer
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

// Die Endschaft (Schritt 4) ist das einzige Bild, auf dem der Frischgelaedene
// nachgelesen bekommt, was K3PTA mit seinen Angaben getan hat. Sie darf dort
// nichts behaupten, was der Knopfdruck unter ihr nicht wirklich schreibt.
// Pruefziel ist die Liste selbst, nicht der ganze Schirm: Ueberschrift und
// Fortschritt gehoeren anderen Fallgruppen.
function endschaft(container: HTMLElement) {
  const liste = container.querySelector("ul");
  if (!liste) throw new Error("keine Rueckmeldungsliste auf der Endschaft");
  return liste.textContent ?? "";
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

  it("kuendigt an, dass nur Notizen ueber K3PTA selbst angelegt werden", async () => {
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
  // K3PTA den Rechner durchsieht. Der Haken hier ist bewusst NUR eine Anfrage —
  // die eigentliche Zustimmung holt der Scan-Dialog mit Vorschau und dem Hinweis
  // auf MCP-Agenten. Ein Haken im Assistenten darf keine Festplatte lesen.
  it("bietet es an und sagt dabei, was nie gelesen wird", async () => {
    const user = userEvent.setup();
    oeffne();
    await zuSchrittVier(user);
    expect(screen.getByText(/Also look through this computer for documents/i)).toBeTruthy();
    expect(screen.getByText(/Keys, passwords, credentials and browser data are never read/i)).toBeTruthy();
    // „exactly" war zu viel versprochen: die Vorschau zeigt zwanzig oberste
    // Ordner und vierundzwanzig Dateinamen, nicht 13.616 Titel. Der Satz sagt
    // jetzt, was der Schirm danach wirklich tut.
    expect(screen.getByText(/you see the folders it would take and how many documents each holds/i)).toBeTruthy();
    expect(screen.getByText(/you can leave any of them out/i)).toBeTruthy();
    expect(screen.queryByText(/exactly what would be imported/i)).toBeNull();
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

// Zwei Behauptungen auf der Endschaft standen fest, egal was vorher passiert war:
//   „Provider auto-configured (…)“ — geschrieben wird der Anbieter nur, wenn ein
//   lokaler KI-Provider ein Modell gemeldet hat. Im Standardfall dieses Tests meldet
//   Ollama sich zwar, aber mit leerer Modelliste: es wurde nichts geschrieben.
//   „every answer adapts to your goal“ — das Ziel ist freiwillig und war hier leer.
// Beide Fälle sind die wahren Erste-Start-Faelle: heruntergeladen, Ollama nicht
// installiert oder leer, Ziel nicht ausgefuellt.
describe("Endschaft: sie sagt nur, was der Klick wirklich schreibt", () => {
  it("ohne Modell in der Liste behauptet sie keinen eingerichteten Anbieter", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await zuSchrittVier(user);

    const rueck = endschaft(container);
    expect(rueck, "es wurde kein Anbieter geschrieben, die Liste behauptet es doch").not.toMatch(/auto-configured|configured|provider set/i);
    expect(rueck).toMatch(/no ai|nothing was set|noch keine KI/i);
  });

  it("mit gefundenem Modell nennt sie Anbieter und Modell, die sie schreibt", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const ziel = String(url);
      if (ziel.includes("11434")) return new Response(JSON.stringify({ models: [{ name: "llama3.2" }] }), { status: 200 });
      if (ziel.includes("1234")) throw new Error("kein LM Studio");
      return new Response("{}", { status: 200 });
    }));
    const user = userEvent.setup();
    const { container } = oeffne();
    await zuSchrittVier(user);

    const rueck = endschaft(container);
    expect(rueck).toMatch(/llama3\.2/);
    expect(rueck).toMatch(/Ollama/i);
    expect(rueck).not.toMatch(/no ai|nothing was set/i);
  });

  it("ohne Ziel behauptet sie keine angepassten Antworten", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await zuSchrittVier(user);

    const rueck = endschaft(container);
    expect(rueck, "das Ziel ist freiwillig; ohne Ziel passt sich nichts an").not.toMatch(/adapts to your goal|every answer adapts/i);
    expect(rueck).toMatch(/no goal|bleibt allgemein/i);
  });

  it("mit Ziel sagt sie, wohin das Ziel geschrieben wird", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    await user.type(screen.getByPlaceholderText("e.g. find things faster"), "find things faster");
    await zuSchrittVier(user);

    const rueck = endschaft(container);
    expect(rueck).toMatch(/find things faster/);
    expect(rueck).toMatch(/question|prompt/i);
  });
});

// Die drei Fragen, die ein Frischgelaedener wirklich hat — wo liegt mein
// Bestand, wer kann ihn lesen, was geschieht beim ersten Oeffnen mit meinen
// Dateien. Sie muessen auf dem ERSTEN Schirm beantwortet sein, nicht auf dem
// letzten, den man wegklickt. Auf dem letzten steht dafuer die Datei selbst.
describe("Erster Schirm: die drei Fragen sind beantwortet", () => {
  it("er nennt Ordner, Herkunft und dass die Dokumente warten", () => {
    const { container } = oeffne();
    const text = container.textContent ?? "";
    expect(text, "keine Zeile darueber, wo der Bestand liegt").toMatch(/~\/\.kepta\/kepta\.db/);
    expect(text, "keine Zeile darueber, dass nichts hochgeladen wird").toMatch(/no K3PTA account|nothing leaves|nothing is sent/i);
    expect(text, "keine Zeile darueber, was beim Oeffnen mit den Dateien geschieht").toMatch(/reads nothing/i);
    expect(text, "keine Zeile darueber, dass Dateien nur auf Wunsch gelesen werden").toMatch(/you ask for that|say yes at the end/i);
    // Die Beschönigung, dass ein Schluessel nichts koestete: ein KI-Anbieter in
    // fremdem Rechenzentrum sieht die Anfrage. Das muss da stehen, sonst ist die
    // Sicherheitszeile eine halbe Wahrheit.
    expect(text, "keine Zeile darueber, was ein Schluessel nach aussen gibt").toMatch(/cloud key|cloud ai/i);
  });

  it("der letzte Schirm nennt die Datei, in die geschrieben wird", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    await zuSchrittVier(user);

    const text = container.textContent ?? "";
    expect(text).toMatch(/kepta\.db/);
    expect(text).toMatch(/back it up, move it, or delete/i);
  });
});

describe("Endschaft: kein Feld ohne Wirkung", () => {
  // Die Frage muss ueber alle Schritte laufen: auf Schritt 4 sind die Felder von
  // Schritt 2 laengst ausgewechselt, ein Blick auf den Endschirm findet sie nie.
  // Gelesen wird immer erst, wenn der Schritt auch erschienen ist — die
  // Blends-Animation laesst sonst den alten Schritt im Baum stehen.
  it("es gibt nirgends ein viertes Freitextfeld", async () => {
    const user = userEvent.setup();
    const { container } = oeffne();
    const merke = () => {
      const felder = [...container.querySelectorAll("input")].map((f) => f.getAttribute("placeholder") ?? "");
      const beschriftungen = [...container.querySelectorAll("label")].map((l) => l.textContent ?? "");
      return [...felder, ...beschriftungen].join(" | ");
    };

    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    let alle = merke();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByPlaceholderText(/Type a topic/i);
    alle += " | " + merke();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Your AI/i);
    alle += " | " + merke();
    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByText(/Almost there/i);
    alle += " | " + merke();

    expect(alle).not.toMatch(/worth knowing|constraint|deadline/i);
  });
});

describe("OnboardingWizard: KI-Erkennung (Schritt 3)", () => {  function stubLocalAI(ollamaOk: boolean, lmstudioOk: boolean) {
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

  it("zeigt Ollama als verfügbar mit Latenz und nennt Modell und Ort", async () => {
    const user = userEvent.setup();
    stubLocalAI(true, false);
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(container.textContent).toMatch(/available/), { timeout: 4000 });
    const text = container.textContent ?? "";
    expect(text).toMatch(/Ollama/);
    // „free and offline" war die Werbung; gemeldet wird jetzt das Modell, das
    // wirklich geschrieben wird, und dass es auf der Platte bleibt.
    expect(text).toMatch(/will answer with llama3\.2/);
    expect(text).toMatch(/Nothing leaves this machine/i);
    expect(text).toMatch(/\d+ms/);
    await user.click(screen.getByRole("button", { name: /Scan again/i }));
    await waitFor(() => expect(container.textContent).toMatch(/\d+ms/), { timeout: 4000 });
  });

  it("erklaert bei gar keiner lokaler KI, dass K3PTA trotzdem funktioniert", async () => {
    const user = userEvent.setup();
    stubLocalAI(false, false);
    const { container } = oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole("button", { name: /Next/i }));
    await waitFor(() => expect(container.textContent).toMatch(/not found/), { timeout: 4000 });
    expect(container.textContent).toMatch(/K3PTA works anyway/);
  });
});

describe("OnboardingWizard: Rueckwaerts und freiwillige Angaben", () => {
  // Das Hinweis-Feld ist geflogen („Ein Feld ohne Wirkung ist kein Feld"), also
  // prueft dieser Fall, was bleibt: Rueckwaerts gehen verliert nichts.
  it("Back und wieder vor verliert weder Name noch Thema", async () => {
    const user = userEvent.setup();
    oeffne();
    await user.type(screen.getByPlaceholderText("e.g. Alex"), "Damian");
    await user.click(screen.getByRole("button", { name: /Next/i }));
    const feld = await screen.findByPlaceholderText(/Type a topic/i);
    await user.type(feld, "Fristen{Enter}");
    await screen.findByRole("button", { name: /Remove Fristen/i });

    await user.click(screen.getByRole("button", { name: /^Back$/i }));
    const name = await screen.findByPlaceholderText("e.g. Alex") as HTMLInputElement;
    expect(name.value).toBe("Damian");

    await user.click(screen.getByRole("button", { name: /Next/i }));
    await screen.findByPlaceholderText(/Type a topic/i);
    expect(screen.getByRole("button", { name: /Remove Fristen/i })).toBeTruthy();
  });

  it("der Schirm zaehlt sich selbst, und zwar nur einmal", () => {
    const { container } = oeffne();
    const text = container.textContent ?? "";
    expect(text).toMatch(/Step 1 of 4/);
    // Frueher stand dieselbe Zahl zweimal auf dem Kopf: in Worten und als
    // „1/4"-Plakette daneben. Die Plakette ist weg.
    expect(text).not.toMatch(/\b1\/4\b/);
    // Und „one minute" war eine Anwerbung ohne Messung.
    expect(text).not.toMatch(/one minute/i);
  });

  it("der Namenszug lässt Pfade und Routen unangetastet", () => {
    // Sichtbare Wörter dürfen mitgehen, ein Pfad nicht: `~/.kepta/kepta.db` ist
    // der Ort auf der Platte (src/core/store.ts:44) und `/api/memory` die Tür.
    // Ein Zug, der beides beugt, schreibt an einen Ort, den niemand liest.
    //
    // Der Wächter prueft daher die Pfade, nicht die ganze Datei: die letzte Zeile
    // verbot einmal das sichtbare „Set up K3PTA" im Quelltext — weiter unten im
    // selben Block (und in `tests/components/huelle-fenster.test.tsx:110`) wird
    // genau dieser Sichttext verlangt. Ein Verbot, das der eigene Fall bricht, ist
    // ein zu weiter Schnitt, kein kaputter Zug.
    const quelle = require("node:fs").readFileSync("src/components/OnboardingWizard.tsx", "utf-8");
    expect(quelle).toMatch(/~\/\.kepta\/kepta\.db/);
    expect(quelle).toMatch(/\/api\/memory/);
    expect(quelle).toMatch(/\/api\/profile/);
    // Ein Pfad mit dem alten Wort bleibt erlaubt; die neue Form an seiner Stelle nicht.
    expect(quelle, "ein Pfad oder eine Route ist verbogen worden").not.toMatch(
      /\.k3pta\/|k3pta\.db|\/api\/k3pta/i,
    );
    // Und der Sichttext fuehrt die neue Marke — sonst ist der Zug hier halb stehen geblieben.
    expect(quelle, "der sichtbare Satz fuehrt noch die alte Marke").toMatch(/Set up K3PTA/);
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
    expect(schicht.textContent).toMatch(/Set up K3PTA/);
    expect([...schicht.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Later")).toBe(true);
  });
});
