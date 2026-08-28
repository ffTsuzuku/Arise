const { execSync, spawnSync } = require('child_process');
const path = require('path');
const os = require('os');
const readline = require('readline');

function isCommandAvailable(cmd) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isHerdrInstalled() {
  const localBin = path.join(os.homedir(), '.local', 'bin');
  if (process.env.PATH && !process.env.PATH.split(path.delimiter).includes(localBin)) {
    process.env.PATH = `${localBin}${path.delimiter}${process.env.PATH}`;
  }
  return isCommandAvailable('herdr');
}

function getRecommendedInstallCommand() {
  if (process.platform === 'darwin' && isCommandAvailable('brew')) {
    return {
      name: 'Homebrew',
      cmd: 'brew install herdr',
      docsUrl: 'https://herdr.dev/docs/install/#install-with-homebrew',
    };
  }
  if (isCommandAvailable('mise')) {
    return {
      name: 'mise',
      cmd: 'mise use -g herdr',
      docsUrl: 'https://herdr.dev/docs/install/#install-with-mise',
    };
  }
  if (process.platform === 'win32') {
    return {
      name: 'PowerShell Installer',
      cmd: 'powershell -ExecutionPolicy Bypass -c "irm https://herdr.dev/install.ps1 | iex"',
      docsUrl: 'https://herdr.dev/docs/install/',
    };
  }
  return {
    name: 'Official Install Script',
    cmd: 'curl -fsSL https://herdr.dev/install.sh | sh',
    docsUrl: 'https://herdr.dev/docs/install/',
  };
}

function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function ensureHerdrInstalled(options = {}) {
  if (isHerdrInstalled()) {
    return true;
  }

  const { name, cmd, docsUrl } = getRecommendedInstallCommand();
  const autoConfirm = Boolean(options.yes);

  if (!autoConfirm && (!process.stdin.isTTY || process.env.CI)) {
    console.error(`\n[arise] Error: "herdr" is required to manage terminal workspaces but was not found in PATH.`);
    console.error(`Please install Herdr before running arise:\n  ${cmd}\n`);
    console.error(`Docs: ${docsUrl || 'https://herdr.dev/docs/install/'}`);
    process.exit(1);
  }

  if (!autoConfirm) {
    console.log(`\n[arise] "herdr" is required to manage terminal workspaces but was not found in PATH.`);
    const answer = await promptUser(`Would you like arise to install Herdr now via ${name} (\`${cmd}\`)? [Y/n]: `);
    if (answer && !/^(y|yes)$/i.test(answer)) {
      console.error('\nCannot proceed without Herdr. Aborting.');
      process.exit(1);
    }
  }

  console.log(`\n==> Installing Herdr via ${name}...`);
  const result = spawnSync(cmd, { stdio: 'inherit', shell: true });

  if (result.status !== 0 || !isHerdrInstalled()) {
    console.error(`\n[arise] Failed to automatically install Herdr.`);
    console.error(`Please visit https://herdr.dev/docs/install/ to install manually.`);
    process.exit(1);
  }

  console.log(`[arise] Herdr installed successfully!\n`);
  return true;
}

function parseJsonFromOutput(output) {
  if (!output) return null;
  const line = output.split('\n').find(l => l.trim().startsWith('{'));
  if (line) {
    try {
      return JSON.parse(line);
    } catch (e) {}
  }
  try {
    return JSON.parse(output);
  } catch (e) {
    return null;
  }
}

function listWorkspaces() {
  try {
    const listOutput = execSync('herdr workspace list', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const data = parseJsonFromOutput(listOutput);
    return (data && data.result && data.result.workspaces) || [];
  } catch (err) {
    return [];
  }
}

function createWorkspace({ label, cwd }) {
  const wsOutput = execSync(`herdr workspace create --label "${label}" --cwd "${cwd}"`, { encoding: 'utf8' }).trim();
  const res = parseJsonFromOutput(wsOutput);
  if (!res || !res.result || !res.result.workspace) {
    throw new Error(`Failed to create Herdr workspace "${label}". Raw output: ${wsOutput}`);
  }
  return {
    workspaceId: res.result.workspace.workspace_id,
    rootPaneId: res.result.root_pane ? res.result.root_pane.pane_id : null,
  };
}

function closeWorkspace(workspaceId) {
  try {
    execSync(`herdr workspace close ${workspaceId}`, { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function focusWorkspace(workspaceId) {
  try {
    execSync(`herdr workspace focus ${workspaceId}`, { stdio: 'ignore' });
  } catch (e) {}
}

function splitPane({ paneId, direction = 'right', cwd, focus = false }) {
  const focusFlag = focus ? '--focus' : '--no-focus';
  const cwdFlag = cwd ? `--cwd "${cwd}"` : '';
  const output = execSync(`herdr pane split --pane ${paneId} --direction ${direction} ${cwdFlag} ${focusFlag}`, { encoding: 'utf8' }).trim();
  const res = parseJsonFromOutput(output);
  if (!res || !res.result || !res.result.pane) {
    throw new Error(`Failed to split pane ${paneId} direction ${direction}`);
  }
  return res.result.pane.pane_id;
}

function renamePane(paneId, name) {
  try {
    execSync(`herdr pane rename ${paneId} "${name}"`, { stdio: 'ignore' });
  } catch (e) {}
}

function runInPane(paneId, command) {
  if (!command) return;
  try {
    execSync(`herdr pane send-text ${paneId} "${command}"`, { stdio: 'ignore' });
    execSync(`herdr pane send-keys ${paneId} enter`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`Failed to execute command "${command}" in pane ${paneId}: ${e.message}`);
  }
}

function closeWorkspacesMatching(matchTargets = []) {
  const targets = matchTargets.filter(Boolean);
  if (!targets.length) return;

  const workspaces = listWorkspaces();
  const matchingWorkspaces = workspaces.filter(w => targets.includes(w.label));

  for (const ws of matchingWorkspaces) {
    if (ws.workspace_id) {
      console.log(`Closing Herdr workspace "${ws.label}" (ID: ${ws.workspace_id}) and terminating panes...`);
      closeWorkspace(ws.workspace_id);
      console.log(`Herdr workspace "${ws.label}" closed.`);
    }
  }
}

function attachOrSwitchSession(sessionName) {
  if (process.env.HERDR_ENV === '1') {
    console.log(`Already inside herdr. Workspace "${sessionName}" created and focused!`);
  } else {
    console.log(`Starting herdr session...`);
    spawnSync('herdr', [], { stdio: 'inherit', shell: true });
  }
}

module.exports = {
  isHerdrInstalled,
  getRecommendedInstallCommand,
  ensureHerdrInstalled,
  listWorkspaces,
  createWorkspace,
  closeWorkspace,
  focusWorkspace,
  splitPane,
  renamePane,
  runInPane,
  closeWorkspacesMatching,
  attachOrSwitchSession,
};
