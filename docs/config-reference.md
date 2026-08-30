# Configuration File Reference (`.ariserc.json` / `arise.config.js` / `.worktreerc.json`)

`arise` allows project-level and user-level configuration files to override preset defaults, topology paths, and terminal layouts.

---

## File Resolution Order

1. `./.ariserc.js` or `./arise.config.js` (Current Directory)
2. `./.ariserc.json` or `./.ariserc` (Current Directory)
3. `./.worktreerc.js` or `./worktree.config.js` (Current Directory fallback)
4. `./.worktreerc.json` or `./.worktreerc` (Current Directory fallback)
5. `<repoRoot>/.ariserc.json` / `<repoRoot>/.worktreerc.json` (Repository Root)
6. `~/.config/arise/config.js` (User Global Config)
7. `~/.config/herdr-worktree/config.js` (User Global Config fallback)
8. `~/.ariserc.json` / `~/.worktreerc.json` (User Home Directory)

---

## Configuration Schema & Options

### `preset` (string)
The preset to use (`'node'`, `'laravel'`, `'generic'`, etc.). When omitted, `arise` auto-detects the preset from file markers.

### `repo` (object)
- **`bareRepo`** (`string | null`): Path to bare repository (e.g. `'/path/to/bare/repo.git'`).
- **`worktreesBase`** (`string | null`): Base directory where worktrees are created (e.g. `'/path/to/worktrees'`).
- **`defaultBaseBranch`** (`string`): Base branch used when creating a new branch (e.g. `'develop'`, `'prod'`, `'main'`).
- **`protectedBranches`** (`string[]`): Array of branches protected against deletion during `--nuke` (defaults to `['main', 'master', 'develop', 'prod', 'staging', 'production']`).

### `workspace` (object)
- **`labelPrefix`** (`string`): String prepended to Herdr workspace labels (e.g. `'[BE] '`).
- **`agent`** (`string | object`): AI CLI agent to run in the designated agent quadrant (`'agy'`, `'claude'`, `'aider'`, `'copilot'`, `'none'`, or `{ cmd: 'claude', title: 'claude' }`). Can also be set via the `ARISE_AGENT` environment variable or `--agent` / `-a` CLI flag.
- **`defaultFocus`** (`string`): Default pane ID or title to focus upon creation (`'agent'`, `'agy'`, `'claude'`, `'vim'`, `'logs'`, `'server'`, `'shell'`).

### `layout` (array)
An array of pane definitions:
- **`id`** (`string`): Unique ID within this layout.
- **`title`** (`string`): Display label in Herdr.
- **`cmd`** (`string | null`): Command executed upon startup.
- **`position`** (`'root'`): Set on the root pane.
- **`from`** (`string`): Parent pane ID to split from.
- **`split`** (`'right' | 'down'`): Direction to split.
- **`focus`** (`boolean`): Set `true` if this pane receives focus by default.
- **`isAgent`** (`boolean`): Set `true` to designate this pane as the AI CLI agent pane for automatic agent command overriding.

### `scaffold` (object)
- **`envSource`** (`string | null`): Path to environment file (.env) to copy into the new worktree.
- **`symlink`** (`string | null`): Path to web server symlink to point to the active worktree (e.g. `'/var/www/my-app'`).
- **`install`** (`string | boolean | null`): Command executed upon creation to install dependencies (e.g. `'npm install --legacy-peer-deps'`, `'pnpm install'`, `'composer install --no-interaction'`). Set to `false` or `null` to skip dependency installation.

---

## Example: `.worktreerc.json`

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
    "symlink": "/var/www/my-app",
    "install": "composer install --no-interaction"
  }
}
```

---

## CLI Flags Reference

| Flag | Aliases | Description |
|---|---|---|
| *(none)* | | Running `arise` with zero arguments launches the interactive TUI menu |
| `init` | `--init` | Run the interactive Arise configuration initialization wizard (`.ariserc.json`) |
| `--quick` | `-q` | (Wizard option) Fast-path setup with detected repo defaults |
| `--target <path>` | `--out <path>` | (Wizard option) Custom destination path for generated configuration |
| `--interactive` | `-I`, `--menu` | Explicitly launch interactive prompt/menu |
| `--branch <name>` | `-b <name>` | Git branch to create or boot into |
| `--dirname <dir>` | `-d <dir>` | Directory name for the worktree (defaults to sanitized branch) |
| `--workspace <name>` | `-w <name>` | Custom Herdr workspace name |
| `--source <branch>` | `-s`, `--base` | Base source branch for new branch creation |
| `--preset <name>` | `-p <name>` | Override project preset (`node`, `laravel`, `generic`) |
| `--agent <name>` | `-a <name>` | AI CLI agent (`agy`, `claude`, `aider`, `copilot`, `none`) |
| `--focus <pane>` | `-f <pane>` | Focus target pane |
| `--nuke [<target>]` | `-n`, `--cleanup`, `-c` | Safe teardown: closes Herdr workspace, removes worktree, deletes branches |
| `--dir-only` | `--keep-branch` | Only remove worktree directory; preserve branches |
| `--keep-remote` | `--local-only` | Delete local branch, preserve remote on origin |
| `--force` | `-f` | Force worktree deletion if uncommitted changes exist |
| `--install-skill` | `-i` | Install agent skills (`--global` or `--local`) |
| `--yes` | `-y` | Auto-confirm interactive prompts |
| `--debug` | | Enable verbose debug logging to stderr and log file (`~/.config/arise/logs/arise.log`) |
| `--verbose` | `-V` | Alias for `--debug` |
| `--help` | `-h` | Show help and usage |
| `--version` | `-v` | Show version |

