const path = require('path');

function showUsage() {
  console.log(`
Arise - Unified Worktree & Herdr Workspace Orchestrator

Usage:
  arise                                (Interactive menu / TUI mode)
  arise init [options]                 (Interactive setup wizard / .ariserc.json generator)
  arise --branch <branch> [options]
  arise --nuke [<worktree dir or branch>] [nuke-options]
  arise --cleanup [<worktree dir or branch>] [nuke-options]

Interactive & Wizard Modes:
  arise                       (Running with zero arguments launches the interactive TUI menu)
  arise init, --init          Launch the Arise configuration initialization wizard.
  --quick, -q                 (Wizard option) Fast-path setup with detected repo defaults.
  --interactive, -I, --menu   Launch interactive prompt/menu (create, switch, list, nuke, init).

Creation Arguments:
  --branch, -b <branch>       (Required for non-interactive creation) Git branch to create or boot into.
  --dirname, -d <dirname>     (Optional) Directory name of the worktree. Defaults to sanitized branch name.
  --workspace, -w <name>      (Optional) Custom Herdr workspace name.
  --source, -s, --base <src>  (Optional) Base branch if creating a new branch. Defaults to preset default (e.g. 'develop' / 'prod').
  --preset, -p <preset>       (Optional) Project preset ('node', 'laravel', 'generic', or custom). Auto-detected if omitted.
  --agent, -a <agent>         (Optional) AI CLI agent to run in workspace ('agy', 'claude', 'aider', 'copilot', etc.).
  --focus, -f <pane>          (Optional) Pane to focus ('agent', 'agy', 'claude', 'vim', 'logs', 'server', 'shell'). Defaults to active agent or 'agy'.

Nuke / Cleanup Arguments:
  --nuke, -n [<target>]       Nuke the worktree: closes Herdr workspace, removes worktree directory,
                              deletes local branch, and deletes remote branch on origin.
                              (Auto-detects current worktree if omitted inside a worktree directory).
  --cleanup, -c [<target>]    Alias for --nuke.
  --dir-only, --keep-branch   (Optional) Only remove the worktree directory; keep local and remote branches.
  --keep-remote, --local-only (Optional) Delete local branch, but keep remote branch on origin.
  --force, -f                 (Optional) Force worktree removal even if changes are uncommitted.

Agent Skill Arguments:
  --install-skill, -i         Install the agent skill for Antigravity (agy), Claude Code, and other AI agents.
  --global                    (Default) Install skill globally to ~/.agents/skills and ~/.gemini/skills.
  --local, --workspace        Install skill locally to current workspace (.agents/skills).

General Arguments:
  --yes, -y                   (Optional) Automatically answer yes to confirmation prompts (e.g. installing Herdr, quick init).
  --debug                     (Optional) Enable verbose debug logging to stderr and log file.
  --verbose, -V               (Optional) Alias for --debug.
  --help, -h                  Show this help message.
  --version, -v               Show version information.
`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {
    interactive: false,
    isInit: false,
    quick: false,
    isCleanup: false,
    cleanupTarget: null,
    dirOnly: false,
    keepRemote: false,
    force: false,
    yes: false,
    debug: false,
    verbose: false,
    branch: null,
    dirname: null,
    workspaceName: null,
    source: null,
    presetName: null,
    agent: null,
    focusTarget: null,
    installSkill: false,
    skillScope: 'global',
    targetPath: null,
    showHelp: false,
    showVersion: false,
    rawArgs: argv,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      flags.showHelp = true;
    } else if (arg === '--version' || arg === '-v') {
      flags.showVersion = true;
    } else if (arg === '--debug') {
      flags.debug = true;
    } else if (arg === '--verbose' || arg === '-V') {
      flags.verbose = true;
      flags.debug = true;
    } else if (arg === 'init' || arg === '--init') {
      flags.isInit = true;
    } else if (arg === '--quick' || arg === '-q') {
      flags.quick = true;
    } else if (arg === '--interactive' || arg === '-I' || arg === '--menu' || arg === 'menu' || arg === 'interactive') {
      flags.interactive = true;
    } else if (arg === '--install-skill' || arg === '--install-agent-skill' || arg === '--setup-skill' || arg === '-i') {
      flags.installSkill = true;
    } else if (arg === '--global') {
      flags.skillScope = 'global';
    } else if (arg === '--local' || arg === '--workspace') {
      flags.skillScope = 'local';
    } else if (arg === '--nuke' || arg === '-n' || arg === 'nuke' || arg === '--cleanup' || arg === '-c' || arg === 'cleanup') {
      flags.isCleanup = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        flags.cleanupTarget = argv[i + 1];
        i++;
      }
    } else if (arg === '--dir-only' || arg === '--only-dir' || arg === '--keep-branch' || arg === '--keep-branches') {
      flags.dirOnly = true;
    } else if (arg === '--keep-remote' || arg === '--local-only') {
      flags.keepRemote = true;
    } else if (arg === '--force' || arg === '-f') {
      flags.force = true;
    } else if (arg === '--yes' || arg === '-y') {
      flags.yes = true;
    } else if (arg === '--target' || arg === '--out') {
      flags.targetPath = argv[i + 1];
      i++;
    } else if (arg === '--branch' || arg === '-b') {
      flags.branch = argv[i + 1];
      i++;
    } else if (arg === '--dirname' || arg === '-d') {
      flags.dirname = argv[i + 1];
      i++;
    } else if (arg === '--workspace' || arg === '--workspace-name' || arg === '-w' || arg === '--name') {
      flags.workspaceName = argv[i + 1];
      i++;
    } else if (arg === '--source' || arg === '--base' || arg === '-s') {
      flags.source = argv[i + 1];
      i++;
    } else if (arg === '--preset' || arg === '-p') {
      flags.presetName = argv[i + 1];
      i++;
    } else if (arg === '--agent' || arg === '-a') {
      flags.agent = argv[i + 1];
      i++;
    } else if (arg.startsWith('--agent=')) {
      flags.agent = arg.slice(8);
    } else if (arg === '--focus') {
      flags.focusTarget = argv[i + 1];
      i++;
    } else if (!arg.startsWith('-')) {
      if (flags.isCleanup && !flags.cleanupTarget) {
        flags.cleanupTarget = arg;
      } else if (!flags.branch) {
        flags.branch = arg;
      }
    }
  }

  return flags;
}

module.exports = {
  parseArgs,
  showUsage,
};
