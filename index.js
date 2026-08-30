const pkg = require('./package.json');
const { parseArgs, showUsage } = require('./lib/cli');
const { resolveConfiguration } = require('./lib/config');
const { executeCreate } = require('./lib/lifecycle/create');
const { executeNuke } = require('./lib/lifecycle/nuke');
const logger = require('./lib/logger');

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
        cwd,
      });
      return;
    }

    const config = resolveConfiguration(flags, cwd);
    logger.debug(`Loaded configuration for cwd="${cwd}":`, {
      configFile: config.configFile,
      preset: config.preset?.name,
      layoutCount: config.layout?.length,
      panes: config.layout?.map((p) => ({ id: p.id, title: p.title, from: p.from, split: p.split })),
    });

    if (flags.isCleanup) {
      await executeNuke(flags, config, cwd);
      return;
    }

    // Interactive CLI / TUI Mode (arise with zero args or --interactive flag)
    const isZeroArgs = flags.rawArgs.length === 0 && !flags.branch;
    if (flags.interactive || isZeroArgs) {
      if (process.stdin.isTTY || flags.interactive) {
        const { startInteractiveMenu } = require('./lib/interactive');
        await startInteractiveMenu(flags, config, cwd);
        return;
      }
    }

    await executeCreate(flags, config, cwd);
  } catch (err) {
    logger.error(`Execution failed: ${err.message}`, err);
    process.exit(1);
  }
}

module.exports = {
  run,
};
