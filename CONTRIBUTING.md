# Contributing

1. Fork and branch (`feat/...`)
2. These must be green: `npm install && npm run lint && npm run test:cov && npm run build`
3. New logic follows TDD (RED → GREEN → REFACTOR); tests live in `tests/`, mirroring the source layout
4. Do not lower the coverage gate — `npm run test:cov` has to pass without threshold errors
5. Open a PR with a description, and a screenshot for UI changes
6. Found a bug? Open an issue. Questions, ideas, security-model critique? Open a [discussion](https://github.com/DamianTodorovic/kepta/discussions).

Never commit a secret. The old `KI-Gehirn` branding is gone — use `KEPTA`.

Docs, UI strings and code comments are English. Keep new user-facing text in English — and do not put a translatable string in a place where code branches on its wording; that turns a translation into a behaviour change.

**One surface, one language.** A terminal answer that mixes languages costs the reader a thought, so the rule is by surface, not by taste:

- Machine-readable text — API error bodies, `reason` fields, JSON, tool descriptions — is **English**, always. It is parsed by clients and read by other models.
- Human-facing CLI output is **English** in this repository; the desktop app ships its own German strings, and that translation lives in the app's own surface layer, never in a value the code branches on.

Two places still break the first bullet and are on record so the next contributor does not "fix" them by accident: `server.ts` answers the Device-Sync routes with `Passphrase fehlt` / `Bundle fehlt`, and the write gate returns `reason: "keine ähnliche Erinnerung"` (`src/core/engine.ts`) into a field an agent reads. Both should be English; a guard for German string literals in `src/**` and `server.ts` does not exist yet, so nothing catches a third one.

**Say "note", not "node".** A note is one thing the memory holds; `node` is the graph and API word for the same object and should not surface in a user's answer. Words that need care: *key* (licence key vs database key — name which one), *restore* (a note back from the trash vs a backup file back in place), *host* (network machine vs embedding app vs offered service), *memory* (the file vs one note). The full list is [docs/WORDS.md](docs/WORDS.md).
