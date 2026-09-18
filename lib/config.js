const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPreset, detectPreset } = require('../presets');
const git = require('./git');
const { paint } = require('./tui/theme');

function findConfigFile(searchDirs = []) {
  const configNames = [
    '.ariserc.js',
    'arise.config.js',
    '.ariserc.json',
    '.ariserc',
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

  // Check home directory ~/.config/arise
  const homeConfigDirs = [
    path.join(os.homedir(), '.config', 'arise'),
  ];
  for (const homeDir of homeConfigDirs) {
    for (const name of configNames) {
      const fullPath = path.join(homeDir, name);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  const homeRcFiles = [
    path.join(os.homedir(), '.ariserc.json'),
  ];
  for (const rcFile of homeRcFiles) {
    if (fs.existsSync(rcFile)) {
      return rcFile;
    }
  }

  return null;
}

function stripJsonComments(str) {
  // Walk strings rather than stripping URL fragments or shell syntax as comments.
  return str.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    (token) => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, ' ')).trim();
}

function loadConfigFile(filePath, { strict = false } = {}) {
  if (!filePath) return {};
  try {
    if (filePath.endsWith('.json') || filePath.endsWith('.ariserc')) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(stripJsonComments(content));
    } else {
      return require(path.resolve(filePath));
    }
  } catch (err) {
    if (strict) throw new Error(`Cannot read configuration "${filePath}": ${err.message}`);
    console.warn(paint(`Warning: Failed to load config from "${filePath}": ${err.message}`, 'danger'));
    return {};
  }
}

function resolveConfiguration(flags = {}, cwd = process.cwd(), callerCwd = null) {
  const repoRoot = git.getRepoRootDir(cwd) || (callerCwd ? git.getRepoRootDir(callerCwd) : null);
  const isBare = git.isBareRepo(repoRoot);
  const searchDirs = [];

  const addSearchDir = (dir) => {
    if (dir && !searchDirs.includes(dir)) {
      searchDirs.push(dir);
    }
  };

  let worktrees = [];
  if (repoRoot) {
    try {
      worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: isBare ? repoRoot : null });
    } catch (e) {}
  }

  // 1. Explicit directory if --dirname / -d is passed
  if (flags.dirname) {
    const resolvedDir = path.isAbsolute(flags.dirname)
      ? flags.dirname
      : path.resolve(repoRoot || cwd, flags.dirname);
    addSearchDir(resolvedDir);
  }

  // 2. Directory for the specified branch (--branch / -b)
  if (flags.branch) {
    const matchingWt = worktrees.find((wt) => wt.branch === flags.branch);
    if (matchingWt && matchingWt.path) {
      addSearchDir(matchingWt.path);
    }
    const branchDir = path.resolve(repoRoot || cwd, flags.branch.replace(/\//g, '-'));
    addSearchDir(branchDir);
  }

  // 3. Target working directory
  addSearchDir(cwd);
  addSearchDir(git.getWorkingTreeRoot(cwd));

  // 4. Fallback working directory (caller working directory)
  if (callerCwd) {
    addSearchDir(callerCwd);
    addSearchDir(git.getWorkingTreeRoot(callerCwd));
  }

  // 5. Repository root directory
  if (repoRoot) {
    addSearchDir(repoRoot);
    if (isBare) {
      addSearchDir(path.dirname(repoRoot));
    }
  }

  // 6. Fallback to existing worktrees (prioritizing primary branches like main, master, develop)
  const primaryBranches = ['main', 'master', 'develop', 'prod', 'staging'];
  const primaryWts = worktrees.filter((wt) => !wt.isBare && wt.branch && primaryBranches.includes(wt.branch));
  for (const wt of primaryWts) {
    if (wt.path) addSearchDir(wt.path);
  }
  for (const wt of worktrees) {
    if (wt.path && !wt.isBare) addSearchDir(wt.path);
  }

  const configFile = findConfigFile(searchDirs);
  const fileConfig = loadConfigFile(configFile);

  // 1. Resolve Preset
  let presetName = flags.presetName || fileConfig.preset;
  let preset = null;
  if (presetName) {
    const isRelativeFile = presetName.startsWith('./') || presetName.startsWith('../') || /\.(c?js)$/.test(presetName);
    const presetBase = flags.presetName ? cwd : configFile ? path.dirname(configFile) : cwd;
    preset = getPreset(isRelativeFile && !path.isAbsolute(presetName) && !presetName.startsWith('~') ? path.resolve(presetBase, presetName) : presetName, searchDirs);
  }
  if (!preset) {
    const detectDir = (configFile && path.dirname(configFile)) || cwd;
    preset = detectPreset(detectDir, searchDirs);
    if ((preset.name === 'default' || preset.name === 'generic') && detectDir !== cwd) {
      preset = detectPreset(cwd, searchDirs);
    }
  }

  return mergePresetConfiguration(fileConfig, preset, flags, { cwd, repoRoot, isBare, configFile });
}

// Used by runtime resolution and by the setup draft so previews match launches.
function mergePresetConfiguration(fileConfig, preset, flags = {}, {
  cwd = process.cwd(), repoRoot = null, isBare = false, configFile = null,
} = {}) {
  const fallback = getPreset('default');
  // 2. Merge Repo Settings
  const rawBareRepo = (fileConfig.repo && fileConfig.repo.bareRepo) || (preset.repo && preset.repo.bareRepo) || null;
  let resolvedBare = null;
  if (rawBareRepo) {
    const candidateBare = path.isAbsolute(rawBareRepo) ? rawBareRepo : path.resolve(repoRoot || cwd, rawBareRepo);
    if (fs.existsSync(candidateBare) && git.isBareRepo(candidateBare)) {
      resolvedBare = candidateBare;
    } else if (isBare && repoRoot) {
      resolvedBare = repoRoot;
    }
  } else if (isBare && repoRoot) {
    resolvedBare = repoRoot;
  }

  const rawWorktreesBase = (fileConfig.repo && fileConfig.repo.worktreesBase) || (preset.repo && preset.repo.worktreesBase) || null;
  let resolvedWorktreesBase = null;
  if (rawWorktreesBase) {
    if (!path.isAbsolute(rawWorktreesBase)) {
      resolvedWorktreesBase = path.resolve(repoRoot || cwd, rawWorktreesBase);
    } else {
      const parentDir = path.dirname(rawWorktreesBase);
      if (fs.existsSync(rawWorktreesBase) || fs.existsSync(parentDir)) {
        resolvedWorktreesBase = rawWorktreesBase;
      }
    }
  }

  const repoConfig = {
    bareRepo: resolvedBare,
    worktreesBase: resolvedWorktreesBase,
    defaultBaseBranch: (fileConfig.repo && fileConfig.repo.defaultBaseBranch) || (preset.repo && preset.repo.defaultBaseBranch) || 'main',
    protectedBranches: (fileConfig.repo && fileConfig.repo.protectedBranches) || (preset.repo && preset.repo.protectedBranches) || ['main', 'master', 'develop', 'prod', 'staging'],
  };

  // Preset commands stay intact unless the user explicitly chooses an agent override.
  const baseLayout = fileConfig.layout ?? preset.layout ?? fallback.layout;
  const agentPane = baseLayout.find((pane) => pane.isAgent ?? ['agy', 'agent', 'ai'].includes(pane.id));
  const agentOverride = flags.agent || process.env.ARISE_AGENT ||
    (Object.hasOwn(fileConfig.workspace || {}, 'agent') ? fileConfig.workspace.agent : fileConfig.layout ? undefined : preset.workspace?.agent);
  const resolvedAgent = agentOverride !== undefined ? agentOverride : (agentPane?.cmd ?? null);
  const layout = baseLayout.map((pane) => {
    const isAgentPane = pane.isAgent ?? ['agy', 'agent', 'ai'].includes(pane.id);
    if (!isAgentPane || agentOverride === undefined) return { ...pane };
    let cmd = pane.cmd;
    let title = pane.title;
    if (agentOverride === null || (typeof agentOverride === 'string' && ['none', 'false', 'null', 'disabled'].includes(agentOverride.trim().toLowerCase()))) {
      cmd = null;
      title = 'shell';
    } else if (typeof agentOverride === 'string') {
      cmd = agentOverride;
      title = agentOverride;
    } else if (typeof agentOverride === 'object') {
      cmd = agentOverride.cmd ?? agentOverride.command ?? null;
      title = agentOverride.title || cmd || pane.title;
    }
    return { ...pane, cmd, title, isAgent: true };
  });

  const requestedFocus = fileConfig.workspace?.defaultFocus ?? fileConfig.layout?.find((pane) => pane.focus)?.id ?? preset.workspace?.defaultFocus;
  const normalizedFocus = typeof requestedFocus === 'string' ? requestedFocus.trim().toLowerCase() : '';
  const matchingFocus = normalizedFocus && (
    layout.find((pane) => pane.id?.toLowerCase() === normalizedFocus) ||
    layout.find((pane) => pane.title?.toLowerCase() === normalizedFocus) ||
    layout.find((pane) => pane.cmd?.toLowerCase().split(/\s+/)[0] === normalizedFocus) ||
    (['agent', 'agy', 'ai'].includes(normalizedFocus) && layout.find((pane) => pane.isAgent ?? ['agy', 'agent', 'ai'].includes(pane.id)))
  );
  const defaultFocus = matchingFocus?.id || layout.find((pane) => pane.focus)?.id || layout[0]?.id;
  const workspaceConfig = {
    labelPrefix: fileConfig.workspace?.labelPrefix ?? preset.workspace?.labelPrefix ?? '',
    agent: resolvedAgent,
    defaultFocus,
  };

  // 5. Merge Scaffolding Settings
  const scaffoldConfig = {
    ...(preset.scaffold || {}),
    ...(fileConfig.scaffold || {}),
  };

  // 6. Merge Setup Commands
  let setup = [];
  if (Array.isArray(fileConfig.setup)) {
    setup = fileConfig.setup;
  } else if (typeof fileConfig.setup === 'string') {
    setup = [fileConfig.setup];
  } else if (Array.isArray(preset.setup)) {
    setup = preset.setup;
  } else if (fileConfig.scaffold && fileConfig.scaffold.install) {
    setup = [fileConfig.scaffold.install];
  }

  // 7. Merge Cleanup Commands
  let cleanup = [];
  if (Array.isArray(fileConfig.cleanup)) {
    cleanup = fileConfig.cleanup;
  } else if (typeof fileConfig.cleanup === 'string') {
    cleanup = [fileConfig.cleanup];
  } else if (Array.isArray(preset.cleanup)) {
    cleanup = preset.cleanup;
  }

  // 8. Merge Hooks
  const hooks = {
    ...(preset.hooks || {}),
    ...(fileConfig.hooks || {}),
  };

  const multiplexer = flags.multiplexer || fileConfig.multiplexer || 'auto';
  const plugins = fileConfig.plugins || [];

  return {
    multiplexer,
    plugins,
    preset,
    repo: repoConfig,
    workspace: workspaceConfig,
    layout,
    setup,
    cleanup,
    scaffold: scaffoldConfig,
    hooks,
    configFile,
  };
}

module.exports = {
  findConfigFile,
  loadConfigFile,
  mergePresetConfiguration,
  resolveConfiguration,
};
