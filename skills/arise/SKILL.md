---
name: arise
description: User guide, CLI reference, and command executor for the `arise` utility (Git worktree and Herdr workspace orchestrator). Activate this skill whenever the user asks questions about how to use arise, how worktree orchestration works, how to configure `.ariserc.json` or `.worktreerc.json`, or asks the assistant to create, switch to, or nuke/clean up Git worktrees and Herdr workspaces on their behalf.
---

# Arise Operator & Assistant Guide

Use this skill to answer questions about `arise` and run worktree management commands on the user's behalf.

---

## 1. CLI Quick Reference & Cheatsheet

### Creating Worktrees
```bash
# Create or open a worktree for a branch (auto-detects preset, boots Herdr workspace)
arise --branch <branch-name>

# Create worktree based off a specific base branch (e.g. develop, prod, main)
arise --branch <branch-name> --base <base-branch>

# Custom directory name or workspace name
arise -b <branch-name> -d <dir-name> -w <workspace-name>

# Explicit preset or pane focus ('agy', 'vim', 'logs', 'server', 'shell')
arise -b <branch-name> --preset laravel --focus agy
```

### Nuking / Teardown
```bash
# Nuke active worktree (when run inside a worktree directory)
arise --nuke

# Nuke specific worktree by branch or directory name
arise --nuke <branch-or-dir>

# Remove directory only (keep local and remote git branches)
arise --nuke <target> --dir-only

# Delete local branch and directory, but keep remote branch on origin
arise --nuke <target> --keep-remote

# Force removal even if uncommitted changes exist
arise --nuke <target> --force
```

---

## 2. Configuration (`.ariserc.json` / `.worktreerc.json` / `arise.config.js`)

Projects can configure custom topology, bare repos, and layouts via `.ariserc.json` or `.worktreerc.json` in the repository root or base directory:

```json
{
  "preset": "laravel",
  "repo": {
    "bareRepo": "/path/to/bare.git",
    "worktreesBase": "/path/to/worktrees",
    "defaultBaseBranch": "develop",
    "protectedBranches": ["main", "master", "develop", "prod", "staging"]
  },
  "workspace": {
    "labelPrefix": "[API] ",
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
2. If working inside a repository with local documentation or `.ariserc.json` / `.worktreerc.json`, inspect those files.
3. Provide clear explanations with executable CLI examples and config snippets.

### When the User Asks You to Perform an Action:
1. Formulate the appropriate `arise` CLI command.
2. Execute the command on behalf of the user using the available command runner.
3. Confirm the status of the created or nuked worktree and Herdr workspace.
