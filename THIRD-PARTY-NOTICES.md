# Third-party software in KEPTA Enterprise

KEPTA Enterprise is proprietary software, but it builds on open source. This
file lists the bundled components and their licenses. The open memory engine
underneath is licensed separately (AGPL-3.0, see [DamianTodorovic/kepta](https://github.com/DamianTodorovic/kepta)).

## Icon sets (embedded in `src/lib/kepta-icons.json`)

| Set | License | Usage |
|---|---|---|
| **Solar** (480 Design, via Iconify) | **CC BY 4.0** | 61 glyphs of the KEPTA icon series (`solar:*-linear`) |
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

## KEPTA's own open components (shipped from this repository's public counterpart)

| Component | License |
|---|---|
| `npm/` folder — source of the `kepta-mcp` package | AGPL-3.0-or-later (from 2.11; published 2.10.3 was MIT) |
| `python/` folder — source of the PyPI `kepta` client | MIT |
