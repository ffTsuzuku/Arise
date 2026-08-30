# Arise (`arise`)

Unified, workplace-agnostic Git worktree and Herdr workspace orchestrator with pluggable project presets.

---

## Features

- **Interactive TUI Mode**: Run `arise` with zero arguments for an interactive menu (create worktrees, switch/open existing sessions, list worktrees with Herdr status, nuke/cleanup with multi-picker, and install AI agent skills).
- **Unified Lifecycle**: Handles git worktree creation, branch resolution, Herdr workspace orchestration, 4-pane quadrant terminal setup, and safe teardown/nuke.
- **Pluggable Presets**: Built-in support for **Node.js** (`npm`/`yarn`/`pnpm`), **Laravel/PHP** (`composer`, logs, permissions), and **Generic** projects.
- **Zero-Config Auto-Detection**: Automatically detects project types based on directory markers (`package.json`, `composer.json`, `artisan`, etc.).
- **Workplace & Repo Agnostic**: Supports standard Git repos and bare repositories (`--git-dir`). Custom environment paths and symlinks are completely configurable via `.ariserc.json` / `.worktreerc.json` / `arise.config.js`.
- **Full Feature Parity**: Both Node and PHP projects get full `--nuke` / `--cleanup` suites with protected branch safety and Herdr workspace auto-closing.

---

## Installation

```bash
# Install globally via npm
npm install -g arise

# Or run directly without installing via npx
npx arise
```

Aliases provided: `arise`, `herdr-worktree`, `herder-worktree`, and `hwk`.

---

## Quick Start

### 1. Interactive Setup Wizard (`arise init`)
```bash
# Run interactive configuration wizard (Quick or Guided Step-by-Step, with .gitignore prompt)
arise init

# Fast-path quick initialization with detected repo defaults (optionally adding to .gitignore)
arise init --quick
arise init --quick --gitignore
```

### 2. Interactive Menu / TUI Mode (Zero Arguments)
```bash
# Launch interactive menu
arise
```
Interactive options include:
- 🚀 **Create new worktree** (select base source branch, enter branch name)
- 🔄 **Switch / Open existing worktree in Herdr**
- 📋 **List worktrees** (with active Herdr workspace status)
- 🧹 **Nuke / Cleanup worktree** (multi-select / picker with branch deletion options)
- ⚙️ **Initialize / Configure Arise** (interactive setup wizard)

### 2. Create a Worktree Session (CLI Flags)
```bash
# Auto-detects project type (Node, Laravel, etc.)
arise --branch feature/login

# Explicitly specify a preset
arise --branch feature/login --preset laravel

# Choose your AI CLI agent (e.g. Claude Code, Aider, Antigravity, or Copilot)
arise --branch feature/login --agent claude
arise --branch feature/login -a aider

# Specify base branch, custom workspace name, or focus pane
arise --branch feature/login --source develop --focus claude
```

### 3. Nuke / Clean Up a Worktree
```bash
# Inside a worktree directory (auto-detects current worktree):
arise --nuke

# From anywhere, by branch or directory name:
arise --nuke feature-login

# Keep branches, only remove directory:
arise --nuke feature-login --dir-only

# Delete local branch, keep remote on origin:
arise --nuke feature-login --keep-remote
```

### 4. Install AI Agent Skill (Antigravity `agy`, Claude Code, etc.)
```bash
# Install globally to ~/.agents/skills and link to ~/.gemini/skills:
arise --install-skill

# Install locally to workspace (.agents/skills/arise):
arise --install-skill --local
```

---

## Customizing via `.ariserc.json` or `arise.config.js`

Place a `.ariserc.json` in your repository root, worktrees base directory, or `~/.config/arise/config.js` (also supports `.worktreerc.json` / `~/.config/herdr-worktree/` for backwards compatibility):

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
    "agent": "claude",
    "defaultFocus": "claude"
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
arise/
├── package.json
├── index.js               # Main runner module
├── bin/
│   └── cli.js             # Executable CLI
├── lib/
│   ├── cli.js             # CLI argument parsing & help output
│   ├── interactive.js     # Interactive TUI menu & prompt handlers
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
