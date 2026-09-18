const fs = require('fs');
const path = require('path');

function showUsage() {
  console.log(`
Arise - Universal Terminal Workspace Bootstrapper (tmux & Herdr)

Usage:
  arise [<directory>] [options]         Boot terminal layout in current or target directory
  arise worktree <create|list|switch|nuke> [args]  Git worktree management subcommands
  arise init [preset] [options]         Interactive setup wizard / Preset creator
  arise --branch <branch> [options]     Create git worktree and boot session (via worktree plugin)
  arise --kill [<session-name>]         Close active session in current multiplexer
  arise --nuke [<target>]               Nuke git worktree and cleanup branches safely
  arise --sessions                      List all active terminal sessions

Subcommands:
  arise worktree create <branch>        Create git worktree and boot session
  arise worktree list                   List active worktrees with session status
  arise worktree switch <branch>        Switch / open existing worktree in session
  arise worktree nuke <branch>          Tear down worktree and cleanup branches
  arise preset new                      Walk through creating a reusable preset
  arise sessions                        List active terminal sessions
  arise kill [<session-name>]           Close active or specified session

Interactive & Wizard Modes:
  arise                                (Running with zero arguments launches the interactive TUI menu)
  arise init, --init                   Launch initialization wizard.
  arise init preset, arise preset new  Launch preset creation walkthrough.
  --quick, -q                          (Wizard option) Fast-path setup with detected defaults.
  --gitignore                          (Wizard option) Add generated config file to .gitignore.
  --no-gitignore                       (Wizard option) Do not add generated config file to .gitignore.
  --interactive, -I, --menu            Launch interactive menu.

Session & Multiplexer Options:
  --mux, -m, --multiplexer <driver>    Terminal multiplexer: 'tmux', 'herdr', or 'auto' (default: auto).
  --name, -w, --session <name>         Custom session name / label.
  --dir, -C <path>                     Target directory to bootstrap session inside.
  --no-attach                          Create session and render layout without attaching.
  --kill, -k, --close [<target>]       Close / kill the active or specified session.
  --list-sessions, --sessions          List active terminal sessions in current multiplexer.
  --preset, -p <preset>                Project preset (custom preset name or 'default').
  --agent, -a <agent>                  AI CLI agent to run ('agy', 'claude', 'aider', 'copilot', etc.).
  --focus, -f <pane>                   Pane to focus ('agent', 'agy', 'claude', 'vim', 'logs', 'shell').

Git Worktree Plugin Options:
  --branch, -b <branch>                Git branch to create or switch into.
  --dirname, -d <dirname>              Directory name of the worktree. Defaults to sanitized branch name.
  --source, -s, --base <src>           Base branch if creating a new branch.
  --nuke, -n [<target>]                Nuke worktree: closes session, removes directory, deletes branches.
  --cleanup, -c [<target>]             Alias for --nuke.
  --dir-only, --keep-branch            Only remove worktree directory; keep local and remote branches.
  --keep-remote, --local-only          Delete local branch, but keep remote branch on origin.
  --force                              Force worktree removal even if changes are uncommitted.

Agent Skill Arguments:
  --install-skill, -i                  Install agent skill for Antigravity (agy), Claude Code, etc.
  --global                             (Default) Install skill globally to ~/.agents/skills.
  --local, --workspace                 Install skill locally to current workspace (.agents/skills).

General Arguments:
  --yes, -y                            Automatically answer yes to confirmation prompts.
  --debug                              Enable verbose debug logging to stderr and log file.
  --verbose, -V                        Alias for --debug.
  --help, -h                           Show this help message.
  --version, -v                        Show version information.
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
    multiplexer: null,
    sessionName: null,
    targetDir: null,
    subcommand: null,
    subargs: [],
    isKill: false,
    listSessions: false,
    noAttach: false,
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
    initTarget: null,
    gitignore: null,
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
      if (argv[i + 1] === 'preset' || argv[i + 1] === '--preset') {
        flags.initTarget = 'preset';
        i++;
      }
    } else if (arg === 'preset' && (argv[i + 1] === 'new' || argv[i + 1] === 'create' || argv[i + 1] === 'init')) {
      flags.isInit = true;
      flags.initTarget = 'preset';
      i++;
    } else if (arg === '--quick' || arg === '-q') {
      flags.quick = true;
    } else if (arg === '--gitignore' || arg === '--add-gitignore') {
      flags.gitignore = true;
    } else if (arg === '--no-gitignore') {
      flags.gitignore = false;
    } else if (arg === '--interactive' || arg === '-I' || arg === '--menu' || arg === 'menu' || arg === 'interactive') {
      flags.interactive = true;
    } else if (arg === '--install-skill' || arg === '--install-agent-skill' || arg === '--setup-skill' || arg === '-i') {
      flags.installSkill = true;
    } else if (arg === '--global') {
      flags.skillScope = 'global';
    } else if (arg === '--local' || arg === '--workspace') {
      flags.skillScope = 'local';
    } else if (arg === '--mux' || arg === '-m' || arg === '--multiplexer') {
      flags.multiplexer = argv[i + 1];
      i++;
    } else if (arg.startsWith('--mux=')) {
      flags.multiplexer = arg.slice(6);
    } else if (arg.startsWith('--multiplexer=')) {
      flags.multiplexer = arg.slice(14);
    } else if (arg === '--no-attach') {
      flags.noAttach = true;
    } else if (arg === '--kill' || arg === '-k' || arg === 'kill' || arg === '--close' || arg === 'close') {
      flags.isKill = true;
      flags.isCleanup = true;
      if (argv[i + 1] && !argv[i + 1].startsWith('-')) {
        flags.cleanupTarget = argv[i + 1];
        i++;
      }
    } else if (arg === '--sessions' || arg === '--list-sessions' || arg === 'sessions') {
      flags.listSessions = true;
    } else if (arg === '--dir' || arg === '-C') {
      flags.targetDir = argv[i + 1];
      i++;
    } else if (arg === '--session' || arg === '--session-name') {
      flags.sessionName = argv[i + 1];
      flags.workspaceName = argv[i + 1];
      i++;
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
      flags.sessionName = argv[i + 1];
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
    } else if (arg === 'worktree' || arg === 'wt') {
      flags.subcommand = 'worktree';
      flags.subargs = argv.slice(i + 1);
      break;
    } else if (!arg.startsWith('-')) {
      if (flags.isCleanup && !flags.cleanupTarget) {
        flags.cleanupTarget = arg;
      } else if (!flags.targetDir && fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
        flags.targetDir = arg;
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
