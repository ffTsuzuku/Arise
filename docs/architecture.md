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
- `mergePresetConfiguration` is shared with setup previews. A preset's pane commands survive unless an explicit agent override applies; relative preset file paths resolve from the config location. JSON comment parsing preserves strings, URLs, and shell syntax.

#### Configuration editor (`lib/config/`)
- **`draft.js`** loads the current checkout's JSON config into memory, preserves unrelated settings, resolves inherited values, validates layouts, and writes only on Save. Atomic replacement includes a stale-file check. Malformed JSON and executable configs are never silently replaced.
- **`init.js`** implements preset selection followed by a review screen with optional editors. Existing configs open directly in review. Prefix changes only update `workspace.labelPrefix`. Switching presets offers a choice to retain or clear preset-related overrides. Quick setup uses the same draft without interactive review.
- **`layout-editor.js`** edits a copy of the current panes and applies it only when the user chooses Apply layout. It supports individual commands, titles, IDs, agent roles, parent/direction choices, focus, and pane additions/removals. Lifecycle editors keep each shell command intact.
- Preset authoring is a separate workflow with a starting shape, pane editor, and its own review/save. It never runs agent-skill installation as part of repository setup. The interactive menu reloads saved config before launching another session.

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

### 7. Terminal Interface (`lib/tui/`)
- **`theme.js`** owns the charcoal/teal palette, ASCII branding, directory and session context, numbered menu sections, selection bars, and contextual footer. Its renderer adjusts the header, spacing, and visible list window to the terminal dimensions.
- **`prompt.js`** implements select, multi-select, text, confirmation, and scrollable notice screens using Node's readline keypress events. Every prompt uses the same renderer, including nested configuration and preset steps. Prompts own an alternate screen and restore raw mode, cursor visibility, and listeners on completion, cancellation, input errors, or termination.
- **`ansi.js`** measures terminal cells (including wide Unicode glyphs), wraps and truncates styled content, and preserves true-color and indexed-color sequences across wrapped lines.
- Arrow keys and j/k navigate choices; Enter selects; Escape cancels. Multi-select adds Space to toggle. Main-menu actions provide single-key shortcuts. Long lists support Page Up/Down and Home/End.
- Color output honors `NO_COLOR` and `TERM=dumb`. Without interactive input and output, prompts preserve their default-value fallback behavior.
- Plugin menu actions can supply `label`, `description`/`hint`, `group`, `shortcut`, `danger`, and `subtle` presentation metadata. Ungrouped plugins appear under **Extensions**. Reserve `l`, `s`, `c`, and `q` for built-in actions and j/k for navigation; the worktree plugin uses `n`, `o`, `w`, and `x`. A create/switch/open handler returns `true` when it has opened a session and the menu should finish; cancelling keeps the menu open.
