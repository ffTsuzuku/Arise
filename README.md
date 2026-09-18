# Arise (`arise`)

Universal, multiplexer-agnostic terminal workspace bootstrapper supporting **tmux** and **Herdr**, with declarative layout orchestration, project presets, AI CLI agent panes, and a pluggable ecosystem.

---

## Features

- **Multiplexer Agnostic**: Seamlessly boots sessions in either **tmux** or **Herdr** (auto-detected or configured via `--mux`).
- **Instant Workspace Bootstrapping**: Run `arise` in any directory to spin up an orchestrated 4-pane quadrant layout with your editor, dev server, shell, and AI agent.
- **Pluggable Architecture**: Core Arise focuses purely on session orchestration and terminal layouts. Workflows like Git worktrees are provided through a lightweight, extensible plugin ecosystem.
- **Interactive TUI Mode**: Run `arise` with zero arguments for an interactive menu (launch sessions, attach/switch sessions, manage git worktrees, and install AI agent skills).
- **User-Defined Project Presets**: Completely un-opinionated by default with zero hardcoded presets. Build reusable presets via `arise init preset` and store them globally (`~/.config/arise/presets/`) or locally (`.arise/presets/`).
- **Built-in Worktree Plugin**: Full git worktree creation, branch resolution, customizable setup commands, and safe teardown with protected branch safeguards.

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
- **Launch session in current directory** (boots in tmux or Herdr)
- **Attach / Switch to existing session**
- **Git Worktree Operations** (Create new worktree, Switch worktree, List worktrees, Nuke worktree)
- **Initialize / Configure Arise** (interactive setup wizard)

### 3. Git Worktree Subcommands (`arise wt`)
```bash
# Clean, modern worktree subcommands:
arise wt create feature/login    # Create worktree, run setup, and boot session
arise wt list                    # List active worktrees & session statuses
arise wt switch feature/login    # Switch / open existing worktree in session
arise wt rm feature/login        # Run cleanup, close session, remove worktree & branches

# Long-form alias:
arise worktree create feature/login
arise worktree list
arise worktree switch feature/login
arise worktree nuke feature/login

# Or via classic flags:
arise --branch feature/login
arise --nuke feature-login
```

### 4. Manage Sessions
```bash
# List active sessions:
arise sessions
# (or arise --sessions)

# Close / kill an active session:
arise kill my-session
# (or arise --kill my-session)
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
  "setup": [
    "cp .env.example .env",
    "npm install"
  ],
  "cleanup": [
    "docker compose down -v"
  ],
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
│       └── session.js     # Core session bootstrap & close engine
└── presets/
    ├── index.js           # Preset registry & custom loader
    └── generic.js         # Fallback default un-opinionated preset
```
