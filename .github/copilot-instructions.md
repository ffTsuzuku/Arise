# GitHub Copilot Instructions for Herdr Worktree

## Core Project Guidelines
- Read `AGENTS.md` and `types.d.ts` for architectural conventions and type interfaces.
- Keep `lib/` 100% workplace-agnostic. Language-specific behavior belongs in `presets/`.
- Ensure all terminal layouts are declarative objects passed to `lib/layout.js`.

## Mandatory Documentation Maintenance
When adding or modifying features:
1. Always update `types.d.ts` to reflect flag, preset, or config schema changes.
2. Always update `docs/` and `README.md`.
3. Keep `worktree.schema.json` in sync with any `.worktreerc.json` changes.
4. Ensure `npm test` passes cleanly.
