const pkg = require('./package.json');
const { parseArgs, showUsage } = require('./lib/cli');
const { resolveConfiguration } = require('./lib/config');
const { executeSessionCreate, executeSessionClose } = require('./lib/lifecycle/session');
const { resolveDriver } = require('./lib/drivers');
const { initPluginManager } = require('./lib/plugins');
const logger = require('./lib/logger');
const { printSummary, paint, shortPath } = require('./lib/tui/theme');

async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const flags = parseArgs(argv);
  logger.initLogger(flags);

  if (flags.showHelp) {
    showUsage();
    process.exit(0);
  }

  if (flags.showVersion) {
    console.log(`arise v${pkg.version}`);
    process.exit(0);
  }

  try {
    if (flags.installSkill) {
      const { installSkill } = require('./lib/skill');
      installSkill({ scope: flags.skillScope, cwd });
      process.exit(0);
    }

    if (flags.isInit) {
      const { ConfigInitWizard } = require('./lib/config/init');
      await ConfigInitWizard.run({
        quick: flags.quick || flags.yes,
        local: flags.skillScope === 'local',
        global: flags.skillScope === 'global' && flags.rawArgs.includes('--global'),
        targetPath: flags.targetPath,
        force: flags.force,
        gitignore: flags.gitignore,
        initTarget: flags.initTarget,
        presetOnly: flags.initTarget === 'preset',
        presetName: flags.presetName,
        multiplexer: flags.multiplexer,
        agent: flags.agent || undefined,
        focusTarget: flags.focusTarget,
        cwd,
      });
      return;
    }

    const config = resolveConfiguration(flags, cwd);
    const driver = resolveDriver(config.multiplexer, flags);
    const pluginManager = initPluginManager({ flags, config, cwd });

    logger.debug(`Loaded configuration for cwd="${cwd}":`, {
      multiplexer: driver.name,
      configFile: config.configFile,
      preset: config.preset?.name,
      layoutCount: config.layout?.length,
      panes: config.layout?.map((p) => ({ id: p.id, title: p.title, from: p.from, split: p.split })),
    });

    // Subcommand dispatch (e.g. arise worktree create|list|switch|nuke)
    if (flags.subcommand) {
      const handled = await pluginManager.hookHandleCommand(flags.subcommand, flags.subargs, {
        flags,
        config,
        cwd,
        driver,
        pluginManager,
      });
      if (handled) return;
    }

    if (flags.listSessions) {
      const sessions = driver.listSessions();
      printSummary('Sessions', [['mux', driver.name], ['active sessions', sessions.length]]);
      if (!sessions.length) {
        console.log(paint('  No active sessions found.', 'muted'));
      } else {
        for (const s of sessions) {
          const activeTag = s.active ? paint('● attached', 'success') : '';
          console.log(`  ${paint(s.name, 'accent')}  ${activeTag}`);
          if (s.cwd) console.log(`  ${paint(shortPath(s.cwd), 'muted')}\n`);
        }
      }
      console.log();
      return;
    }

    if (flags.isCleanup || flags.isKill) {
      await executeSessionClose({ flags, config, cwd, pluginManager, driver });
      return;
    }

    // Interactive CLI / TUI Mode (arise with zero args or --interactive flag)
    const isZeroArgs = flags.rawArgs.length === 0 && !flags.branch && !flags.targetDir && !flags.subcommand;
    if (flags.interactive || isZeroArgs) {
      if (process.stdin.isTTY || flags.interactive) {
        const { startInteractiveMenu } = require('./lib/interactive');
        await startInteractiveMenu(flags, config, cwd);
        return;
      }
    }

    await executeSessionCreate({ flags, config, cwd, pluginManager, driver });
  } catch (err) {
    logger.error(`Execution failed: ${err.message}`, err);
    process.exit(1);
  }
}

module.exports = {
  run,
  executeSessionCreate,
  executeSessionClose,
};
