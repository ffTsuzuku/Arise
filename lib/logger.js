const fs = require('fs');
const path = require('path');
const os = require('os');
const { paint } = require('./tui/theme');

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
    console.log(paint(`  [DEBUG] ${message}`, 'muted'));
    if (details) {
      console.log(paint(typeof details === 'object' ? JSON.stringify(details, null, 2) : details, 'muted'));
    }
  }
}

function info(message) {
  writeToFile('INFO', message);
  console.log(paint(message));
}

function warn(message, details = null) {
  writeToFile('WARN', message, details);
  console.warn(paint(`Warning: ${message}`, 'danger'));
  if (isDebugEnabled && details) {
    console.warn(paint(typeof details === 'object' ? JSON.stringify(details, null, 2) : details, 'muted'));
  }
}

function error(message, err = null) {
  writeToFile('ERROR', message, err && err.stack ? err.stack : err);
  console.error(paint(`Error: ${message}`, 'danger'));
  if (err) {
    if (isDebugEnabled && err.stack) {
      console.error(paint(err.stack, 'muted'));
    } else if (err.message) {
      console.error(paint(`Details: ${err.message}`, 'muted'));
    }
  }
  if (!isDebugEnabled && logFilePath) {
    console.error(paint(`(Detailed logs saved to ${logFilePath})`, 'muted'));
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
