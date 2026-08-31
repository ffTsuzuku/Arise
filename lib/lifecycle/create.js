const fs = require('fs');
const path = require('path');
const git = require('../git');
const herdr = require('../herdr');
const layout = require('../layout');
const { createContext } = require('../context');
const { resolveConfiguration } = require('../config');
const { showUsage } = require('../cli');
const logger = require('../logger');

async function executeCreate(flags, config, cwd = process.cwd()) {
  const branch = flags.branch;
  if (!branch) {
    console.error('Error: --branch is a required argument for creation.');
    showUsage();
    process.exit(1);
  }

  // 1. Resolve Dirname and Worktree Path
  const sanitizedBranch = branch.replace(/\//g, '-');
  const dirname = flags.dirname || sanitizedBranch;

  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const baseDir = config.repo.worktreesBase || (git.isBareRepo(repoRoot) ? path.dirname(repoRoot) : repoRoot);
  const worktreePath = path.resolve(baseDir, dirname);

  // 2. Resolve Session / Workspace Name
  const baseWorkspace = flags.workspaceName || dirname.replace(/[\s.:]/g, '_');
  let prefix = config.workspace.labelPrefix || '';
  let sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
    ? `${prefix}${baseWorkspace}`
    : baseWorkspace;

  console.log(`\n=== Starting Herdr Worktree Session ===`);
  console.log(`Active Preset:        ${config.preset ? config.preset.name : 'generic'}`);
  console.log(`Repository Root:      ${repoRoot}`);
  console.log(`Target Worktree Path: ${worktreePath}`);
  console.log(`Workspace Name:       ${sessionName}`);
  console.log(`Base Branch (Source): ${flags.source || config.repo.defaultBaseBranch}\n`);

  // 3. Determine if Worktree Already Exists
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });
  const existingWorktree = worktrees.find(wt => wt.branch === branch || path.resolve(wt.path) === path.resolve(worktreePath));

  let worktreePathToUse = worktreePath;
  let worktreeExists = false;

  if (existingWorktree) {
    worktreeExists = true;
    worktreePathToUse = existingWorktree.path;
    console.log(`Worktree already exists for branch "${branch}" at "${worktreePathToUse}".`);
  } else if (fs.existsSync(worktreePath)) {
    worktreeExists = true;
    console.log(`Directory already exists at "${worktreePath}". Skipping git worktree creation.`);
  }

  // 4. Create Worktree if it doesn't exist
  if (!worktreeExists) {
    console.log(`Creating new git worktree for branch "${branch}"...`);
    try {
      git.createWorktree({
        worktreePath,
        branch,
        source: flags.source || config.repo.defaultBaseBranch,
        repoDir: repoRoot,
        bareRepo: config.repo.bareRepo,
      });
    } catch (err) {
      logger.error(`Failed to create worktree: ${err.message}`, err);
      process.exit(1);
    }
  }

  // 5. Re-resolve config using target worktree directory for branch-specific overrides with caller cwd fallback
  let activeConfig = resolveConfiguration(flags, worktreePathToUse, cwd);

  // If the worktree was freshly created and caller had an active configuration file in cwd, sync it into the new worktree
  if (!worktreeExists && config.configFile && fs.existsSync(config.configFile)) {
    try {
      const targetConfigPath = path.join(worktreePathToUse, path.basename(config.configFile));
      fs.copyFileSync(config.configFile, targetConfigPath);
      logger.debug(`Synced configuration file from caller to new worktree: ${config.configFile} -> ${targetConfigPath}`);
      activeConfig = resolveConfiguration(flags, worktreePathToUse, cwd);
    } catch (err) {
      logger.warn(`Could not sync caller config file to new worktree: ${err.message}`);
    }
  }

  if (config.layout && config.layout.length > 0 && config.configFile && (!activeConfig.configFile || activeConfig.configFile.includes('.bare'))) {
    activeConfig.layout = config.layout;
  }

  logger.debug(`Active configuration for target="${worktreePathToUse}" (caller="${cwd}"):`, {
    configFile: activeConfig.configFile,
    layoutCount: activeConfig.layout?.length,
    panes: activeConfig.layout?.map((p) => ({ id: p.id, title: p.title, from: p.from, split: p.split })),
  });

  prefix = activeConfig.workspace.labelPrefix || '';
  sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
    ? `${prefix}${baseWorkspace}`
    : baseWorkspace;

  // Initialize Context for Hooks
  const ctx = createContext({
    worktreePath: worktreePathToUse,
    repoRoot,
    bareRepo: activeConfig.repo.bareRepo,
    branch,
    source: flags.source || activeConfig.repo.defaultBaseBranch,
    flags,
    preset: activeConfig.preset,
    config: activeConfig,
  });

  // 6. Run Preset / Config Hooks
  if (typeof activeConfig.hooks.onSyncPrimary === 'function') {
    await activeConfig.hooks.onSyncPrimary(ctx);
  }

  if (!worktreeExists && typeof activeConfig.hooks.onScaffold === 'function') {
    await activeConfig.hooks.onScaffold(ctx);
  } else if (worktreeExists && activeConfig.scaffold && activeConfig.scaffold.symlink) {
    await ctx.setSymlink(activeConfig.scaffold.symlink, worktreePathToUse);
  }

  // 7. Orchestrate Herdr Workspace
  await herdr.ensureHerdrInstalled({ yes: flags.yes });

  console.log(`\n==> Creating Herdr workspace "${sessionName}"...`);
  let ws;
  try {
    ws = herdr.createWorkspace({ label: sessionName, cwd: worktreePathToUse });
  } catch (err) {
    console.error(`Failed to create herdr workspace: ${err.message}`);
    process.exit(1);
  }

  // 8. Render Terminal Layout
  console.log(`==> Configuring terminal panes...`);
  layout.renderLayout({
    layout: activeConfig.layout,
    rootPaneId: ws.rootPaneId,
    cwd: worktreePathToUse,
    focusTarget: flags.focusTarget || activeConfig.workspace.defaultFocus,
  });

  // Focus the workspace
  herdr.focusWorkspace(ws.workspaceId);

  // 9. Attach or Switch
  herdr.attachOrSwitchSession(sessionName);
}

module.exports = {
  executeCreate,
};
