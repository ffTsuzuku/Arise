# Configuration File Reference (`.ariserc.json` / `arise.config.js`)

`arise` allows project-level and user-level configuration files to override multiplexer driver, plugins, preset defaults, topology paths, and terminal layouts.

---

## Interactive Configuration

Run `arise` and choose **Configure** (`c`), or run `arise init` directly. New configurations ask for a preset, then open a review screen. Existing JSON configurations open directly in review. Save immediately or edit individual settings; choosing a preset or changing a prefix never requires creating a new layout.

Repository setup defaults to the current checkout/worktree, including outside Git. Use `arise init --global` for user defaults, or `--target <path>` for an explicit JSON destination. Only settings you override are written, so a config containing only `preset` follows future changes to that preset. When changing presets, you can keep existing overrides or use the new preset's settings; unrelated plugins, Git settings, and the session prefix are preserved.

The layout editor starts with the current panes and supports individual command, title, ID, parent, direction, agent-role, and focus changes. **Use preset layout** restores inheritance. Lifecycle commands are complete strings edited one at a time; commas are never treated as separators. Escape returns from a field or editor; Escape on the review screen discards the configuration draft. Config and optional `.gitignore` changes happen only on **Save configuration**. Preset creation has its own separate save action.

`--quick` skips review and saves the selected/detected preset reference plus explicit options. Existing files require `--force` or an interactive confirmation, and their unrelated settings are retained. Malformed JSON is not replaced; executable JavaScript configs remain editable in their source file so hooks are not lost. A file changed externally while the review screen is open must be reloaded before saving.

The interface responds to terminal resizing, compacts its header in smaller windows, and scrolls long lists. `NO_COLOR` disables the palette; `TERM=dumb` and redirected input/output use prompt defaults; the main menu prints command guidance and exits. These are terminal environment settings, not `.ariserc.json` options.

## File Resolution Order

Arise checks these directories in order, using `.ariserc.js`, `arise.config.js`, `.ariserc.json`, then `.ariserc` within each:

1. Explicit worktree directory or branch selected with `--dirname` / `--branch`
2. Current directory, then its checkout/worktree root
3. Caller directory and its checkout/worktree root, when different
4. Common repository root (and the parent of a bare repository)
5. Other worktrees, preferring primary branches such as `main`
6. `~/.config/arise/`

Finally, Arise checks `~/.ariserc.json`. The first matching file wins. Setup edits the current checkout's config by default; `--global` explicitly selects `~/.config/arise/`.

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
Saved relative preset paths resolve from the configuration file; CLI `--preset` paths resolve from the invocation directory. Omitted layout, workspace, setup, and cleanup settings inherit from the preset.

The preset to use (`'default'`, custom preset name, or relative/absolute file path such as `'./presets/custom.js'`). When omitted, `arise` auto-detects user-defined presets from `~/.config/arise/presets/` and `.arise/presets/`, falling back to the un-opinionated `'default'` preset.

### `repo` (object)
- **`bareRepo`** (`string | null`): Path to bare repository (e.g. `'/path/to/bare/repo.git'`).
- **`worktreesBase`** (`string | null`): Base directory where worktrees are created (e.g. `'/path/to/worktrees'`).
- **`defaultBaseBranch`** (`string`): Base branch used when creating a new branch (e.g. `'develop'`, `'prod'`, `'main'`).
- **`protectedBranches`** (`string[]`): Array of branches protected against deletion during `--nuke` (defaults to `['main', 'master', 'develop', 'prod', 'staging', 'production']`).

### `workspace` (object)
- **`labelPrefix`** (`string`): String prepended to workspace/session labels (e.g. `'[BE] '`). This only affects names; it does not change panes, commands, or focus. An empty string removes the prefix.
- **`agent`** (`string | object | null`): Explicit command override for panes marked as agents (`'codex'`, `'agy'`, `'claude'`, `'aider'`, `'copilot'`, `'none'`, or `{ cmd: 'claude', title: 'claude' }`). Omit it to preserve preset commands, or pane commands in an explicit custom layout. `null` and `'none'` open an empty shell. `ARISE_AGENT` and `--agent` / `-a` take precedence.
- **`defaultFocus`** (`string`): Default pane ID or title to focus upon creation (`'agent'`, `'agy'`, `'claude'`, `'vim'`, `'logs'`, `'server'`, `'shell'`).

### `layout` (array)
An optional array replacing the preset's entire layout. Omit it to inherit; prefix-only changes do not need a layout override. Agent commands within a custom layout are preserved unless `workspace.agent`, `ARISE_AGENT`, or `--agent` explicitly overrides them. The setup editor rejects duplicate pane IDs and splits from missing/later panes. Pane definitions:
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
| `--quick` | `-q` | (Wizard option) Skip review and save the selected/detected preset plus explicit overrides |
| `--global` | | (Wizard option) Edit global configuration or store a preset globally |
| `--local` | | (Wizard option, default) Edit the current checkout/worktree or store a preset locally |
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
| `--preset <name>` | `-p <name>` | Override project preset; with `init`, select the initial preset without asking again |
| `--agent <name>` | `-a <name>` | AI CLI agent (`agy`, `claude`, `aider`, `copilot`, `none`) |
| `--focus <pane>` | `-f <pane>` | Focus target pane |
| `--nuke [<target>]` | `-n`, `--cleanup`, `-c` | Safe teardown: closes session, removes worktree, deletes branches |
| `--dir-only` | `--keep-branch` | Only remove worktree directory; preserve branches |
| `--keep-remote` | `--local-only` | Delete local branch, preserve remote on origin |
| `--force` | `-f` | Force worktree deletion; with `init --quick`, allow saving an existing config while retaining unrelated settings |
| `--install-skill` | `-i` | Install agent skills (`--global` or `--local`) |
| `--yes` | `-y` | Auto-confirm interactive prompts |
| `--debug` | | Enable verbose debug logging to stderr and log file (`~/.config/arise/logs/arise.log`) |
| `--verbose` | `-V` | Alias for `--debug` |
| `--help` | `-h` | Show help and usage |
| `--version` | `-v` | Show version |
