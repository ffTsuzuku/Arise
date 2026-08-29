# AGENTS.md - AI Developer Guide for Arise

> **Briefing for AI Assistants & LLMs:**
> This repository contains **`arise`**, a modular, workplace-agnostic Git worktree and Herdr workspace orchestrator.
> Read this document first when analyzing, extending, modifying, or debugging this codebase.

---

## 1. Project Philosophy & System Overview

- **Core Goal**: Provide a unified CLI to automate the entire lifecycle of Git worktrees integrated with Herdr terminal workspaces (creation, branch checkout, environment file copying, dependency installation, permission setting, 4-pane quadrant layout orchestration, and safe teardown/nuke).
- **Agnostic Core**: The core engine (`lib/`) MUST remain 100% agnostic of any specific workplace, machine, or language.
- **Pluggable Presets**: Language- and framework-specific behavior (Node.js, Laravel/PHP, etc.) is isolated in `presets/`.
- **User Configurations**: Machine- or project-specific paths (such as bare repos, shared directories, and symlinks) are configured externally via `.ariserc.json` / `.worktreerc.json` / `arise.config.js`.

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
│   ├── config.js              # Config file discovery (.ariserc / .worktreerc) and preset merging
│   ├── context.js             # Execution context helper passed into lifecycle hooks
│   ├── git.js                 # Git operations (worktrees, branches, remote checks, prune)
│   ├── herdr.js               # Herdr CLI commands (workspace create/close, pane split/exec)
│   ├── layout.js              # Declarative terminal layout renderer
│   ├── skill.js               # Agent skill installer for Antigravity, Claude Code, etc.
│   └── lifecycle/
│       ├── create.js          # Pipeline for creating worktrees & orchestrating workspace
│       └── nuke.js            # Pipeline for safe worktree & branch teardown
├── presets/
│   ├── index.js               # Preset registry & auto-detection engine
│   ├── node.js                # Generic Node.js preset (npm, 'npm server' pane)
│   ├── laravel.js             # Generic Laravel/PHP preset (composer, permissions, logs pane)
│   └── generic.js             # Fallback preset for standard repos
├── docs/                      # In-depth architectural and developer documentation
│   ├── architecture.md        # Lifecycle flowcharts & subsystem details
│   ├── preset-guide.md        # Step-by-step tutorial on creating new presets
│   └── config-reference.md    # Exhaustive config reference
├── examples/                  # Reference implementations for configs and presets
└── test/                      # Node.js built-in test suite (node --test)
```

---

## 3. The 7-Step Lifecycle Pipeline

```
[1. Parse CLI Args] ──► [2. Load .ariserc / .worktreerc & Merge Preset]
                                    │
    ┌───────────────────────────────┴──────────────────────────────┐
    ▼                                                              ▼
[CREATION FLOW]                                             [NUKE FLOW]
3a. Validate Branch & Resolve Target Paths                 4a. Resolve Target (auto-detect cwd)
3b. Git Worktree Discovery & Creation                      4b. Safety Checks (protected branches)
3c. Hook: `onSyncPrimary(ctx)`                             4c. Hook: `onPreNuke(ctx)` (e.g. symlinks)
3d. Hook: `onScaffold(ctx)` (env, deps, perms)             4d. Git Worktree Remove & Prune
3e. Create Herdr Workspace                                 4e. Delete Local & Remote Branches
3f. Render Declarative Layout                              4f. Hook: `onPostNuke(ctx)`
3g. Focus Pane & Attach Session                            4g. Close Matching Herdr Workspaces
```

---

## 4. Design Invariants (CRITICAL RULES - Never Break These)

1. **Zero Hardcoded Paths in Core**: Never hardcode workplace paths (e.g. `/path/to/...`) inside `lib/`. Use `presets/` defaults or `config` overrides.
2. **Declarative Layouts**: Never write raw `herdr pane split` inside lifecycle orchestration. Always describe layouts as declarative arrays of pane objects rendered by `lib/layout.js`.
3. **Safety Guardrails on Nuke**:
   - Never allow nuking the repository root directory (`repoRoot`).
   - Never delete protected branches (`staging`, `prod`, `master`, `main`, `develop`) unless explicitly overridden.
   - Always auto-detect when the user runs `--nuke` inside an active worktree.
4. **Context Helper (`ctx`) Protocol**:
   - Hooks must use methods on `ctx` (`ctx.exec`, `ctx.spawn`, `ctx.copyFile`, `ctx.copyFromRoot`, `ctx.setSymlink`) rather than raw unchecked Node APIs.
5. **Backwards Compatibility**:
   - Argument parsing in `lib/cli.js` must support both long flags (`--branch`) and short flags (`-b`), aliases (`--cleanup` / `--nuke`, `--dir-only` / `--keep-branch`), and positional arguments.

---

## 5. How to Extend This Codebase

### A. How to Add a New Preset (e.g., Python / Django / Go / Rust)
1. Create `presets/<name>.js` conforming to the `Preset` interface in `types.d.ts`:
   ```javascript
   module.exports = {
     name: 'python',
     detect: (cwd) => fs.existsSync(path.join(cwd, 'requirements.txt')) || fs.existsSync(path.join(cwd, 'Pipfile')),
     repo: { defaultBaseBranch: 'main' },
     workspace: { defaultFocus: 'agy' },
     layout: [
       { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
       { id: 'server', title: 'server', cmd: 'python manage.py runserver', split: 'right', from: 'vim' },
       { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
       { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
     ],
     hooks: {
       async onScaffold(ctx) {
         ctx.copyFromRoot('.env', '.env');
         ctx.exec('pip install -r requirements.txt');
       },
     },
   };
   ```
2. Register it in `presets/index.js` inside `builtInPresets`.
3. Add a test in `test/config.test.js`.

### B. How to Add a New CLI Flag
1. Update `lib/cli.js`:
   - Add property to `flags` in `parseArgs()`.
   - Add parsing branch in the `for` loop.
   - Add flag description in `showUsage()`.
2. Update `types.d.ts` under `CliFlags`.
3. Pass or consume the flag in `create.js`, `nuke.js`, or `ctx.flags`.
4. Add a test in `test/cli.test.js`.

---

## 6. Documentation & Type Synchronization Invariant (MANDATORY)

Whenever modifying or extending this codebase, **YOU MUST KEEP ALL DOCUMENTATION, TYPE DEFINITIONS, AND SCHEMAS SYNCHRONIZED**.

- **Adding / Modifying Flags**:
  - Update `lib/cli.js` (`parseArgs` and `showUsage`).
  - Update `types.d.ts` (`CliFlags`).
  - Update `docs/config-reference.md` and `README.md`.
- **Adding / Modifying Presets**:
  - Create `presets/<name>.js` and register in `presets/index.js`.
  - Update `docs/preset-guide.md` and `types.d.ts` (if new hook properties added).
- **Adding / Modifying Config Options**:
  - Update `lib/config.js`.
  - Update `types.d.ts` (`WorktreeConfig`, `RepoConfig`, `WorkspaceConfig`, `ScaffoldConfig`).
  - Update `arise.schema.json`.
  - Update `docs/config-reference.md`.

---

## 7. Definition of Done (DoD) Checklist for AI Assistants

Before declaring any task or modification complete, you MUST verify:
- [ ] Code is implemented cleanly in `lib/` or `presets/` without breaking invariants.
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

