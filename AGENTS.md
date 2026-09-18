# AGENTS.md - AI Developer Guide for Arise

> **Briefing for AI Assistants & LLMs:**
> This repository contains **`arise`**, a universal, multiplexer-agnostic terminal workspace bootstrapper supporting **tmux** and **Herdr**, with declarative layout orchestration, project presets, and a pluggable ecosystem.
> Read this document first when analyzing, extending, modifying, or debugging this codebase.

---

## 1. Project Philosophy & System Overview

- **Core Goal**: Provide a unified CLI to bootstrap terminal workspaces with multi-pane declarative layouts, dev servers, editors, shells, and AI CLI agent panes across **tmux** and **Herdr**, based on directory context or configuration.
- **Multiplexer Agnostic**: The engine is completely abstracted from underlying multiplexers via `lib/drivers/` (`tmux` and `herdr`).
- **Pluggable Ecosystem**: Features such as Git worktree management are implemented as pluggable lifecycle extensions (`lib/plugins/`) rather than hardcoded into the core engine.
- **User-Defined Presets**: Zero hardcoded presets by default. Users create reusable presets via `arise init preset` and store them globally (`~/.config/arise/presets/`) or locally (`.arise/presets/`), with an un-opinionated fallback (`presets/generic.js`).
- **User Configurations**: Project-specific paths, preferred multiplexer, plugins, and custom layouts are configured via `.ariserc.json` / `arise.config.js`.

---

## 2. Directory Map

```
arise/
├── AGENTS.md                  # This master AI instruction file
├── types.d.ts                 # TypeScript type definitions for all core abstractions
├── arise.schema.json          # JSON Schema for .ariserc.json
├── package.json               # Package metadata & bin script mapping
├── index.js                   # Main runner entrypoint
├── bin/
│   └── cli.js                 # Executable CLI entrypoint (#!/usr/bin/env node)
├── lib/
│   ├── cli.js                 # CLI argument parsing, flags, and help text
│   ├── interactive.js         # Interactive TUI prompt and zero-argument menu handler
│   ├── config.js              # Config file discovery (.ariserc / arise.config.js) and preset merging
│   ├── config/
│   │   └── init.js            # Interactive configuration & preset setup wizard
│   ├── context.js             # Execution context helper passed into lifecycle hooks
│   ├── git.js                 # Git operations (worktrees, branches, remote checks, prune)
│   ├── layout.js              # Declarative terminal layout renderer
│   ├── logger.js              # Logger utility
│   ├── skill.js               # Agent skill installer for Antigravity, Claude Code, etc.
│   ├── tui/
│   │   ├── prompt.js          # Terminal prompts & in-place screen management
│   │   └── ansi.js            # ANSI styling utilities
│   ├── drivers/               # Multiplexer driver abstraction
│   │   ├── index.js           # Driver registry & auto-resolution
│   │   ├── tmux.js            # tmux driver implementation
│   │   └── herdr.js           # Herdr driver implementation
│   ├── plugins/               # Pluggable ecosystem
│   │   ├── manager.js         # Plugin lifecycle manager
│   │   ├── worktree.js        # Built-in Git worktree lifecycle plugin
│   │   └── index.js           # Plugin resolver
│   └── lifecycle/
│       └── session.js         # Core session bootstrap & close engine
├── presets/
│   ├── index.js               # Preset registry & custom loader
│   └── generic.js             # Fallback un-opinionated default preset
├── docs/                      # In-depth architectural and developer documentation
│   ├── architecture.md        # Lifecycle flowcharts & subsystem details
│   ├── preset-guide.md        # Step-by-step tutorial on creating new presets
│   └── config-reference.md    # Exhaustive config reference
├── examples/                  # Reference implementations for configs and presets
└── test/                      # Node.js built-in test suite (node --test)
```

---

## 3. The Lifecycle Pipeline

```
[1. Parse CLI Args] ──► [2. Load .ariserc & Merge Preset]
                                    │
                                    ▼
                     [3. PluginManager.hookResolveTarget]
         (Git worktree plugin resolves worktree & creates branch if --branch)
                                    │
    ┌───────────────────────────────┴──────────────────────────────┐
    ▼                                                              ▼
[SESSION CREATION FLOW]                                     [SESSION TEARDOWN / NUKE FLOW]
4a. Plugin Hook: `onBeforeSession(ctx)`                     5a. Plugin Hook: `onTeardown(ctx)`
4b. Run Workspace `setup` commands (if new)                     (Worktree plugin runs `cleanup` commands,
4c. Ensure Multiplexer Installed (`tmux` or `herdr`)             handles git removal, branch deletion,
4d. Driver: `createSession({ name, cwd })`                       & closes sessions)
4e. Render Declarative Layout via Driver                    5b. Run Workspace `cleanup` commands (if any)
4f. Focus Targeted Pane & Session                           5c. Driver: `closeSession(name)`
4g. Plugin Hook: `onAfterSession(ctx)`
4h. Driver: `attachOrSwitchSession(name)`
```

---

## 4. Design Invariants (CRITICAL RULES - Never Break These)

1. **Multiplexer Agnosticism**: Never call `herdr` or `tmux` directly from lifecycle engines. Always route terminal operations through the `MultiplexerDriver` interface via `lib/drivers/`.
2. **Zero Hardcoded Paths in Core**: Never hardcode workplace paths inside `lib/`. Use `presets/` defaults or `config` overrides.
3. **Declarative Layouts**: Never write raw split shell calls inside lifecycle orchestration. Always describe layouts as declarative arrays of pane objects rendered by `lib/layout.js`.
4. **Git Decoupled in Core**: The core session bootstrapper operates on any directory without requiring Git. Git worktree operations belong in `lib/plugins/worktree.js`.
5. **Safety Guardrails on Nuke**:
   - Never allow nuking the repository root directory (`repoRoot`).
   - Never delete protected branches (`staging`, `prod`, `master`, `main`, `develop`) unless explicitly overridden.
   - Always auto-detect when the user runs `--nuke` inside an active worktree.
6. **Context Helper (`ctx`) Protocol**:
   - Hooks must use methods on `ctx` (`ctx.exec`, `ctx.spawn`, `ctx.copyFile`, `ctx.copyFromRoot`, `ctx.setSymlink`) rather than raw unchecked Node APIs.
7. **Backwards Compatibility**:
   - Argument parsing in `lib/cli.js` must support both long flags (`--branch`, `--mux`), short flags (`-b`, `-m`), aliases (`--cleanup` / `--nuke`, `--session`), and positional arguments.

---

## 5. How to Extend This Codebase

### A. How to Add a New Multiplexer Driver
1. Create `lib/drivers/<name>.js` implementing the `MultiplexerDriver` interface from `types.d.ts`.
2. Register the driver in `lib/drivers/index.js`.
3. Add a test in `test/drivers.test.js`.

### B. How to Add a New Plugin
1. Create a plugin module adhering to the `Plugin` interface:
   ```javascript
   module.exports = function myPlugin(options = {}) {
     return {
       name: 'my-plugin',
       async resolveTarget(ctx) { ... },
       async onBeforeSession(ctx) { ... },
       async onAfterSession(ctx) { ... },
       async onTeardown(ctx) { ... },
       menuActions(ctx) { return [...]; },
     };
   };
   ```
2. Users can register it in `.ariserc.json` or `arise.config.js` under `plugins`.

### C. How to Add a New Preset
1. Use `arise init preset` or `arise preset new` to walk through creating a preset, or write a `.js` module conforming to the `Preset` interface in `types.d.ts`.
2. Save it globally in `~/.config/arise/presets/<name>.js` or locally in `.arise/presets/<name>.js`.
3. Add a test in `test/config.test.js`.

---

## 6. Documentation & Type Synchronization Invariant (MANDATORY)

Whenever modifying or extending this codebase, **YOU MUST KEEP ALL DOCUMENTATION, TYPE DEFINITIONS, AND SCHEMAS SYNCHRONIZED**.

- **Adding / Modifying Flags**:
  - Update `lib/cli.js` (`parseArgs` and `showUsage`).
  - Update `types.d.ts` (`CliFlags`).
  - Update `docs/config-reference.md` and `README.md`.
- **Adding / Modifying Presets**:
  - Create `presets/<name>.js` and register in `presets/index.js`.
  - Update `docs/preset-guide.md` and `types.d.ts`.
- **Adding / Modifying Config Options**:
  - Update `lib/config.js`.
  - Update `types.d.ts` (`AriseConfig`, `WorktreeConfig`).
  - Update `arise.schema.json`.
  - Update `docs/config-reference.md`.

---

## 7. Definition of Done (DoD) Checklist for AI Assistants

Before declaring any task or modification complete, you MUST verify:
- [ ] Code is implemented cleanly in `lib/`, `lib/drivers/`, or `lib/plugins/` without breaking invariants.
- [ ] `types.d.ts` is fully updated with any new/modified types.
- [ ] Relevant documentation in `docs/` and `README.md` is updated.
- [ ] Schema `arise.schema.json` is updated if config options changed.
- [ ] Automated tests in `test/` (including `docs-sync.test.js`) are executed with `npm test` and pass 100%.

---

## 8. Testing & Quality Verification

Run the test suite with Node's built-in test runner:
```bash
npm test
# Or directly:
node --test test/*.test.js
```
Ensure all tests pass before completing any modification or addition.
