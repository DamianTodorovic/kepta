import type * as THREE from 'three';

export type BrainJarTheme = 'dark' | 'light';
export type BrainJarSpeedMode = 'still' | 'drehen' | 'schnell';
export type BrainJarActivityState =
  | 'idle'
  | 'ready'
  | 'still'
  | 'active'
  | 'listening'
  | 'syncing'
  | 'drehen'
  | 'thinking'
  | 'processing'
  | 'indexing'
  | 'schnell';
export type BrainJarViewPreset = 'default' | 'dock' | 'float' | 'vortex' | 'profile' | 'base';
export type BrainJarZoomMode = boolean | 'modifier';

export interface BrainJarPaletteTokens {
  brainFill?: string;
  brainLine?: string;
  ink?: string;
  shadow?: string;
  lidFill?: string;
}

export type BrainJarPaletteConfig =
  | BrainJarPaletteTokens
  | {
      light?: BrainJarPaletteTokens;
      dark?: BrainJarPaletteTokens;
    };

export interface BrainJarSpeedModeEntry {
  id: BrainJarSpeedMode;
  label: string;
  speed: number;
}

export declare const SPEED_MODES: Record<BrainJarSpeedMode, BrainJarSpeedModeEntry>;
export declare const ACTIVITY_SPEED_MAP: Record<BrainJarActivityState, BrainJarSpeedMode>;
export declare const K3PTA_SIDEBAR_PALETTES: {
  light: BrainJarPaletteTokens;
  dark: BrainJarPaletteTokens;
};

export interface BrainJarWidgetOptions {
  theme?: BrainJarTheme;
  speedMode?: BrainJarSpeedMode;
  activityState?: BrainJarActivityState;
  initialView?: BrainJarViewPreset;
  paused?: boolean;
  suspended?: boolean;
  speed?: number;
  syncDocumentTheme?: boolean;
  respectReducedMotion?: boolean;
  enableDrag?: boolean;
  enableZoom?: BrainJarZoomMode;
  enableClickCycle?: boolean;
  enableHoverTilt?: boolean;
  freeOrbit?: boolean;
  showBaseShadow?: boolean;
  maxPixelRatio?: number;
  pauseWhenHidden?: boolean;
  idleSleep?: boolean;
  forceContextLossOnDispose?: boolean;
  palette?: BrainJarPaletteConfig | null;
  onViewChange?: (view: BrainJarViewPreset | null) => void;
  onSpeedModeChange?: (mode: BrainJarSpeedMode) => void;
  onModelClick?: (event: PointerEvent, widget: BrainJarWidget) => boolean | void;
  onContextLost?: (widget: BrainJarWidget) => void;
  onContextRestored?: (widget: BrainJarWidget) => void;
}

export declare class BrainJarWidget {
  readonly hostEl: HTMLElement;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly jarAssembly: THREE.Group;

  speedMode: BrainJarSpeedMode;
  activityState: BrainJarActivityState | BrainJarSpeedMode;
  activeView: BrainJarViewPreset | null;
  currentTheme: BrainJarTheme;
  isPaused: boolean;
  isSuspended: boolean;
  rotationSpeed: number;
  currentSpeed: number;
  syncDocumentTheme: boolean;
  enableDrag: boolean;
  enableZoom: BrainJarZoomMode;
  enableClickCycle: boolean;
  enableHoverTilt: boolean;
  freeOrbit: boolean;
  showBaseShadow: boolean;
  maxPixelRatio: number;
  pauseWhenHidden: boolean;
  idleSleep: boolean;
  forceContextLossOnDispose: boolean;
  isDisposed: boolean;

  onViewChange: ((view: BrainJarViewPreset | null) => void) | null;
  onSpeedModeChange: ((mode: BrainJarSpeedMode) => void) | null;
  onModelClick: ((event: PointerEvent, widget: BrainJarWidget) => boolean | void) | null;
  onContextLost: ((widget: BrainJarWidget) => void) | null;
  onContextRestored: ((widget: BrainJarWidget) => void) | null;

  constructor(hostEl: HTMLElement, options?: BrainJarWidgetOptions);

  setTheme(theme: BrainJarTheme): void;
  setPalette(palette: BrainJarPaletteConfig | null): void;
  setPaused(paused: boolean): void;
  setSuspended(suspended: boolean): void;
  setFreeOrbit(enabled: boolean): void;
  setShowBaseShadow(show: boolean): void;
  setSpeed(speed: number): void;
  setZoomEnabled(mode: BrainJarZoomMode): void;
  setSpeedMode(mode: BrainJarSpeedMode, notify?: boolean): void;
  setActivityState(state: BrainJarActivityState, notify?: boolean): BrainJarSpeedMode | null;
  cycleSpeedMode(notify?: boolean): BrainJarSpeedMode;
  setViewPreset(name: BrainJarViewPreset, notify?: boolean): void;
  nudgeYaw(deltaYaw: number): void;
  nudgePitch(deltaPitch: number): void;
  hitTestModel(clientX: number, clientY: number): boolean;
  handleResize(): void;
  wakeRender(): void;
  dispose(): void;
  destroy(): void;
}

export declare function mountStandaloneDemo(): BrainJarWidget | null;
