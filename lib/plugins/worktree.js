const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const git = require('../git');
const logger = require('../logger');
const { printSummary } = require('../tui/theme');
const { createContext } = require('../context');
const { resolveConfiguration } = require('../config');
const {
  clearScreen,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  promptPause,
  p,
  pc,
} = require('../tui/prompt');


function resolvePluginOptions(pluginOptions = {}, config = {}) {
  const repoConfig = config.repo || {};
  return {
    worktreesBase: pluginOptions.worktreesBase || pluginOptions.baseDir || repoConfig.worktreesBase || null,
    defaultBaseBranch: pluginOptions.defaultBaseBranch || repoConfig.defaultBaseBranch || 'main',
    protectedBranches: pluginOptions.protectedBranches || repoConfig.protectedBranches || [
      'main',
      'master',
      'develop',
      'prod',
      'staging',
    ],
    dirPattern: pluginOptions.dirPattern || ((branch) => branch.replace(/\//g, '-')),
    autoFetch: pluginOptions.autoFetch !== undefined ? pluginOptions.autoFetch : true,
    bareRepo: pluginOptions.bareRepo !== undefined ? pluginOptions.bareRepo : repoConfig.bareRepo || null,
  };
}

function createWorktreePlugin(pluginOptions = {}) {
  return {
    name: 'worktree',

    async resolveTarget(context) {
      const { flags, config, cwd } = context;
      if (!flags.branch) {
        return null;
      }

      const opts = resolvePluginOptions(pluginOptions, config);
      const branch = flags.branch;

      if (opts.bareRepo && (!fs.existsSync(opts.bareRepo) || !git.isBareRepo(opts.bareRepo))) {
        opts.bareRepo = null;
      }

      const repoRoot = git.getRepoRootDir(cwd, opts.bareRepo);
      if (!repoRoot || !git.isGitRepo(cwd)) {
        throw new Error(`Cannot create git worktree: directory "${cwd}" is not inside a git repository.`);
      }

      const isBare = git.isBareRepo(repoRoot);
      const defaultBase = isBare ? path.dirname(repoRoot) : path.join(repoRoot, '.worktrees');
      let baseDir = opts.worktreesBase;
      if (baseDir) {
        if (!path.isAbsolute(baseDir)) {
          baseDir = path.resolve(repoRoot, baseDir);
        } else if (!fs.existsSync(baseDir)) {
          const parentDir = path.dirname(baseDir);
          if (!fs.existsSync(parentDir)) {
            baseDir = defaultBase;
          }
        }
      } else {
        baseDir = defaultBase;
      }

      // Auto-ignore worktrees folder in git if located inside repoRoot
      if (!isBare && baseDir.startsWith(repoRoot)) {
        const rel = path.relative(repoRoot, baseDir);
        if (rel) {
          git.ensureGitExclude(repoRoot, rel);
        }
      }


      const dirPatternFn = typeof opts.dirPattern === 'function' ? opts.dirPattern : (b) => b.replace(/\//g, '-');
      const dirname = flags.dirname || dirPatternFn(branch);
      const worktreePath = path.resolve(baseDir, dirname);

      const baseWorkspace = flags.workspaceName || flags.sessionName || dirname.replace(/[\s.:]/g, '_');
      const prefix = (config.workspace && config.workspace.labelPrefix) || '';
      const sessionName = (prefix && !baseWorkspace.startsWith(prefix.trim()))
        ? `${prefix}${baseWorkspace}`
        : baseWorkspace;

      printSummary('Create worktree', [
        ['repository', repoRoot], ['directory', worktreePath], ['branch', branch],
        ['session', sessionName], ['base branch', flags.source || opts.defaultBaseBranch],
      ]);

      const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: opts.bareRepo });
      const existingWorktree = worktrees.find(
        (wt) => wt.branch === branch || path.resolve(wt.path) === path.resolve(worktreePath)
      );

      let worktreePathToUse = worktreePath;
      let worktreeExists = false;

      if (existingWorktree) {
        worktreeExists = true;
        worktreePathToUse = existingWorktree.path;
        p.log.info(`Worktree already exists for branch "${branch}" at "${worktreePathToUse}".`);
      } else if (fs.existsSync(worktreePath)) {
        worktreeExists = true;
        p.log.info(`Directory already exists at "${worktreePath}". Skipping git worktree creation.`);
      }

      if (!worktreeExists) {
        p.log.info(`Creating new git worktree for branch "${branch}"...`);
        git.createWorktree({
          worktreePath,
          branch,
          source: flags.source || opts.defaultBaseBranch,
          repoDir: repoRoot,
          bareRepo: opts.bareRepo,
        });
      }

      // Sync caller config file if worktree was freshly created
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
        isNew: !worktreeExists,
        isWorktree: true,
      };
    },

    async onBeforeSession(ctx) {
      if (!ctx.isWorktree) return;

      const activeConfig = ctx.config;
      if (activeConfig.hooks && typeof activeConfig.hooks.onSyncPrimary === 'function') {
        await activeConfig.hooks.onSyncPrimary(ctx);
      }
    },

    async onTeardown(context) {
      const { flags, config, cwd, driver } = context;
      if (!flags.isCleanup) return false;

      const opts = resolvePluginOptions(pluginOptions, config);
      const repoRoot = git.getRepoRootDir(cwd, opts.bareRepo);
      if (!repoRoot || !git.isGitRepo(cwd)) {
        return false;
      }

      const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: opts.bareRepo });
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
          p.log.info(`Auto-detected current worktree: "${target}"`);
        } else {
          return false;
        }
      }

      // 2. Resolve worktree target path and matching branch
      const isBare = git.isBareRepo(repoRoot);
      const defaultBase = isBare ? path.dirname(repoRoot) : path.join(repoRoot, '.worktrees');
      const baseDir = opts.worktreesBase || defaultBase;
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

      printSummary('Clean up worktree', [
        ['repository', repoRoot], ['directory', targetWorktreePath],
        ['branch', targetBranch || '(None detected)'],
        ['directory only', flags.dirOnly ? 'Yes (branches will be preserved)' : 'No'],
        ['keep remote', flags.keepRemote ? 'Yes' : 'No'],
      ]);

      // Safety check: Never delete root repository
      if (path.resolve(targetWorktreePath) === path.resolve(repoRoot)) {
        p.log.error(`Error: Cannot delete the repository root directory "${repoRoot}".`);
        process.exit(1);
      }

      // Safety check: Protected branches
      const protectedBranches = opts.protectedBranches;
      if (!flags.dirOnly && targetBranch && protectedBranches.includes(targetBranch)) {
        p.log.error(`\nError: Branch "${targetBranch}" is protected. Cannot delete protected branch.`);
        p.log.error(`Protected branches: ${protectedBranches.join(', ')}`);
        p.log.error(`If you only want to remove the worktree directory, use --dir-only.`);
        process.exit(1);
      }

      // Dirty check: Warn if uncommitted changes exist
      if (fs.existsSync(targetWorktreePath) && git.hasUncommittedChanges(targetWorktreePath) && !flags.force) {
        p.log.error(`\nError: Worktree at "${targetWorktreePath}" contains uncommitted changes.`);
        p.log.error(`Use --force / -f to delete anyway and discard changes.`);
        process.exit(1);
      }

      // If cwd is inside the target worktree, switch to safe directory
      if (path.resolve(process.cwd()).startsWith(path.resolve(targetWorktreePath))) {
        const safeDir = isBare ? path.dirname(repoRoot) : repoRoot;
        p.log.info(`Current working directory is inside target worktree. Switching to: ${safeDir}`);
        try {
          process.chdir(safeDir);
        } catch (e) {}
      }

      // Run workspace cleanup commands if configured
      if (fs.existsSync(targetWorktreePath) && Array.isArray(activeConfig.cleanup) && activeConfig.cleanup.length > 0) {
        p.log.info(`\nRunning workspace cleanup commands in "${targetWorktreePath}"...`);
        for (const cmd of activeConfig.cleanup) {
          p.log.info(`  $ ${cmd}`);
          try {
            execSync(cmd, { cwd: targetWorktreePath, stdio: 'inherit' });
          } catch (err) {
            p.log.warn(`Warning: Cleanup command failed: "${cmd}" (${err.message})`);
          }
        }
      }

      const ctx = createContext({
        worktreePath: targetWorktreePath,
        repoRoot,
        bareRepo: activeConfig.repo.bareRepo,
        branch: targetBranch,
        flags,
        preset: activeConfig.preset,
        config: activeConfig,
      });

      // Hook: onPreNuke (legacy hook fallback)
      if (typeof activeConfig.hooks.onPreNuke === 'function') {
        p.log.info('Running onPreNuke hook...');
        await activeConfig.hooks.onPreNuke(ctx);
      } else if (activeConfig.scaffold && activeConfig.scaffold.symlink) {
        p.log.info(`Removing web server symlink: ${activeConfig.scaffold.symlink}`);
        await ctx.setSymlink(activeConfig.scaffold.symlink, '');
      }

      // Remove Git Worktree
      if (existingWorktree || fs.existsSync(targetWorktreePath)) {
        p.log.info(`Removing git worktree at "${targetWorktreePath}"...`);
        try {
          git.removeWorktree({
            worktreePath: targetWorktreePath,
            force: flags.force,
            repoDir: repoRoot,
            bareRepo: activeConfig.repo.bareRepo,
          });
          p.log.info(`Worktree directory removed.`);
        } catch (err) {
          p.log.warn(`Warning: Standard worktree removal encountered an issue: ${err.message}`);
          if (flags.force && fs.existsSync(targetWorktreePath)) {
            p.log.info(`Force flag provided. Manually removing directory "${targetWorktreePath}"...`);
            fs.rmSync(targetWorktreePath, { recursive: true, force: true });
          }
        }
      }

      // Prune worktree list
      git.pruneWorktrees({ repoDir: repoRoot, bareRepo: activeConfig.repo.bareRepo });

      // Delete branches if not --dir-only
      if (!flags.dirOnly && targetBranch) {
        p.log.info(`Deleting local branch "${targetBranch}"...`);
        try {
          git.deleteLocalBranch({
            branch: targetBranch,
            force: flags.force,
            repoDir: repoRoot,
            bareRepo: activeConfig.repo.bareRepo,
          });
          p.log.info(`Local branch "${targetBranch}" deleted.`);
        } catch (err) {
          p.log.warn(`Warning: Could not delete local branch "${targetBranch}": ${err.message}`);
        }

        if (!flags.keepRemote) {
          p.log.info(`Deleting remote branch "${targetBranch}" on origin...`);
          try {
            git.deleteRemoteBranch({
              branch: targetBranch,
              repoDir: repoRoot,
              bareRepo: activeConfig.repo.bareRepo,
            });
            p.log.info(`Remote branch "${targetBranch}" deleted on origin.`);
          } catch (err) {
            p.log.warn(`Warning: Could not delete remote branch "${targetBranch}": ${err.message}`);
          }
        }
      }

      // Hook: onPostNuke
      if (typeof activeConfig.hooks.onPostNuke === 'function') {
        p.log.info('Running onPostNuke hook...');
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

      p.log.info(`\nWorktree "${targetDirname}" nuked successfully.\n`);
      return true;
    },

    /**
     * Handle CLI subcommands: `arise worktree <create|list|switch|nuke>`
     */
    async handleCommand(command, subargs = [], context = {}) {
      if (command !== 'worktree' && command !== 'wt') {
        return false;
      }

      const { executeSessionCreate, executeSessionClose } = require('../lifecycle/session');
      const { flags, config, cwd, driver } = context;
      const action = subargs[0] || 'list';

      if (action === 'create' || action === 'new' || action === 'add' || (!['list', 'ls', 'switch', 'open', 'nuke', 'rm', 'delete', 'cleanup'].includes(action) && subargs.length > 0)) {
        const branchName = (action === 'create' || action === 'new' || action === 'add') ? subargs[1] : subargs[0];
        if (!branchName) {
          if (process.stdin.isTTY) {
            await handleCreateWorktree(context);
            return true;
          }
          p.log.error('Error: branch name is required for worktree creation.\nUsage: arise worktree create <branch>');
          process.exit(1);
        }
        await executeSessionCreate({
          flags: { ...flags, branch: branchName },
          config,
          cwd,
          driver,
        });
        return true;
      }

      if (action === 'list' || action === 'ls') {
        await handleListWorktrees({ ...context, isInteractive: false });
        return true;
      }

      if (action === 'switch' || action === 'open') {
        const target = subargs[1];
        if (!target) {
          await handleSwitchWorktree(context);
          return true;
        }
        const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
        const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo?.bareRepo });
        const match = worktrees.find((wt) => wt.branch === target || path.basename(wt.path) === target);
        if (!match) {
          p.log.error(`Error: No worktree found matching "${target}". Run \`arise worktree list\` to see available worktrees.`);
          process.exit(1);
        }
        await executeSessionCreate({
          flags: { ...flags, branch: match.branch, targetDir: match.path },
          config,
          cwd: match.path,
          driver,
        });
        return true;
      }

      if (action === 'nuke' || action === 'rm' || action === 'delete' || action === 'cleanup') {
        const target = subargs[1];
        if (!target) {
          const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
          const worktrees = repoRoot ? git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo?.bareRepo }) : [];
          const currentCwd = path.resolve(cwd);
          const insideWorktree = worktrees.some((wt) => {
            if (wt.isBare) return false;
            const resolvedWtPath = path.resolve(wt.path);
            return (
              resolvedWtPath !== path.resolve(repoRoot) &&
              (currentCwd === resolvedWtPath || currentCwd.startsWith(resolvedWtPath + path.sep))
            );
          });
          if (!insideWorktree && process.stdin.isTTY) {
            await handleNukeWorktree(context);
            return true;
          }
        }
        await executeSessionClose({
          flags: { ...flags, isCleanup: true, cleanupTarget: target },
          config,
          cwd,
          driver,
        });
        return true;
      }

      return false;
    },

    menuActions(context) {
      if (!context.isGitRepo) return [];
      return [
        {
          value: 'worktree_create',
          label: 'Create worktree',
          title: 'Create worktree',
          group: 'Worktrees',
          shortcut: 'n',
          description: 'Create a branch and open it in a new workspace.',
          handler: async (ctx) => handleCreateWorktree(ctx),
        },
        {
          value: 'worktree_switch',
          label: 'Open worktree',
          title: 'Open worktree',
          group: 'Worktrees',
          shortcut: 'o',
          description: 'Open an existing worktree in a terminal session.',
          handler: async (ctx) => handleSwitchWorktree(ctx),
        },
        {
          value: 'worktree_list',
          label: 'List worktrees',
          title: 'List worktrees',
          group: 'Worktrees',
          shortcut: 'w',
          description: 'Browse worktrees, their paths, and active sessions.',
          handler: async (ctx) => handleListWorktrees({ ...ctx, isInteractive: true }),
        },
        {
          value: 'worktree_nuke',
          label: 'Clean up worktree',
          title: 'Clean up worktree',
          group: 'Worktrees',
          shortcut: 'x',
          danger: true,
          description: 'Remove selected worktrees and optionally their branches.',
          handler: async (ctx) => handleNukeWorktree(ctx),
        },
      ];
    },
  };
}

async function handleCreateWorktree(context) {
  const { executeSessionCreate } = require('../lifecycle/session');
  const { flags = {}, config = {}, cwd = process.cwd(), driver } = context;
  const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
  const gitOpts = { repoDir: repoRoot, bareRepo: config.repo?.bareRepo };
  const localBranches = git.getLocalBranches(gitOpts);
  const defaultSource = flags.source || config.repo?.defaultBaseBranch || 'main';

  clearScreen();
  p.intro('Create worktree');

  const branchChoices = [];
  if (defaultSource) {
    branchChoices.push({
      label: `${defaultSource} (Default)`,
      value: defaultSource,
    });
  }

  for (const b of localBranches) {
    if (b !== defaultSource && !branchChoices.some((c) => c.value === b)) {
      branchChoices.push({ label: b, value: b });
    }
  }

  branchChoices.push({
    label: 'Enter a custom branch or ref…',
    value: '__custom__',
  });

  const selectedChoice = await promptSelect({
    message: 'Select source base branch:',
    choices: branchChoices,
    defaultIndex: 0,
    section: 'Base branch',
  });

  if (!selectedChoice) return;

  let sourceBranch = typeof selectedChoice === 'object' ? selectedChoice.value : selectedChoice;
  if (sourceBranch === '__custom__') {
    sourceBranch = await promptText({
      message: 'Enter base branch or ref to branch off',
      defaultValue: defaultSource,
      validate: (val) => {
        const str = typeof val === 'string' ? val.trim() : (val ? String(val).trim() : '');
        return Boolean(str) || 'Base branch cannot be empty';
      },
    });
    if (sourceBranch === null) return;
  }

  const branchName = await promptText({
    message: 'Enter new branch name (e.g. feature/login, fix/api-cache)',
    validate: (val) => {
      const trimmed = typeof val === 'string' ? val.trim() : (val ? String(val).trim() : '');
      if (!trimmed) return 'Branch name cannot be empty';
      if (/\s/.test(trimmed)) return 'Branch name cannot contain spaces';
      return true;
    },
  });

  if (!branchName) return;

  const defaultDirname = branchName.replace(/\//g, '-');
  const customDir = await promptText({
    message: 'Worktree directory name',
    defaultValue: defaultDirname,
  });
  if (customDir === null) return;

  p.log.info(
    `${pc.bold('Branch:')}    ${pc.cyan(branchName)} ${pc.dim(`(off ${sourceBranch})`)}\n  ${pc.bold('Directory:')} ${pc.cyan(customDir)}`
  );

  await executeSessionCreate({
    flags: {
      ...flags,
      branch: branchName,
      source: sourceBranch,
      dirname: customDir,
    },
    config,
    cwd,
    driver,
  });
  return true;
}

async function handleSwitchWorktree(context) {
  const { executeSessionCreate } = require('../lifecycle/session');
  const { flags = {}, config = {}, cwd = process.cwd(), driver } = context;
  const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo?.bareRepo });
  const nonBare = worktrees.filter((wt) => !wt.isBare);

  clearScreen();
  p.intro('Open worktree');

  if (!nonBare.length) {
    p.log.warn('No existing worktrees found.');
    await promptPause();
    return;
  }

  const items = nonBare.map((wt) => {
    const isRoot = path.resolve(wt.path) === path.resolve(repoRoot);
    const branchLabel = wt.branch ? pc.bold(wt.branch) : pc.dim('(detached)');
    const rootTag = isRoot ? pc.magenta(' [repo root]') : '';

    return {
      label: `${branchLabel}${rootTag}`,
      description: wt.path,
      value: wt,
    };
  });

  const selected = await promptSelect({
    message: 'Select worktree to open in terminal session:',
    choices: items,
    section: 'Worktrees',
  });

  if (!selected) return;

  const wt = typeof selected === 'object' && selected.value ? selected.value : selected;
  const branchToUse = wt.branch || path.basename(wt.path);

  p.log.step(`Opening worktree "${branchToUse}" at "${wt.path}"...`);

  await executeSessionCreate({
    flags: {
      ...flags,
      branch: branchToUse,
      targetDir: wt.path,
    },
    config,
    cwd: wt.path,
    driver,
  });
  return true;
}

async function handleListWorktrees(context = {}) {
  const { config = {}, cwd = process.cwd(), driver } = context;
  const { resolveDriver } = require('../drivers');
  const activeDriver = driver || resolveDriver(config.multiplexer);
  const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo?.bareRepo });
  const sessions = activeDriver ? activeDriver.listSessions() : [];

  clearScreen();
  p.intro('List worktrees');

  if (!worktrees.length) {
    p.log.warn('No worktrees detected.');
    if (context.isInteractive && process.stdin.isTTY) await promptPause();
    return;
  }

  const items = worktrees.map((wt, idx) => {
    const isRoot = path.resolve(wt.path) === path.resolve(repoRoot);
    const rootTag = isRoot ? pc.magenta(' [repo root]') : '';
    const dirName = path.basename(wt.path);
    const hasSession = sessions.some((s) => s.name === dirName || s.name.includes(dirName) || s.cwd === wt.path);
    const sessionTag = hasSession
      ? `  ${pc.bold(pc.green(`● ${activeDriver ? activeDriver.name : 'session'} active`))}`
      : `  ${pc.dim('○ idle')}`;

    if (!context.isInteractive) {
      console.log(`  ${pc.cyan(`${idx + 1}.`)} ${wt.branch || '(detached)'}${rootTag}`);
      console.log(`     ${pc.dim('Path:')}    ${wt.path}`);
      console.log(`     ${pc.dim('Status:')}  ${sessionTag}\n`);
    }
    return {
      label: `${wt.branch || '(detached)'}${rootTag}  ${hasSession ? '● active' : '○ idle'}`,
      hint: `${wt.path} · ${hasSession ? 'Session active' : 'No active session'}`,
      value: wt.path,
    };
  });

  if (context.isInteractive && process.stdin.isTTY) {
    await promptSelect({ message: 'Worktrees in this repository', section: 'Worktrees', choices: items,
      keys: '↑ ↓ inspect   enter back   esc back' });
  }
}

async function handleNukeWorktree(context) {
  const { executeSessionClose } = require('../lifecycle/session');
  const { flags = {}, config = {}, cwd = process.cwd(), driver } = context;
  const repoRoot = git.getRepoRootDir(cwd, config.repo?.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo?.bareRepo });
  const candidateWorktrees = worktrees.filter((wt) => !wt.isBare && path.resolve(wt.path) !== path.resolve(repoRoot));

  clearScreen();
  p.intro('Clean up worktrees');

  if (!candidateWorktrees.length) {
    p.log.warn('No worktrees available for teardown.');
    await promptPause();
    return;
  }

  const items = candidateWorktrees.map((wt) => ({
    label: wt.branch || path.basename(wt.path),
    hint: wt.path,
    danger: true,
    value: wt,
  }));

  const selected = await promptMultiSelect({
    message: 'Select worktrees to remove',
    choices: items,
    section: 'Worktrees',
  });

  if (selected === null) return;
  if (!selected.length) {
    p.log.info('No worktrees selected.');
    await promptPause();
    return;
  }

  const deleteBranches = await promptConfirm({
    message: 'Also delete associated local and remote branches?',
    defaultYes: true,
    danger: true,
    hint: `Remove ${selected.length} worktree(s) and their associated local and remote branches.`,
  });
  if (deleteBranches === null) return;

  for (const target of selected) {
    await executeSessionClose({
      flags: {
        ...flags,
        isCleanup: true,
        cleanupTarget: target.path,
        branch: target.branch,
        dirOnly: !deleteBranches,
      },
      config,
      cwd,
      driver,
    });
  }

  p.log.success('Cleanup operations complete.');
  await promptPause();
}

module.exports = createWorktreePlugin;
module.exports.handleCreateWorktree = handleCreateWorktree;
module.exports.handleSwitchWorktree = handleSwitchWorktree;
module.exports.handleListWorktrees = handleListWorktrees;
module.exports.handleNukeWorktree = handleNukeWorktree;
