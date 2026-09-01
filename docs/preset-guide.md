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

  // 6. Scaffolding and lifecycle hooks
  hooks: {
    async onScaffold(ctx) {
      // Copy .env from root if available
      ctx.copyFromRoot('.env', '.env');

      // Fetch or build dependencies
      ctx.exec('cargo check');
    },

    async onPreNuke(ctx) {
      // Optional cleanup before worktree removal
    },
  },
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

## Contributing Built-in Presets

To add a new first-class preset directly into the Arise repository:

1. Add your preset file to `presets/<name>.js`.
2. Open `presets/index.js` and register it in `builtInPresets`:
   ```javascript
   const rustPreset = require('./rust');

   const builtInPresets = [
     laravelPreset,
     nodePreset,
     rustPreset,
     genericPreset,
   ];
   ```
3. Add alias lookup in `getPreset(name)`:
   ```javascript
   if (normalized === 'rust' || normalized === 'rs' || normalized === 'cargo') {
     return rustPreset;
   }
   ```
4. Run test suite: `npm test`.
