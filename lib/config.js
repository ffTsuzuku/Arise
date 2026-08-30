const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPreset, detectPreset } = require('../presets');
const git = require('./git');

function findConfigFile(searchDirs = []) {
  const configNames = [
    '.ariserc.js',
    'arise.config.js',
    '.ariserc.json',
    '.ariserc',
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

  // Check home directory ~/.config/arise then ~/.config/herdr-worktree
  const homeConfigDirs = [
    path.join(os.homedir(), '.config', 'arise'),
    path.join(os.homedir(), '.config', 'herdr-worktree'),
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
    path.join(os.homedir(), '.worktreerc.json'),
  ];
  for (const rcFile of homeRcFiles) {
    if (fs.existsSync(rcFile)) {
      return rcFile;
    }
  }

  return null;
}

function stripJsonComments(str) {
  return str
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim();
}

function loadConfigFile(filePath) {
  if (!filePath) return {};
  try {
    if (filePath.endsWith('.json') || filePath.endsWith('.worktreerc') || filePath.endsWith('.ariserc')) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(stripJsonComments(content));
    } else {
      return require(path.resolve(filePath));
    }
  } catch (err) {
    console.warn(`Warning: Failed to load config from "${filePath}": ${err.message}`);
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
  try {
    worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: isBare ? repoRoot : null });
  } catch (e) {}

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

  // 4. Fallback working directory (caller working directory)
  if (callerCwd) {
    addSearchDir(callerCwd);
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
    preset = getPreset(presetName);
  }
  if (!preset) {
    const detectDir = (configFile && path.dirname(configFile)) || cwd;
    preset = detectPreset(detectDir);
    if (preset.name === 'generic' && detectDir !== cwd) {
      preset = detectPreset(cwd);
    }
  }

  // 2. Merge Repo Settings
  const repoConfig = {
    bareRepo: (fileConfig.repo && fileConfig.repo.bareRepo) || (preset.repo && preset.repo.bareRepo) || (isBare ? repoRoot : null),
    worktreesBase: (fileConfig.repo && fileConfig.repo.worktreesBase) || (preset.repo && preset.repo.worktreesBase) || null,
    defaultBaseBranch: (fileConfig.repo && fileConfig.repo.defaultBaseBranch) || (preset.repo && preset.repo.defaultBaseBranch) || 'develop',
    protectedBranches: (fileConfig.repo && fileConfig.repo.protectedBranches) || (preset.repo && preset.repo.protectedBranches) || ['main', 'master', 'develop', 'prod', 'staging'],
  };

  // 3. Resolve AI CLI Agent
  const resolvedAgent = flags.agent
    || process.env.ARISE_AGENT
    || (fileConfig.workspace && fileConfig.workspace.agent)
    || (preset.workspace && preset.workspace.agent)
    || 'agy';

  // 4. Merge Workspace Settings
  const defaultFocus = (fileConfig.workspace && fileConfig.workspace.defaultFocus)
    || (preset.workspace && preset.workspace.defaultFocus)
    || 'agy';

  const workspaceConfig = {
    labelPrefix: (fileConfig.workspace && fileConfig.workspace.labelPrefix !== undefined)
      ? fileConfig.workspace.labelPrefix
      : (preset.workspace && preset.workspace.labelPrefix !== undefined ? preset.workspace.labelPrefix : ''),
    agent: resolvedAgent,
    defaultFocus,
  };

  // 5. Merge & Customize Layout for Active Agent
  const baseLayout = fileConfig.layout || preset.layout || [];
  const layout = baseLayout.map((pane) => {
    const isAgentPane = pane.isAgent || pane.id === 'agy' || pane.id === 'agent' || pane.id === 'ai';
    if (!isAgentPane) return { ...pane };

    let agentCmd = pane.cmd;
    let agentTitle = pane.title;

    if (typeof resolvedAgent === 'string') {
      const lower = resolvedAgent.toLowerCase().trim();
      if (lower === 'none' || lower === 'false' || lower === 'null' || lower === 'disabled') {
        agentCmd = null;
        agentTitle = 'shell';
      } else {
        agentCmd = resolvedAgent;
        agentTitle = resolvedAgent;
      }
    } else if (typeof resolvedAgent === 'object' && resolvedAgent !== null) {
      agentCmd = resolvedAgent.cmd !== undefined ? resolvedAgent.cmd : (resolvedAgent.command || null);
      agentTitle = resolvedAgent.title || resolvedAgent.cmd || pane.title;
    }

    return {
      ...pane,
      cmd: agentCmd,
      title: agentTitle,
      isAgent: true,
    };
  });

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
