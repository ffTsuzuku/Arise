const pkg = require('./package.json');
const { parseArgs, showUsage } = require('./lib/cli');
const { resolveConfiguration } = require('./lib/config');
const { executeCreate } = require('./lib/lifecycle/create');
const { executeNuke } = require('./lib/lifecycle/nuke');

async function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const flags = parseArgs(argv);

  if (flags.showHelp) {
    showUsage();
    process.exit(0);
  }

  if (flags.showVersion) {
    console.log(`arise v${pkg.version}`);
    process.exit(0);
  }

  if (flags.installSkill) {
    const { installSkill } = require('./lib/skill');
    installSkill({ scope: flags.skillScope, cwd });
    process.exit(0);
  }

  const config = resolveConfiguration(flags, cwd);

  if (flags.isCleanup) {
    await executeNuke(flags, config, cwd);
  } else {
    await executeCreate(flags, config, cwd);
  }
}

module.exports = {
  run,
};
