const path = require('path');
const git = require('./git');
const { resolveDriver } = require('./drivers');
const { executeSessionCreate } = require('./lifecycle/session');
const { initPluginManager } = require('./plugins');
const {
  clearScreen,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  promptPause,
  p,
  pc,
} = require('./tui/prompt');
const {
  handleCreateWorktree,
  handleSwitchWorktree,
  handleListWorktrees,
  handleNukeWorktree,
} = require('./plugins/worktree');
const pkg = require('../package.json');

function renderHeader(config, cwd = process.cwd(), driver = null) {
  const activeDriver = driver || resolveDriver(config?.multiplexer);
  const repoRoot = git.getRepoRootDir(cwd, config?.repo?.bareRepo);
  const presetName = config?.preset ? config.preset.name : 'generic';
  const sessions = activeDriver ? activeDriver.listSessions() : [];

  p.intro(`${pc.bold(pc.cyan('arise'))} ${pc.dim(`v${pkg.version}`)}`);
  console.log(`${pc.gray('│')}  ${pc.dim('Target:')}      ${pc.cyan(repoRoot || cwd)}`);
  console.log(
    `${pc.gray('│')}  ${pc.dim('Multiplexer:')} ${pc.magenta(activeDriver.name)}  ${pc.dim('•')}  ${pc.dim('Preset:')} ${pc.green(presetName)}  ${pc.dim('•')}  ${pc.dim('Sessions:')} ${pc.blue(`${sessions.length} active`)}`
  );
  console.log(`${pc.gray('│')}`);
}

async function handleLaunchSession(flags, config, cwd, driver) {
  p.log.step(`Bootstrapping ${driver.name} session in current directory: "${cwd}"...`);
  await executeSessionCreate({ flags, config, cwd, driver });
}

async function handleSwitchSession(flags, config, cwd, driver) {
  clearScreen();
  renderHeader(config, cwd, driver);
  const sessions = driver.listSessions();
  if (!sessions.length) {
    p.log.warn(`No active ${driver.name} sessions found.`);
    await promptPause();
    return;
  }

  const items = sessions.map((s) => ({
    label: s.name,
    hint: s.cwd || (s.active ? 'attached' : ''),
    value: s,
  }));

  const selected = await promptSelect({
    message: `Select ${driver.name} session to attach:`,
    choices: items,
  });

  if (!selected) return;
  const s = typeof selected === 'object' && selected.value ? selected.value : selected;

  p.log.step(`Attaching to session "${s.name}"...`);
  driver.attachOrSwitchSession(s.name);
}

async function startInteractiveMenu(flags, config, cwd = process.cwd()) {
  const driver = resolveDriver(config?.multiplexer, flags);
  const repoRoot = git.getRepoRootDir(cwd, config?.repo?.bareRepo);
  const isGit = Boolean(repoRoot && git.isGitRepo(cwd));
  const pluginManager = initPluginManager({ flags, config, cwd });

  while (true) {
    clearScreen();
    renderHeader(config, cwd, driver);

    const menuChoices = [
      {
        label: `Launch session in current directory (${driver.name})`,
        value: 'launch_current',
      },
      {
        label: 'Attach / switch to existing session',
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
        label: act.label || act.title,
        value: act.value,
        handler: act.handler,
      });
    }

    menuChoices.push(
      {
        label: 'Initialize / configure Arise',
        value: 'init',
      },
      {
        label: 'Exit',
        value: 'exit',
      }
    );

    const action = await promptSelect({
      message: 'What would you like to do?',
      choices: menuChoices,
    });

    const actionValue = typeof action === 'object' && action !== null ? action.value : action;

    if (!actionValue || actionValue === 'exit') {
      clearScreen();
      p.outro(pc.dim('Goodbye!'));
      break;
    }

    try {
      if (actionValue === 'launch_current') {
        await handleLaunchSession(flags, config, cwd, driver);
        break;
      } else if (actionValue === 'switch_session') {
        await handleSwitchSession(flags, config, cwd, driver);
        break;
      } else if (actionValue === 'init') {
        const { ConfigInitWizard } = require('./config/init');
        await ConfigInitWizard.run({ cwd });
        await promptPause();
      } else {
        const matchedPluginAction = pluginActions.find((a) => a.value === actionValue);
        if (matchedPluginAction && typeof matchedPluginAction.handler === 'function') {
          await matchedPluginAction.handler({ flags, config, cwd, driver });
          if (actionValue.includes('create') || actionValue.includes('switch') || actionValue.includes('open')) {
            break; // Finished creating or attaching to session
          }
        }
      }
    } catch (err) {
      p.log.error(`Error: ${err.message}`);
      await promptPause();
    }
  }
}

module.exports = {
  startInteractiveMenu,
  clearScreen,
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
