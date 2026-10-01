// @vitest-environment jsdom
//
// Das Upgrade-Panel: KEPTA sperrt die App nie (Freemium) — dieses Panel öffnet
// sich auf Wunsch. Es zeigt den Kauf-Weg, aktiviert einen vorhandenen
// Schlüssel offline und meldet jeden Fehlweg verständlich.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProUpgrade } from "../../src/components/ProUpgrade";

afterEach(() => { vi.unstubAllGlobals(); });

function antwort(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

async function ausfuellen() {
  await userEvent.type(screen.getByPlaceholderText("e.g. Sarah Mandel"), "Sarah Mandel");
  await userEvent.type(screen.getByPlaceholderText(/Paste the key/), "AAAAA-BBBBB");
  await userEvent.click(screen.getByRole("button", { name: "Activate key" }));
}

describe("ProUpgrade", () => {
  it("sperrt nichts — es überzeugt: Vorteile, Kauf-Weg, und kein Trial-Wort", () => {
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} upgradeUrl="https://buy.paddle.com/kepta-pro" checkoutLive />);
    expect(screen.getByText(/The free plan carries generous daily limits/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Buy a key — everything unlimited/ }).getAttribute("href")).toBe("https://buy.paddle.com/kepta-pro");
    expect(document.body.textContent).not.toMatch(/trial/i);
  });

  it("ohne live Checkout (Paddle in Prüfung) führt der Kaufen-Knopf auf LinkedIn — niemals auf eine tote Adresse", () => {
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} upgradeUrl="https://kepta.pro/upgrade" />);
    const kontakt = screen.getByRole("link", { name: /Get a key — write to Damian on LinkedIn/ });
    expect(kontakt.getAttribute("href")).toBe("https://www.linkedin.com/in/damian-todorovic-244235434");
    expect(screen.queryByRole("link", { name: /Buy a key — everything unlimited/ })).toBeNull();
    // Die Aktivierung bleibt daneben voll erhalten.
    expect(screen.getByPlaceholderText("e.g. Sarah Mandel")).toBeTruthy();
  });

  it("mit live Checkout gibt es keinen LinkedIn-Kauf-Knopf daneben", () => {
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} upgradeUrl="https://buy.paddle.com/kepta-pro" checkoutLive />);
    expect(screen.getByRole("link", { name: /Buy a key — everything unlimited/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Get a key — write to Damian on LinkedIn/ })).toBeNull();
  });

  it("zeigt für Business/Enterprise den persönlichen Weg — LinkedIn, nicht eine Adresse, die es nicht gibt", () => {
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} />);
    const link = screen.getByRole("link", { name: /Write to Damian Todorovic/ });
    expect(link.getAttribute("href")).toBe("https://www.linkedin.com/in/damian-todorovic-244235434");
    expect(document.body.innerHTML).not.toMatch(/@kepta\.app/);
  });

  it("verlangt Name und Schlüssel, bevor es fragt", async () => {
    const f = antwort(200, {});
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} />);
    await userEvent.click(screen.getByRole("button", { name: "Activate key" }));
    expect(screen.getByRole("alert").textContent).toContain("Please enter your name and your license key.");
    expect(f).not.toHaveBeenCalled();
  });

  it("zeigt die Meldung des Servers bei einem falschen oder gesperrten Schlüssel", async () => {
    antwort(403, { error: "This license key has been revoked." });
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} />);
    await ausfuellen();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("revoked"));
  });

  it("aktiviert offline — genau eine Anfrage, Lizenznehmer und Nummer wandern nach oben, das Panel schließt", async () => {
    const f = vi.fn(async (_url: unknown, init?: RequestInit) => new Response(JSON.stringify({ ok: true, licensed: true, licensee: "Sarah Mandel", number: "0000-0007-AAAA-BBBB" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const aktiviert = vi.fn();
    const geschlossen = vi.fn();
    render(<ProUpgrade onClose={geschlossen} onActivated={aktiviert} />);
    await ausfuellen();
    await waitFor(() => expect(aktiviert).toHaveBeenCalled());
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe("/api/license");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ name: "Sarah Mandel", key: "AAAAA-BBBBB" });
    expect(geschlossen).not.toHaveBeenCalled(); // schließt sich selbst über onActivated im Dashboard
  });

  it("sagt klar, wenn der Server nicht antwortet", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} />);
    await ausfuellen();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("not reachable"));
  });

  it("warum es überhaupt existiert: ein gesperrter Schlüssel sperrt die App nicht — es warnt nur", () => {
    render(<ProUpgrade onClose={() => undefined} onActivated={() => undefined} revoked />);
    expect(screen.getByRole("alert").textContent).toContain("revoked");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
