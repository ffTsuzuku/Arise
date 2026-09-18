const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { mkdir, writeFile, rename, unlink } = require('fs/promises');
const git = require('../git');
const { getPreset, detectPreset } = require('../../presets');
const { loadConfigFile, mergePresetConfiguration } = require('../config');

const CONFIG_NAMES = ['.ariserc.js', 'arise.config.js', '.ariserc.json', '.ariserc'];
const clone = (value) => structuredClone(value);
const commands = (value) => typeof value === 'string' ? [value] : Array.isArray(value) ? [...value] : [];

function projectDirectory(cwd) {
  // A linked worktree owns its config; never redirect edits to the common .git directory.
  return git.getWorkingTreeRoot(cwd) || cwd;
}

function findTarget(directory) {
  return CONFIG_NAMES.map((name) => path.join(directory, name)).find((file) => fs.existsSync(file)) || path.join(directory, '.ariserc.json');
}

function resolvePreset(reference, directory, searchDirs) {
  if (!reference || typeof reference !== 'string') return null;
  const relativeFile = reference.startsWith('./') || reference.startsWith('../') || /\.(c?js)$/.test(reference);
  return getPreset(relativeFile && !path.isAbsolute(reference) && !reference.startsWith('~')
    ? path.resolve(directory, reference) : reference, searchDirs);
}

function validateLayout(layout) {
  if (!Array.isArray(layout) || !layout.length) return 'Add at least one pane.';
  const ids = new Set();
  for (let i = 0; i < layout.length; i++) {
    const pane = layout[i];
    if (!pane || typeof pane.id !== 'string' || !pane.id.trim()) return 'Every pane needs an ID.';
    if (ids.has(pane.id)) return `Pane ID "${pane.id}" is used more than once.`;
    if (typeof pane.title !== 'string' || !pane.title.trim()) return `Give pane "${pane.id}" a title.`;
    if (pane.cmd != null && typeof pane.cmd !== 'string') return `The command for "${pane.id}" must be text.`;
    if (i === 0) {
      if (pane.from) return 'The first pane must be the root pane.';
    } else {
      if (pane.position === 'root' || !ids.has(pane.from)) return `Pane "${pane.id}" must split from an earlier pane.`;
      if (!['right', 'down'].includes(pane.split)) return `Choose a split direction for "${pane.id}".`;
    }
    ids.add(pane.id);
  }
  return null;
}

function presetNameError(name) {
  return /^[a-z0-9][a-z0-9_-]*$/.test(name) ? null : 'Use lowercase letters, numbers, hyphens, or underscores; start with a letter or number.';
}

async function writeDraft(file, content, original) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current !== original) throw new Error(`"${file}" changed while setup was open. Reopen setup to load the latest version.`);
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o644;
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode });
    const latest = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (latest !== original) throw new Error(`"${file}" changed before saving. Reopen setup to load the latest version.`);
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

class ConfigurationDraft {
  constructor(options = {}) {
    this.cwd = path.resolve(options.cwd || process.cwd());
    this.projectDir = projectDirectory(this.cwd);
    this.global = Boolean(options.global);
    const directory = this.global ? path.join(os.homedir(), '.config', 'arise') : this.projectDir;
    this.target = options.targetPath ? path.resolve(this.cwd, options.targetPath) : findTarget(directory);
    if (/\.(c?js)$/.test(this.target)) {
      throw new Error(`"${this.target}" is an executable configuration. Edit it directly; setup preserves JavaScript hooks and will not replace it with JSON.`);
    }
    this.original = fs.existsSync(this.target) ? fs.readFileSync(this.target, 'utf8') : null;
    this.data = this.original === null ? {} : loadConfigFile(this.target, { strict: true });
    if (!this.data || typeof this.data !== 'object' || Array.isArray(this.data)) throw new Error('Configuration must be a JSON object.');
    this.data = clone(this.data);
    this.searchDirs = [path.dirname(this.target), this.projectDir, this.cwd];
    this.reference = options.presetName || this.data.preset || detectPreset(this.projectDir, this.searchDirs).name;
    this.preset = resolvePreset(this.reference, options.presetName ? this.cwd : path.dirname(this.target), this.searchDirs);
    if (options.presetName && this.preset?.sourcePath && !path.isAbsolute(this.reference) && !this.reference.startsWith('~') &&
        (this.reference.startsWith('./') || this.reference.startsWith('../') || /\.(c?js)$/.test(this.reference))) {
      const relative = path.relative(path.dirname(this.target), this.preset.sourcePath).split(path.sep).join('/');
      this.reference = relative.startsWith('../') ? relative : `./${relative}`;
    }
    if (this.global && this.preset?.sourcePath) this.reference = this.preset.sourcePath;
    this.data.preset = this.reference;
    this.gitignore = options.gitignore ?? options.addToGitignore ?? false;
    if (options.multiplexer) this.data.multiplexer = options.multiplexer;
    if (options.labelPrefix !== undefined) this.setWorkspace('labelPrefix', options.labelPrefix);
    if (options.agent !== undefined) this.setWorkspace('agent', options.agent);
    if (options.focusTarget) this.setWorkspace('defaultFocus', options.focusTarget);
    if (options.layout) this.data.layout = clone(options.layout);
    if (options.setup !== undefined) this.data.setup = commands(options.setup);
    if (options.cleanup !== undefined) this.data.cleanup = commands(options.cleanup);
  }

  effective() {
    const repoRoot = git.getRepoRootDir(this.projectDir);
    return mergePresetConfiguration(this.data, this.preset || getPreset('default'), {}, {
      cwd: this.projectDir, repoRoot, isBare: git.isBareRepo(repoRoot), configFile: this.target,
    });
  }

  setWorkspace(key, value) {
    this.data.workspace ||= {};
    if (value === undefined) delete this.data.workspace[key];
    else this.data.workspace[key] = value;
    if (!Object.keys(this.data.workspace).length) delete this.data.workspace;
  }

  hasPresetOverrides() {
    return ['layout', 'setup', 'cleanup'].some((key) => Object.hasOwn(this.data, key)) ||
      ['agent', 'defaultFocus'].some((key) => Object.hasOwn(this.data.workspace || {}, key));
  }

  usePreset(reference, reset = false) {
    const preset = resolvePreset(reference, path.dirname(this.target), this.searchDirs);
    if (!preset) throw new Error(`Preset "${reference}" could not be loaded.`);
    // A global config must still resolve a project-local preset in other directories.
    if (this.global && preset.sourcePath) reference = preset.sourcePath;
    if (reset) {
      for (const key of ['layout', 'setup', 'cleanup']) delete this.data[key];
      this.setWorkspace('agent', undefined);
      this.setWorkspace('defaultFocus', undefined);
    }
    this.reference = reference;
    this.preset = preset;
    this.data.preset = reference;
  }

  validationError() {
    if (!this.preset) return `Preset "${this.reference}" is unavailable. Choose a preset before saving.`;
    const effective = this.effective();
    return validateLayout(effective.layout);
  }

  async save() {
    const error = this.validationError();
    if (error) throw new Error(error);
    const content = `// Arise ${this.global ? 'Global' : 'Local Repository'} Configuration\n// Values omitted here are inherited from the selected preset.\n${JSON.stringify(this.data, null, 2)}\n`;
    await writeDraft(this.target, content, this.original);
    this.original = content;
    return this.target;
  }
}

module.exports = { ConfigurationDraft, clone, commands, projectDirectory, findTarget, resolvePreset, validateLayout, presetNameError, writeDraft };
