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
  let activeConfig = config || resolveConfiguration(flags, cwd);
  if (targetDir !== cwd) {
    const targetConfig = resolveConfiguration(flags, targetDir, cwd);
    if (targetConfig.configFile) {
      activeConfig = targetConfig;
    } else if (config) {
      activeConfig = {
        ...config,
        ...targetConfig,
        setup: (config.setup && config.setup.length > 0) ? config.setup : targetConfig.setup,
        cleanup: (config.cleanup && config.cleanup.length > 0) ? config.cleanup : targetConfig.cleanup,
      };
    } else {
      activeConfig = targetConfig;
    }
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

  // 6. Run workspace setup commands if this is a freshly provisioned workspace
  const isNew = Boolean(pluginTarget && (pluginTarget.isNew || !pluginTarget.worktreeExists));
  if (isNew && Array.isArray(activeConfig.setup) && activeConfig.setup.length > 0) {
    console.log(`\n==> Running workspace setup commands...`);
    for (const cmd of activeConfig.setup) {
      console.log(`  $ ${cmd}`);
      try {
        ctx.exec(cmd);
      } catch (err) {
        console.warn(`Warning: Setup command failed: "${cmd}" (${err.message})`);
      }
    }
  }

  // 7. Ensure the terminal multiplexer is installed
  await activeDriver.ensureInstalled({ yes: flags.yes });

  // 8. Create Session
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

  // 2. Run workspace cleanup commands if configured
  if (Array.isArray(config?.cleanup) && config.cleanup.length > 0) {
    console.log(`\n==> Running workspace cleanup commands...`);
    for (const cmd of config.cleanup) {
      console.log(`  $ ${cmd}`);
      try {
        require('child_process').execSync(cmd, { cwd, stdio: 'inherit' });
      } catch (err) {
        console.warn(`Warning: Cleanup command failed: "${cmd}" (${err.message})`);
      }
    }
  }

  // 3. Standard session close if not handled by a plugin
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
