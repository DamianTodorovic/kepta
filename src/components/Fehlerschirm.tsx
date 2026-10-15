// Der Fehlerrand der Anwendung.
//
// Warum eine Klasse und kein Hook: ein Wurf im Render fängt React aus, und die
// einzige Stelle, die so etwas überlebt, ist `componentDidCatch` eines
// Elternbaums. Ohne diesen Rand blieb ein graues Fenster — kein Satz, kein
// Knopf, keine Meldung — und der Nutzer musste selbst raten, was weg ist
// (Damian, 15.10. 16:24: „wenn ich das umstellen möchte kommt ein grauer Screen").
//
// Der Rand tut drei Dinge: er **nennt** den Fehler (Text und Datei:Zeile, wenn
// die Laufzeit sie liefert), er schreibt ihn in die Konsole, damit ein
// Protokoll existiert, und er gibt einen **Ausgang** — ein Knopf, der die
// Kinder neu baut. Ein Fehlerbild ohne Weg zurück ist eine Sackgasse.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Zustand {
  fehler: Error | null;
  spur: string | null;
}

export function fehlertext(fehler: Error | null, spur: string | null): string {
  const grund = fehler?.message || "unbekannte Ursache";
  const ort = spur?.split("\n").find((z) => z.trim().startsWith("at "))?.trim();
  return ort ? `${grund} — ${ort}` : grund;
}

export class Fehlerschirm extends Component<{ children: ReactNode }, Zustand> {
  override state: Zustand = { fehler: null, spur: null };

  static getDerivedStateFromError(fehler: Error): Partial<Zustand> {
    return { fehler };
  }

  override componentDidCatch(fehler: Error, info: ErrorInfo): void {
    // Die Konsole ist hier das Protokoll: ein Bildschirm, der etwas zeigt, und
    // ein Log, das den Wurf trägt, sind zwei verschiedene Versprechen.
    console.error("K3PTA: Render-Wurf abgefangen:", fehler, info?.componentStack ?? "");
    this.setState({ spur: info?.componentStack ?? null });
  }

  weiter = () => {
    this.setState({ fehler: null, spur: null });
  };

  override render(): ReactNode {
    const { fehler } = this.state;
    if (!fehler) return this.props.children;
    return (
      <div
        data-testid="fehlerschirm"
        role="alert"
        className="min-h-screen w-full flex flex-col items-center justify-center text-center px-6"
        style={{ background: "var(--bg-base)", color: "var(--text-1)" }}
      >
        <p className="hud-label mb-2" style={{ color: "var(--text-3)" }}>Something broke on this screen</p>
        <p className="text-[15px] max-w-xl mb-1">
          K3PTA caught the failure instead of showing you an empty window. Your knowledge is untouched —
          this is the view, not the store.
        </p>
        <p className="text-[12px] max-w-xl mb-4 break-words" style={{ color: "var(--text-2)" }}>
          {fehlertext(fehler, this.state.spur)}
        </p>
        <button
          type="button"
          data-testid="fehlerschirm-weiter"
          onClick={this.weiter}
          className="btn-ghost px-3 py-1.5 rounded-lg text-[13px]"
          style={{ color: "var(--accent)" }}
        >
          Try this screen again
        </button>
      </div>
    );
  }
}
