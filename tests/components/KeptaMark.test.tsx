// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeptaMark, KeptaWordmark } from "../../src/components/KeptaMark";

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
});

describe("KeptaWordmark", () => {
  it("zeigt den Text KEPTA und reicht className durch", () => {
    render(<KeptaWordmark className="test-klasse" />);
    const el = screen.getByText("KEPTA");
    expect(el).toBeInTheDocument();
    expect(el).toHaveClass("test-klasse");
  });
});
