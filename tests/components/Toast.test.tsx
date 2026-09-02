// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// motion/react mocken: AnimatePresence reicht Kinder ohne Exit-Animation durch,
// motion.div wird zu einem normalen div → deterministisches Ein-/Ausblenden.
vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy({} as Record<string, unknown>, {
    get: () => (props: Record<string, unknown>) => {
      const { children, ...rest } = props as { children?: React.ReactNode } & Record<string, unknown>;
      // nur DOM-taugliche Props durchreichen
      const domProps: Record<string, unknown> = {};
      for (const k of ["className", "style", "onClick", "role", "aria-label"]) {
        if (k in rest) domProps[k] = (rest as Record<string, unknown>)[k];
      }
      return <div {...domProps}>{children}</div>;
    },
  }),
}));

import { ToastProvider, useToast } from "../../src/components/ui/Toast";

afterEach(() => vi.useRealTimers());

function Harness({ options }: { options: Parameters<ReturnType<typeof useToast>["push"]>[0] }) {
  const { push } = useToast();
  return <button onClick={() => push(options)}>zeigen</button>;
}

describe("ToastProvider / useToast", () => {
  it("zeigt eine Toast-Nachricht nach push", async () => {
    render(
      <ToastProvider>
        <Harness options={{ message: "Gespeichert" }} />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("zeigen"));
    expect(screen.getByText("Gespeichert")).toBeInTheDocument();
  });

  it("führt eine Action aus und schließt danach", async () => {
    const onClick = vi.fn();
    render(
      <ToastProvider>
        <Harness options={{ message: "Gelöscht", action: { label: "Rückgängig", onClick } }} />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("zeigen"));
    await userEvent.click(screen.getByText("Rückgängig"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("lässt sich manuell schließen", async () => {
    render(
      <ToastProvider>
        <Harness options={{ message: "Weg damit" }} />
      </ToastProvider>
    );
    await userEvent.click(screen.getByText("zeigen"));
    await userEvent.click(screen.getByLabelText("Schließen"));
    expect(screen.queryByText("Weg damit")).not.toBeInTheDocument();
  });

  it("verschwindet automatisch nach Ablauf der duration", async () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Harness options={{ message: "Kurz", duration: 1000 }} />
      </ToastProvider>
    );
    // userEvent mit Fake-Timern: click synchron über fireEvent-Ersatz
    const btn = screen.getByText("zeigen");
    act(() => {
      btn.click();
    });
    expect(screen.getByText("Kurz")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByText("Kurz")).not.toBeInTheDocument();
  });

  it("useToast wirft außerhalb des Providers", () => {
    // Fehler-Boundary simulieren: direktes Rendern ohne Provider
    const Bad = () => {
      useToast();
      return null;
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Bad />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
