# Claude Instructions for Arise

Master briefing for Claude Code and Anthropic assistants working on `arise`.

## Overview & Architecture
`arise` orchestrates Git worktrees and Herdr terminal sessions with pluggable language presets (`presets/`) and user configurations (`.ariserc.json` / `.worktreerc.json`).

Refer to `AGENTS.md` and `types.d.ts` for full architectural details and type contracts.

## Mandatory Invariants
- `lib/` must remain completely generic and workplace-agnostic.
- Terminal layouts must use declarative arrays resolved by `lib/layout.js`.
- Protect core branches (`staging`, `prod`, `master`, `main`, `develop`) and `repoRoot` from accidental deletion.

## Documentation & Type Synchronization (Mandatory)
Every code change MUST keep documentation, type definitions, and tests in sync:
1. Update `types.d.ts` for any interface or flag modifications.
2. Update `docs/` and `README.md` to reflect new/updated features.
3. Update `arise.schema.json` if configuration options change.
4. Run `npm test` before concluding.
