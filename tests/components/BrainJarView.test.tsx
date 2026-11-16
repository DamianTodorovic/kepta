// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import {
  BrainJarView,
  K3PTA_SIDEBAR_PALETTES,
  type BrainJarWidget,
  type BrainJarWidgetOptions,
} from "../../src/components/BrainJarView";

interface MockInstance {
  hostEl: HTMLElement;
  options: BrainJarWidgetOptions;
  enableDrag: boolean;
  enableClickCycle: boolean;
  enableHoverTilt: boolean;
  idleSleep: boolean;
  pauseWhenHidden: boolean;
  maxPixelRatio: number;
  setTheme: ReturnType<typeof vi.fn>;
  setPalette: ReturnType<typeof vi.fn>;
  setSpeedMode: ReturnType<typeof vi.fn>;
  setActivityState: ReturnType<typeof vi.fn>;
  setViewPreset: ReturnType<typeof vi.fn>;
  setPaused: ReturnType<typeof vi.fn>;
  setSuspended: ReturnType<typeof vi.fn>;
  setFreeOrbit: ReturnType<typeof vi.fn>;
  setShowBaseShadow: ReturnType<typeof vi.fn>;
  setZoomEnabled: ReturnType<typeof vi.fn>;
  cycleSpeedMode: ReturnType<typeof vi.fn>;
  nudgeYaw: ReturnType<typeof vi.fn>;
  nudgePitch: ReturnType<typeof vi.fn>;
  handleResize: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

const mockState = vi.hoisted(() => ({
  instances: [] as MockInstance[],
  shouldThrow: false,
}));

vi.mock("../../src/specimen/brainJarEngine.js", () => {
  const SPEED_MODES = {
    still: { id: "still", label: "Still", speed: 0 },
    drehen: { id: "drehen", label: "Drehen", speed: 0.65 },
    schnell: { id: "schnell", label: "Schnell drehen", speed: 2.15 },
  };
  const ACTIVITY_SPEED_MAP = {
    idle: "still",
    ready: "still",
    still: "still",
    active: "drehen",
    listening: "drehen",
    syncing: "drehen",
    drehen: "drehen",
    thinking: "schnell",
    processing: "schnell",
    indexing: "schnell",
    schnell: "schnell",
  };
  const K3PTA_SIDEBAR_PALETTES = {
    light: {
      ink: "#1f1e1c",
      brainFill: "#1f1e1c",
      brainLine: "#eae9e4",
      lidFill: "#fafaf9",
      shadow: "#1f1e1c",
    },
    dark: {
      ink: "#eaeae8",
      brainFill: "#eaeae8",
      brainLine: "#060607",
      lidFill: "#252526",
      shadow: "#060607",
    },
  };

  class BrainJarWidgetMock {
    hostEl: HTMLElement;
    options: BrainJarWidgetOptions;
    enableDrag: boolean;
    enableClickCycle: boolean;
    enableHoverTilt: boolean;
    idleSleep: boolean;
    pauseWhenHidden: boolean;
    maxPixelRatio: number;
    setTheme = vi.fn();
    setPalette = vi.fn();
    setSpeedMode = vi.fn();
    setActivityState = vi.fn();
    setViewPreset = vi.fn();
    setPaused = vi.fn();
    setSuspended = vi.fn();
    setFreeOrbit = vi.fn();
    setShowBaseShadow = vi.fn();
    setZoomEnabled = vi.fn();
    cycleSpeedMode = vi.fn(() => "schnell");
    nudgeYaw = vi.fn();
    nudgePitch = vi.fn();
    handleResize = vi.fn();
    dispose = vi.fn();

    constructor(hostEl: HTMLElement, options: BrainJarWidgetOptions = {}) {
      if (mockState.shouldThrow) {
        throw new Error("WebGL unavailable");
      }
      this.hostEl = hostEl;
      this.options = options;
      this.enableDrag = options.enableDrag ?? true;
      this.enableClickCycle = options.enableClickCycle ?? true;
      this.enableHoverTilt = options.enableHoverTilt ?? true;
      this.idleSleep = options.idleSleep ?? true;
      this.pauseWhenHidden = options.pauseWhenHidden ?? true;
      this.maxPixelRatio = options.maxPixelRatio ?? 2;
      mockState.instances.push(this as unknown as MockInstance);
    }
  }

  return {
    SPEED_MODES,
    ACTIVITY_SPEED_MAP,
    K3PTA_SIDEBAR_PALETTES,
    BrainJarWidget: BrainJarWidgetMock,
  };
});

beforeEach(() => {
  mockState.instances = [];
  mockState.shouldThrow = false;
});

describe("BrainJarView", () => {
  it("constructs and disposes the 3D widget with slanted dock defaults and sidebar palette", () => {
    const widgetRef = createRef<BrainJarWidget | null>();
    const { unmount } = render(
      <BrainJarView
        theme="light"
        palette={K3PTA_SIDEBAR_PALETTES}
        speedMode="drehen"
        viewPreset="dock"
        freeOrbit={true}
        showBaseShadow={false}
        enableHoverTilt={false}
        enableClickCycle={true}
        className="k3pta-jar-dock"
        ariaLabel="Interactive K3PTA 3D emblem"
        widgetRef={widgetRef}
      />
    );

    expect(mockState.instances).toHaveLength(1);
    const inst = mockState.instances[0];
    expect(inst.options.theme).toBe("light");
    expect(inst.options.speedMode).toBe("drehen");
    expect(inst.options.initialView).toBe("dock");
    expect(inst.options.freeOrbit).toBe(true);
    expect(inst.options.showBaseShadow).toBe(false);
    expect(inst.options.enableHoverTilt).toBe(false);
    expect(inst.options.enableClickCycle).toBe(true);
    expect(inst.options.palette).toBe(K3PTA_SIDEBAR_PALETTES);
    expect(widgetRef.current).toBeTruthy();

    const host = screen.getByRole("button", { name: "Interactive K3PTA 3D emblem" });
    expect(host.className).toContain("k3pta-jar-dock");

    unmount();
    expect(inst.dispose).toHaveBeenCalledTimes(1);
    expect(widgetRef.current).toBeNull();
  });

  it("synchronizes theme, speed, view preset, suspension, and interaction props without remounting", () => {
    const { rerender } = render(
      <BrainJarView theme="light" speedMode="drehen" suspended={false} maxPixelRatio={1} />
    );
    expect(mockState.instances).toHaveLength(1);
    const inst = mockState.instances[0];

    rerender(
      <BrainJarView
        theme="dark"
        palette={K3PTA_SIDEBAR_PALETTES}
        speedMode="schnell"
        activityState="thinking"
        viewPreset="float"
        paused={true}
        suspended={true}
        freeOrbit={false}
        showBaseShadow={true}
        enableDrag={false}
        enableClickCycle={false}
        enableHoverTilt={true}
        enableZoom="modifier"
        idleSleep={false}
        pauseWhenHidden={false}
        maxPixelRatio={2}
      />
    );

    expect(mockState.instances).toHaveLength(1);
    expect(inst.setTheme).toHaveBeenCalledWith("dark");
    expect(inst.setPalette).toHaveBeenCalledWith(K3PTA_SIDEBAR_PALETTES);
    expect(inst.setSpeedMode).toHaveBeenCalledWith("schnell", false);
    expect(inst.setActivityState).toHaveBeenCalledWith("thinking", false);
    expect(inst.setViewPreset).toHaveBeenCalledWith("float", false);
    expect(inst.setPaused).toHaveBeenCalledWith(true);
    expect(inst.setSuspended).toHaveBeenCalledWith(true);
    expect(inst.setFreeOrbit).toHaveBeenCalledWith(false);
    expect(inst.setShowBaseShadow).toHaveBeenCalledWith(true);
    expect(inst.setZoomEnabled).toHaveBeenCalledWith("modifier");
    expect(inst.handleResize).toHaveBeenCalled();
    expect(inst.enableDrag).toBe(false);
    expect(inst.enableClickCycle).toBe(false);
    expect(inst.enableHoverTilt).toBe(true);
  });

  it("handles keyboard speed cycling, orbit nudges, and dock pose reset", () => {
    const onActivate = vi.fn();
    render(
      <BrainJarView
        viewPreset="dock"
        enableDrag={true}
        enableClickCycle={true}
        onActivate={onActivate}
      />
    );

    const inst = mockState.instances[0];
    const host = screen.getByRole("button");

    fireEvent.keyDown(host, { key: "Enter" });
    fireEvent.keyDown(host, { key: " " });
    expect(inst.cycleSpeedMode).toHaveBeenCalledTimes(2);
    expect(onActivate).not.toHaveBeenCalled();

    fireEvent.keyDown(host, { key: "ArrowLeft" });
    fireEvent.keyDown(host, { key: "ArrowRight" });
    fireEvent.keyDown(host, { key: "ArrowUp" });
    fireEvent.keyDown(host, { key: "ArrowDown" });
    fireEvent.keyDown(host, { key: "Home" });

    expect(inst.nudgeYaw).toHaveBeenNthCalledWith(1, 0.24);
    expect(inst.nudgeYaw).toHaveBeenNthCalledWith(2, -0.24);
    expect(inst.nudgePitch).toHaveBeenNthCalledWith(1, 0.22);
    expect(inst.nudgePitch).toHaveBeenNthCalledWith(2, -0.22);
    expect(inst.setViewPreset).toHaveBeenCalledWith("dock", true);
  });

  it("forwards callbacks cleanly and supports Space/Enter activation when click-cycle is off", () => {
    const onActivate = vi.fn();
    const onSpeedModeChange = vi.fn();
    const onViewChange = vi.fn();
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();

    render(
      <BrainJarView
        enableClickCycle={false}
        onActivate={onActivate}
        onSpeedModeChange={onSpeedModeChange}
        onViewChange={onViewChange}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
    );

    const inst = mockState.instances[0];
    const host = screen.getByRole("button");
    fireEvent.keyDown(host, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(1);

    inst.options.onSpeedModeChange?.("still");
    inst.options.onViewChange?.(null);
    inst.options.onContextLost?.(inst as unknown as BrainJarWidget);
    inst.options.onContextRestored?.(inst as unknown as BrainJarWidget);
    inst.options.onModelClick?.({} as PointerEvent, inst as unknown as BrainJarWidget);

    expect(onSpeedModeChange).toHaveBeenCalledWith("still");
    expect(onViewChange).toHaveBeenCalledWith(null);
    expect(onContextLost).toHaveBeenCalledTimes(1);
    expect(onContextRestored).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledTimes(2);
  });

  it("renders fallback when inactive, when WebGL fails, and omits interactive roles when read-only", () => {
    const { rerender, unmount } = render(
      <BrainJarView active={false} fallback={<span data-testid="fb">K</span>} />
    );
    expect(screen.getByTestId("fb")).toBeTruthy();
    expect(mockState.instances).toHaveLength(0);

    mockState.shouldThrow = true;
    rerender(<BrainJarView active={true} fallback={<span data-testid="fb">K</span>} />);
    expect(screen.getByTestId("fb")).toBeTruthy();
    unmount();

    mockState.shouldThrow = false;
    render(<BrainJarView enableDrag={false} enableClickCycle={false} ariaLabel="Static view" />);
    expect(screen.getByRole("img", { name: "Static view" })).toBeTruthy();

    render(<BrainJarView enableDrag={true} enableClickCycle={false} ariaLabel="Orbit view" />);
    expect(screen.getByRole("application", { name: "Orbit view" })).toBeTruthy();
  });
});
