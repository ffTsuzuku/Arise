# Claude Instructions for Arise

Master briefing for Claude Code and Anthropic assistants working on `arise`.

## Overview & Architecture
`arise` is a universal terminal workspace bootstrapper supporting **tmux** and **Herdr**, declarative multi-pane layouts, AI CLI agent panes, pluggable language presets (`presets/`), and a pluggable ecosystem (`lib/plugins/`, including built-in Git worktree management).

Refer to `AGENTS.md`, `types.d.ts`, and `docs/architecture.md` for full architectural details and type contracts.

## Mandatory Invariants
- `lib/` must remain completely generic, multiplexer-agnostic, and workplace-agnostic.
- Terminal layouts must use declarative arrays rendered by `lib/layout.js` via the active multiplexer driver.
- Multiplexers are abstracted behind `lib/drivers/` (`tmux.js`, `herdr.js`).
- Git worktree workflows are encapsulated in `lib/plugins/worktree.js` and decoupled from core session bootstrapping.
- Protect core branches (`staging`, `prod`, `master`, `main`, `develop`) and `repoRoot` from accidental deletion.

## Documentation & Type Synchronization (Mandatory)
Every code change MUST keep documentation, type definitions, and tests in sync:
1. Update `types.d.ts` for any interface or flag modifications.
2. Update `docs/` and `README.md` to reflect new/updated features.
3. Update `arise.schema.json` if configuration options change.
4. Run `npm test` before concluding.
