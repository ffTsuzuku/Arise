const path = require('path');
const readline = require('readline');
const git = require('./git');
const herdr = require('./herdr');
const { executeCreate } = require('./lifecycle/create');
const { executeNuke } = require('./lifecycle/nuke');
const pkg = require('../package.json');

const style = {
  bold: (s) => `\x1b[1m${s}\x1b[22m`,
  dim: (s) => `\x1b[2m${s}\x1b[22m`,
  cyan: (s) => `\x1b[36m${s}\x1b[39m`,
  green: (s) => `\x1b[32m${s}\x1b[39m`,
  yellow: (s) => `\x1b[33m${s}\x1b[39m`,
  red: (s) => `\x1b[31m${s}\x1b[39m`,
  magenta: (s) => `\x1b[35m${s}\x1b[39m`,
  blue: (s) => `\x1b[34m${s}\x1b[39m`,
  gray: (s) => `\x1b[90m${s}\x1b[39m`,
  bgCyan: (s) => `\x1b[46m\x1b[30m${s}\x1b[39m\x1b[49m`,
};

function promptSelect({ title, items = [], defaultIndex = 0 }) {
  if (!items.length) return Promise.resolve(null);

  if (!process.stdin.isTTY) {
    // Non-TTY fallback
    return new Promise((resolve) => {
      console.log(`\n${title}`);
      items.forEach((item, idx) => {
        const label = typeof item === 'object' ? (item.title || item.label || item.value) : item;
        console.log(`  ${idx + 1}) ${label}`);
      });
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(`Enter choice (1-${items.length}): `, (answer) => {
        rl.close();
        const num = parseInt(answer.trim(), 10);
        if (!isNaN(num) && num >= 1 && num <= items.length) {
          resolve(items[num - 1]);
        } else {
          resolve(items[defaultIndex] || items[0]);
        }
      });
    });
  }

  return new Promise((resolve) => {
    let selectedIndex = Math.max(0, Math.min(defaultIndex, items.length - 1));
    let renderedLineCount = 0;

    const render = (isInitial = false) => {
      const lines = [];
      if (title) {
        lines.push(`${style.bold(style.cyan('?'))} ${style.bold(title)} ${style.gray('(Use arrow keys or numbers, Enter to select)')}`);
      }

      items.forEach((item, idx) => {
        const isSelected = idx === selectedIndex;
        const pointer = isSelected ? style.cyan('❯') : ' ';
        const numStr = style.gray(`${idx + 1})`);
        const label = typeof item === 'object' ? (item.title || item.label || item.value) : item;
        const desc = typeof item === 'object' && item.description ? ` ${style.dim(item.description)}` : '';

        if (isSelected) {
          lines.push(` ${pointer} ${numStr} ${style.bold(style.cyan(label))}${desc}`);
        } else {
          lines.push(` ${pointer} ${numStr} ${label}${desc}`);
        }
      });

      if (!isInitial && renderedLineCount > 0) {
        readline.moveCursor(process.stdout, 0, -renderedLineCount);
        readline.clearScreenDown(process.stdout);
      }

      process.stdout.write(lines.join('\n') + '\n');
      renderedLineCount = lines.length;
    };

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    render(true);

    const onKeypress = (str, key) => {
      if (key && (key.ctrl && key.name === 'c')) {
        cleanup();
        process.stdout.write('\n');
        process.exit(0);
      }

      if (key && (key.name === 'escape' || str === 'q')) {
        cleanup();
        resolve(null);
        return;
      }

      if (key && (key.name === 'up' || key.name === 'k')) {
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        render();
        return;
      }

      if (key && (key.name === 'down' || key.name === 'j')) {
        selectedIndex = (selectedIndex + 1) % items.length;
        render();
        return;
      }

      // Quick number select (1..9)
      const num = parseInt(str, 10);
      if (!isNaN(num) && num >= 1 && num <= items.length) {
        selectedIndex = num - 1;
        cleanup();
        resolve(items[selectedIndex]);
        return;
      }

      if (key && (key.name === 'return' || key.name === 'enter' || key.name === 'space')) {
        cleanup();
        resolve(items[selectedIndex]);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw || false);
      }
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function promptMultiSelect({ title, items = [] }) {
  if (!items.length) return Promise.resolve([]);

  if (!process.stdin.isTTY) {
    return Promise.resolve(items);
  }

  return new Promise((resolve) => {
    let cursorIndex = 0;
    const selected = new Set();
    let renderedLineCount = 0;

    const render = (isInitial = false) => {
      const lines = [];
      if (title) {
        lines.push(`${style.bold(style.cyan('?'))} ${style.bold(title)} ${style.gray('(Space to toggle, "a" to toggle all, Enter to confirm)')}`);
      }

      items.forEach((item, idx) => {
        const isCursor = idx === cursorIndex;
        const isChecked = selected.has(idx);
        const pointer = isCursor ? style.cyan('❯') : ' ';
        const checkbox = isChecked ? style.green('[✔]') : style.gray('[ ]');
        const label = typeof item === 'object' ? (item.title || item.label || item.value) : item;
        const desc = typeof item === 'object' && item.description ? ` ${style.dim(item.description)}` : '';

        if (isCursor) {
          lines.push(` ${pointer} ${checkbox} ${style.bold(style.cyan(label))}${desc}`);
        } else {
          lines.push(` ${pointer} ${checkbox} ${label}${desc}`);
        }
      });

      if (!isInitial && renderedLineCount > 0) {
        readline.moveCursor(process.stdout, 0, -renderedLineCount);
        readline.clearScreenDown(process.stdout);
      }

      process.stdout.write(lines.join('\n') + '\n');
      renderedLineCount = lines.length;
    };

    readline.emitKeypressEvents(process.stdin);
    const wasRaw = process.stdin.isRaw;
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    render(true);

    const onKeypress = (str, key) => {
      if (key && (key.ctrl && key.name === 'c')) {
        cleanup();
        process.stdout.write('\n');
        process.exit(0);
      }

      if (key && (key.name === 'escape' || str === 'q')) {
        cleanup();
        resolve([]);
        return;
      }

      if (key && (key.name === 'up' || key.name === 'k')) {
        cursorIndex = (cursorIndex - 1 + items.length) % items.length;
        render();
        return;
      }

      if (key && (key.name === 'down' || key.name === 'j')) {
        cursorIndex = (cursorIndex + 1) % items.length;
        render();
        return;
      }

      if (str === ' ' || (key && key.name === 'space')) {
        if (selected.has(cursorIndex)) {
          selected.delete(cursorIndex);
        } else {
          selected.add(cursorIndex);
        }
        render();
        return;
      }

      if (str === 'a' || str === 'A') {
        if (selected.size === items.length) {
          selected.clear();
        } else {
          items.forEach((_, idx) => selected.add(idx));
        }
        render();
        return;
      }

      if (key && (key.name === 'return' || key.name === 'enter')) {
        cleanup();
        // If none explicitly checked, use the item currently under the cursor
        const results = selected.size > 0
          ? Array.from(selected).map(idx => items[idx])
          : [items[cursorIndex]];
        resolve(results);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw || false);
      }
      process.stdin.pause();
    };

    process.stdin.on('keypress', onKeypress);
  });
}

function promptText({ question, defaultValue = '', validate = null }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const defaultHint = defaultValue ? style.gray(` (${defaultValue})`) : '';
  const promptStr = `${style.bold(style.cyan('?'))} ${style.bold(question)}${defaultHint}: `;

  return new Promise((resolve) => {
    const ask = () => {
      rl.question(promptStr, (answer) => {
        const val = answer.trim() || defaultValue;
        if (validate) {
          const valid = validate(val);
          if (valid !== true) {
            console.log(`  ${style.red('✖')} ${valid || 'Invalid input'}`);
            ask();
            return;
          }
        }
        rl.close();
        resolve(val);
      });
    };
    ask();
  });
}

function promptConfirm({ question, defaultYes = false }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const promptStr = `${style.bold(style.yellow('?'))} ${style.bold(question)} ${style.dim(hint)}: `;

  return new Promise((resolve) => {
    rl.question(promptStr, (answer) => {
      rl.close();
      const val = answer.trim().toLowerCase();
      if (!val) {
        resolve(defaultYes);
      } else {
        resolve(val === 'y' || val === 'yes');
      }
    });
  });
}

function promptPause(message = 'Press Enter to continue...') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${style.dim(message)}`, () => {
      rl.close();
      resolve();
    });
  });
}

function renderHeader(config, cwd = process.cwd()) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const presetName = config.preset ? config.preset.name : 'generic';
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });
  const workspaces = herdr.listWorkspaces();

  console.log(`\n${style.bold(style.cyan('  ┌─────────────────────────────────────────────────────────────┐'))}`);
  console.log(`${style.bold(style.cyan('  │'))}  ${style.bold(style.magenta('🚀 ARISE'))} ${style.dim(`v${pkg.version}`)} — ${style.bold('Git Worktree & Herdr Orchestrator')}        ${style.bold(style.cyan('│'))}`);
  console.log(`${style.bold(style.cyan('  └─────────────────────────────────────────────────────────────┘'))}`);
  console.log(`  ${style.bold('Repository:')} ${style.cyan(repoRoot)}`);
  console.log(`  ${style.bold('Preset:')}     ${style.green(presetName)}  │  ${style.bold('Worktrees:')} ${style.yellow(worktrees.length)}  │  ${style.bold('Herdr Sessions:')} ${style.blue(workspaces.length)}\n`);
}

async function handleCreateWorktree(flags, config, cwd) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const gitOpts = { repoDir: repoRoot, bareRepo: config.repo.bareRepo };
  const localBranches = git.getLocalBranches(gitOpts);
  const defaultSource = flags.source || config.repo.defaultBaseBranch || 'main';

  console.log(`\n${style.bold(style.cyan('=== 🚀 Create New Git Worktree ==='))}\n`);

  // 1. Select / Enter Base Source Branch
  const branchChoices = [];
  if (defaultSource) {
    branchChoices.push({
      title: `${defaultSource} ${style.green('(Preset Default)')}`,
      value: defaultSource,
    });
  }

  for (const b of localBranches) {
    if (b !== defaultSource && !branchChoices.some(c => c.value === b)) {
      branchChoices.push({ title: b, value: b });
    }
  }

  branchChoices.push({
    title: `[ Enter custom branch or ref... ]`,
    value: '__custom__',
  });

  const selectedChoice = await promptSelect({
    title: 'Select source base branch:',
    items: branchChoices,
    defaultIndex: 0,
  });

  if (!selectedChoice) return;

  let sourceBranch = selectedChoice.value;
  if (sourceBranch === '__custom__') {
    sourceBranch = await promptText({
      question: 'Enter base branch or ref to branch off',
      defaultValue: defaultSource,
      validate: (val) => Boolean(val.trim()) || 'Base branch cannot be empty',
    });
  }

  // 2. Enter New Branch Name
  const branchName = await promptText({
    question: 'Enter new branch name (e.g. feature/login, fix/api-cache)',
    validate: (val) => {
      const trimmed = val.trim();
      if (!trimmed) return 'Branch name cannot be empty';
      if (/\s/.test(trimmed)) return 'Branch name cannot contain spaces';
      return true;
    },
  });

  if (!branchName) return;

  // 3. Optional Dirname
  const defaultDirname = branchName.replace(/\//g, '-');
  const customDir = await promptText({
    question: 'Worktree directory name',
    defaultValue: defaultDirname,
  });

  // 4. Optional Herdr Workspace Name
  const prefix = config.workspace.labelPrefix || '';
  const defaultWs = (prefix && !customDir.startsWith(prefix.trim())) ? `${prefix}${customDir}` : customDir;
  const customWs = await promptText({
    question: 'Herdr workspace label',
    defaultValue: defaultWs,
  });

  console.log(`\n${style.bold(style.green('✓'))} Ready to create worktree:`);
  console.log(`  • Branch:    ${style.cyan(branchName)} (off ${style.yellow(sourceBranch)})`);
  console.log(`  • Directory: ${style.cyan(customDir)}`);
  console.log(`  • Workspace: ${style.cyan(customWs)}\n`);

  await executeCreate({
    ...flags,
    branch: branchName,
    source: sourceBranch,
    dirname: customDir,
    workspaceName: customWs,
  }, config, cwd);
}

async function handleSwitchWorktree(flags, config, cwd) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });
  const nonBare = worktrees.filter(wt => !wt.isBare);

  console.log(`\n${style.bold(style.cyan('=== 🔄 Switch / Open Existing Worktree in Herdr ==='))}\n`);

  if (!nonBare.length) {
    console.log(`  ${style.yellow('No existing worktrees found.')}`);
    await promptPause();
    return;
  }

  const items = nonBare.map(wt => {
    const isRoot = path.resolve(wt.path) === path.resolve(repoRoot);
    const branchLabel = wt.branch ? style.bold(wt.branch) : style.dim('(detached)');
    const rootTag = isRoot ? style.magenta(' [repo root]') : '';
    const dirLabel = path.basename(wt.path);

    return {
      title: `${branchLabel}${rootTag}`,
      description: `${wt.path}`,
      value: wt,
    };
  });

  const selected = await promptSelect({
    title: 'Select worktree to open in Herdr:',
    items,
  });

  if (!selected || !selected.value) return;

  const wt = selected.value;
  const branchToUse = wt.branch || path.basename(wt.path);
  const dirToUse = path.basename(wt.path);

  console.log(`\nOpening worktree "${branchToUse}" at "${wt.path}" in Herdr...`);

  await executeCreate({
    ...flags,
    branch: branchToUse,
    dirname: dirToUse,
  }, config, cwd);
}

async function handleListWorktrees(flags, config, cwd) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });
  const workspaces = herdr.listWorkspaces();

  console.log(`\n${style.bold(style.cyan('=== 📋 Active Git Worktrees ==='))}\n`);

  if (!worktrees.length) {
    console.log(`  ${style.yellow('No worktrees detected.')}`);
    await promptPause();
    return;
  }

  worktrees.forEach((wt, idx) => {
    const isRoot = path.resolve(wt.path) === path.resolve(repoRoot);
    const dirName = path.basename(wt.path);
    const activeWs = workspaces.find(w => w.label === dirName || (wt.branch && w.label === wt.branch) || (w.cwd && path.resolve(w.cwd) === path.resolve(wt.path)));

    const branchStr = wt.branch ? style.bold(style.cyan(wt.branch)) : (wt.isBare ? style.dim('(bare repo)') : style.yellow('(detached)'));
    const rootBadge = isRoot ? ` ${style.magenta('[root]')}` : '';
    const wsBadge = activeWs ? ` ${style.green(`● Herdr: "${activeWs.label}"`)}` : ` ${style.dim('○ Herdr: (inactive)')}`;

    console.log(`  ${style.bold(`${idx + 1}.`)} ${branchStr}${rootBadge}${wsBadge}`);
    console.log(`     ${style.dim('Path:')} ${wt.path}`);
  });

  console.log(`\n  ${style.bold('Total:')} ${worktrees.length} worktree(s)`);
  await promptPause();
}

async function handleNukeWorktree(flags, config, cwd) {
  const repoRoot = git.getRepoRootDir(cwd, config.repo.bareRepo);
  const worktrees = git.getWorktrees({ repoDir: repoRoot, bareRepo: config.repo.bareRepo });

  // Safe nukable worktrees (exclude root repository)
  const nukable = worktrees.filter(wt => {
    if (wt.isBare) return false;
    return path.resolve(wt.path) !== path.resolve(repoRoot);
  });

  console.log(`\n${style.bold(style.red('=== 🧹 Nuke / Cleanup Worktree ==='))}\n`);

  if (!nukable.length) {
    console.log(`  ${style.yellow('No worktrees available to nuke (cannot delete repository root).')}`);
    await promptPause();
    return;
  }

  const items = nukable.map(wt => {
    const branchLabel = wt.branch ? style.bold(wt.branch) : style.dim('(detached)');
    return {
      title: branchLabel,
      description: wt.path,
      value: wt,
    };
  });

  const selectedItems = await promptMultiSelect({
    title: 'Select worktree(s) to cleanup / nuke:',
    items,
  });

  if (!selectedItems || !selectedItems.length) return;

  const targets = selectedItems.map(s => s.value || s);

  console.log(`\n${style.bold('Selected for teardown:')}`);
  targets.forEach(t => console.log(`  • ${style.cyan(t.branch || path.basename(t.path))} (${t.path})`));

  const deleteBranches = await promptConfirm({
    question: 'Delete local & remote Git branches too?',
    defaultYes: true,
  });

  const force = await promptConfirm({
    question: 'Force removal if uncommitted changes exist?',
    defaultYes: false,
  });

  const confirmed = await promptConfirm({
    question: `⚠️  Are you sure you want to permanently delete ${targets.length} worktree(s)?`,
    defaultYes: false,
  });

  if (!confirmed) {
    console.log(`\nOperation cancelled.`);
    await promptPause();
    return;
  }

  for (const target of targets) {
    console.log(`\n--- Nuking ${target.path} ---`);
    await executeNuke({
      ...flags,
      cleanupTarget: target.path,
      branch: target.branch,
      dirOnly: !deleteBranches,
      force,
    }, config, cwd);
  }

  console.log(`\n${style.bold(style.green('✓'))} Cleanup operations complete.`);
  await promptPause();
}

async function startInteractiveMenu(flags, config, cwd = process.cwd()) {
  while (true) {
    renderHeader(config, cwd);

    const menuChoices = [
      {
        title: '🚀 Create new worktree',
        description: 'Branch off source, scaffold environment, and boot Herdr workspace',
        value: 'create',
      },
      {
        title: '🔄 Switch / Open existing worktree in Herdr',
        description: 'Select an existing worktree and attach terminal workspace',
        value: 'switch',
      },
      {
        title: '📋 List worktrees',
        description: 'View all active worktrees and Herdr workspace status',
        value: 'list',
      },
      {
        title: '🧹 Nuke / Cleanup worktree',
        description: 'Safely tear down worktree directory and associated branches',
        value: 'nuke',
      },
      {
        title: '🚪 Exit',
        description: 'Close interactive menu',
        value: 'exit',
      },
    ];

    const action = await promptSelect({
      title: 'What would you like to do?',
      items: menuChoices,
    });

    if (!action || action.value === 'exit') {
      console.log(`\nGoodbye! 👋\n`);
      break;
    }

    try {
      if (action.value === 'create') {
        await handleCreateWorktree(flags, config, cwd);
        break; // After creating & attaching Herdr session, finish
      } else if (action.value === 'switch') {
        await handleSwitchWorktree(flags, config, cwd);
        break; // After switching & attaching Herdr session, finish
      } else if (action.value === 'list') {
        await handleListWorktrees(flags, config, cwd);
      } else if (action.value === 'nuke') {
        await handleNukeWorktree(flags, config, cwd);
      }
    } catch (err) {
      console.error(`\n${style.red('Error:')} ${err.message}`);
      await promptPause();
    }
  }
}

module.exports = {
  startInteractiveMenu,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  promptPause,
  handleCreateWorktree,
  handleSwitchWorktree,
  handleListWorktrees,
  handleNukeWorktree,
};

