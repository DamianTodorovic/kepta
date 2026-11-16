import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MutableRefObject, type ReactNode } from "react";
import {
  ACTIVITY_SPEED_MAP,
  BrainJarWidget,
  K3PTA_SIDEBAR_PALETTES,
  SPEED_MODES,
  type BrainJarActivityState,
  type BrainJarPaletteConfig,
  type BrainJarSpeedMode,
  type BrainJarTheme,
  type BrainJarViewPreset,
  type BrainJarWidgetOptions,
  type BrainJarZoomMode,
} from "../specimen/brainJarEngine.js";

export { K3PTA_SIDEBAR_PALETTES };
export type {
  BrainJarActivityState,
  BrainJarPaletteConfig,
  BrainJarSpeedMode,
  BrainJarTheme,
  BrainJarViewPreset,
  BrainJarWidget,
  BrainJarWidgetOptions,
  BrainJarZoomMode,
};

export interface BrainJarViewProps {
  active?: boolean;
  fallback?: ReactNode;
  theme?: BrainJarTheme;
  speedMode?: BrainJarSpeedMode;
  activityState?: BrainJarActivityState;
  viewPreset?: BrainJarViewPreset;
  paused?: boolean;
  suspended?: boolean;
  enableDrag?: boolean;
  enableZoom?: BrainJarZoomMode;
  enableClickCycle?: boolean;
  enableHoverTilt?: boolean;
  freeOrbit?: boolean;
  showBaseShadow?: boolean;
  idleSleep?: boolean;
  pauseWhenHidden?: boolean;
  respectReducedMotion?: boolean;
  maxPixelRatio?: number;
  forceContextLossOnDispose?: boolean;
  palette?: BrainJarPaletteConfig | null;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  onActivate?: () => void;
  onSpeedModeChange?: (mode: BrainJarSpeedMode) => void;
  onViewChange?: (view: BrainJarViewPreset | null) => void;
  onModelClick?: (event: PointerEvent, widget: BrainJarWidget) => boolean | void;
  onContextLost?: (widget: BrainJarWidget) => void;
  onContextRestored?: (widget: BrainJarWidget) => void;
  widgetRef?: MutableRefObject<BrainJarWidget | null>;
}

/**
 * Interactive 3D K3PTA emblem host with full WebGL lifecycle cleanup and static fallback.
 */
export function BrainJarView({
  active = true,
  fallback = null,
  theme = "dark",
  speedMode,
  activityState,
  viewPreset = "dock",
  paused = false,
  suspended = false,
  enableDrag = true,
  enableZoom = false,
  enableClickCycle = true,
  enableHoverTilt = false,
  freeOrbit = true,
  showBaseShadow = false,
  idleSleep = true,
  pauseWhenHidden = true,
  respectReducedMotion = true,
  maxPixelRatio = 2,
  forceContextLossOnDispose = true,
  palette = null,
  className = "",
  style,
  ariaLabel = "Interactive K3PTA 3D emblem",
  onActivate,
  onSpeedModeChange,
  onViewChange,
  onModelClick,
  onContextLost,
  onContextRestored,
  widgetRef,
}: BrainJarViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const instanceRef = useRef<BrainJarWidget | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const callbacksRef = useRef({
    onActivate,
    onSpeedModeChange,
    onViewChange,
    onModelClick,
    onContextLost,
    onContextRestored,
  });

  useEffect(() => {
    callbacksRef.current = {
      onActivate,
      onSpeedModeChange,
      onViewChange,
      onModelClick,
      onContextLost,
      onContextRestored,
    };
  }, [onActivate, onSpeedModeChange, onViewChange, onModelClick, onContextLost, onContextRestored]);

  useEffect(() => {
    const hostEl = hostRef.current;
    if (!active || !hostEl || webglFailed) return;

    let widget: BrainJarWidget | null = null;
    try {
      widget = new BrainJarWidget(hostEl, {
        theme,
        speedMode: speedMode && SPEED_MODES[speedMode] ? speedMode : undefined,
        activityState: activityState && ACTIVITY_SPEED_MAP[activityState] ? activityState : undefined,
        initialView: viewPreset,
        paused,
        suspended,
        freeOrbit,
        showBaseShadow,
        syncDocumentTheme: false,
        respectReducedMotion,
        enableDrag,
        enableZoom,
        enableClickCycle,
        enableHoverTilt,
        idleSleep,
        pauseWhenHidden,
        maxPixelRatio,
        forceContextLossOnDispose,
        palette,
        onSpeedModeChange: (mode) => callbacksRef.current.onSpeedModeChange?.(mode),
        onViewChange: (view) => callbacksRef.current.onViewChange?.(view),
        onModelClick: (evt, inst) => {
          const res = callbacksRef.current.onModelClick?.(evt, inst);
          if (res !== false && callbacksRef.current.onActivate && !inst.enableClickCycle) {
            callbacksRef.current.onActivate();
          }
          return res;
        },
        onContextLost: (inst) => callbacksRef.current.onContextLost?.(inst),
        onContextRestored: (inst) => callbacksRef.current.onContextRestored?.(inst),
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    instanceRef.current = widget;
    if (widgetRef) {
      widgetRef.current = widget;
    }

    return () => {
      widget?.dispose();
      instanceRef.current = null;
      if (widgetRef) {
        widgetRef.current = null;
      }
    };
    // WebGL scene constructs only while active; runtime props synchronize via dedicated effects below.
  }, [active, forceContextLossOnDispose, respectReducedMotion, webglFailed]);

  useEffect(() => {
    instanceRef.current?.setTheme(theme);
  }, [theme]);

  useEffect(() => {
    instanceRef.current?.setPalette(palette);
  }, [palette]);

  useEffect(() => {
    if (speedMode && SPEED_MODES[speedMode]) {
      instanceRef.current?.setSpeedMode(speedMode, false);
    }
  }, [speedMode]);

  useEffect(() => {
    if (activityState && ACTIVITY_SPEED_MAP[activityState]) {
      instanceRef.current?.setActivityState(activityState, false);
    }
  }, [activityState]);

  useEffect(() => {
    if (viewPreset) {
      instanceRef.current?.setViewPreset(viewPreset, false);
    }
  }, [viewPreset]);

  useEffect(() => {
    instanceRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    instanceRef.current?.setSuspended(suspended);
  }, [suspended]);

  useEffect(() => {
    instanceRef.current?.setFreeOrbit(freeOrbit);
  }, [freeOrbit]);

  useEffect(() => {
    instanceRef.current?.setShowBaseShadow(showBaseShadow);
  }, [showBaseShadow]);

  useEffect(() => {
    const widget = instanceRef.current;
    if (!widget) return;
    widget.enableDrag = enableDrag;
    widget.enableClickCycle = enableClickCycle;
    widget.enableHoverTilt = enableHoverTilt;
    widget.setZoomEnabled(enableZoom);
    widget.idleSleep = idleSleep;
    widget.pauseWhenHidden = pauseWhenHidden;
  }, [enableDrag, enableClickCycle, enableHoverTilt, enableZoom, idleSleep, pauseWhenHidden]);

  useEffect(() => {
    const widget = instanceRef.current;
    if (!widget) return;
    widget.maxPixelRatio = maxPixelRatio;
    widget.handleResize();
  }, [maxPixelRatio]);

  const hasClickAction = enableClickCycle || Boolean(onActivate) || Boolean(onModelClick);
  const isInteractive = hasClickAction || enableDrag;

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const widget = instanceRef.current;
    if (!widget || !isInteractive) return;
    if (e.key === " " || e.key === "Enter") {
      if (enableClickCycle) {
        e.preventDefault();
        widget.cycleSpeedMode(true);
      } else if (callbacksRef.current.onActivate) {
        e.preventDefault();
        callbacksRef.current.onActivate();
      }
    } else if (e.key === "ArrowLeft" && enableDrag) {
      e.preventDefault();
      widget.nudgeYaw(0.24);
    } else if (e.key === "ArrowRight" && enableDrag) {
      e.preventDefault();
      widget.nudgeYaw(-0.24);
    } else if (e.key === "ArrowUp" && enableDrag) {
      e.preventDefault();
      widget.nudgePitch(0.22);
    } else if (e.key === "ArrowDown" && enableDrag) {
      e.preventDefault();
      widget.nudgePitch(-0.22);
    } else if ((e.key === "0" || e.key === "Home") && enableDrag) {
      e.preventDefault();
      widget.setViewPreset(viewPreset, true);
    }
  };

  if (!active || webglFailed) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <div
      ref={hostRef}
      className={className || undefined}
      style={style}
      role={hasClickAction ? "button" : enableDrag ? "application" : "img"}
      aria-roledescription={!hasClickAction && enableDrag ? "interactive 3D object" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={ariaLabel}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
    />
  );
}

export default BrainJarView;
