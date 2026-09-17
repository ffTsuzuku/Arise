const path = require('path');
const readline = require('readline');
const git = require('./git');
const { resolveDriver } = require('./drivers');
const { executeSessionCreate } = require('./lifecycle/session');
const { initPluginManager } = require('./plugins');
const {
  handleCreateWorktree,
  handleSwitchWorktree,
  handleListWorktrees,
  handleNukeWorktree,
} = require('./plugins/worktree');
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
};

function promptSelect({ title, items = [], defaultIndex = 0 }) {
  if (!items.length) return Promise.resolve(null);

  if (!process.stdin.isTTY) {
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
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
        render();
      } else if (key && (key.name === 'down' || key.name === 'j')) {
        selectedIndex = selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
        render();
      } else if (key && key.name === 'return') {
        cleanup();
        resolve(items[selectedIndex]);
      } else if (str && /^[1-9]$/.test(str)) {
        const num = parseInt(str, 10);
        if (num <= items.length) {
          selectedIndex = num - 1;
          render();
        }
      }
    };

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw);
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

function promptMultiSelect({ title, items = [] }) {
  if (!items.length) return Promise.resolve([]);
  return Promise.resolve(items);
}

function promptText({ question, defaultValue = '', validate = () => true }) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const q = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    rl.question(q, (answer) => {
      rl.close();
      const finalVal = answer.trim() || defaultValue;
      resolve(finalVal);
    });
  });
}

function promptConfirm(question, defaultYes = false) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    const defHint = defaultYes ? '[Y/n]' : '[y/N]';
    rl.question(`${question} ${defHint}: `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (!trimmed) resolve(defaultYes);
      else resolve(trimmed === 'y' || trimmed === 'yes');
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

function renderHeader(config, cwd = process.cwd(), driver = null) {
  const activeDriver = driver || resolveDriver(config?.multiplexer);
  const repoRoot = git.getRepoRootDir(cwd, config?.repo?.bareRepo);
  const presetName = config?.preset ? config.preset.name : 'generic';
  const worktrees = repoRoot ? git.getWorktrees({ repoDir: repoRoot, bareRepo: config?.repo?.bareRepo }) : [];
  const sessions = activeDriver ? activeDriver.listSessions() : [];

  console.log(`\n${style.bold(style.cyan('  ┌─────────────────────────────────────────────────────────────┐'))}`);
  console.log(`${style.bold(style.cyan('  │'))}  ${style.bold(style.magenta('🚀 ARISE'))} ${style.dim(`v${pkg.version}`)} — ${style.bold('Terminal Workspace Bootstrapper')}            ${style.bold(style.cyan('│'))}`);
  console.log(`${style.bold(style.cyan('  └─────────────────────────────────────────────────────────────┘'))}`);
  if (repoRoot) {
    console.log(`  ${style.bold('Repository:')}   ${style.cyan(repoRoot)}`);
  } else {
    console.log(`  ${style.bold('Directory:')}    ${style.cyan(cwd)}`);
  }
  console.log(`  ${style.bold('Multiplexer:')}  ${style.magenta(activeDriver.name)}  │  ${style.bold('Preset:')} ${style.green(presetName)}  │  ${style.bold('Sessions:')} ${style.blue(sessions.length)}\n`);
}

async function handleLaunchSession(flags, config, cwd, driver) {
  console.log(`\nBootstrapping ${driver.name} session in current directory: "${cwd}"...`);
  await executeSessionCreate({ flags, config, cwd, driver });
}

async function handleSwitchSession(flags, config, cwd, driver) {
  const sessions = driver.listSessions();
  if (!sessions.length) {
    console.log(`\n${style.yellow(`No active ${driver.name} sessions found.`)}`);
    await promptPause();
    return;
  }

  const items = sessions.map((s) => ({
    title: `${style.bold(s.name)} ${s.active ? style.green('[attached]') : ''}`,
    description: s.cwd || '',
    value: s,
  }));

  const selected = await promptSelect({
    title: `Select ${driver.name} session to attach:`,
    items,
  });

  if (!selected || !selected.value) return;

  console.log(`Attaching to session "${selected.value.name}"...`);
  driver.attachOrSwitchSession(selected.value.name);
}

async function startInteractiveMenu(flags, config, cwd = process.cwd()) {
  const driver = resolveDriver(config?.multiplexer, flags);
  const repoRoot = git.getRepoRootDir(cwd, config?.repo?.bareRepo);
  const isGit = Boolean(repoRoot && git.isGitRepo(cwd));
  const pluginManager = initPluginManager({ flags, config, cwd });

  while (true) {
    renderHeader(config, cwd, driver);

    const menuChoices = [
      {
        title: `🚀 Launch session in current directory (${driver.name})`,
        description: `Orchestrate terminal layout for current project in ${driver.name}`,
        value: 'launch_current',
      },
      {
        title: `🔄 Attach / Switch to existing session`,
        description: `Connect to an active ${driver.name} workspace or session`,
        value: 'switch_session',
      },
    ];

    // Collect dynamic plugin actions (e.g. Git worktree operations)
    const pluginActions = pluginManager.getMenuActions({
      flags,
      config,
      cwd,
      driver,
      isGitRepo: isGit,
    });

    for (const act of pluginActions) {
      menuChoices.push({
        title: act.title,
        description: act.description,
        value: act.value,
        handler: act.handler,
      });
    }

    menuChoices.push(
      {
        title: '⚙️  Initialize / Configure Arise',
        description: 'Run interactive setup wizard to generate or update .ariserc.json',
        value: 'init',
      },
      {
        title: '🚪 Exit',
        description: 'Close interactive menu',
        value: 'exit',
      }
    );

    const action = await promptSelect({
      title: 'What would you like to do?',
      items: menuChoices,
    });

    if (!action || action.value === 'exit') {
      console.log(`\nGoodbye! 👋\n`);
      break;
    }

    try {
      if (action.value === 'launch_current') {
        await handleLaunchSession(flags, config, cwd, driver);
        break;
      } else if (action.value === 'switch_session') {
        await handleSwitchSession(flags, config, cwd, driver);
        break;
      } else if (action.value === 'init') {
        const { ConfigInitWizard } = require('./config/init');
        await ConfigInitWizard.run({ cwd });
        await promptPause();
      } else {
        const matchedPluginAction = pluginActions.find((a) => a.value === action.value);
        if (matchedPluginAction && typeof matchedPluginAction.handler === 'function') {
          await matchedPluginAction.handler({ flags, config, cwd, driver });
          if (action.value.includes('create') || action.value.includes('switch') || action.value.includes('open')) {
            break; // Finished creating or attaching to session
          }
        }
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
  handleLaunchSession,
  handleSwitchSession,
  handleCreateWorktree,
  handleSwitchWorktree,
  handleListWorktrees,
  handleNukeWorktree,
};
