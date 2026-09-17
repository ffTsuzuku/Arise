const path = require('path');
const { PluginManager } = require('./manager');
const createWorktreePlugin = require('./worktree');
const git = require('../git');
const logger = require('../logger');

function resolvePluginInstance(pluginDef, cwd = process.cwd()) {
  if (!pluginDef) return null;

  if (typeof pluginDef === 'function') {
    return pluginDef();
  }

  if (typeof pluginDef === 'object' && pluginDef !== null) {
    return pluginDef;
  }

  if (typeof pluginDef === 'string') {
    if (pluginDef === 'worktree' || pluginDef === 'git' || pluginDef === '@arise/plugin-worktree') {
      return createWorktreePlugin();
    }
    // Try resolving from cwd or node_modules
    try {
      const resolvedPath = path.isAbsolute(pluginDef) ? pluginDef : path.resolve(cwd, pluginDef);
      const mod = require(resolvedPath);
      return typeof mod === 'function' ? mod() : mod;
    } catch (err) {
      logger.warn(`Failed to load plugin "${pluginDef}": ${err.message}`);
      return null;
    }
  }

  return null;
}

function initPluginManager({ flags = {}, config = {}, cwd = process.cwd() } = {}) {
  const manager = new PluginManager();
  const repoRoot = git.getRepoRootDir(cwd, config.repo && config.repo.bareRepo);
  const isGitRepo = Boolean(repoRoot);

  // 1. Explicitly configured plugins
  const configuredPlugins = (config.plugins || []).map((p) => resolvePluginInstance(p, cwd)).filter(Boolean);
  manager.registerMany(configuredPlugins);

  // 2. Auto-register worktree plugin if branch/cleanup flag was given or inside git repo
  const hasWorktree = manager.hasPlugin('worktree');
  if (!hasWorktree && (flags.branch || flags.isCleanup || isGitRepo)) {
    manager.register(createWorktreePlugin());
  }

  return manager;
}

module.exports = {
  PluginManager,
  initPluginManager,
  createWorktreePlugin,
};
