const { executeSessionCreate } = require('./session');

async function executeCreate(flags, config, cwd = process.cwd()) {
  return executeSessionCreate({ flags, config, cwd });
}

module.exports = {
  executeCreate,
};
