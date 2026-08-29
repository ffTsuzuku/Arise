const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const git = require('../git');
const herdr = require('../herdr');
const { createContext } = require('../context');
const { resolveConfiguration } = require('../config');
const { showUsage } = require('../cli');

async function executeNuke(flags, config, cwd = process.cwd()) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });

  let target = flags.cleanupTarget || flags.dirname || flags.branch;

  // 1. Auto-detect worktree if invoked inside a worktree directory without arguments
  if (!target) {
    const currentCwd = path.resolve(cwd);
    const matchingWt = worktrees.find(wt => {
      const resolvedWtPath = path.resolve(wt.path);
      return resolvedWtPath !== path.resolve(repoRoot) && (
        currentCwd === resolvedWtPath ||
        currentCwd.startsWith(resolvedWtPath + path.sep)
      );
    });

    if (matchingWt) {
      target = matchingWt.path;
      console.log(`Auto-detected current worktree: "${target}"`);
    } else {
      console.error('Error: --nuke / --cleanup requires a worktree directory name or branch when run from the root repository.');
      showUsage();
      process.exit(1);
    }
  }

  // 2. Resolve worktree target path and matching branch
  const baseDir = config.repo.worktreesBase || repoRoot;
  const resolvedTarget = path.isAbsolute(target) ? path.resolve(target) : path.resolve(baseDir, target);

  const existingWorktree = worktrees.find(wt => {
    return (
      path.resolve(wt.path) === resolvedTarget ||
      path.basename(wt.path) === target ||
      (wt.branch && wt.branch === target) ||
      (flags.branch && wt.branch === flags.branch)
    );
  });

  const targetWorktreePath = existingWorktree ? existingWorktree.path : resolvedTarget;
  const targetDirname = path.basename(targetWorktreePath);
  const targetSessionName = targetDirname.replace(/[\s.:]/g, '_');

  const activeConfig = fs.existsSync(targetWorktreePath)
    ? resolveConfiguration(flags, targetWorktreePath)
    : config;

  let targetBranch = flags.branch;
  if (!targetBranch && existingWorktree && existingWorktree.branch) {
    targetBranch = existingWorktree.branch;
  }
  if (!targetBranch && fs.existsSync(targetWorktreePath)) {
    try {
      const detected = execSync(`git -C "${targetWorktreePath}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (detected && detected !== 'HEAD') {
        targetBranch = detected;
      }
    } catch (e) {}
  }
  if (!targetBranch) {
    try {
      const gitCmd = git.getGitPrefix({ repoDir: repoRoot, bareRepo: activeConfig.repo.bareRepo });
      execSync(`${gitCmd} rev-parse --verify "${target}"`, { stdio: 'ignore' });
      targetBranch = target;
    } catch (e) {}
  }

  console.log(`\n=== Starting Worktree Nuke ===`);
  console.log(`Active Preset:        ${activeConfig.preset ? activeConfig.preset.name : 'generic'}`);
  console.log(`Repository Root:      ${repoRoot}`);
  console.log(`Target Worktree Path: ${targetWorktreePath}`);
  console.log(`Associated Branch:    ${targetBranch || '(None detected)'}`);
  console.log(`Directory Only Mode:  ${flags.dirOnly ? 'Yes (branches will be preserved)' : 'No'}`);
  console.log(`Keep Remote Branch:   ${flags.keepRemote ? 'Yes' : 'No'}\n`);

  // Safety check: Never delete root repository
  if (path.resolve(targetWorktreePath) === path.resolve(repoRoot)) {
    console.error(`Error: Cannot delete the repository root directory "${repoRoot}".`);
    process.exit(1);
  }

  // If cwd is inside the target worktree, switch to rootDir/baseDir
  if (path.resolve(process.cwd()).startsWith(path.resolve(targetWorktreePath))) {
    console.log(`Current working directory is inside target worktree. Switching to: ${baseDir}`);
    try {
      process.chdir(baseDir);
    } catch (e) {}
  }

  // Initialize context for hooks
  const ctx = createContext({
    worktreePath: targetWorktreePath,
    repoRoot,
    bareRepo: activeConfig.repo.bareRepo,
    branch: targetBranch,
    flags,
    preset: activeConfig.preset,
    config: activeConfig,
  });

  // Pre-Nuke Hook
  if (typeof activeConfig.hooks.onPreNuke === 'function') {
    await activeConfig.hooks.onPreNuke(ctx);
  }

  // 1. Remove Worktree & Directory
  console.log(`\n==> [1/3] Removing git worktree and directory...`);
  const isRegisteredWorktree = worktrees.some(wt => path.resolve(wt.path) === path.resolve(targetWorktreePath));

  if (isRegisteredWorktree) {
    git.removeWorktree(targetWorktreePath, {
      force: flags.force,
      repoDir: repoRoot,
      bareRepo: config.repo.bareRepo,
    });
  }

  // Prune any stale worktree entries
  git.pruneWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });

  // Remove any remaining files or untracked directory
  if (fs.existsSync(targetWorktreePath)) {
    console.log(`Removing remaining directory "${targetWorktreePath}"...`);
    try {
      fs.rmSync(targetWorktreePath, { recursive: true, force: true });
      console.log(`Directory deleted successfully.`);
    } catch (err) {
      console.error(`Failed to delete directory "${targetWorktreePath}": ${err.message}`);
    }
  } else {
    console.log(`Worktree directory is clean.`);
  }

  // Helper for final cleanup steps (Herdr workspace close + Post-Nuke hook)
  const finishCleanup = async () => {
    // Post-Nuke Hook
    if (typeof activeConfig.hooks.onPostNuke === 'function') {
      await activeConfig.hooks.onPostNuke(ctx);
    }

    // Close Herdr Workspace if running (performed last so active pane is not terminated mid-cleanup)
    const prefix = activeConfig.workspace.labelPrefix || '';
    const matchTargets = [
      targetSessionName,
      targetDirname,
      targetBranch,
      prefix ? `${prefix}${targetSessionName}` : null,
      prefix ? `${prefix}${targetDirname}` : null,
    ].filter(Boolean);

    herdr.closeWorkspacesMatching(matchTargets);

    console.log(`\nCleanup complete!`);
  };

  // 2. Delete Local Branch
  if (flags.dirOnly) {
    console.log(`\n==> Skipping branch deletion (--dir-only / --keep-branch).`);
    await finishCleanup();
    return;
  }

  const protectedBranches = activeConfig.repo.protectedBranches || ['main', 'master', 'develop', 'prod', 'staging', 'production'];
  if (targetBranch && protectedBranches.includes(targetBranch)) {
    console.warn(`\n==> WARNING: "${targetBranch}" is a protected branch. Skipping local and remote branch deletion.`);
    await finishCleanup();
    return;
  }

  if (!targetBranch) {
    console.log(`\n==> No branch associated with "${target}". Skipping branch deletion.`);
    await finishCleanup();
    return;
  }

  console.log(`\n==> [2/3] Deleting local branch "${targetBranch}"...`);
  const gitOpts = { repoDir: repoRoot, bareRepo: config.repo.bareRepo };
  const existsLocally = git.branchExistsLocally(targetBranch, gitOpts);

  if (existsLocally) {
    git.deleteLocalBranch(targetBranch, gitOpts);
  } else {
    console.log(`Local branch "${targetBranch}" does not exist or was already deleted.`);
  }

  // 3. Delete Remote Branch
  if (flags.keepRemote) {
    console.log(`\n==> Skipping remote branch deletion (--keep-remote / --local-only).`);
    await finishCleanup();
    return;
  }

  console.log(`\n==> [3/3] Deleting remote branch "${targetBranch}" from origin...`);
  const existsRemotely = git.branchExistsRemotely(targetBranch, gitOpts);

  if (existsRemotely) {
    git.deleteRemoteBranch(targetBranch, gitOpts);
  } else {
    console.log(`Remote branch "${targetBranch}" does not exist on origin or was already deleted.`);
  }

  await finishCleanup();
}

module.exports = {
  executeNuke,
};
