const fs = require('fs');
const path = require('path');
const os = require('os');
const nodePreset = require('./node');
const laravelPreset = require('./laravel');
const genericPreset = require('./generic');

const builtInPresets = [
  laravelPreset, // Check Laravel/PHP before generic
  nodePreset,    // Check Node before generic
  genericPreset, // Catch-all fallback
];

/**
 * Returns list of directories to search for custom presets.
 * @param {string[]} searchDirs
 * @returns {string[]}
 */
function getPresetSearchDirectories(searchDirs = []) {
  const dirs = [];

  const addDir = (d) => {
    if (d && typeof d === 'string') {
      const resolved = path.resolve(d);
      if (!dirs.includes(resolved) && fs.existsSync(resolved)) {
        dirs.push(resolved);
      }
    }
  };

  // 1. Check passed search directories (e.g. worktree path, repo root, cwd)
  for (const base of searchDirs) {
    if (!base) continue;
    addDir(path.join(base, '.arise', 'presets'));
    addDir(path.join(base, '.ariserc', 'presets'));
    addDir(path.join(base, 'presets'));
  }

  // 2. User home config directories
  const homeDir = os.homedir();
  addDir(path.join(homeDir, '.config', 'arise', 'presets'));
  addDir(path.join(homeDir, '.config', 'herdr-worktree', 'presets'));
  addDir(path.join(homeDir, '.arise', 'presets'));

  return dirs;
}

/**
 * Safely loads and normalizes a preset from a file path.
 * @param {string} filePath
 * @returns {import('../types').Preset | null}
 */
function loadPresetFromFile(filePath) {
  if (!filePath) return null;
  let resolvedPath = filePath;
  if (filePath.startsWith('~')) {
    resolvedPath = path.join(os.homedir(), filePath.slice(1));
  }
  resolvedPath = path.resolve(resolvedPath);

  if (!fs.existsSync(resolvedPath)) {
    return null;
  }

  // If path is a directory, check for index.js
  if (fs.statSync(resolvedPath).isDirectory()) {
    const indexPath = path.join(resolvedPath, 'index.js');
    if (fs.existsSync(indexPath)) {
      resolvedPath = indexPath;
    } else {
      return null;
    }
  }

  try {
    const raw = require(resolvedPath);
    const preset = typeof raw === 'function' ? raw() : raw;
    if (!preset || typeof preset !== 'object') return null;

    const baseName = path.basename(resolvedPath, path.extname(resolvedPath));
    const normalizedName = preset.name || (baseName === 'index' ? path.basename(path.dirname(resolvedPath)) : baseName);

    return {
      ...preset,
      name: normalizedName,
      sourcePath: resolvedPath,
      isCustom: true,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Discovers and loads all custom presets found in search directories.
 * @param {string[]} searchDirs
 * @returns {import('../types').Preset[]}
 */
function loadCustomPresets(searchDirs = []) {
  const presetDirs = getPresetSearchDirectories(searchDirs);
  const customPresets = [];
  const seenNames = new Set();

  for (const dir of presetDirs) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      let preset = null;

      if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.cjs'))) {
        preset = loadPresetFromFile(fullPath);
      } else if (entry.isDirectory()) {
        preset = loadPresetFromFile(fullPath);
      }

      if (preset && preset.name && !seenNames.has(preset.name.toLowerCase())) {
        seenNames.add(preset.name.toLowerCase());
        customPresets.push(preset);
      }
    }
  }

  return customPresets;
}

/**
 * Retrieves a preset by name, alias, or file path.
 * @param {string} name
 * @param {string[]} searchDirs
 * @returns {import('../types').Preset | null}
 */
function getPreset(name, searchDirs = []) {
  if (!name || typeof name !== 'string') return null;
  const raw = name.trim();

  // 1. Direct file path or module path
  if (
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    raw.startsWith('/') ||
    raw.startsWith('~') ||
    raw.endsWith('.js') ||
    raw.endsWith('.cjs')
  ) {
    return loadPresetFromFile(raw);
  }

  const normalized = raw.toLowerCase();

  // 2. Built-in Preset Aliases
  if (normalized === 'php' || normalized === 'laravel' || normalized === 'api' || normalized === 'be') {
    return laravelPreset;
  }
  if (normalized === 'node' || normalized === 'js' || normalized === 'ts' || normalized === 'fe' || normalized === 'react') {
    return nodePreset;
  }
  if (normalized === 'generic' || normalized === 'default') {
    return genericPreset;
  }

  // 3. Custom Presets in Search Directories
  const customPresets = loadCustomPresets(searchDirs);
  const foundCustom = customPresets.find(
    (p) => p.name && p.name.toLowerCase() === normalized
  );
  if (foundCustom) {
    return foundCustom;
  }

  // 4. Try loading as an installed npm package (e.g. arise-preset-python or @org/arise-preset)
  const candidateModuleNames = [
    raw,
    `arise-preset-${raw}`,
    `@arise/preset-${raw}`,
  ];

  for (const modName of candidateModuleNames) {
    try {
      const mod = require(modName);
      const preset = typeof mod === 'function' ? mod() : mod;
      if (preset && typeof preset !== 'object') continue;
      if (preset) {
        return {
          ...preset,
          name: preset.name || raw,
          isCustom: true,
        };
      }
    } catch {}
  }

  return null;
}

/**
 * Detects the appropriate preset for a directory.
 * Custom presets take priority if their detect() matches.
 * @param {string} cwd
 * @param {string[]} searchDirs
 * @returns {import('../types').Preset}
 */
function detectPreset(cwd = process.cwd(), searchDirs = []) {
  const allSearchDirs = [cwd, ...searchDirs];
  const customPresets = loadCustomPresets(allSearchDirs);

  // 1. Check custom presets first
  for (const preset of customPresets) {
    if (typeof preset.detect === 'function') {
      try {
        if (preset.detect(cwd)) {
          return preset;
        }
      } catch {}
    }
  }

  // 2. Check built-in presets
  for (const preset of builtInPresets) {
    if (typeof preset.detect === 'function') {
      try {
        if (preset.detect(cwd)) {
          return preset;
        }
      } catch {}
    }
  }

  // 3. Fallback to generic
  return genericPreset;
}

/**
 * Returns a list of all available presets (built-ins + discovered custom presets).
 * @param {string[]} searchDirs
 * @returns {Array<{ name: string, label: string, isCustom: boolean, preset: import('../types').Preset }>}
 */
function listPresets(searchDirs = []) {
  const list = [
    { name: 'node', label: '✨ Node.js (node)', isCustom: false, preset: nodePreset },
    { name: 'laravel', label: '🐘 Laravel / PHP (laravel)', isCustom: false, preset: laravelPreset },
    { name: 'generic', label: '📦 Generic (generic)', isCustom: false, preset: genericPreset },
  ];

  const customPresets = loadCustomPresets(searchDirs);
  for (const cp of customPresets) {
    if (!list.some((item) => item.name.toLowerCase() === cp.name.toLowerCase())) {
      const icon = cp.icon || cp.emoji || '🧩';
      list.push({
        name: cp.name,
        label: `${icon} ${cp.name}`,
        isCustom: true,
        preset: cp,
      });
    }
  }

  return list;
}

module.exports = {
  getPreset,
  detectPreset,
  loadPresetFromFile,
  loadCustomPresets,
  getPresetSearchDirectories,
  listPresets,
  builtInPresets,
};
