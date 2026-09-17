const { executeSessionClose } = require('./session');

async function executeNuke(flags, config, cwd = process.cwd()) {
  return executeSessionClose({ flags: { ...flags, isCleanup: true }, config, cwd });
}

module.exports = {
  executeNuke,
};
