# Contributing

1. Fork and branch (`feat/...`)
2. These must be green: `npm install && npm run lint && npm run test:cov && npm run build`
3. New logic follows TDD (RED → GREEN → REFACTOR); tests live in `tests/`, mirroring the source layout
4. Do not lower the coverage gate — `npm run test:cov` has to pass without threshold errors
5. Open a PR with a description, and a screenshot for UI changes

Never commit a secret. The old `KI-Gehirn` branding is gone — use `KEPTA`.

The docs are English; the desktop UI is still German. Translation help is welcome — see [issues](https://github.com/DamianTodorovic/kepta/issues).
