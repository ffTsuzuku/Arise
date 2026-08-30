const fs = require('fs');
const path = require('path');
const os = require('os');
const { ANSI } = require('./tui/ansi');

let isDebugEnabled = false;
let logFilePath = null;

function initLogger(flags = {}) {
  isDebugEnabled = Boolean(
    flags.debug ||
    flags.verbose ||
    process.env.ARISE_DEBUG === '1' ||
    process.env.DEBUG === 'arise' ||
    process.env.DEBUG === '*'
  );

  try {
    const logDir = path.join(os.homedir(), '.config', 'arise', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logFilePath = path.join(logDir, 'arise.log');
  } catch (e) {
    logFilePath = path.join(os.tmpdir(), 'arise-debug.log');
  }
}

function writeToFile(level, message, details = null) {
  if (!logFilePath) return;
  try {
    const timestamp = new Date().toISOString();
    let line = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    if (details) {
      line += typeof details === 'object' ? JSON.stringify(details, null, 2) + '\n' : String(details) + '\n';
    }
    fs.appendFileSync(logFilePath, line, 'utf8');
  } catch (e) {}
}

function debug(message, details = null) {
  writeToFile('DEBUG', message, details);
  if (isDebugEnabled) {
    console.log(`  ${ANSI.dim}[DEBUG] ${message}${ANSI.reset}`);
    if (details) {
      console.log(ANSI.dim + (typeof details === 'object' ? JSON.stringify(details, null, 2) : details) + ANSI.reset);
    }
  }
}

function info(message) {
  writeToFile('INFO', message);
  console.log(message);
}

function warn(message, details = null) {
  writeToFile('WARN', message, details);
  console.warn(`${ANSI.yellow}Warning: ${message}${ANSI.reset}`);
  if (isDebugEnabled && details) {
    console.warn(ANSI.dim + (typeof details === 'object' ? JSON.stringify(details, null, 2) : details) + ANSI.reset);
  }
}

function error(message, err = null) {
  writeToFile('ERROR', message, err && err.stack ? err.stack : err);
  console.error(`${ANSI.red}Error: ${message}${ANSI.reset}`);
  if (err) {
    if (isDebugEnabled && err.stack) {
      console.error(ANSI.dim + err.stack + ANSI.reset);
    } else if (err.message) {
      console.error(`${ANSI.dim}Details: ${err.message}${ANSI.reset}`);
    }
  }
  if (!isDebugEnabled && logFilePath) {
    console.error(`${ANSI.dim}(Detailed logs saved to ${logFilePath})${ANSI.reset}`);
  }
}

module.exports = {
  initLogger,
  isDebugEnabled: () => isDebugEnabled,
  getLogFilePath: () => logFilePath,
  debug,
  info,
  warn,
  error,
};
