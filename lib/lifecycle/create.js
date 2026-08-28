const fs = require('fs');
const path = require('path');
const git = require('../git');
const herdr = require('../herdr');
const layout = require('../layout');
const { createContext } = require('../context');
const { showUsage } = require('../cli');

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
  const baseDir = config.repo.worktreesBase || repoRoot;
  const worktreePath = path.resolve(baseDir, dirname);

  // 2. Resolve Session / Workspace Name
  const baseWorkspace = flags.workspaceName || dirname.replace(/[\s.:]/g, '_');
  const prefix = config.workspace.labelPrefix || '';
  const sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
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
      console.error(`Failed to create worktree: ${err.message}`);
      process.exit(1);
    }
  }

  // 5. Initialize Context for Hooks
  const ctx = createContext({
    worktreePath: worktreePathToUse,
    repoRoot,
    bareRepo: config.repo.bareRepo,
    branch,
    source: flags.source || config.repo.defaultBaseBranch,
    flags,
    preset: config.preset,
    config,
  });

  // 6. Run Preset / Config Hooks
  if (typeof config.hooks.onSyncPrimary === 'function') {
    await config.hooks.onSyncPrimary(ctx);
  }

  if (!worktreeExists && typeof config.hooks.onScaffold === 'function') {
    await config.hooks.onScaffold(ctx);
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
    layout: config.layout,
    rootPaneId: ws.rootPaneId,
    cwd: worktreePathToUse,
    focusTarget: flags.focusTarget || config.workspace.defaultFocus,
  });

  // Focus the workspace
  herdr.focusWorkspace(ws.workspaceId);

  // 9. Attach or Switch
  herdr.attachOrSwitchSession(sessionName);
}

module.exports = {
  executeCreate,
};
