const path = require('path');
const git = require('../git');
const { resolveDriver } = require('../drivers');
const { renderLayout } = require('../layout');
const { createContext } = require('../context');
const { resolveConfiguration } = require('../config');
const { initPluginManager } = require('../plugins');
const logger = require('../logger');

async function executeSessionCreate({
  flags = {},
  config,
  cwd = process.cwd(),
  pluginManager = null,
  driver = null,
} = {}) {
  const activeManager = pluginManager || initPluginManager({ flags, config, cwd });
  const activeDriver = driver || resolveDriver(config?.multiplexer, flags);

  // 1. Let plugins resolve or redirect the target directory and session name (e.g. Worktree creation)
  const pluginTarget = await activeManager.hookResolveTarget({ flags, config, cwd });

  const targetDir = (pluginTarget && pluginTarget.targetDir)
    ? pluginTarget.targetDir
    : (flags.targetDir ? path.resolve(cwd, flags.targetDir) : cwd);

  // 2. Resolve session / workspace label
  const defaultSessionName = path.basename(targetDir).replace(/[\s.:]/g, '_');
  const baseWorkspace = flags.workspaceName || flags.sessionName || (pluginTarget && pluginTarget.sessionName) || defaultSessionName;
  const prefix = (config?.workspace && config.workspace.labelPrefix) || '';
  const sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
    ? `${prefix}${baseWorkspace}`
    : baseWorkspace;

  console.log(`\n=== Arise Session Orchestrator ===`);
  console.log(`Multiplexer:    ${activeDriver.name}`);
  console.log(`Session Name:   ${sessionName}`);
  console.log(`Target Dir:     ${targetDir}`);
  console.log(`Active Preset:  ${config?.preset ? config.preset.name : 'generic'}\n`);

  // 3. Re-resolve config for target directory if needed
  let activeConfig = config;
  if (targetDir !== cwd) {
    activeConfig = resolveConfiguration(flags, targetDir, cwd);
  }

  // 4. Create execution context for hooks
  const ctx = createContext({
    worktreePath: targetDir,
    targetDir,
    sessionName,
    repoRoot: (pluginTarget && pluginTarget.repoRoot) || git.getRepoRootDir(targetDir),
    branch: (pluginTarget && pluginTarget.branch) || flags.branch || null,
    flags,
    preset: activeConfig.preset,
    config: activeConfig,
    driver: activeDriver,
    isWorktree: Boolean(pluginTarget && pluginTarget.isWorktree),
    worktreeExists: Boolean(pluginTarget && pluginTarget.worktreeExists),
  });

  // 5. Run onBeforeSession hook across registered plugins
  await activeManager.hookOnBeforeSession(ctx);

  // 6. Ensure the terminal multiplexer is installed
  await activeDriver.ensureInstalled({ yes: flags.yes });

  // 7. Create Session
  console.log(`==> Creating ${activeDriver.name} session "${sessionName}"...`);
  const session = await activeDriver.createSession({ name: sessionName, cwd: targetDir });

  // 8. Render declarative layout
  console.log(`==> Configuring terminal panes (${activeDriver.name})...`);
  renderLayout({
    layout: activeConfig.layout,
    rootPaneId: session.rootPaneId,
    cwd: targetDir,
    focusTarget: flags.focusTarget || activeConfig.workspace.defaultFocus,
    driver: activeDriver,
  });

  // 9. Focus session
  activeDriver.focusSession(session.sessionId || sessionName);

  // 10. Run onAfterSession hook across registered plugins
  await activeManager.hookOnAfterSession({ ctx, session, driver: activeDriver });

  // 11. Attach or switch to session unless disabled
  if (!flags.noAttach) {
    activeDriver.attachOrSwitchSession(sessionName);
  }

  return {
    session,
    sessionName,
    targetDir,
    driver: activeDriver,
  };
}

async function executeSessionClose({
  flags = {},
  config,
  cwd = process.cwd(),
  pluginManager = null,
  driver = null,
} = {}) {
  const activeManager = pluginManager || initPluginManager({ flags, config, cwd });
  const activeDriver = driver || resolveDriver(config?.multiplexer, flags);

  // 1. Try plugin teardown hook first (e.g. worktree plugin handles git worktree remove & branch deletion)
  const handled = await activeManager.hookOnTeardown({ flags, config, cwd, driver: activeDriver });
  if (handled) {
    return true;
  }

  // 2. Standard session close if not handled by a plugin
  const target = flags.cleanupTarget || flags.workspaceName || flags.sessionName || path.basename(cwd).replace(/[\s.:]/g, '_');
  console.log(`\nClosing ${activeDriver.name} session "${target}"...`);
  const closed = activeDriver.closeSession(target);
  if (closed) {
    console.log(`Session "${target}" closed successfully.\n`);
  } else {
    console.log(`Session "${target}" was not active or could not be closed.\n`);
  }
  return closed;
}

module.exports = {
  executeSessionCreate,
  executeSessionClose,
};
