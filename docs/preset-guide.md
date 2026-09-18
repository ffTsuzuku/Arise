# Preset Authoring Guide

This guide describes how to build, test, and register custom language and framework presets for `arise`.

---

## Anatomy of a Preset

A preset is a CommonJS module exporting a JavaScript object conforming to the `Preset` interface in `types.d.ts`:

```javascript
const fs = require('fs');
const path = require('path');

module.exports = {
  // 1. Preset identification
  name: 'rust',

  // 2. Auto-detection rule
  detect(cwd) {
    return fs.existsSync(path.join(cwd, 'Cargo.toml'));
  },

  // 3. Repository defaults
  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'staging', 'production'],
  },

  // 4. Workspace defaults
  workspace: {
    labelPrefix: '',
    defaultFocus: 'agy',
  },

  // 5. Declarative terminal layout
  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'watch', title: 'cargo watch', cmd: 'cargo watch -x check', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'watch', focus: true, isAgent: true },
  ],

  // 6. Setup and cleanup shell commands
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
* **Auto-Detection**: If `detect(cwd)` matches, the custom preset takes priority over built-in presets.
* **Explicit Usage**: In `.ariserc.json`, set `"preset": "django"`, or run `arise --preset django`.

### 2. User-Wide Global Presets (`~/.config/arise/presets/`)
To share custom presets across all projects on your machine:
```
~/.config/arise/
└── presets/
    ├── python.js
    ├── go.js
    └── rails.js
```
* Custom presets saved here are available in all repositories and listed in `arise --init`.

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

---

## Creating Presets with the Interactive Wizard

The easiest way to create a reusable preset is using the built-in wizard:

```bash
# Launch the preset creation walkthrough
arise init preset
# Or:
arise preset new
```

The wizard will guide you through:
1. **Preset Name & Icon**: E.g. `fastapi` with ⚡ or `rust` with 🦀.
2. **Storage Scope**:
   - **Global (`~/.config/arise/presets/`)**: Available across every repository and project on your machine.
   - **Local (`.arise/presets/`)**: Committed inside your repository to share with teammates.
3. **Auto-Detection File Marker**: Optional marker file (e.g. `Cargo.toml`, `go.mod`, `manage.py`, `package.json`).
4. **Workspace Setup Commands**: Array of commands run on fresh workspaces (e.g. `cargo build`, `cp .env.example .env`).
5. **Workspace Cleanup Commands**: Array of commands run on workspace deletion (e.g. `cargo clean`, `docker compose down`).
6. **Layout Templates**: Choose between 4-pane quadrant, 3-pane split, or 2-pane minimal layout and configure commands.

---

## Fallback Default Preset

When no preset matches or is specified, Arise uses the un-opinionated `default` preset:
- Root pane: Blank interactive shell / editor.
- Secondary pane: Shell.
- Agent pane: Antigravity AI (`agy`).
- Setup & Cleanup: Empty (`[]`).
