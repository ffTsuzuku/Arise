# Configuration File Reference (`.ariserc.json` / `arise.config.js`)

`arise` allows project-level and user-level configuration files to override multiplexer driver, plugins, preset defaults, topology paths, and terminal layouts.

---

## File Resolution Order

1. `./.ariserc.js` or `./arise.config.js` (Current Directory)
2. `./.ariserc.json` or `./.ariserc` (Current Directory)
3. `<repoRoot>/.ariserc.json` (Repository Root)
4. `~/.config/arise/config.js` (User Global Config)
5. `~/.ariserc.json` (User Home Directory)

---

## Configuration Schema & Options

### `multiplexer` (string)
The terminal multiplexer backend to use (`'tmux'`, `'herdr'`, or `'auto'`).
- `'tmux'`: Uses native tmux session management (`tmux new-session`, `tmux split-window`).
- `'herdr'`: Uses Herdr workspace management (`herdr workspace create`, `herdr pane split`).
- `'auto'` (Default): Detects from active `$TMUX` / `$HERDR_ENV` environment or available binaries.

### `plugins` (array)
An array of plugins to load (`string` or `object`), e.g. `["worktree"]`. Built-in plugins include:
- `'worktree'`: Full Git worktree lifecycle management, branch creation, and safe teardown.

### `preset` (string)
The preset to use (`'default'`, custom preset name, or relative/absolute file path such as `'./presets/custom.js'`). When omitted, `arise` auto-detects user-defined presets from `~/.config/arise/presets/` and `.arise/presets/`, falling back to the un-opinionated `'default'` preset.

### `repo` (object)
- **`bareRepo`** (`string | null`): Path to bare repository (e.g. `'/path/to/bare/repo.git'`).
- **`worktreesBase`** (`string | null`): Base directory where worktrees are created (e.g. `'/path/to/worktrees'`).
- **`defaultBaseBranch`** (`string`): Base branch used when creating a new branch (e.g. `'develop'`, `'prod'`, `'main'`).
- **`protectedBranches`** (`string[]`): Array of branches protected against deletion during `--nuke` (defaults to `['main', 'master', 'develop', 'prod', 'staging', 'production']`).

### `workspace` (object)
- **`labelPrefix`** (`string`): String prepended to workspace / session labels (e.g. `'[BE] '`).
- **`agent`** (`string | object`): AI CLI agent to run in the designated agent quadrant (`'agy'`, `'claude'`, `'aider'`, `'copilot'`, `'none'`, or `{ cmd: 'claude', title: 'claude' }`). Can also be set via the `ARISE_AGENT` environment variable or `--agent` / `-a` CLI flag.
- **`defaultFocus`** (`string`): Default pane ID or title to focus upon creation (`'agent'`, `'agy'`, `'claude'`, `'vim'`, `'logs'`, `'server'`, `'shell'`).

### `layout` (array)
An array of pane definitions:
- **`id`** (`string`): Unique ID within this layout.
- **`title`** (`string`): Display label in the terminal multiplexer.
- **`cmd`** (`string | null`): Command executed upon startup.
- **`position`** (`'root'`): Set on the root pane.
- **`from`** (`string`): Parent pane ID to split from.
- **`split`** (`'right' | 'down'`): Direction to split.
- **`focus`** (`boolean`): Set `true` if this pane receives focus by default.
- **`isAgent`** (`boolean`): Set `true` to designate this pane as the AI CLI agent pane for automatic agent command overriding.

### `setup` (array of strings | string)
Shell command(s) executed in the workspace directory upon creating a newly provisioned workspace or worktree:
```json
"setup": [
  "cp .env.example .env",
  "npm install"
]
```

### `cleanup` (array of strings | string)
Shell command(s) executed in the workspace directory before removing or nuking a workspace:
```json
"cleanup": [
  "docker compose down -v"
]
```

### `scaffold` (object, optional/legacy)
- **`envSource`** (`string | null`): Path to environment file (.env) to copy into the new worktree.
- **`symlink`** (`string | null`): Path to web server symlink to point to the active worktree (e.g. `'/var/www/my-app'`).
- **`install`** (`string | boolean | null`): Command executed upon creation to install dependencies (e.g. `'npm install --legacy-peer-deps'`, `'pnpm install'`, `'composer install --no-interaction'`). Set to `false` or `null` to skip dependency installation.

---

## Example: `.ariserc.json`

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
  ]
}
```

---

## Subcommands

| Subcommand | Aliases | Description |
|---|---|---|
| `arise worktree list` | `arise wt ls`, `arise wt` | List active Git worktrees and multiplexer session status |
| `arise worktree create <branch>` | `arise wt create`, `arise wt new` | Create Git worktree, run setup commands, and boot session |
| `arise worktree switch [<branch>]` | `arise wt switch`, `arise wt open` | Switch / open existing worktree in session (interactive if omitted) |
| `arise worktree nuke [<branch>]` | `arise wt rm`, `arise wt delete` | Safely run cleanup commands, close session, remove worktree, and delete branches |
| `arise sessions` | `arise --sessions` | List active multiplexer sessions |
| `arise kill [<session>]` | `arise --kill` | Close active or specified session |


---

## CLI Flags Reference

| Flag | Aliases | Description |
|---|---|---|
| *(none)* | | Running `arise` with zero arguments launches the interactive TUI menu |
| `init [preset]` | `--init` | Run the interactive setup wizard or preset creator (`arise init preset`) |
| `preset new` | | Walk through creating a reusable preset (global or local) |
| `--quick` | `-q` | (Wizard option) Fast-path setup with detected repo defaults |
| `--target <path>` | `--out <path>` | (Wizard option) Custom destination path for generated configuration |
| `--gitignore` | | (Wizard option) Add generated configuration file to `.gitignore` |
| `--no-gitignore` | | (Wizard option) Do not add generated configuration file to `.gitignore` |
| `--interactive` | `-I`, `--menu` | Explicitly launch interactive prompt/menu |
| `--mux <driver>` | `-m`, `--multiplexer` | Terminal multiplexer driver (`'tmux'`, `'herdr'`, or `'auto'`) |
| `--session <name>` | `-w`, `--name` | Custom session / workspace name |
| `--dir <path>` | `-C <path>` | Target directory to bootstrap session inside |
| `--no-attach` | | Create session and render layout without attaching to it |
| `--kill [<target>]` | `-k`, `--close` | Close / kill active or specified terminal session |
| `--sessions` | `--list-sessions` | List all active terminal sessions across current multiplexer |
| `--branch <name>` | `-b <name>` | Git branch to create or boot into (via worktree plugin) |
| `--dirname <dir>` | `-d <dir>` | Directory name for the worktree (defaults to sanitized branch) |
| `--source <branch>` | `-s`, `--base` | Base source branch for new branch creation |
| `--preset <name>` | `-p <name>` | Override project preset ('default' or custom preset name) |
| `--agent <name>` | `-a <name>` | AI CLI agent (`agy`, `claude`, `aider`, `copilot`, `none`) |
| `--focus <pane>` | `-f <pane>` | Focus target pane |
| `--nuke [<target>]` | `-n`, `--cleanup`, `-c` | Safe teardown: closes session, removes worktree, deletes branches |
| `--dir-only` | `--keep-branch` | Only remove worktree directory; preserve branches |
| `--keep-remote` | `--local-only` | Delete local branch, preserve remote on origin |
| `--force` | `-f` | Force worktree deletion if uncommitted changes exist |
| `--install-skill` | `-i` | Install agent skills (`--global` or `--local`) |
| `--yes` | `-y` | Auto-confirm interactive prompts |
| `--debug` | | Enable verbose debug logging to stderr and log file (`~/.config/arise/logs/arise.log`) |
| `--verbose` | `-V` | Alias for `--debug` |
| `--help` | `-h` | Show help and usage |
| `--version` | `-v` | Show version |
