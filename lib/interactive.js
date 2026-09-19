const git = require('./git');
const { resolveDriver } = require('./drivers');
const { executeSessionCreate } = require('./lifecycle/session');
const { initPluginManager } = require('./plugins');
const { resolveConfiguration } = require('./config');
const {
  isInteractive,
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
const { setContext, shortPath } = require('./tui/theme');

function renderHeader(config, cwd = process.cwd(), driver = null) {
  const activeDriver = driver || resolveDriver(config?.multiplexer);
  const presetName = config?.preset ? config.preset.name : 'generic';
  const sessions = activeDriver ? activeDriver.listSessions() : [];

  setContext({ cwd, multiplexer: activeDriver.name, preset: presetName, sessions: sessions.length });
}

async function handleLaunchSession(flags, config, cwd, driver) {
  p.log.step(`Bootstrapping ${driver.name} session in current directory: "${cwd}"...`);
  await executeSessionCreate({ flags, config, cwd, driver });
}

async function handleSwitchSession(flags, config, cwd, driver) {
  clearScreen();
  renderHeader(config, cwd, driver);
  p.intro('Switch session');
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
    section: 'Sessions',
  });

  if (!selected) return;
  const s = typeof selected === 'object' && selected.value ? selected.value : selected;

  p.log.step(`Attaching to session "${s.name}"...`);
  driver.attachOrSwitchSession(s.name);
  return true;
}

async function handleInstallAgentReadme(cwd) {
  clearScreen();
  p.intro('Install AI-agent README');
  const scope = await promptSelect({
    message: 'Where should the Arise agent guide (SKILL.md) be installed?',
    choices: [
      {
        label: 'Global',
        value: 'global',
        hint: '~/.agents/skills/arise/ — available across projects.',
      },
      {
        label: 'This directory',
        value: 'local',
        hint: `${shortPath(cwd)}/.agents/skills/arise/ — for this workspace.`,
      },
      { label: 'Back', value: 'back', subtle: true },
    ],
  });
  if (!scope || scope === 'back') return;

  const { installSkill } = require('./skill');
  installSkill({ scope, cwd });
  await promptPause();
}

async function startInteractiveMenu(flags, config, cwd = process.cwd()) {
  if (!isInteractive()) {
    p.log.info('The menu needs an interactive terminal. Use arise --help for commands.');
    return;
  }
  let driver = resolveDriver(config?.multiplexer, flags);
  const repoRoot = git.getRepoRootDir(cwd, config?.repo?.bareRepo);
  const isGit = Boolean(repoRoot && git.isGitRepo(cwd));
  let pluginManager = initPluginManager({ flags, config, cwd });
  let menuIndex = 0;

  while (true) {
    clearScreen();
    renderHeader(config, cwd, driver);

    const menuChoices = [
      {
        label: 'Launch session',
        value: 'launch_current',
        group: 'Sessions',
        shortcut: 'l',
        hint: `Start a ${driver.name} session in ${shortPath(cwd)}.`,
      },
      {
        label: 'Switch session',
        value: 'switch_session',
        group: 'Sessions',
        shortcut: 's',
        hint: `Switch to an active ${driver.name} session.`,
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
        ...act,
        label: act.label || act.title,
        group: act.group || 'Extensions',
        hint: act.hint || act.description,
      });
    }

    menuChoices.push(
      {
        label: 'Configure',
        value: 'init',
        group: 'Arise',
        shortcut: 'c',
        hint: 'Set up this project or create a reusable preset.',
      },
      {
        label: 'Install AI-agent README',
        value: 'install_skill',
        group: 'Arise',
        shortcut: 'a',
        hint: 'Install the Arise usage guide for AI agents globally or in this directory.',
      },
      {
        label: 'Exit',
        value: 'exit',
        group: 'Arise',
        shortcut: 'q',
        subtle: true,
        hint: 'Close Arise and return to your terminal.',
      }
    );

    const action = await promptSelect({
      choices: menuChoices,
      defaultIndex: menuIndex,
    });

    const actionValue = typeof action === 'object' && action !== null ? action.value : action;
    menuIndex = Math.max(0, menuChoices.findIndex((choice) => choice.value === actionValue));

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
        if (await handleSwitchSession(flags, config, cwd, driver)) break;
      } else if (actionValue === 'install_skill') {
        await handleInstallAgentReadme(cwd);
      } else if (actionValue === 'init') {
        const { ConfigInitWizard } = require('./config/init');
        if (await ConfigInitWizard.run({ cwd })) {
          config = resolveConfiguration(flags, cwd);
          driver = resolveDriver(config.multiplexer, flags);
          pluginManager = initPluginManager({ flags, config, cwd });
          await promptPause();
        }
      } else {
        const matchedPluginAction = pluginActions.find((a) => a.value === actionValue);
        if (matchedPluginAction && typeof matchedPluginAction.handler === 'function') {
          const completed = await matchedPluginAction.handler({ flags, config, cwd, driver });
          if (completed && (actionValue.includes('create') || actionValue.includes('switch') || actionValue.includes('open'))) {
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
