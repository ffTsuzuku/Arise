# Herdr Worktree (`herdr-worktree`)

Unified, workplace-agnostic Git worktree and Herdr workspace orchestrator with pluggable project presets.

---

## Features

- **Unified Lifecycle**: Handles git worktree creation, branch resolution, Herdr workspace orchestration, 4-pane quadrant terminal setup, and safe teardown/nuke.
- **Pluggable Presets**: Built-in support for **Node.js** (`npm`/`yarn`/`pnpm`), **Laravel/PHP** (`composer`, logs, permissions), and **Generic** projects.
- **Zero-Config Auto-Detection**: Automatically detects project types based on directory markers (`package.json`, `composer.json`, `artisan`, etc.).
- **Workplace & Repo Agnostic**: Supports standard Git repos and bare repositories (`--git-dir`). Custom environment paths and symlinks are completely configurable via `.worktreerc.json` / `worktree.config.js`.
- **Full Feature Parity**: Both Node and PHP projects get full `--nuke` / `--cleanup` suites with protected branch safety and Herdr workspace auto-closing.

---

## Installation

```bash
# Install globally via npm
npm install -g herdr-worktree

# Or run directly without installing via npx
npx herdr-worktree --branch <branch-name>
```

Aliases provided: `herdr-worktree`, `herder-worktree`, and `hwk`.

---

## Quick Start

### 1. Create a Worktree Session
```bash
# Auto-detects project type (Node, Laravel, etc.)
herdr-worktree --branch feature/login

# Explicitly specify a preset
herdr-worktree --branch feature/login --preset laravel

# Specify base branch or custom workspace name
herdr-worktree --branch feature/login --source develop --focus agy
```

### 2. Nuke / Clean Up a Worktree
```bash
# Inside a worktree directory (auto-detects current worktree):
herdr-worktree --nuke

# From anywhere, by branch or directory name:
herdr-worktree --nuke feature-login

# Keep branches, only remove directory:
herdr-worktree --nuke feature-login --dir-only

# Delete local branch, keep remote on origin:
herdr-worktree --nuke feature-login --keep-remote
```

### 3. Install AI Agent Skill (Antigravity `agy`, Claude Code, etc.)
```bash
# Install globally to ~/.agents/skills and link to ~/.gemini/skills:
herdr-worktree --install-skill

# Install locally to workspace (.agents/skills/herdr-worktree):
herdr-worktree --install-skill --local
```

---

## Customizing via `.worktreerc.json` or `worktree.config.js`

Place a `.worktreerc.json` in your repository root, worktrees base directory, or `~/.config/herdr-worktree/config.js`:

```json
{
  "preset": "laravel",
  "repo": {
    "bareRepo": "/path/to/bare/repo.git",
    "worktreesBase": "/path/to/worktrees",
    "defaultBaseBranch": "main"
  },
  "workspace": {
    "labelPrefix": "[API] ",
    "defaultFocus": "agy"
  },
  "scaffold": {
    "envSource": "/path/to/shared/.env",
    "symlink": "/var/www/my-app"
  }
}
```

---

## Architecture & Modular Structure

```
herder-worktree/
├── package.json
├── index.js               # Main runner module
├── bin/
│   └── cli.js             # Executable CLI
├── lib/
│   ├── cli.js             # CLI argument parsing & help output
│   ├── config.js          # Config discovery & preset merging
│   ├── git.js             # Git worktree & branch operations
│   ├── herdr.js           # Herdr workspace & pane operations
│   ├── layout.js          # Declarative terminal layout renderer
│   ├── context.js         # Lifecycle execution context & helpers
│   ├── skill.js           # Agent skill installer for agy/claude
│   └── lifecycle/
│       ├── create.js      # Worktree creation & layout pipeline
│       └── nuke.js        # Safe teardown & branch deletion pipeline
└── presets/
    ├── index.js           # Preset registry & auto-detection
    ├── node.js            # Node / JS project preset
    ├── laravel.js         # Laravel / PHP project preset
    └── generic.js         # Fallback generic preset
```
