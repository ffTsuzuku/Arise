# System Architecture & Subsystem Design

`arise` is structured as a decoupled, layered command-line engine that coordinates Git worktrees and Herdr terminal sessions across disparate technology stacks.

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
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│       Creation Pipeline      │        │        Nuke Pipeline         │
│  (lib/lifecycle/create.js)   │        │   (lib/lifecycle/nuke.js)    │
└──────────────┬───────────────┘        └──────────────┬───────────────┘
               │                                       │
               ├───────────────────┬───────────────────┤
               ▼                   ▼                   ▼
┌────────────────────────┐┌─────────────────┐┌────────────────────────┐
│     Git Subsystem      ││ Herdr Subsystem ││    Layout Subsystem    │
│      (lib/git.js)      ││ (lib/herdr.js)  ││    (lib/layout.js)     │
└────────────────────────┘└─────────────────┘└────────────────────────┘
```

---

## Subsystems

### 1. CLI & Argument Parser (`lib/cli.js`)
- Pure parser transforming raw command-line arguments (`process.argv`) into a structured `CliFlags` object.
- Handles flags, aliases, short forms, and positional fallback.

### 2. Configuration & Preset Loader (`lib/config.js`)
- Recursively searches parent directories and home configs for `.ariserc.json`, `arise.config.js`, `.worktreerc.json`, `.worktreerc.js`, or `worktree.config.js`.
- Discovers active preset through `--preset` flag, config file, or directory auto-detection heuristics.
- Deep-merges user config over preset defaults.

### 3. Git Subsystem (`lib/git.js`)
- Manages standard working tree topologies as well as bare git repository topologies (`--git-dir`).
- Handles porcelain worktree parsing, local/remote branch verification, safe worktree removal, branch tracking, and worktree pruning.

### 4. Herdr Subsystem (`lib/herdr.js`)
- Interfaces with the `herdr` CLI over IPC / CLI commands (`herdr workspace create`, `herdr workspace close`, `herdr pane split`, `herdr pane rename`, `herdr pane send-text`).
- Manages session lifecycle (`attachOrSwitchSession`).

### 5. Declarative Layout Renderer (`lib/layout.js`)
- Converts declarative pane arrays into tree-based Herdr pane split calls.
- Maps parent pane IDs, sets pane titles, starts pane processes, and resolves focus targets.

### 6. Execution Context (`lib/context.js`)
- Wraps child processes and file manipulation into safe, logged helper methods exposed to lifecycle hooks (`ctx.exec`, `ctx.spawn`, `ctx.copyFile`, `ctx.setSymlink`).
