const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const git = require('../git');
const logger = require('../logger');
const { createContext } = require('../context');
const { resolveConfiguration } = require('../config');

function createWorktreePlugin(pluginOptions = {}) {
  return {
    name: 'worktree',

    async resolveTarget(context) {
      const { flags, config, cwd } = context;
      if (!flags.branch) {
        return null;
      }

      const branch = flags.branch;
      const sanitizedBranch = branch.replace(/\//g, '-');
      const dirname = flags.dirname || sanitizedBranch;

      const repoRoot = git.getRepoRootDir(cwd, config.repo && config.repo.bareRepo);
      if (!repoRoot) {
        throw new Error(`Cannot create git worktree: directory "${cwd}" is not inside a git repository.`);
      }

      const isBare = git.isBareRepo(repoRoot);
      const baseDir = (config.repo && config.repo.worktreesBase) || (isBare ? path.dirname(repoRoot) : repoRoot);
      const worktreePath = path.resolve(baseDir, dirname);

      const baseWorkspace = flags.workspaceName || dirname.replace(/[\s.:]/g, '_');
      const prefix = (config.workspace && config.workspace.labelPrefix) || '';
      const sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
        ? `${prefix}${baseWorkspace}`
        : baseWorkspace;

      console.log(`\n=== Git Worktree Session Setup ===`);
      console.log(`Repository Root:      ${repoRoot}`);
      console.log(`Target Worktree Path: ${worktreePath}`);
      console.log(`Branch:               ${branch}`);
      console.log(`Session Name:         ${sessionName}`);
      console.log(`Base Branch (Source): ${flags.source || (config.repo && config.repo.defaultBaseBranch) || 'main'}\n`);

      const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo && config.repo.bareRepo });
      const existingWorktree = worktrees.find(
        (wt) => wt.branch === branch || path.resolve(wt.path) === path.resolve(worktreePath)
      );

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

      if (!worktreeExists) {
        console.log(`Creating new git worktree for branch "${branch}"...`);
        git.createWorktree({
          worktreePath,
          branch,
          source: flags.source || (config.repo && config.repo.defaultBaseBranch),
          repoDir: repoRoot,
          bareRepo: config.repo && config.repo.bareRepo,
        });
      }

      // Sync caller config if worktree freshly created
      if (!worktreeExists && config.configFile && fs.existsSync(config.configFile)) {
        try {
          const targetConfigPath = path.join(worktreePathToUse, path.basename(config.configFile));
          fs.copyFileSync(config.configFile, targetConfigPath);
          logger.debug(`Synced config to new worktree: ${config.configFile} -> ${targetConfigPath}`);
        } catch (err) {
          logger.warn(`Could not sync caller config file to new worktree: ${err.message}`);
        }
      }

      return {
        targetDir: worktreePathToUse,
        sessionName,
        branch,
        repoRoot,
        worktreeExists,
        isWorktree: true,
      };
    },

    async onBeforeSession(ctx) {
      if (!ctx.isWorktree) return;

      const activeConfig = ctx.config;
      if (activeConfig.hooks && typeof activeConfig.hooks.onSyncPrimary === 'function') {
        await activeConfig.hooks.onSyncPrimary(ctx);
      }

      if (!ctx.worktreeExists && activeConfig.hooks && typeof activeConfig.hooks.onScaffold === 'function') {
        await activeConfig.hooks.onScaffold(ctx);
      } else if (ctx.worktreeExists && activeConfig.scaffold && activeConfig.scaffold.symlink) {
        await ctx.setSymlink(activeConfig.scaffold.symlink, ctx.targetDir || ctx.worktreePath);
      }
    },

    async onTeardown(context) {
      const { flags, config, cwd, driver } = context;
      if (!flags.isCleanup) return false;

      const repoRoot = git.getRepoRootDir(cwd, config.repo && config.repo.bareRepo);
      if (!repoRoot) {
        // Not a git repo, let core session close handle it
        return false;
      }

      const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo && config.repo.bareRepo });
      let target = flags.cleanupTarget || flags.dirname || flags.branch;

      // 1. Auto-detect worktree if invoked inside a worktree directory without arguments
      if (!target) {
        const currentCwd = path.resolve(cwd);
        const matchingWt = worktrees.find((wt) => {
          if (wt.isBare) return false;
          const resolvedWtPath = path.resolve(wt.path);
          return (
            resolvedWtPath !== path.resolve(repoRoot) &&
            (currentCwd === resolvedWtPath || currentCwd.startsWith(resolvedWtPath + path.sep))
          );
        });

        if (matchingWt) {
          target = matchingWt.path;
          console.log(`Auto-detected current worktree: "${target}"`);
        } else {
          return false;
        }
      }

      // 2. Resolve worktree target path and matching branch
      const baseDir = (config.repo && config.repo.worktreesBase) || repoRoot;
      const resolvedTarget = path.isAbsolute(target) ? path.resolve(target) : path.resolve(baseDir, target);

      const existingWorktree = worktrees.find((wt) => {
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
          const detected = execSync(`git -C "${targetWorktreePath}" rev-parse --abbrev-ref HEAD`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
          }).trim();
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

      console.log(`\n=== Starting Worktree Teardown & Nuke ===`);
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

      // If cwd is inside the target worktree, switch to baseDir
      if (path.resolve(process.cwd()).startsWith(path.resolve(targetWorktreePath))) {
        console.log(`Current working directory is inside target worktree. Switching to: ${baseDir}`);
        try {
          process.chdir(baseDir);
        } catch (e) {}
      }

      // Safety check: Protected branches
      const protectedBranches = activeConfig.repo.protectedBranches || ['main', 'master', 'develop', 'prod', 'staging'];
      if (!flags.dirOnly && targetBranch && protectedBranches.includes(targetBranch)) {
        console.error(`\nError: Branch "${targetBranch}" is protected. Cannot delete protected branch.`);
        console.error(`If you only want to remove the worktree directory, use --dir-only.`);
        process.exit(1);
      }

      // Create Context for Nuke Hooks
      const ctx = createContext({
        worktreePath: targetWorktreePath,
        repoRoot,
        bareRepo: activeConfig.repo.bareRepo,
        branch: targetBranch,
        flags,
        preset: activeConfig.preset,
        config: activeConfig,
      });

      // Hook: onPreNuke
      if (typeof activeConfig.hooks.onPreNuke === 'function') {
        console.log('Running onPreNuke hook...');
        await activeConfig.hooks.onPreNuke(ctx);
      } else if (activeConfig.scaffold && activeConfig.scaffold.symlink) {
        console.log(`Removing web server symlink: ${activeConfig.scaffold.symlink}`);
        await ctx.setSymlink(activeConfig.scaffold.symlink, '');
      }

      // Remove Git Worktree
      if (existingWorktree || fs.existsSync(targetWorktreePath)) {
        console.log(`Removing git worktree at "${targetWorktreePath}"...`);
        try {
          git.removeWorktree({
            worktreePath: targetWorktreePath,
            force: flags.force,
            repoDir: repoRoot,
            bareRepo: activeConfig.repo.bareRepo,
          });
          console.log(`Worktree directory removed.`);
        } catch (err) {
          console.warn(`Warning: Standard worktree removal encountered an issue: ${err.message}`);
          if (flags.force && fs.existsSync(targetWorktreePath)) {
            console.log(`Force flag provided. Manually removing directory "${targetWorktreePath}"...`);
            fs.rmSync(targetWorktreePath, { recursive: true, force: true });
          }
        }
      }

      // Prune worktree list
      git.pruneWorktrees({ repoDir: repoRoot, bareRepo: activeConfig.repo.bareRepo });

      // Delete branches if not --dir-only
      if (!flags.dirOnly && targetBranch) {
        console.log(`Deleting local branch "${targetBranch}"...`);
        try {
          git.deleteBranch({
            branch: targetBranch,
            force: flags.force,
            repoDir: repoRoot,
            bareRepo: activeConfig.repo.bareRepo,
          });
          console.log(`Local branch "${targetBranch}" deleted.`);
        } catch (err) {
          console.warn(`Warning: Could not delete local branch "${targetBranch}": ${err.message}`);
        }

        if (!flags.keepRemote) {
          console.log(`Deleting remote branch "${targetBranch}" on origin...`);
          try {
            git.deleteRemoteBranch({
              branch: targetBranch,
              repoDir: repoRoot,
              bareRepo: activeConfig.repo.bareRepo,
            });
            console.log(`Remote branch "${targetBranch}" deleted on origin.`);
          } catch (err) {
            console.warn(`Warning: Could not delete remote branch "${targetBranch}": ${err.message}`);
          }
        }
      }

      // Hook: onPostNuke
      if (typeof activeConfig.hooks.onPostNuke === 'function') {
        console.log('Running onPostNuke hook...');
        await activeConfig.hooks.onPostNuke(ctx);
      }

      // Close matching terminal sessions in active multiplexer
      const prefix = activeConfig.workspace.labelPrefix || '';
      const prefixedSessionName = (prefix && !targetSessionName.startsWith(prefix.trim()))
        ? `${prefix}${targetSessionName}`
        : targetSessionName;

      const matchTargets = [
        targetSessionName,
        prefixedSessionName,
        targetDirname,
        targetBranch,
        path.basename(targetWorktreePath),
      ];

      if (driver && typeof driver.closeSessionsMatching === 'function') {
        driver.closeSessionsMatching(matchTargets);
      }

      console.log(`\nWorktree "${targetDirname}" nuked successfully.\n`);
      return true;
    },

    menuActions(context) {
      if (!context.isGitRepo) return [];
      return [
        {
          value: 'worktree_create',
          title: '🌿 Create new git worktree',
          description: 'Branch off source, scaffold environment, and boot session',
        },
        {
          value: 'worktree_switch',
          title: '🔄 Switch / Open existing worktree',
          description: 'Select an existing worktree and attach session',
        },
        {
          value: 'worktree_list',
          title: '📋 List worktrees',
          description: 'View all active worktrees and session status',
        },
        {
          value: 'worktree_nuke',
          title: '🧹 Nuke / Cleanup worktree',
          description: 'Safely tear down worktree directory and associated branches',
        },
      ];
    },
  };
}

module.exports = createWorktreePlugin;
