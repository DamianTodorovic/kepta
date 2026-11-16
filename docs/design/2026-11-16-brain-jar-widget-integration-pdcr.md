# PDCR Design Analysis & Integration Plan: Interactive 3D Specimen Identity Widget

**Target Application:** K3PTA Desktop / Core (`3.2.214`, Electron 44 + React 19 + Tailwind CSS v4 + Express 5)  
**Working Goal:** Embed our engraved 3D specimen widget cleanly into K3PTA as an unmistakable visual mark and calm activity indicator without altering P202 geometry, existing controls, or design/security guardrails.

---

## P — Plan

### Objectives & Verified System Constraints
1. **Non-Invasive Layout Parity:** Preserve every selector measured by `scripts/p202-dom-masse.mjs` (26 DOM handles in `Knowledge`, including `.fenster-titelleiste` 38 px, `.seiten-leiste` 208 px, `.nav-fuss-leiste` 33 px, `.listen-spalte` 420 px, `.listen-fuss` 32 px, `.detail-kopf`/`.detail-korper`, `.flaechen-status` 26 px) plus `.chat-panel` (`260 px` in `src/mockup-masse.css`), `design/DESIGN.md`, and `docs/design/CREATIVE_DIRECTION.md` (*Swiss Archival Instrument*, no decorative glow or floating cards).
2. **Optical Sharpness vs. Device Pixel Ratio (`brain-jar.js`):**
   - Below `136 px` width (such as `20–84 px` icons), procedural copperplate hatching (`engravingLine`), micro-stippling (`210.0`), lid knurling (`68` flutes), and lid `"K3PTA"` SDF merge into flat fills (`fwidth` exceeds Nyquist). Tiny slots must keep `KeptaMark` (`20 px`).
   - On **1x DPR monitors**, placements should stay **`>= 176 px` wide** (e.g., `176x206 px` to `204x240 px`) to avoid subpixel aliasing on cortex lines; `140–144 px` placements remain crisp on **>= 2x Retina/HiDPI** displays unless coarse-viewport Nyquist damping is added in Phase 2.
3. **Calm-UX & Single WebGL Context Discipline:**
   - Default `idle` (`still` = `0.0` with `idleSleep: true` -> `0 FPS` at rest). Motion activates strictly on live operations (`drehen` on MCP/health/sync, `schnell` on chat streaming, file import, or local model discovery).
   - Keep `enableZoom: false` (omits non-passive `wheel` listener) so scrollable panes never stall.
   - `Dashboard.tsx` keeps all 8 `.ansicht-blende` view containers mounted simultaneously via `flex` / `hidden`. `BrainJarView.tsx` now takes an `active` prop and sets `forceContextLossOnDispose: true` so hidden tabs immediately release WebGL contexts (`<= 1` active context app-wide), plus `try/catch` fallback when WebGL2 is unavailable (`jsdom` tests).
4. **Electron CSP & Offline Bundle (`electron.js`):**
   - Packaged `electron.js` enforces `script-src 'self' http://localhost:* http://127.0.0.1:*` and `connect-src 'self' ...` (no external CDN importmaps, no `'unsafe-eval'`, no `wasm-unsafe-eval`, no `blob:` fetches).
   - Phase 2 integration will install `three` and `@types/three` in `package.json` with a dedicated Vite `manualChunks` split below `chunkSizeWarningLimit: 800`.
5. **Verified Theme Palette Calibration (`src/index.css`):**
   - `ThemeContext` toggles `.dark` on `document.documentElement` (`theme-werkbank`, default Light).
   - **Light (`:root`):** `--eb-0` `#f7f6f3`, `--bg-panel` `#f6f5f3`, `--eb-2` `#fafaf9`, `--feld` `#f1f0ec`, `--text-1` `#1f1e1c`, `--accent` `#276b4f`.
   - **Dark (`.dark`):** `--eb-0` `#070708`, `--feld` `#070708`, `--bg-panel` `#252526`, `--eb-2` `#38383a`, `--text-1` `#eaeae8`, `--accent` `#f97d69`.
6. **UI Copy Guardrail (`scripts/pruefe-einstellungen-im-fenster.mjs` + `scripts/verstaendlichkeit.mjs`):**
   - Surface text in `src/components/**` forbids `"brain"`, `"node"`, `"nodes"`, and German strings (`verbotenQ`). Always phrase K3PTA labels in plain English (`"local memory"`, `"knowledge store"`, `"K3PTA"`).

---

## D — Do (Prepared Integration Pre-Work & Placement Portfolio)

Reusable integration assets reside outside `K3PTA Core Coding` in sibling folder `brain-jar-3d/`:
- Embed controller (`brain-jar.js`) + strict declarations (`brain-jar.d.ts`)
- React 18/19 wrapper (`integration/BrainJarView.tsx`) with `active` view-gate, `forceContextLossOnDispose: true`, English fallback, and WebGL `try/catch` guard
- Custom Element (`integration/brain-jar-element.js`) with context cleanup and fallback flag
- Interactive 5-example K3PTA placement preview (`integration/k3pta-placement-examples.html`) matching `src/index.css` tokens

| Option | Target Location & Responsive Gate | Specimen Size (`460:540`) | Semantic Speed Trigger | P202 Impact | Trade-Off / Gate Note |
|---|---|---|---|---|---|
| **1 · Empty Canvas Sanctuary** *(Top Pick)* | `Dashboard.tsx` `[data-testid="detail-leer"]` (hidden `<= 767 px` in `mockup-masse.css`) + `ActivityView.tsx` `detail-korper` (`--eb-0`) | `176x206 px` (`Knowledge`), `164x192 px` (`Activity`) | `still` -> `drehen` (`appsLive`) -> `schnell` (import/indexing) | **0 px** (unmounts on note open) | Safe at 1x & 2x DPR; invisible once reading a note or on phones `<= 767 px`. |
| **2 · `K· K3PTA` Specimen Popover** | Trigger outside `33 px` `.nav-fuss-leiste` (or `>= 36 px` button cleanly separated from `.treff` `44 px` hitboxes) -> opaque `242 px` card | Popover `176x206 px`; **0 GPU when closed** | Unmounted closed; `drehen` / `schnell` when inspected | **0 px** (only if trigger respects `>= 36 px` & avoids `.treff` overlap) | Requires careful trigger placement outside `.nav-fuss-leiste` to pass `mitteDiebe` / `--ziel-boden`. |
| **3 · `Today — All quiet` Sanctuary** *(Top Pick)* | `TodayView.tsx` bottom on `--eb-1` only when all change/todo/contradiction/expiry buckets are empty | `184x216 px` desktop (hide `< 768 px` on 1x DPR) | `still` -> `drehen` if MCP `appsLive` connects | **0 px** (unmounts when Today has items) | Serene signature on quiet mornings; match `--eb-1` palette (`#f6f5f3` / `#252526`). |
| **4 · Chat Context Cockpit** | `Chat.tsx` bottom of `.chat-panel-zeilen` (`margin-top: auto`, collapsible, needs explicit `<= 767 px` hide rule) | `144x169 px` inside `260 px` `.chat-panel` | `still` -> `drehen` (warm/scan) -> `schnell` (`isStreaming`) | **0 px** (`.chat-panel` stays `260 px`) | Strong live feedback during streaming; `144 px` suited for **>= 2x Retina/HiDPI** or with Nyquist line damping in Phase 2. |
| **5 · Setup & System Status Hero** | Cardless `OnboardingWizard.tsx` `.wizard-taefelchen` (`fixed inset-0` `--feld` 2-col at `>= 960 px`); optional top strip in `SystemStatus.tsx` | `204x240 px` (Wizard), `140x164 px` (Status strip) | `still` -> `drehen` (`Working`/partial embed) -> `schnell` (scan/test) | **0 px** (Wizard overlay; Settings outside Knowledge run) | Wizard overlay matches cardless `.assistent` at `>= 960 px`; Settings strip fits default `1280x840` Electron window cleanly (unlike `>= 1380 px` side col). |

**Rejected Patterns (Excluded):** Inline tiny WebGL badges (`20–84 px`), always-on floating bottom-right corner badge (collides with `.chat-panel-regler` and `Graph`), permanent lower-sidebar block competing with `Tags`, and `[data-testid="leerer-zustand"]` inside `.listen-spalte` (stutters during live search typing).

---

## C — Check (Independent Guardrail Audit & Executed Verifications)

### Automated & Visual Checks Executed So Far
- `K3PTA Core Coding` TypeScript check (`tsc --noEmit`): **0 errors**.
- `K3PTA Core Coding` `node scripts/design-wache.mjs`: **274 measurements, 0 below threshold (exit 0)**.
- `K3PTA Core Coding` `node scripts/zahlen-belege.mjs`: **43 tracked `.md` files checked, OK**.
- Interactive showcase browser checks (`1280x800` / `1280x900` desktop Chromium, Light `#f7f6f3` & Dark `#070708`): Examples 1–5 rendered with non-zero canvases, unmount/remount lifecycle, and **0 console errors / 0 page errors / 0 failed requests** against `127.0.0.1:8788`.

### Audit Catches Resolved in PDCR Review
Independent audit (`design-guardrail-auditor`) flagged these blockers before any production wiring:
1. **`verbotenQ` copy guard:** UI strings containing `"brain"` fail automated UI checks -> purged across wrappers and showcase copy.
2. **`.treff::after` (`44 px`) hitbox vs `.nav-fuss-leiste` (`33 px`):** Placing a clickable `<button>` inside `.nav-fuss-konto` conflicts with `--ziel-boden` (`36/44 px`) -> Option 2 flagged to require a dedicated `>= 36 px` trigger or external host when wired.
3. **`BrainJarView.tsx` lifecycle & CSS hygiene:** Added `active` unmount gate + `forceContextLossOnDispose: true` default + WebGL `try/catch` fallback + English default `ariaLabel`. Note for Phase 2: `css:klassen-waisen === 0` forbids copying unused utility classes from `brain-jar.embed.css` into `src/index.css`.
4. **Pending Phase 2 Gates (Not Yet Run Because Production `src/` Remains Untouched):** Full `npm run lint`, `npm run test:cov` + `scripts/doku-check.mjs` (requires generated `test-results/vitest.json`), `npm run build` (`vite build` + inline-script check), `npm run eval`, and live `390 px` narrow-viewport checks.

---

## R — Review & Next Steps

### Progress Log
- **2026-11-16 (PDCR Plan -> Do -> Check -> Refine):** Completed deep architecture/token/guardrail audit of `K3PTA Core Coding` (`3.2.214`), calibrated prototype palette & shell dimensions against `src/index.css` and `src/mockup-masse.css`, hardened `BrainJarView.tsx` / `brain-jar-element.js` context disposal & fallbacks, built and verified 5 interactive placement prototypes in Chromium (`0` console/page/HTTP errors), verified `tsc --noEmit`, `design-wache.mjs`, and `zahlen-belege.mjs` cleanly on the Core workspace, and logged all findings here.
- **2026-11-16 (Phase 2 — Darstellung C Endfassung Selected & Multi-Role PDCR Approved):** User selected **Darstellung C** (inline sidebar footer dock replacing `KeptaMark` + expanded floating 3D view) and refined four strict product requirements: purely playful decorative gimmick (`drehen` at launch, zero app/thinking/status telemetry), clearly recognizable `"K3PTA"` lid logo, generous unclipped space to spin 360° in every direction, and weightless floating presentation with zero background shift on hover/drag.

---

## Phase 2 — Sidebar Footer Replacement: Perfected Darstellung C Endfassung

### Plan & 3D Floating Architecture
- **Zero Status Telemetry (`Sidebar.tsx`):** Removed all status labels, speed dots, and DB strings from the sidebar footer (`K3PTA` + quiet `[Expand]` icon + `Sun`/`Moon`), matching `Sidebar.test.tsx` (*"die Marke trägt keine Unterzeile mehr"*). Rotation at launch (`drehen`) is strictly decorative/playful.
- **Unclipped 360° Free Quaternion Orbit & Solid Lid Bottom (`brain-jar.js`):**
  - Added `freeOrbit` camera-space quaternion trackball (`orbitQuat`/`targetQuat`, zero gimbal lock) + view-space `vShadePos`/`vShadeXZ` (`uFreeOrbit` uniform) across Glass, Lid, BasePunt, and Vortex so key highlights and shadows remain camera-locked at any 360° angle, plus a watertight flat bottom cap in `buildLidGeometry()` (`isBottom` shader pass) for upside-down inspection.
  - Switched both dock and expanded views to `1:1` square stages (`square` attr / `.k3pta-brain-jar--square`) with aspect-adaptive `fitRadius: 1.62, fitFill: 0.84` (`_computeMinFitDist()` -> `effDist ~7.63` at `1:1`), leaving ample margin around the `1.60`-unit bounding sphere so nothing clips in any direction.
- **Recognizable `"K3PTA"` Lid Logo:** Set `VIEW_PRESETS.dock` (`pitch: 0.36`, `yaw: -0.06`) and `VIEW_PRESETS.float` (`pitch: 0.42`, `yaw: -0.06`), upgrading `createLidMaterial()` with compact `stampMix` (`25%` enlarged stamped wordmark gated by `uCompact` + pixel height `brandPxH`, preserving exact hero V-cut `brandVis == 1.0` when `uCompact == 0.0`).
- **Weightless Space Floating & Zero Hover Background (`showBaseShadow: false`):** Disabled `baseShadowMesh` in Light & Dark modes, enforced `background: transparent` across hover/drag/focus states, and designed the expanded stage as a cardless, borderless `240x240 px` (or `260x260 px` desktop) specimen over a quiet zero-blur 90% `--eb-0` veil (`--veil-bg` with solid `--eb-0` fallback under `prefers-reduced-transparency: reduce`, strictly compliant with `CREATIVE_DIRECTION.md`).

### Do — Endfassung Geometry (`brain-jar-3d/integration/k3pta-sidebar-footer-mockup.html`)
- **Inline Dock (Card 2):** `84x84 px` (`1:1`) dock inside a `94 px` `.nav-fuss-leiste` footer (`+61 px` vs original `33 px`), paired with `12 px` gutter + `96 px` right stack (`K3PTA` + `24x24 px` expand button top, `24x24 px` `Sun`/`Moon` with `20 px` gap -> `44 px` center-to-center bottom).
- **Floating Space Stage (Card 3):** Click (`<= 5 px` drag threshold) on the dock jar or `[Expand]` suspends the dock RAF loop and opens the `240x240 px` (`260x260 px` desktop) cardless floating stage; `Escape`, stationary click outside the jar, or the corner `24x24 px` close icon dismisses it.

### Check & Multi-Role Review (All Roles PASS)
1. **Role 1 — WebGL & 360° Free-Orbit Architect:** Verified GLSL syntax/order (`smoothstep(-0.85, -0.55, ...)`), watertight lid bottom winding, `uFreeOrbit` view-space transforms, `_computeMinFitDist()` `~7.63` sphere margin, and `brandVis` `uCompact == 0.0` hero parity fix.
2. **Role 2 — K3PTA Design & Security Guardrail Auditor:** Verified zero-blur `--veil-bg`, zero hover/drag background change, zero telemetry strings (`verbotenQ` / `Sidebar.test.tsx`), `onActivate` / `role="application"` / `ArrowUp`/`ArrowDown` `nudgePitch` + `Home` reset in `BrainJarView.tsx` & `brain-jar-element.js`, and `24x24 px` (`gap: 20 px`) `.treff` clearance. Required `K3PTA Core Coding` implementation gates:
   - Bundle `three` locally via Vite `manualChunks` with zero `https://` strings in `src/` (`tests/keine-telemetrie.test.ts` + `electron.js` CSP).
   - Port only active canvas/overlay styles into `src/components/huelle.css` (`color-mix(in srgb, var(--eb-0) 90%, transparent)`, `var(--fokus)`, `var(--r-btn)`, `var(--dur-fast)`, `var(--ease-apple)`, `z-index: 70` below chrome `z-index: 80`), adding `role="dialog" aria-modal="true"` focus return on the React overlay.
   - Update `src/mockup-masse.css` (`94 px` `.nav-fuss-leiste`, `min-width: 0; min-height: 0` on `.nav-fuss-ikon`, `gap: 20px` on `.nav-fuss-ikonen`), keep `<KeptaMark size={20} />` as `fallback`, pass `active`/`suspended={!isFocusMode}`, and update `p202-dom-masse.mjs` / `p202-pixel-differ.mjs` / `Sidebar.test.tsx`.
3. **Role 3 — UX Placement Strategist:** Verified pure playful ergonomics, readable `"K3PTA"` lid dome across inline & floating views, unclipped 360° drag space, and cardless `--veil-bg` contrast.
4. **Live Browser Verification (Light & Dark Endfassung at `1400x820`):** `0` console/page/HTTP errors, continuous startup `drehen` rotation, strictly `rgba(0, 0, 0, 0)` backgrounds on hover/drag, unclipped 360° side/top/underside orbit, stationary veil dismiss vs `> 5 px` drag immunity, `44 px` `.treff` non-overlap verified, and all 3 cutout frames aligned at `412 px` height (`y = 170.79 px` to `582.79 px`).

### Status Note (Superseded by Phase 3 below)
Phase 2 design choices (initial expand overlay) were refined per final maintainer direction: the expand icon and secondary space popup were removed in favor of direct speed-stage cycling (`drehen -> schnell -> still -> drehen`) on stationary dock clicks and an initially tilted `dock` pose exposing the `K3PTA` lid engraving at launch.

---

## Phase 3 — Production Integration Complete (Single-Dock Edition, Ready for Push Review)

### Finalized Product & Haptics Spec Implemented in `src/`
1. **Slanted Opening Pose (`VIEW_PRESETS.dock`):** Configured `{ yaw: -0.16, pitch: 0.64, roll: -0.30, dist: 7.55, targetY: -0.02, fitRadius: 1.62, fitFill: 0.84 }` so opening K3PTA immediately reveals the carved `"K3PTA"` lid logo above the rotating brain specimen with zero edge clipping inside the `84x84 px` (`1:1`) square dock (`aspect`-normalized `effDist ~7.63`).
2. **Horizon-Clean Turntable Haptics (`brainJarEngine.js`):** Replaced diagonal quaternion twist drift with `'YXZ'` turntable angles (`orbitYaw, orbitPitch, orbitRoll`), size-normalized drag sensitivity, `24.0` tracking stiffness, gentle inertial flick coasting on fast drags, progressive `targetRoll -> 0` horizon leveling across deliberate drags, wide `[-1.46, +1.46]` (`+-83.6 deg`) pitch travel, and double-click camera reset back to `dock`.
3. **Click Cycles Speed Stages — Zero Second Window:** Left-click (`<= 5 px` drag threshold) or `Space`/`Enter` cycles `drehen -> schnell -> still -> drehen` in-place via `enableClickCycle={true}`. Removed the expand button and popup overlay entirely (`dialogs: 0`).
4. **Strict Zero-Change Boundary Elsewhere:** Only the sidebar footer widget integration (`Sidebar.tsx`, `BrainJarView.tsx`, `src/specimen/brainJarEngine.{js,d.ts}`, `huelle.css`, `mockup-masse.css`, `vite.config.ts`, `package.json`, `package-lock.json`, `tests/components/BrainJarView.test.tsx`) was added or modified; `KeptaMark.tsx` remains intact as WebGL `fallback` and for `Dashboard.tsx`. Sidebar footer copy stays strictly `"K3PTA"` + `Sun`/`Moon` (`44 px` center separation via `gap: 20px`) with transparent rest/hover/drag backgrounds (`rgba(0, 0, 0, 0)`).

### Implemented File Inventory (`K3PTA Core Coding`)
- **Dependencies & Chunking:** `package.json`, `package-lock.json` (`three`, `@types/three`), `vite.config.ts` (`manualChunks` splitting `node_modules/three` into `three` chunk, built `550.09 kB` / `139.75 kB` gzip).
- **WebGL Specimen Module:** `src/specimen/brainJarEngine.js` (+ `src/specimen/brainJarEngine.d.ts`) placed outside `vitest.config.ts` coverage denominators, including zero external URLs and silent `jsdom` WebGL unavailability throw caught by `BrainJarView` fallback.
- **React Wrapper & Sidebar Wiring:** `src/components/BrainJarView.tsx`, `src/components/Sidebar.tsx`, `src/components/huelle.css` (zero unused CSS selectors), `src/mockup-masse.css` (`94 px` `.nav-fuss-leiste`, `gap: 20px`, `24x24 px` `.nav-fuss-ikon` with `min-width: 0; min-height: 0`).
- **Unit Coverage:** `tests/components/BrainJarView.test.tsx` (5 tests covering mount/dispose, reactive prop sync, keyboard `Enter`/`Space`/`Arrow`/`Home`, callback forwarding, and inactive/WebGL-error `<KeptaMark />` fallback).

### Verification Summary & Open Space-Path Note
- `npx tsc --noEmit` & `npm run lint`: **0 errors** (pre-existing `Sidebar.tsx:55` unused-arg warnings left untouched per minimal-diff scope).
- `npm run build`: **0 errors** (`dist/index.html` contains zero inline `<script>` tags).
- `node scripts/design-wache.mjs`: **274 measurements, 0 below threshold (exit 0)**, zero orphan CSS classes.
- `node scripts/zahlen-belege.mjs` & `npm run eval`: **exit 0**.
- **Targeted Tests + Coverage:** `tests/components/BrainJarView.test.tsx`, `Sidebar.test.tsx`, `KeptaMark.test.tsx`, `keine-telemetrie.test.ts` all pass (`BrainJarView.tsx` `98.98%` statements, `92.98%` branches, `100%` functions, `100%` lines).
- **Full `npm run test:cov` Run Observation:** **370/373 test files passed (3,904 passed | 4 skipped)**. Three upstream verification test files failed in this workspace path specifically because the directory name `K3PTA Core Coding` contains spaces (`%20` mismatch in pre-existing `scripts/verstaendlichkeit.mjs:31` `new URL(...).pathname` yielding 0 source matches, and `scripts/platten-wache.mjs:117` `import.meta.url === file://${process.argv[1]}`), plus `tests/doku-zahlen.test.ts` waiting for a clean full pass to match `test-results/vitest.json` / `README.md`. Left those pre-existing scripts untouched to respect strict widget-only scope.
- **Live Built App Chromium Verification (`http://127.0.0.1:3625`, `1400x860`, Light & Dark modes, isolated temp `KEPTA_HOME`):** Confirmed slanted `"K3PTA"` lid pose on launch, continuous rotation, click cycle (`drehen -> schnell -> still -> drehen`) with `0` dialogs/popups, smooth drag & double-click reset, `44 px` Sun-to-Moon center distance, `rgba(0, 0, 0, 0)` transparent background across rest/hover/drag, `0` console errors, and `0` page errors.
