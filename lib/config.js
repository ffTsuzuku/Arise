const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPreset, detectPreset } = require('../presets');
const git = require('./git');

function findConfigFile(searchDirs = []) {
  const configNames = [
    '.worktreerc.js',
    'worktree.config.js',
    '.worktreerc.json',
    '.worktreerc',
  ];

  for (const dir of searchDirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const name of configNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  // Check home directory
  const homeConfigDir = path.join(os.homedir(), '.config', 'herdr-worktree');
  for (const name of configNames) {
    const fullPath = path.join(homeConfigDir, name);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  const homeRc = path.join(os.homedir(), '.worktreerc.json');
  if (fs.existsSync(homeRc)) {
    return homeRc;
  }

  return null;
}

function loadConfigFile(filePath) {
  if (!filePath) return {};
  try {
    if (filePath.endsWith('.json') || filePath.endsWith('.worktreerc')) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } else {
      return require(path.resolve(filePath));
    }
  } catch (err) {
    console.warn(`Warning: Failed to load config from "${filePath}": ${err.message}`);
    return {};
  }
}

function resolveConfiguration(flags = {}, cwd = process.cwd()) {
  const repoRoot = git.getRepoRootDir(cwd);
  const configFile = findConfigFile([cwd, repoRoot]);
  const fileConfig = loadConfigFile(configFile);

  // 1. Resolve Preset
  let presetName = flags.presetName || fileConfig.preset;
  let preset = null;
  if (presetName) {
    preset = getPreset(presetName);
  }
  if (!preset) {
    preset = detectPreset(cwd);
  }

  // 2. Merge Repo Settings
  const repoConfig = {
    bareRepo: (fileConfig.repo && fileConfig.repo.bareRepo) || (preset.repo && preset.repo.bareRepo) || null,
    worktreesBase: (fileConfig.repo && fileConfig.repo.worktreesBase) || (preset.repo && preset.repo.worktreesBase) || null,
    defaultBaseBranch: (fileConfig.repo && fileConfig.repo.defaultBaseBranch) || (preset.repo && preset.repo.defaultBaseBranch) || 'develop',
    protectedBranches: (fileConfig.repo && fileConfig.repo.protectedBranches) || (preset.repo && preset.repo.protectedBranches) || ['main', 'master', 'develop', 'prod', 'staging'],
  };

  // 3. Merge Workspace Settings
  const workspaceConfig = {
    labelPrefix: (fileConfig.workspace && fileConfig.workspace.labelPrefix !== undefined)
      ? fileConfig.workspace.labelPrefix
      : (preset.workspace && preset.workspace.labelPrefix !== undefined ? preset.workspace.labelPrefix : ''),
    defaultFocus: (fileConfig.workspace && fileConfig.workspace.defaultFocus)
      || (preset.workspace && preset.workspace.defaultFocus)
      || 'agy',
  };

  // 4. Merge Layout
  const layout = fileConfig.layout || preset.layout || [];

  // 5. Merge Scaffolding Settings
  const scaffoldConfig = {
    ...(preset.scaffold || {}),
    ...(fileConfig.scaffold || {}),
  };

  // 6. Merge Hooks
  const hooks = {
    ...(preset.hooks || {}),
    ...(fileConfig.hooks || {}),
  };

  return {
    preset,
    repo: repoConfig,
    workspace: workspaceConfig,
    layout,
    scaffold: scaffoldConfig,
    hooks,
    configFile,
  };
}

module.exports = {
  findConfigFile,
  loadConfigFile,
  resolveConfiguration,
};
