const herdrDriver = require('./herdr');
const tmuxDriver = require('./tmux');

const drivers = {
  herdr: herdrDriver,
  tmux: tmuxDriver,
};

function getDriver(name) {
  if (!name || name === 'auto') {
    return resolveDriver();
  }
  const normalized = String(name).toLowerCase().trim();
  const driver = drivers[normalized];
  if (!driver) {
    throw new Error(`Unsupported terminal multiplexer driver "${name}". Supported: ${Object.keys(drivers).join(', ')}`);
  }
  return driver;
}

function resolveDriver(nameOrConfig = 'auto', flags = {}) {
  // 1. Explicit CLI flag override
  const flagChoice = flags.multiplexer || flags.mux;
  if (flagChoice && flagChoice !== 'auto') {
    return getDriver(flagChoice);
  }

  // 2. Explicit config choice
  if (nameOrConfig && nameOrConfig !== 'auto') {
    return getDriver(nameOrConfig);
  }

  // 3. Environment heuristic (active session)
  if (process.env.TMUX) {
    return tmuxDriver;
  }
  if (process.env.HERDR_ENV) {
    return herdrDriver;
  }

  // 4. Installed tools availability
  if (tmuxDriver.isAvailable()) {
    return tmuxDriver;
  }
  if (herdrDriver.isAvailable()) {
    return herdrDriver;
  }

  // 5. Default fallback
  return tmuxDriver;
}

function listAvailableDrivers() {
  return Object.values(drivers).filter((d) => d.isAvailable());
}

module.exports = {
  getDriver,
  resolveDriver,
  listAvailableDrivers,
  drivers,
  tmux: tmuxDriver,
  herdr: herdrDriver,
};
