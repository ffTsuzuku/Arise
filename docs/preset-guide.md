# Preset Authoring Guide

This guide describes how to build, test, and register custom language and framework presets for `arise`.

---

## Interactive Preset Builder

Run `arise init preset`, or choose **Configure → Preset → Create a reusable preset**. The preset builder is separate from repository configuration. Give the preset a name, choose a starting shape, edit any panes, and review before saving. Selecting an existing preset during repository setup reuses it directly and does not enter this builder. Use ↑/↓ and Enter to choose; Escape returns from an editor or cancels the unsaved preset from its review screen.

## Anatomy of a Preset

A preset is a CommonJS module exporting a JavaScript object conforming to the `Preset` interface in `types.d.ts`:

```javascript
module.exports = {
  // 1. Preset identification
  name: 'rust',
  icon: 'terminal',

  // 2. Repository defaults
  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'staging', 'production'],
  },

  // 3. Workspace defaults
  workspace: {
    labelPrefix: '',
    defaultFocus: 'agy',
  },

  // 4. Declarative terminal layout
  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'watch', title: 'cargo watch', cmd: 'cargo watch -x check', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'watch', focus: true, isAgent: true },
  ],

  // 5. Setup and cleanup shell commands
  setup: [
    'cargo check',
  ],
  cleanup: [
    'cargo clean',
  ],
};
```

---

## Where Custom Presets Are Stored

Arise dynamically discovers and loads custom presets from project-level directories, user-level global configuration, or explicit file paths without needing to modify Arise source code:

### 1. Project-Local Presets (`.arise/presets/`)
Place custom preset files directly in your repository:
```
my-project/
├── .arise/
│   └── presets/
│       ├── django.js
│       └── fast-api.js
├── .ariserc.json
└── ...
```
* **Auto-Discovery**: Any `.js` or `.cjs` file in `.arise/presets/` or `.ariserc/presets/` is automatically discovered.
* **Usage**: In `.ariserc.json`, set `"preset": "django"`, select it in `arise init`, or run `arise --preset django`.

### 2. User-Wide Global Presets (`~/.config/arise/presets/`)
To share custom presets across all projects on your machine:
```
~/.config/arise/
└── presets/
    ├── python.js
    ├── go.js
    └── rails.js
```
* Custom presets saved here are available in all repositories and listed in `arise init`.

### 3. Direct File Paths or NPM Packages
You can specify relative or absolute file paths, or installed npm preset packages:
```json
{
  "preset": "./custom/my-preset.js"
}
```
Or via CLI:
```bash
arise --branch feature/auth --preset ./custom/my-preset.js
```

---

## Creating Presets with the Interactive Wizard

The easiest way to create a reusable preset is using the built-in wizard:

```bash
# Launch the preset creation walkthrough
arise init preset
# Or:
arise preset new
```

1. **Name**: Use lowercase letters, numbers, hyphens, or underscores. `default` and `generic` are reserved.
2. **Starting shape**: One pane, two columns, two rows, three-pane side stack, four-pane grid, or build pane by pane from a single terminal. Templates start with empty commands.
3. **Pane editor**: Edit individual commands, titles, IDs, parents, and split directions. Add/remove panes and choose focus. Commands such as `codex` and `claude` are recognized as agents, and the role can be toggled explicitly.
4. **Review**: Change the name, layout, setup/cleanup commands, or storage location. Local (`.arise/presets/`) is the default; choose Global (`~/.config/arise/presets/`) or pass `--global` to share the preset across projects.
5. **Save**: Nothing is written until Save preset. Replacing an existing preset requires explicit confirmation (or `--force` for programmatic use). Commands are serialized as data, preserving quotes and commas.

Preset commands and titles are preserved at launch unless an explicit agent override applies. The builder stores commands on their panes without adding a redundant `workspace.agent` override, so several agent panes can use different commands.

---

## Fallback Default Preset

When no preset matches or is specified, Arise uses the un-opinionated `default` preset:
- Root pane: Blank interactive shell / editor.
- Secondary pane: Shell.
- Agent pane: Antigravity AI (`agy`).
- Setup & Cleanup: Empty (`[]`).
