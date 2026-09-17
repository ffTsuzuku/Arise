---
name: arise
description: User guide, CLI reference, and command executor for the `arise` utility (Universal terminal workspace bootstrapper across tmux and Herdr with Git worktree plugin). Activate this skill whenever the user asks questions about how to use arise, how session or worktree orchestration works, how to configure `.ariserc.json` or `arise.config.js`, or asks the assistant to boot, switch to, or manage sessions and Git worktrees on their behalf.
---

# Arise Operator & Assistant Guide

Use this skill to answer questions about `arise` and run session or worktree management commands on the user's behalf.

---

## 1. CLI Quick Reference & Cheatsheet

### Bootstrapping Sessions (Directory-First)
```bash
# Bootstrap session in current directory (auto-detects project preset, boots tmux or Herdr)
arise

# Specify preferred multiplexer ('tmux', 'herdr', or 'auto')
arise --mux tmux
arise --mux herdr

# Bootstrap session for specific directory
arise /path/to/project --name my-session
```

### Interactive Mode
```bash
# Launch interactive menu (launch session, switch session, worktrees, config wizard)
arise
```

### Git Worktree Subcommands (Worktree Plugin)
```bash
# Subcommands:
arise worktree create <branch> [--base <source>]
arise worktree list
arise worktree switch <branch>
arise worktree nuke [<branch-or-dir>] [--force]

# Or via classic flags:
arise --branch <branch-name> [--base <base-branch>]
arise --nuke [<branch-or-dir>] [--force]
```

### Session Management & Nuking
```bash
# List active sessions
arise sessions
# (or arise --sessions)

# Close / kill active session
arise kill <session-name>
# (or arise --kill <session-name>)

# Nuke active worktree (when run inside a worktree directory)
arise worktree nuke
# (or arise --nuke)
```

---

## 2. Configuration (`.ariserc.json` / `arise.config.js`)

```json
{
  "multiplexer": "tmux",
  "plugins": ["worktree"],
  "preset": "laravel",
  "workspace": {
    "labelPrefix": "[API] ",
    "agent": "agy",
    "defaultFocus": "agy"
  },
  "scaffold": {
    "envSource": "/path/to/shared/.env",
    "symlink": "/path/to/webserver/symlink",
    "install": "composer install --no-interaction"
  }
}
```

---

## 3. How to Assist the User

### When the User Asks Questions:
1. Consult the CLI options and configuration schema above.
2. If working inside a repository with local documentation or `.ariserc.json` / `arise.config.js`, inspect those files.
3. Provide clear explanations with executable CLI examples and config snippets.

### When the User Asks You to Perform an Action:
1. Formulate the appropriate `arise` CLI command.
2. Execute the command on behalf of the user using the available command runner.
3. Confirm the status of the created or closed session and worktree.
