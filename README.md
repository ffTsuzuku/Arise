# Arise (`arise`)

Universal, multiplexer-agnostic terminal workspace bootstrapper supporting **tmux** and **Herdr**, with declarative layout orchestration, project presets, AI CLI agent panes, and a pluggable ecosystem.

---

## Features

- **Multiplexer Agnostic**: Seamlessly boots sessions in either **tmux** or **Herdr** (auto-detected or configured via `--mux`).
- **Instant Workspace Bootstrapping**: Run `arise` in any directory to spin up an orchestrated 4-pane quadrant layout with your editor, dev server, shell, and AI agent.
- **Pluggable Architecture**: Core Arise focuses purely on session orchestration and terminal layouts. Workflows like Git worktrees are provided through a lightweight, extensible plugin ecosystem.
- **Interactive TUI Mode**: Run `arise` with zero arguments for an interactive menu (launch sessions, attach/switch sessions, manage git worktrees, and install AI agent skills).
- **First-Class AI Agent Panes**: Native awareness and focus targeting for AI CLI agents (**Antigravity `agy`**, **Claude Code**, **Aider**, **Copilot CLI**).
- **Pluggable Project Presets**: Built-in support for **Node.js** (`npm`/`yarn`/`pnpm`), **Laravel/PHP** (`composer`, logs, permissions), and **Generic** projects with zero-config auto-detection.
- **Built-in Worktree Plugin**: Full git worktree creation, branch resolution, environment file copying, and safe `--nuke` teardown with protected branch safeguards.

---

## Installation

```bash
# Install globally via npm
npm install -g arise

# Or run directly without installing via npx
npx arise
```

---

## Quick Start

### 1. Bootstrap a Session in the Current Directory
```bash
# Auto-detects project type and launches in tmux (or herdr):
arise

# Specify your preferred multiplexer:
arise --mux tmux
arise --mux herdr

# Bootstrap a session for a specific directory:
arise ~/projects/my-api --name api
```

### 2. Interactive Menu / TUI Mode (Zero Arguments)
```bash
# Launch interactive menu
arise
```
Interactive options include:
- 🚀 **Launch session in current directory** (boots in tmux or Herdr)
- 🔄 **Attach / Switch to existing session**
- 🌿 **Git Worktree Operations** (Create new worktree, Switch worktree, List worktrees, Nuke worktree)
- ⚙️ **Initialize / Configure Arise** (interactive setup wizard)

### 3. Git Worktree Workflows (Worktree Plugin)
```bash
# Create a new git worktree & boot into tmux or herdr session:
arise --branch feature/login

# Explicitly choose multiplexer, preset, and AI agent:
arise --branch feature/login --mux tmux --preset laravel --agent claude

# Safe worktree nuke / teardown:
arise --nuke feature-login
```

### 4. Manage Sessions
```bash
# List active sessions in current multiplexer:
arise --sessions

# Close / kill an active session:
arise --kill my-session
```

### 5. Install AI Agent Skill (Antigravity `agy`, Claude Code, etc.)
```bash
# Install globally to ~/.agents/skills and link to ~/.gemini/skills:
arise --install-skill

# Install locally to workspace (.agents/skills/arise):
arise --install-skill --local
```

---

## Customizing via `.ariserc.json` or `arise.config.js`

Place a `.ariserc.json` in your project root or `~/.config/arise/config.js`:

```json
{
  "multiplexer": "tmux",
  "plugins": ["worktree"],
  "preset": "node",
  "workspace": {
    "labelPrefix": "[API] ",
    "agent": "agy",
    "defaultFocus": "agy"
  },
  "layout": [
    { "id": "vim", "title": "vim", "cmd": "nvim .", "position": "root" },
    { "id": "server", "title": "server", "cmd": "npm run dev", "split": "right", "from": "vim" },
    { "id": "shell", "title": "shell", "cmd": null, "split": "down", "from": "vim" },
    { "id": "agy", "title": "agy", "cmd": "agy", "split": "down", "from": "server", "focus": true, "isAgent": true }
  ]
}
```

---

## Architecture & Modular Structure

```
arise/
├── package.json
├── index.js               # Main runner entrypoint
├── bin/
│   └── cli.js             # Executable CLI
├── lib/
│   ├── cli.js             # CLI argument parsing & help output
│   ├── interactive.js     # Interactive TUI menu & prompt handlers
│   ├── config.js          # Config discovery & preset merging
│   ├── layout.js          # Declarative terminal layout renderer
│   ├── context.js         # Lifecycle execution context & helpers
│   ├── skill.js           # Agent skill installer for agy/claude
│   ├── drivers/           # Terminal multiplexer abstraction
│   │   ├── index.js       # Driver registry & auto-detection
│   │   ├── tmux.js        # tmux driver implementation
│   │   └── herdr.js       # Herdr driver implementation
│   ├── plugins/           # Pluggable ecosystem
│   │   ├── manager.js     # Plugin lifecycle manager
│   │   ├── worktree.js    # Built-in Git worktree lifecycle plugin
│   │   └── index.js       # Plugin resolver
│   └── lifecycle/
│       ├── session.js     # Core session bootstrap & close engine
│       ├── create.js      # Backwards-compatible create adapter
│       └── nuke.js        # Backwards-compatible nuke adapter
└── presets/
    ├── index.js           # Preset registry & auto-detection
    ├── node.js            # Node / JS project preset
    ├── laravel.js         # Laravel / PHP project preset
    └── generic.js         # Fallback generic preset
```
