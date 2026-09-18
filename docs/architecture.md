# System Architecture & Subsystem Design

`arise` is structured as a decoupled, layered command-line engine that bootstraps terminal sessions across **tmux** and **Herdr**, orchestrating declarative multi-pane layouts, project presets, and AI agent panes with a pluggable ecosystem.

---

## Subsystem Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Invocation / CLI                    │
│                 (bin/cli.js -> lib/cli.js)                  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Configuration & Preset Discovery                │
│              (lib/config.js & presets/index.js)             │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Plugin Lifecycle Manager                    │
│                     (lib/plugins/)                          │
│     ┌─────────────────────────────────────────────────┐     │
│     │ Built-in: Git Worktree Plugin (lib/plugins/wt) │     │
│     │ Custom User Plugins (arise.config.js)           │     │
│     └─────────────────────────────────────────────────┘     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Core Session Orchestrator Engine                │
│                 (lib/lifecycle/session.js)                  │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐┌──────────────────────────────┐
│  Multiplexer Driver Subsystem││    Layout Subsystem          │
│       (lib/drivers/)         ││     (lib/layout.js)          │
│  ├── tmux Driver (tmux.js)   ││  ├── Declarative Splitting   │
│  └── Herdr Driver (herdr.js) ││  └── AI Agent Focus Engine   │
└──────────────────────────────┘└──────────────────────────────┘
```

---

## Subsystems

### 1. CLI & Argument Parser (`lib/cli.js`)
- Pure parser transforming raw command-line arguments (`process.argv`) into a structured `CliFlags` object.
- Handles flags, aliases, short forms (`-m`, `-b`, `-k`), and positional directory or branch fallbacks.

### 2. Configuration & Preset Loader (`lib/config.js`)
- Recursively searches search directories and home configs for `.ariserc.js`, `arise.config.js`, `.ariserc.json`, or `.ariserc`.
- Merges project presets (user-defined custom presets or fallback default).
- Resolves preferred multiplexer (`tmux`, `herdr`, or `auto`) and loaded plugins.

### 3. Plugin Subsystem (`lib/plugins/`)
- **PluginManager (`lib/plugins/manager.js`)**: Executes lifecycle hooks:
  - `handleCommand(command, subargs, context)`: Intercepts and executes CLI subcommands (e.g. `arise worktree ...`).
  - `resolveTarget(context)`: Allows plugins to redirect session working directories (e.g. creating/locating Git worktrees).
  - `onBeforeSession(context)`: Pre-session scaffolding, environment copying, symlink generation.
  - `onAfterSession(context)`: Post-session initialization.
  - `onTeardown(context)`: Custom teardown and cleanup logic.
  - `menuActions(context)`: Injects custom actions into the interactive TUI menu.
- **Git Worktree Plugin (`lib/plugins/worktree.js`)**: Encapsulates all Git worktree topology, subcommands (`arise worktree <create|list|switch|nuke>`), branch resolution, bare repository support, and safe teardown with uncommitted change warnings and protected branch safeguards.

### 4. Terminal Multiplexer Drivers (`lib/drivers/`)
- Unified interface abstracting multiplexer-specific commands:
  - **`tmux` Driver (`lib/drivers/tmux.js`)**: Manages detached sessions (`tmux new-session`), window splits (`tmux split-window -h/-v`), command dispatching (`tmux send-keys`), pane focus (`tmux select-pane`), and session switching (`tmux switch-client` / `attach-session`).
  - **`herdr` Driver (`lib/drivers/herdr.js`)**: Manages workspaces (`herdr workspace create/close`) and pane splits (`herdr pane split/send-text`).
- **Resolver (`lib/drivers/index.js`)**: Selects driver according to CLI flags (`--mux`), configuration, active environment (`$TMUX`, `$HERDR_ENV`), and system availability.

### 5. Declarative Layout Renderer (`lib/layout.js`)
- Converts declarative pane arrays into tree-based splits executed on the active driver.
- Maps parent pane IDs, sets pane titles, starts pane startup commands, and resolves focus targets.

### 6. Execution Context (`lib/context.js`)
- Wraps child processes and file manipulation into safe, logged helper methods exposed to lifecycle hooks (`ctx.exec`, `ctx.spawn`, `ctx.copyFile`, `ctx.setSymlink`).
