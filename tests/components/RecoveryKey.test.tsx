// @vitest-environment jsdom
//
// Der Wiederherstellungsschluessel unter System status: anzeigen, kopieren,
// verbergen — und klare Meldungen, wenn etwas nicht geht.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecoveryKey, gruppiere } from "../../src/components/RecoveryKey";

const KEY = "0123456789abcdef".repeat(4);

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function antwort(status: number, body: unknown) {
  const f = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("RecoveryKey", () => {
  it("gruppiert in Achterbloecke", () => {
    expect(gruppiere(KEY)).toBe("01234567 89abcdef 01234567 89abcdef 01234567 89abcdef 01234567 89abcdef");
    expect(gruppiere("")).toBe("");
  });

  it("zeigt den Schluessel erst auf Wunsch — mit dem eigenen Header", async () => {
    const f = antwort(200, { key: KEY, storedIn: "macOS Keychain" });
    render(<RecoveryKey />);
    expect(screen.queryByLabelText("Recovery key")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await waitFor(() => expect(screen.getByLabelText("Recovery key").textContent).toBe(gruppiere(KEY)));
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-KEPTA-Recovery"]).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByLabelText("Recovery key")).toBeNull();
  });

  it("kopiert den rohen Schluessel und meldet es erst nach Erfolg", async () => {
    antwort(200, { key: KEY });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<RecoveryKey />);
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await userEvent.click(await screen.findByRole("button", { name: /Copy/ }));
    expect(writeText).toHaveBeenCalledWith(KEY);
    await waitFor(() => expect(screen.getByRole("button", { name: /Copied/ })).toBeTruthy());
  });

  it("sagt, wenn Kopieren scheitert oder nicht geht", async () => {
    antwort(200, { key: KEY });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("nein"); }) }, configurable: true });
    const { unmount } = render(<RecoveryKey />);
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await userEvent.click(await screen.findByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(screen.getByText(/Copying failed/)).toBeTruthy());
    unmount();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<RecoveryKey />);
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await userEvent.click(await screen.findByRole("button", { name: /Copy/ }));
    expect(screen.getByText(/Copying is not available/)).toBeTruthy();
  });

  it("zeigt die Meldung des Servers, wenn es keinen Schluessel gibt", async () => {
    antwort(404, { error: "The knowledge base is not encrypted — there is no recovery key." });
    render(<RecoveryKey />);
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await waitFor(() => expect(screen.getByText(/not encrypted/)).toBeTruthy());
  });

  it("meldet einen Netzfehler verstaendlich", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<RecoveryKey />);
    await userEvent.click(screen.getByRole("button", { name: "Show recovery key" }));
    await waitFor(() => expect(screen.getByText("The recovery key could not be shown.")).toBeTruthy());
    expect(document.body.textContent).not.toContain("offline");
  });
});
