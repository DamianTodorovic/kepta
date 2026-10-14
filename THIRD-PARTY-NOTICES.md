# Third-party software in K3PTA Enterprise

K3PTA Enterprise is proprietary software, but it builds on open source. This
file lists the bundled components and their licenses. The memory engine
underneath is licensed separately: source-available under **BUSL-1.1**, each release converting to AGPL-3.0-or-later four years after its release — see [DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta).

## Icon sets (embedded in `src/lib/kepta-icons.json`)

| Set | License | Usage |
|---|---|---|
| **Solar** (480 Design, via Iconify) | **CC BY 4.0** | 61 glyphs of the K3PTA icon series (`solar:*-linear`) |
| **Tabler Icons** | MIT | 1 glyph (`binary-tree`, the Tree-view switcher) |

Solar is licensed under the Creative Commons Attribution 4.0 International
License (https://creativecommons.org/licenses/by/4.0/). The Solar icon set was
created by 480 Design (https://480.design / https://github.com/480-Design).

## Retired sets (no longer shipped in icons, kept in history)

| Set | License |
|---|---|
| Majesticons (halfmage) | MIT |
| Phosphor Icons | MIT |

## Major libraries

| Library | License |
|---|---|
| Electron | MIT |
| React, React DOM | MIT |
| motion (framer-motion successor) | MIT |
| pdf.js (pdfjs-dist) | Apache-2.0 |
| better-sqlite3-multiple-ciphers | MIT |
| express, helmet, compression, express-rate-limit | MIT |
| markdown rendering: react-markdown + remark/rehype ecosystem | MIT |
| vitest, esbuild, TypeScript, Vite (build/dev only) | MIT / Apache-2.0 |

## K3PTA's own components under a free or permissive license

Published from the public core repository ([DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta)); copies of these two folders live in this repository and track its release number.

| Component | License |
|---|---|
| `npm/` folder — the published `kepta-mcp` package | BUSL-1.1 since 2.13.22 (published under MIT for 2.6.4–2.10.3 and under AGPL-3.0-or-later for 2.12.0–2.13.21; each BUSL version converts to AGPL-3.0-or-later four years after release) |
| `python/` folder — source of the PyPI `kepta` client | MIT |
