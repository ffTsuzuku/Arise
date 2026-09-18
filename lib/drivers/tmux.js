const { p } = require('../tui/prompt');
const { execSync, spawnSync } = require('child_process');

function isCommandAvailable(cmd) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isTmuxInstalled() {
  return isCommandAvailable('tmux');
}

function getRecommendedInstallInstructions() {
  if (process.platform === 'darwin') {
    return 'brew install tmux';
  }
  if (process.platform === 'linux') {
    return 'sudo apt-get install tmux  # or: sudo dnf install tmux / sudo pacman -S tmux';
  }
  return 'Please install tmux via your system package manager.';
}

async function ensureTmuxInstalled(options = {}) {
  if (isTmuxInstalled()) {
    return true;
  }

  const installCmd = getRecommendedInstallInstructions();
  p.log.error(`\n[arise] Error: "tmux" is required for terminal workspace orchestration but was not found in PATH.`);
  p.log.error(`To install tmux:\n  ${installCmd}\n`);
  process.exit(1);
}

function listSessions() {
  if (!isTmuxInstalled()) return [];
  try {
    const output = execSync(
      'tmux list-sessions -F "#{session_id}:#{session_name}:#{session_attached}:#{session_path}"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    if (!output) return [];

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [id, name, attached, cwd] = line.split(':');
        return {
          id: id || name,
          name: name || id,
          label: name || id,
          cwd: cwd || process.cwd(),
          active: attached === '1',
        };
      });
  } catch {
    return [];
  }
}

function hasSession(name) {
  if (!isTmuxInstalled()) return false;
  try {
    execSync(`tmux has-session -t "${name}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function createSession({ name, cwd = process.cwd() }) {
  if (!hasSession(name)) {
    const createCmd = `tmux new-session -d -s "${name}" -c "${cwd}"`;
    execSync(createCmd, { stdio: 'ignore' });
  }

  let rootPaneId = null;
  try {
    const panesOutput = execSync(`tmux list-panes -t "${name}" -F "#{pane_id}"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    rootPaneId = panesOutput.split('\n')[0].trim();
  } catch (err) {
    throw new Error(`Failed to inspect tmux session "${name}": ${err.message}`);
  }

  return {
    sessionId: name,
    rootPaneId,
    name,
  };
}

function closeSession(nameOrId) {
  try {
    execSync(`tmux kill-session -t "${nameOrId}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function closeSessionsMatching(matchTargets = []) {
  const targets = matchTargets.filter(Boolean);
  if (!targets.length) return;

  const sessions = listSessions();
  const matching = sessions.filter((s) => targets.includes(s.name) || targets.includes(s.id));

  for (const s of matching) {
    p.log.info(`Closing tmux session "${s.name}" and terminating panes...`);
    closeSession(s.name);
    p.log.info(`tmux session "${s.name}" closed.`);
  }
}

function focusSession(nameOrId) {
  if (process.env.TMUX) {
    try {
      execSync(`tmux switch-client -t "${nameOrId}"`, { stdio: 'ignore' });
    } catch {}
  }
}

function splitPane({ paneId, direction = 'right', cwd, focus = false }) {
  const splitFlag = direction === 'down' ? '-v' : '-h';
  const focusFlag = focus ? '' : '-d';
  const cwdFlag = cwd ? `-c "${cwd}"` : '';

  const cmd = `tmux split-window ${splitFlag} ${focusFlag} -t "${paneId}" ${cwdFlag} -P -F "#{pane_id}"`;
  const output = execSync(cmd, { encoding: 'utf8' }).trim();
  if (!output) {
    throw new Error(`Failed to split tmux pane ${paneId} direction ${direction}`);
  }
  return output;
}

function renamePane(paneId, name) {
  try {
    execSync(`tmux select-pane -t "${paneId}" -T "${name}"`, { stdio: 'ignore' });
  } catch {}
}

function runInPane(paneId, command) {
  if (!command) return;
  try {
    spawnSync('tmux', ['send-keys', '-t', paneId, command, 'C-m'], { stdio: 'ignore' });
  } catch (e) {
    p.log.error(`Failed to send command to tmux pane ${paneId}: ${e.message}`);
  }
}

function focusPane(paneId) {
  try {
    execSync(`tmux select-pane -t "${paneId}"`, { stdio: 'ignore' });
  } catch {}
}

function attachOrSwitchSession(sessionName) {
  if (process.env.TMUX) {
    p.log.info(`Already inside tmux. Switching to session "${sessionName}"...`);
    spawnSync('tmux', ['switch-client', '-t', sessionName], { stdio: 'inherit' });
  } else {
    p.log.info(`Attaching to tmux session "${sessionName}"...`);
    spawnSync('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' });
  }
}

const tmuxDriver = {
  name: 'tmux',
  isAvailable: isTmuxInstalled,
  ensureInstalled: ensureTmuxInstalled,
  listSessions,
  createSession,
  closeSession,
  closeSessionsMatching,
  focusSession,
  splitPane,
  renamePane,
  runInPane,
  focusPane,
  attachOrSwitchSession,
  hasSession,
};

module.exports = tmuxDriver;
