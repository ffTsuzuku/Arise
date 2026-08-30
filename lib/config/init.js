const fs = require('fs');
const { mkdir, writeFile } = require('fs/promises');
const path = require('path');
const os = require('os');
const { ANSI, drawBox } = require('../tui/ansi');
const { promptSelect, promptMultiSelect, promptText, promptConfirm } = require('../tui/prompt');
const git = require('../git');
const { detectPreset, getPreset, builtInPresets } = require('../../presets');
const { installSkill } = require('../skill');
const pkg = require('../../package.json');

class ConfigInitWizard {
  static async run(options = {}) {
    const cwd = options.cwd || process.cwd();
    let isInsideGit = false;
    let repoRoot = null;

    try {
      repoRoot = git.getRepoRootDir(cwd);
      isInsideGit = Boolean(repoRoot);
    } catch {
      isInsideGit = false;
    }

    console.log(`\n${ANSI.bold}${ANSI.brightCyan}=== 🚀 Arise Configuration Setup Wizard ===${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Configure Git worktree topology, project presets, Herdr terminal layout, and AI agents.${ANSI.reset}\n`);

    // Determine quick vs guided mode
    let isQuick = Boolean(options.quick);
    if (!isQuick && process.stdin.isTTY && !options.local && !options.global) {
      console.log(`  ${ANSI.bold}Configuration Components Overview:${ANSI.reset}`);
      console.log(`  ${ANSI.cyan}• Project Preset:${ANSI.reset}   Node.js, Laravel/PHP, Generic, or custom`);
      console.log(`  ${ANSI.cyan}• Git Topology:${ANSI.reset}     Default base branch (develop/main), protected branches, bare repo`);
      console.log(`  ${ANSI.cyan}• AI CLI Agent:${ANSI.reset}     Antigravity (agy), Claude Code (claude), Aider, Copilot, or Custom`);
      console.log(`  ${ANSI.cyan}• Terminal Layout:${ANSI.reset}  Declarative 4-pane quadrant layout (Editor, Server, Shell, AI Agent)`);
      console.log(`  ${ANSI.cyan}• Scaffolding:${ANSI.reset}      .env copy, dependency auto-install, and web symlinks`);
      console.log(`  ${ANSI.cyan}• Agent Skill:${ANSI.reset}      System integration for Antigravity and Claude Code\n`);

      const modeChoice = await promptSelect({
        message: 'Select initialization mode:',
        choices: [
          {
            label: '🚀 Quick Setup (Recommended defaults)',
            value: 'quick',
            hint: 'Instant setup with detected preset, active branches, and Antigravity AI',
          },
          {
            label: '🛠️  Guided Step-by-Step Setup',
            value: 'guided',
            hint: 'Step-by-step walkthrough with full setting explanations and customization',
          },
        ],
      });

      if (!modeChoice) {
        console.log(`${ANSI.dim}Setup cancelled.${ANSI.reset}\n`);
        return null;
      }
      isQuick = modeChoice === 'quick';
    }

    // Determine target scope (local vs global)
    let isLocal = options.local ?? false;
    if (!options.local && !options.global) {
      if (isInsideGit) {
        if (isQuick) {
          isLocal = true;
        } else {
          console.log(`\n${ANSI.bold}${ANSI.cyan}── Configuration Scope ──${ANSI.reset}`);
          console.log(`  ${ANSI.dim}Arise supports local per-repo configuration or machine-wide global defaults:${ANSI.reset}\n`);
          console.log(`  ${ANSI.bold}Scope Comparison:${ANSI.reset}`);
          console.log(`  ${ANSI.green}• Local (.ariserc.json):${ANSI.reset}      Saved in project root. Configures preset, branches,`);
          console.log(`                               scaffolding, and layout specifically for this repository.`);
          console.log(`  ${ANSI.blue}• Global (~/.config/arise/):${ANSI.reset}  Saved in user home directory. Defines machine-wide defaults,`);
          console.log(`                               global AI agent preference, and fallback presets.\n`);

          const scopeChoice = await promptSelect({
            message: 'Where would you like to save this configuration?',
            choices: [
              {
                label: '📁 Local Repository (.ariserc.json in project root)',
                value: 'local',
                hint: 'Recommended for project-specific rules, presets, and scaffolding',
              },
              {
                label: '🌐 Global User Config (~/.config/arise/.ariserc.json)',
                value: 'global',
                hint: 'For machine-wide defaults and shared AI agent preferences',
              },
            ],
          });
          if (!scopeChoice) return null;
          isLocal = scopeChoice === 'local';
        }
      } else {
        isLocal = false;
      }
    }

    if (isQuick) {
      return this.runQuickInit(cwd, isLocal, isInsideGit, options);
    }

    return this.runGuidedInit(cwd, isLocal, isInsideGit, options);
  }

  static async runQuickInit(cwd, isLocal, isInsideGit, options = {}) {
    const detectedPreset = detectPreset(cwd);
    const presetName = detectedPreset ? detectedPreset.name : 'generic';
    let repoRoot = cwd;
    let isBare = false;
    let localBranches = ['main'];

    if (isInsideGit) {
      try {
        repoRoot = git.getRepoRootDir(cwd);
        isBare = git.isBareRepo(repoRoot);
        localBranches = git.getLocalBranches({ repoDir: repoRoot, bareRepo: isBare ? repoRoot : null });
      } catch {}
    }

    const defaultBase = localBranches.includes('develop')
      ? 'develop'
      : (localBranches.includes('main') ? 'main' : (localBranches[0] || 'main'));

    if (isLocal) {
      const targetFilePath = options.targetPath || path.join(cwd, '.ariserc.json');

      if (fs.existsSync(targetFilePath) && !options.force) {
        console.log(`  ${ANSI.yellow}Existing file found at ${targetFilePath}${ANSI.reset}\n`);
        const overwrite = await promptConfirm({
          message: `.ariserc.json already exists in ${path.dirname(targetFilePath)}. Overwrite?`,
          defaultYes: false,
        });
        if (!overwrite) {
          console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
          return targetFilePath;
        }
      }

      const configObj = {
        $schema: './arise.schema.json',
        preset: presetName,
        repo: {
          defaultBaseBranch: defaultBase,
          protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
        },
        workspace: {
          agent: 'agy',
          defaultFocus: 'agy',
          labelPrefix: '',
        },
      };

      if (isBare) {
        configObj.repo.bareRepo = repoRoot;
        configObj.repo.worktreesBase = path.join(path.dirname(repoRoot), 'worktrees');
      }

      if (presetName === 'node') {
        configObj.scaffold = {
          envSource: '.env',
          install: 'npm install',
        };
      } else if (presetName === 'laravel') {
        configObj.scaffold = {
          envSource: '.env',
          install: 'composer install',
        };
      }

      const content = `// Arise Local Repository Configuration (.ariserc.json)
// Documentation: https://github.com/tsuzuku/arise
//
// SETTINGS REFERENCE:
// • preset: Project preset ('node' | 'laravel' | 'generic' | custom)
// • repo.defaultBaseBranch: Default branch to branch off when creating worktrees
// • repo.protectedBranches: Branches protected from deletion during --nuke
// • repo.bareRepo: Path to bare repository (if using bare git topology)
// • repo.worktreesBase: Base directory where worktrees are created
// • workspace.agent: CLI AI agent ('agy' | 'claude' | 'aider' | 'copilot' | 'none')
// • workspace.defaultFocus: Pane to focus on workspace boot ('agy' | 'vim' | 'server' | 'shell')
// • workspace.labelPrefix: Prefix added to Herdr workspace labels (e.g. '[BE] ')
// • scaffold.envSource: Relative or absolute path to .env template to copy
// • scaffold.install: Command to run to install dependencies upon creation
${JSON.stringify(configObj, null, 2)}
`;
      await writeFile(targetFilePath, content, 'utf8');
      this.printSuccessCard(targetFilePath, 'Local repository configuration (.ariserc.json) created with detected defaults.');
      return targetFilePath;
    }

    // Global quick init
    const globalDir = path.join(os.homedir(), '.config', 'arise');
    const globalPath = options.targetPath || path.join(globalDir, '.ariserc.json');

    if (fs.existsSync(globalPath) && !options.force) {
      console.log(`  ${ANSI.yellow}Existing global config found at ${globalPath}${ANSI.reset}\n`);
      const overwrite = await promptConfirm({
        message: `Global config already exists at ${globalPath}. Overwrite?`,
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
        return globalPath;
      }
    }

    await mkdir(path.dirname(globalPath), { recursive: true });

    const globalObj = {
      preset: presetName,
      repo: {
        defaultBaseBranch: defaultBase,
        protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
      },
      workspace: {
        agent: 'agy',
        defaultFocus: 'agy',
        labelPrefix: '',
      },
    };

    const content = `// Arise Global Configuration (~/.config/arise/.ariserc.json)
// Documentation: https://github.com/tsuzuku/arise
//
// SETTINGS REFERENCE:
// • preset: Default project preset ('node' | 'laravel' | 'generic')
// • repo.defaultBaseBranch: Fallback base branch for new worktrees
// • repo.protectedBranches: Branches protected from deletion across all repos
// • workspace.agent: Default CLI AI agent ('agy' | 'claude' | 'aider' | 'copilot')
// • workspace.defaultFocus: Default pane to focus ('agy' | 'agent' | 'vim' | 'shell')
// • workspace.labelPrefix: Default workspace label prefix
${JSON.stringify(globalObj, null, 2)}
`;
    await writeFile(globalPath, content, 'utf8');
    this.printSuccessCard(globalPath, 'Global configuration created at ~/.config/arise/.ariserc.json.');
    return globalPath;
  }

  static async runGuidedInit(cwd, isLocal, isInsideGit, options = {}) {
    let repoRoot = cwd;
    let isBare = false;
    let localBranches = ['main'];

    if (isInsideGit) {
      try {
        repoRoot = git.getRepoRootDir(cwd);
        isBare = git.isBareRepo(repoRoot);
        localBranches = git.getLocalBranches({ repoDir: repoRoot, bareRepo: isBare ? repoRoot : null });
      } catch {}
    }

    const detected = detectPreset(cwd);
    const detectedName = detected ? detected.name : 'generic';

    // Step 1: Project Preset & Framework Selection
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 1: Project Preset & Framework Selection (preset) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Arise uses pluggable presets to configure quadrant terminal layouts, scaffolding hooks, and dependencies.${ANSI.reset}\n`
    );
    console.log(`  ${ANSI.bold}Preset Options & Behaviors:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Node.js (node):${ANSI.reset}      Auto-copies .env, runs npm install, boots dev server & agent panes.`);
    console.log(`  ${ANSI.green}• Laravel (laravel):${ANSI.reset}   Auto-copies .env, runs composer install, tails storage logs & boots agent.`);
    console.log(`  ${ANSI.blue}• Generic (generic):${ANSI.reset}   Standard 4-pane quadrant layout (Editor, Shell, Build, AI Agent).`);
    console.log(`  ${ANSI.magenta}• Custom Preset:${ANSI.reset}       Enter custom preset module name or path.\n`);

    const presetChoice = await promptSelect({
      message: 'Choose project preset:',
      choices: [
        {
          label: `✨ Node.js (node)${detectedName === 'node' ? ' (Detected)' : ''}`,
          value: 'node',
          hint: 'npm/pnpm/yarn lifecycle, .env scaffolding, dev server pane',
        },
        {
          label: `🐘 Laravel / PHP (laravel)${detectedName === 'laravel' ? ' (Detected)' : ''}`,
          value: 'laravel',
          hint: 'composer lifecycle, storage permissions, log tail pane',
        },
        {
          label: `📦 Generic (generic)${detectedName === 'generic' ? ' (Detected)' : ''}`,
          value: 'generic',
          hint: 'Universal 4-pane terminal quadrant layout',
        },
        {
          label: '✏️  Custom Preset...',
          value: '__custom__',
          hint: 'Specify custom preset name',
        },
      ],
      defaultIndex: detectedName === 'laravel' ? 1 : (detectedName === 'node' ? 0 : 2),
    });

    if (!presetChoice) return null;

    let finalPreset = presetChoice;
    if (presetChoice === '__custom__') {
      const customInput = await promptText({
        message: 'Enter custom preset name:',
        defaultValue: 'generic',
      });
      if (customInput === null) return null;
      finalPreset = customInput.trim() || 'generic';
    }

    // Step 2: Git Topology & Branch Configuration
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 2: Git Topology & Branch Configuration (repo) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Configure default base branch, protected branches, and repository directory topology.${ANSI.reset}\n`
    );
    console.log(`  ${ANSI.bold}Topology Settings:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Base Branch (defaultBaseBranch):${ANSI.reset}  Default source branch to branch off when creating worktrees.`);
    console.log(`  ${ANSI.green}• Protected Branches:${ANSI.reset}              Branches shielded from accidental deletion during --nuke.`);
    console.log(`  ${ANSI.blue}• Bare Repository Topology:${ANSI.reset}        Isolate worktrees in dedicated folders outside bare .git.\n`);

    const defaultCandidate = localBranches.includes('develop')
      ? 'develop'
      : (localBranches.includes('main') ? 'main' : (localBranches[0] || 'main'));

    const baseBranchInput = await promptText({
      message: 'Default base branch to branch off (defaultBaseBranch):',
      defaultValue: defaultCandidate,
    });
    if (baseBranchInput === null) return null;
    const defaultBaseBranch = baseBranchInput.trim() || defaultCandidate;

    const commonProtected = ['main', 'master', 'develop', 'prod', 'staging'];
    const protectedChoices = commonProtected.map((b) => ({
      label: b,
      value: b,
      selected: true,
    }));

    const selectedProtected = await promptMultiSelect({
      message: 'Select protected branches (cannot be nuked):',
      choices: protectedChoices,
      allowCustomInput: true,
    });

    if (selectedProtected === null) return null;
    const protectedBranches = selectedProtected.length > 0 ? selectedProtected : commonProtected;

    let bareRepoPath = null;
    let worktreesBasePath = null;

    if (isInsideGit && isBare) {
      console.log(`  ${ANSI.yellow}Detected bare Git repository topology at ${repoRoot}.${ANSI.reset}`);
      bareRepoPath = repoRoot;
      const defaultWtBase = path.join(path.dirname(repoRoot), 'worktrees');
      const wtBaseInput = await promptText({
        message: 'Worktrees base directory (worktreesBase):',
        defaultValue: defaultWtBase,
        completer: 'dir',
      });
      if (wtBaseInput === null) return null;
      worktreesBasePath = wtBaseInput.trim() || defaultWtBase;
    }

    // Step 3: AI CLI Agent & Workspace Focus
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 3: AI CLI Agent & Herdr Workspace (workspace) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Arise embeds an AI CLI agent directly in your 4-pane Herdr terminal workspace.${ANSI.reset}\n`
    );
    console.log(`  ${ANSI.bold}Supported AI Agents:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• Antigravity (agy):${ANSI.reset}     Google Deepmind Advanced Agentic Coding CLI (Recommended).`);
    console.log(`  ${ANSI.green}• Claude Code (claude):${ANSI.reset}  Anthropic Claude CLI agent.`);
    console.log(`  ${ANSI.blue}• Aider (aider):${ANSI.reset}         Git-integrated pair programming CLI.`);
    console.log(`  ${ANSI.magenta}• Copilot (copilot):${ANSI.reset}     GitHub Copilot in the CLI.`);
    console.log(`  ${ANSI.gray}• Disabled (none):${ANSI.reset}       Standard interactive shell pane without AI agent.\n`);

    const agentChoice = await promptSelect({
      message: 'Select AI CLI agent for workspace quadrant:',
      choices: [
        {
          label: '✨ Antigravity / AGY CLI (Recommended)',
          value: 'agy',
          hint: 'Deepmind agentic pair programmer, instant setup',
        },
        {
          label: '🤖 Claude Code (claude)',
          value: 'claude',
          hint: 'Anthropic Claude Code CLI',
        },
        {
          label: '⚡ Aider (aider)',
          value: 'aider',
          hint: 'AI pair programming in terminal',
        },
        {
          label: '🐙 GitHub Copilot CLI (copilot)',
          value: 'copilot',
          hint: 'GitHub Copilot CLI tool',
        },
        {
          label: '✏️  Custom Agent Command...',
          value: '__custom__',
          hint: 'Enter custom CLI command (e.g. cursor, llm, script)',
        },
        {
          label: '🚫 None / Disabled',
          value: 'none',
          hint: 'Standard bash/zsh shell pane',
        },
      ],
    });

    if (!agentChoice) return null;

    let finalAgent = agentChoice;
    if (agentChoice === '__custom__') {
      const customAgent = await promptText({
        message: 'Enter custom AI agent command:',
        defaultValue: 'agy',
      });
      if (customAgent === null) return null;
      finalAgent = customAgent.trim() || 'agy';
    }

    const focusChoice = await promptSelect({
      message: 'Default pane to focus upon creation (defaultFocus):',
      choices: [
        {
          label: `AI Agent Pane (${finalAgent === 'none' ? 'shell' : finalAgent})`,
          value: finalAgent === 'none' ? 'shell' : 'agy',
          hint: 'Instant focus on pair programming agent',
        },
        {
          label: 'Editor / Vim Pane (vim)',
          value: 'vim',
          hint: 'Focus code editor upon workspace boot',
        },
        {
          label: 'Development Server / Logs Pane',
          value: finalPreset === 'laravel' ? 'logs' : 'server',
          hint: 'Focus server output or log streams',
        },
        {
          label: 'Terminal Shell Pane (shell)',
          value: 'shell',
          hint: 'Focus general terminal shell',
        },
      ],
    });

    if (!focusChoice) return null;

    const labelPrefixInput = await promptText({
      message: 'Optional Herdr workspace label prefix (e.g. "[BE] " or press Enter for none):',
      defaultValue: '',
    });
    if (labelPrefixInput === null) return null;
    const labelPrefix = labelPrefixInput.trim();

    // Step 4: Terminal Layout & Quadrant Architecture
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Terminal Layout & Workspace Panes (layout) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Configure how Herdr splits your terminal window into quadrants and startup command panes.${ANSI.reset}\n`
    );
    console.log(`  ${ANSI.bold}Available Layout Architectures:${ANSI.reset}`);
    console.log(`  ${ANSI.yellow}• 4-Pane Quadrant (2x2 Grid):${ANSI.reset}     Top-Left: Editor, Top-Right: Server/Logs, Bottom-Left: Shell, Bottom-Right: AI Agent.`);
    console.log(`  ${ANSI.green}• 3-Pane Side-Stack:${ANSI.reset}              Editor on Left half; Server on Top-Right; AI Agent on Bottom-Right.`);
    console.log(`  ${ANSI.blue}• 2-Pane Side-by-Side (Vertical):${ANSI.reset}   Left: Editor/Shell; Right: AI Agent.`);
    console.log(`  ${ANSI.magenta}• 2-Pane Top / Bottom (Horizontal):${ANSI.reset} Top: Editor/Shell; Bottom: AI Agent.`);
    console.log(`  ${ANSI.cyan}• 🛠️  Custom Pane-by-Pane Builder:${ANSI.reset}  Interactively define every pane, command, parent, and split direction.\n`);

    const layoutStyleChoice = await promptSelect({
      message: 'Select terminal workspace layout architecture:',
      choices: [
        {
          label: '🪟 4-Pane Quadrant (2x2 Grid) — Recommended',
          value: 'quadrant',
          hint: 'Top-Left: Editor | Top-Right: Server/Logs | Bottom-Left: Shell | Bottom-Right: AI Agent',
        },
        {
          label: '🧱 3-Pane Side-Stack (Left Editor + Right Split)',
          value: 'three_pane',
          hint: 'Left: Editor | Right-Top: Server/Logs | Right-Bottom: AI Agent',
        },
        {
          label: '🌗 2-Pane Side-by-Side (Vertical Split)',
          value: 'split_vertical',
          hint: 'Left: Editor/Shell | Right: AI Agent',
        },
        {
          label: '⬒ 2-Pane Top / Bottom (Horizontal Split)',
          value: 'split_horizontal',
          hint: 'Top: Editor/Shell | Bottom: AI Agent',
        },
        {
          label: '🛠️  Custom Interactive Pane Builder',
          value: 'custom',
          hint: 'Manually configure pane titles, startup commands, split parents, and directions',
        },
      ],
      defaultIndex: 0,
    });

    if (!layoutStyleChoice) return null;

    let configuredLayout = [];

    if (layoutStyleChoice === 'custom') {
      console.log(`\n  ${ANSI.bold}🛠️  Custom Pane Layout Builder:${ANSI.reset}`);
      console.log(`  ${ANSI.dim}Configure each pane in order. The first pane is the root pane; subsequent panes split from an existing pane.${ANSI.reset}\n`);

      const paneCountInput = await promptText({
        message: 'How many panes would you like to configure in this workspace? (1-6):',
        defaultValue: '4',
        validate: (val) => {
          const num = parseInt(val.trim(), 10);
          if (isNaN(num) || num < 1 || num > 6) return 'Please enter a number between 1 and 6';
          return true;
        },
      });
      if (paneCountInput === null) return null;
      const paneCount = parseInt(paneCountInput.trim(), 10) || 4;

      for (let i = 1; i <= paneCount; i++) {
        const defaultId = i === 1
          ? 'vim'
          : (i === 2
            ? 'server'
            : (i === 3
              ? 'shell'
              : (i === 4
                ? 'test'
                : (i === 5
                  ? 'logs'
                  : (i === 6 ? 'agy' : `pane-${i}`)))));

        const defaultTitle = i === 1
          ? 'editor'
          : (i === 2
            ? 'dev server'
            : (i === 3
              ? 'shell'
              : (i === 4
                ? 'test runner'
                : (i === 5
                  ? 'system logs'
                  : (i === 6 ? 'ai agent' : `pane ${i}`)))));

        const paneIdInput = await promptText({
          message: `Pane ${i} unique identifier (id):`,
          defaultValue: defaultId,
          validate: (val) => Boolean(val.trim()) || 'Pane ID cannot be empty',
        });
        if (paneIdInput === null) return null;
        const paneId = paneIdInput.trim();

        const paneTitleInput = await promptText({
          message: `Pane ${i} display title:`,
          defaultValue: defaultTitle,
        });
        if (paneTitleInput === null) return null;
        const paneTitle = paneTitleInput.trim() || paneId;

        const defaultCmd = i === 1
          ? 'vim .'
          : (i === 2 && finalPreset === 'node'
            ? 'npm run dev'
            : (i === 2 && finalPreset === 'laravel'
              ? 'tail -f storage/logs/laravel.log'
              : (i === 4 && finalAgent !== 'none' ? finalAgent : '')));

        const paneCmdInput = await promptText({
          message: `Pane ${i} startup command (leave empty for clean shell):`,
          defaultValue: defaultCmd,
        });
        if (paneCmdInput === null) return null;
        const paneCmd = paneCmdInput.trim() || null;

        const paneDef = {
          id: paneId,
          title: paneTitle,
          cmd: paneCmd,
        };

        if (i === 1) {
          paneDef.position = 'root';
        } else {
          const previousPanes = configuredLayout.map((p) => ({
            label: `Pane "${p.title}" (id: ${p.id})`,
            value: p.id,
          }));

          const splitFrom = await promptSelect({
            message: `Split Pane ${i} from which existing pane?`,
            choices: previousPanes,
            defaultIndex: previousPanes.length - 1,
          });
          if (!splitFrom) return null;
          paneDef.from = splitFrom;

          const splitDir = await promptSelect({
            message: `Split direction from "${splitFrom}":`,
            choices: [
              { label: '➡️  Right (Vertical split - side-by-side)', value: 'right' },
              { label: '⬇️  Down (Horizontal split - stacked)', value: 'down' },
            ],
            defaultIndex: i % 2 === 0 ? 0 : 1,
          });
          if (!splitDir) return null;
          paneDef.split = splitDir;
        }

        const isAgent = await promptConfirm({
          message: `Designate Pane "${paneTitle}" as the AI CLI Agent pane?`,
          defaultYes: paneId === 'agy' || paneId === 'agent' || (i === paneCount && finalAgent !== 'none'),
        });
        if (isAgent) {
          paneDef.isAgent = true;
        }

        const shouldFocus = await promptConfirm({
          message: `Focus Pane "${paneTitle}" by default on workspace boot?`,
          defaultYes: isAgent || i === 1,
        });
        if (shouldFocus) {
          paneDef.focus = true;
        }

        configuredLayout.push(paneDef);
      }
    } else {
      console.log(`\n  ${ANSI.bold}Customize Pane Startup Commands:${ANSI.reset}`);

      const editorCmdInput = await promptText({
        message: 'Editor startup command (Top-Left / Main pane):',
        defaultValue: 'vim .',
      });
      if (editorCmdInput === null) return null;
      const editorCmd = editorCmdInput.trim() || null;

      let defaultServerCmd = '';
      if (finalPreset === 'node') defaultServerCmd = 'npm run dev';
      else if (finalPreset === 'laravel') defaultServerCmd = 'tail -f storage/logs/laravel.log';

      let serverCmd = null;
      if (layoutStyleChoice === 'quadrant' || layoutStyleChoice === 'three_pane') {
        const serverCmdInput = await promptText({
          message: 'Dev server / logs startup command (Top-Right pane, leave empty for shell):',
          defaultValue: defaultServerCmd,
        });
        if (serverCmdInput === null) return null;
        serverCmd = serverCmdInput.trim() || null;
      }

      const agentCmd = finalAgent === 'none' ? null : finalAgent;
      const agentTitle = finalAgent === 'none' ? 'shell' : finalAgent;

      if (layoutStyleChoice === 'quadrant') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: finalPreset === 'laravel' ? 'logs' : 'server', cmd: serverCmd, split: 'right', from: 'vim' },
          { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', focus: true, isAgent: true },
        ];
      } else if (layoutStyleChoice === 'three_pane') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: finalPreset === 'laravel' ? 'logs' : 'server', cmd: serverCmd, split: 'right', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', focus: true, isAgent: true },
        ];
      } else if (layoutStyleChoice === 'split_vertical') {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'right', from: 'vim', focus: true, isAgent: true },
        ];
      } else if (layoutStyleChoice === 'split_horizontal') {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'vim', focus: true, isAgent: true },
        ];
      }
    }

    // Step 5: Scaffolding & Environment Setup
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 5: Scaffolding & Environment Automation (scaffold) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Automate environment file copying, dependency installation, and web server symlinks.${ANSI.reset}\n`
    );

    const defaultEnv = finalPreset === 'laravel' || finalPreset === 'node' ? '.env' : '';
    const envSourceInput = await promptText({
      message: 'Source .env file path to copy into new worktrees (press Enter to skip):',
      defaultValue: defaultEnv,
      completer: 'path',
    });
    if (envSourceInput === null) return null;
    const envSource = envSourceInput.trim() || null;

    let defaultInstall = '';
    if (finalPreset === 'node') defaultInstall = 'npm install';
    else if (finalPreset === 'laravel') defaultInstall = 'composer install';

    const installInput = await promptText({
      message: 'Dependency install command to run on creation (press Enter to skip):',
      defaultValue: defaultInstall,
    });
    if (installInput === null) return null;
    const installCmd = installInput.trim() || null;

    const symlinkInput = await promptText({
      message: 'Optional web server symlink path to update (e.g. /var/www/active, press Enter to skip):',
      defaultValue: '',
      completer: 'dir',
    });
    if (symlinkInput === null) return null;
    const symlinkPath = symlinkInput.trim() || null;

    // Step 6: Agent Skill Installation
    let skillInstalled = false;
    if (process.stdin.isTTY) {
      console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 6: AI Agent Skill Installation (skill) ──${ANSI.reset}`);
      console.log(
        `  ${ANSI.dim}Install the Arise AI Agent Skill to enable Antigravity and Claude Code to orchestrate worktrees directly.${ANSI.reset}\n`
      );

      const wantSkill = await promptConfirm({
        message: 'Install Arise agent skill for Antigravity & Claude Code now?',
        defaultYes: true,
      });

      if (wantSkill) {
        try {
          installSkill({ scope: isLocal ? 'local' : 'global', cwd });
          skillInstalled = true;
        } catch (err) {
          console.warn(`  ${ANSI.yellow}Skill installation skipped: ${err.message}${ANSI.reset}`);
        }
      }
    }

    // Step 7: Write Configuration File
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 7: Save Configuration ──${ANSI.reset}\n`);

    const targetFilePath = options.targetPath || (isLocal
      ? path.join(cwd, '.ariserc.json')
      : path.join(os.homedir(), '.config', 'arise', '.ariserc.json'));

    if (fs.existsSync(targetFilePath) && !options.force) {
      console.log(`  ${ANSI.yellow}Note: Configuration already exists at ${targetFilePath}.${ANSI.reset}\n`);
      const overwrite = await promptConfirm({
        message: `Overwrite existing configuration file?`,
        defaultYes: true,
      });
      if (!overwrite) {
        console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
        return targetFilePath;
      }
    }

    await mkdir(path.dirname(targetFilePath), { recursive: true });

    const configObj = {
      $schema: './arise.schema.json',
      preset: finalPreset,
      repo: {
        defaultBaseBranch,
        protectedBranches,
      },
      workspace: {
        agent: finalAgent,
        defaultFocus: focusChoice,
        labelPrefix,
      },
      layout: configuredLayout,
    };

    if (bareRepoPath) {
      configObj.repo.bareRepo = bareRepoPath;
      if (worktreesBasePath) configObj.repo.worktreesBase = worktreesBasePath;
    }

    if (envSource || installCmd || symlinkPath) {
      configObj.scaffold = {};
      if (envSource) configObj.scaffold.envSource = envSource;
      if (installCmd) configObj.scaffold.install = installCmd;
      if (symlinkPath) configObj.scaffold.symlink = symlinkPath;
    }

    const scopeTitle = isLocal ? 'Local Repository Configuration (.ariserc.json)' : 'Global Configuration (~/.config/arise/.ariserc.json)';
    const content = `// Arise ${scopeTitle}
// Documentation & Guide: https://github.com/tsuzuku/arise
//
// SETTINGS REFERENCE:
// • preset: Preset name ('node' | 'laravel' | 'generic' | custom)
// • repo.defaultBaseBranch: Default branch to branch off when creating worktrees
// • repo.protectedBranches: Branches protected from deletion during --nuke
// • repo.bareRepo: Path to bare repository (if using bare git topology)
// • repo.worktreesBase: Base directory where worktrees are created
// • workspace.agent: CLI AI agent ('agy' | 'claude' | 'aider' | 'copilot' | 'none')
// • workspace.defaultFocus: Pane to focus on workspace boot ('agy' | 'vim' | 'server' | 'shell')
// • workspace.labelPrefix: Prefix added to Herdr workspace labels (e.g. '[BE] ')
// • layout: Declarative terminal layout definitions (id, title, cmd, position, from, split, focus, isAgent)
// • scaffold.envSource: Source .env template file to copy into worktree
// • scaffold.install: Command to run to install dependencies upon creation
// • scaffold.symlink: Optional symlink to point to the active worktree
${JSON.stringify(configObj, null, 2)}
`;

    await writeFile(targetFilePath, content, 'utf8');
    this.printSuccessCard(targetFilePath, `Configuration saved successfully to ${targetFilePath}.`);
    return targetFilePath;
  }

  static printSuccessCard(filePath, message) {
    const cardLines = [
      `${ANSI.bold}${ANSI.green}✔ ${message}${ANSI.reset}`,
      `${ANSI.dim}Config path: ${filePath}${ANSI.reset}`,
      '',
      `${ANSI.bold}Next Steps:${ANSI.reset}`,
      `  • ${ANSI.cyan}arise --branch <feature>${ANSI.reset}   Create a new git worktree & Herdr workspace`,
      `  • ${ANSI.cyan}arise${ANSI.reset}                    Launch the interactive TUI menu`,
      `  • ${ANSI.cyan}arise --nuke${ANSI.reset}             Tear down worktrees and cleanup branches safely`,
      `  • ${ANSI.cyan}arise --help${ANSI.reset}             View all available CLI flags and options`,
    ];

    const box = drawBox('⚙️ Setup Complete', cardLines, Math.min(80, (process.stdout.columns || 80) - 2));
    console.log(`\n${box.join('\n')}\n`);
  }
}

module.exports = {
  ConfigInitWizard,
};
