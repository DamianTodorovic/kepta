// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { KeptaMark, KeptaWordmark } from "../../src/components/KeptaMark";

const rxVon = (container: HTMLElement) =>
  container.querySelector("svg rect")?.getAttribute("rx");

/** Die Rundung als Verhältnis, damit zwei Koordinatensysteme vergleichbar werden. */
function verhaeltnis(breite: string, rx: string) {
  return Number(rx) / Number(breite);
}

describe("KeptaMark", () => {
  it("rendert das Logo-SVG mit aria-label", () => {
    render(<KeptaMark />);
    expect(screen.getByRole("img", { name: "KEPTA Logo" })).toBeInTheDocument();
  });

  it("übernimmt eine benutzerdefinierte Größe", () => {
    const { container } = render(<KeptaMark size={64} />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "64");
  });

  // Eine Marke, ein Radius. Vor dem 11.10. streuten neun Aufrufstellen über sechs
  // verschiedene Radien (6…10 von 32 = 0,188…0,313) — sechs Markengesichter für eine
  // Marke, und der Master (`public/kepta-logo.svg`) trug seine eigene Rundung. Der
  // Radius ist deshalb keine Prop mehr, sondern eine Konstante im 32er Raster des
  // Bausteins — und das Raster des Masters passt darin exakt: 112 von 512 = 7 von 32.
  it("rundet an jeder Größe gleich — und wie der Master", () => {
    const master = fs.readFileSync(path.join(process.cwd(), "public/kepta-logo.svg"), "utf-8");
    const [, breite, rx] = /<rect width="(\d+)" height="\1" rx="(\d+)"/.exec(master) ?? [];
    expect(verhaeltnis(breite, rx), `Master: ${rx} von ${breite}`).toBeCloseTo(7 / 32, 6);
    // Das Programm-Symbol ist eine Datei dieses Baums — seine Quelle trägt denselben
    // Wert. Vorher stand dort 185,4 von 824 (0,225), also ein zweiter Radius.
    const symbol = fs.readFileSync(path.join(process.cwd(), "build/icon.svg"), "utf-8");
    const [, kachel, rondung] = /<rect[^>]*width="([\d.]+)"[^>]*rx="([\d.]+)"/.exec(symbol) ?? [];
    expect(verhaeltnis(kachel, rondung), `icon.svg: ${rondung} von ${kachel}`).toBeCloseTo(7 / 32, 6);
    for (const size of [22, 24, 26, 30, 32, 34, 38, 40, 64]) {
      const { container, unmount } = render(<KeptaMark size={size} />);
      expect(rxVon(container), `rx bei ${size} px`).toBe("7");
      unmount();
    }
  });

  it("lässt niemanden die Rundung überschreiben", () => {
    const ordner = path.join(process.cwd(), "src/components");
    const uebergeben = fs.readdirSync(ordner).filter((f) => f.endsWith(".tsx"))
      .filter((f) => /<KeptaMark[^>]*radius=/.test(fs.readFileSync(path.join(ordner, f), "utf-8")));
    expect(uebergeben, "Aufrufstellen mit eigenem Radius").toEqual([]);
    const quelle = fs.readFileSync(path.join(ordner, "KeptaMark.tsx"), "utf-8");
    expect(quelle, "der Baustein nimmt weiter ein radius-Prop an").not.toMatch(/\bradius\??\s*:/);
  });
});

describe("KeptaWordmark", () => {
  it("zeigt den Text KEPTA und reicht className durch", () => {
    render(<KeptaWordmark className="test-klasse" />);
    const el = screen.getByText("KEPTA");
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("test-klasse");
  });
});
