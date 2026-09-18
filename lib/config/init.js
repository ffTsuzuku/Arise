const fs = require('fs');
const { mkdir, writeFile } = require('fs/promises');
const path = require('path');
const os = require('os');
const { ANSI, drawBox } = require('../tui/ansi');
const { promptSelect, promptMultiSelect, promptText, promptConfirm } = require('../tui/prompt');
const git = require('../git');
const { detectPreset, getPreset, listPresets, builtInPresets } = require('../../presets');
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

    // If preset creation requested explicitly
    if (options.presetOnly || options.initTarget === 'preset') {
      return this.runCreatePresetWizard(cwd, options);
    }

    // Determine quick vs guided mode
    let isQuick = Boolean(options.quick);
    if (!isQuick && process.stdin.isTTY && !options.local && !options.global) {
      console.log(`  ${ANSI.bold}What would you like to initialize?${ANSI.reset}`);
      console.log(`  ${ANSI.cyan}• Reusable Preset:${ANSI.reset}    Create a stack preset (layout + setup commands) saved globally or locally.`);
      console.log(`  ${ANSI.cyan}• Project Config:${ANSI.reset}     Configure .ariserc.json for this repository.\n`);

      const mainTask = await promptSelect({
        message: 'Select initialization task:',
        choices: [
          {
            label: '✨ Create a new Reusable Preset',
            value: 'preset',
            hint: 'Define stack layout, setup commands, and save globally for all projects or locally',
          },
          {
            label: '📁 Configure Local Repository (.ariserc.json)',
            value: 'project',
            hint: 'Set up project configuration, pick a preset, or customize layout',
          },
        ],
      });

      if (!mainTask) {
        console.log(`${ANSI.dim}Setup cancelled.${ANSI.reset}\n`);
        return null;
      }

      if (mainTask === 'preset') {
        return this.runCreatePresetWizard(cwd, options);
      }

      const modeChoice = await promptSelect({
        message: 'Select project configuration mode:',
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

      if (detectedPreset && Array.isArray(detectedPreset.setup) && detectedPreset.setup.length > 0) {
        configObj.setup = [...detectedPreset.setup];
      }
      if (detectedPreset && Array.isArray(detectedPreset.cleanup) && detectedPreset.cleanup.length > 0) {
        configObj.cleanup = [...detectedPreset.cleanup];
      }

      const content = `// Arise Local Repository Configuration (.ariserc.json)
// Documentation: https://github.com/tsuzuku/arise
//
// SETTINGS REFERENCE:
// • preset: Project preset ('default' or custom preset name)
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
      await this.handleGitignore(targetFilePath, isLocal, isInsideGit, cwd, options);
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
// • preset: Default project preset ('default' or custom preset name)
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

    const searchDirs = [cwd, repoRoot].filter(Boolean);
    const allPresets = listPresets(searchDirs);
    const detected = detectPreset(cwd, searchDirs);
    const detectedName = (detected && detected.name !== 'default') ? detected.name : null;

    // Step 1: Project Preset Selection
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 1: Project Preset Selection (preset) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Arise uses user-defined presets to configure layouts, setup commands, and AI agent panes.${ANSI.reset}\n`
    );

    const choices = [];

    // Add discovered user-defined presets
    for (const cp of allPresets) {
      choices.push({
        label: `${cp.label || cp.name}${detectedName === cp.name ? ' (Detected)' : ''}`,
        value: cp.name,
        hint: cp.preset.sourcePath ? `Loaded from ${cp.preset.sourcePath}` : 'User-defined preset',
      });
    }

    choices.push({
      label: '✨ Create a new Preset now...',
      value: '__create_preset__',
      hint: 'Walk through creating a new reusable preset (saved globally or locally)',
    });

    choices.push({
      label: '📦 Default / None (Generic shell layout)',
      value: 'default',
      hint: 'Universal terminal layout without preset dependencies',
    });

    choices.push({
      label: '✏️  Custom Preset Name or File Path...',
      value: '__custom__',
      hint: 'Specify custom preset name, file path, or package',
    });

    let defaultIndex = 0;
    if (detectedName) {
      const idx = choices.findIndex((c) => c.value === detectedName);
      if (idx >= 0) defaultIndex = idx;
    }

    const presetChoice = await promptSelect({
      message: 'Choose project preset:',
      choices,
      defaultIndex,
    });

    if (!presetChoice) return null;

    let finalPreset = presetChoice;
    if (presetChoice === '__create_preset__') {
      const createdPath = await this.runCreatePresetWizard(cwd, options);
      if (!createdPath) return null;
      try {
        const createdPreset = require(createdPath);
        finalPreset = createdPreset.name;
      } catch {
        finalPreset = 'default';
      }
    } else if (presetChoice === '__custom__') {
      const customInput = await promptText({
        message: 'Enter custom preset name, file path (e.g. ./presets/custom.js), or package:',
        defaultValue: 'default',
      });
      if (customInput === null) return null;
      finalPreset = customInput.trim() || 'default';
    }

    const presetObj = getPreset(finalPreset, [cwd]);

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
        const defaultId = `pane-${i}`;
        const defaultTitle = `Pane ${i}`;
        const defaultCmd = '';

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

        // Auto-detect agent designation from command or ID without redundant yes/no prompts
        if (finalAgent !== 'none') {
          if (paneCmd === finalAgent || paneId === finalAgent || paneId === 'agy' || paneId === 'agent' || paneId === 'ai') {
            paneDef.isAgent = true;
          }
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
      if (presetObj && Array.isArray(presetObj.layout)) {
        const serverPane = presetObj.layout.find((p) => p.id === 'server' || p.id === 'watch' || p.id === 'dev');
        if (serverPane && serverPane.cmd) defaultServerCmd = serverPane.cmd;
      }

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
      const serverTitle = serverCmd ? 'server' : 'shell';

      if (layoutStyleChoice === 'quadrant') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: serverTitle, cmd: serverCmd, split: 'right', from: 'vim' },
          { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', isAgent: true },
        ];
      } else if (layoutStyleChoice === 'three_pane') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: serverTitle, cmd: serverCmd, split: 'right', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', isAgent: true },
        ];
      } else if (layoutStyleChoice === 'split_vertical') {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'right', from: 'vim', isAgent: true },
        ];
      } else if (layoutStyleChoice === 'split_horizontal') {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'vim', isAgent: true },
        ];
      }
    }

    // Dynamic Default Pane Focus selection based on actual configured panes
    const focusChoices = configuredLayout.map((p) => {
      const typeHint = p.isAgent
        ? 'AI Agent'
        : (p.cmd ? `command: "${p.cmd}"` : 'clean shell');
      return {
        label: `Pane "${p.title}" (id: ${p.id}) — [${typeHint}]`,
        value: p.id,
        hint: p.isAgent ? 'Instant focus on pair programming agent' : (p.id === 'vim' ? 'Focus code editor upon workspace boot' : `Focus pane "${p.title}"`),
      };
    });

    const agentIndex = configuredLayout.findIndex((p) => p.isAgent);
    const defaultFocusIndex = agentIndex >= 0 ? agentIndex : 0;

    const focusChoice = await promptSelect({
      message: 'Default pane to focus upon creation (defaultFocus):',
      choices: focusChoices,
      defaultIndex: defaultFocusIndex,
    });
    if (!focusChoice) return null;

    for (const pane of configuredLayout) {
      if (pane.id === focusChoice) {
        pane.focus = true;
      } else {
        delete pane.focus;
      }
    }

    // Step 5: Scaffolding & Environment Setup
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 5: Scaffolding & Environment Automation (scaffold) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Automate environment file copying, dependency installation, and web server symlinks.${ANSI.reset}\n`
    );

    const defaultEnv = '';
    const envSourceInput = await promptText({
      message: 'Source .env file path to copy into new worktrees (press Enter to skip):',
      defaultValue: defaultEnv,
      completer: 'path',
    });
    if (envSourceInput === null) return null;
    const envSource = envSourceInput.trim() || null;

    let defaultInstall = (presetObj && Array.isArray(presetObj.setup) && presetObj.setup[0]) || '';

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
// • preset: Preset name ('default' or custom preset name)
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
    await this.handleGitignore(targetFilePath, isLocal, isInsideGit, cwd, options);
    await this.handleExportPreset({
      configObj,
      configuredLayout,
      finalPreset,
      envSource,
      installCmd,
      symlinkPath,
      cwd,
      options,
    });
    this.printSuccessCard(targetFilePath, `Configuration saved successfully to ${targetFilePath}.`);
    return targetFilePath;
  }

  static async runCreatePresetWizard(cwd, options = {}) {
    console.log(`\n${ANSI.bold}${ANSI.brightCyan}── ✨ Create Reusable Preset ──${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Presets bundle terminal layout, AI agent pane, setup commands, and optional auto-detection.${ANSI.reset}\n`);

    // 1. Preset Name
    const defaultName = options.presetName || (cwd ? path.basename(cwd).toLowerCase().replace(/[^a-z0-9_-]/g, '') : 'custom');
    let presetName = options.presetName;
    if (!presetName && process.stdin.isTTY) {
      presetName = await promptText({
        message: 'Enter preset name (e.g. fastapi, rails, nextjs, rust-api):',
        defaultValue: defaultName,
        validate: (v) => Boolean(v && v.trim()) || 'Preset name cannot be empty',
      });
    }
    if (!presetName) presetName = defaultName;
    presetName = presetName.trim().toLowerCase();

    // 2. Icon / Emoji
    let icon = options.icon;
    if (!icon && process.stdin.isTTY) {
      const iconChoice = await promptSelect({
        message: `Choose an icon/emoji for "${presetName}":`,
        choices: [
          { label: '⚡ FastAPI / Vite / Fast (⚡)', value: '⚡' },
          { label: '🐍 Python / Django / Flask (🐍)', value: '🐍' },
          { label: '🦀 Rust / Cargo (🦀)', value: '🦀' },
          { label: '🐹 Go / Golang (🐹)', value: '🐹' },
          { label: '💎 Ruby / Rails (💎)', value: '💎' },
          { label: '✨ Next.js / React / TypeScript (✨)', value: '✨' },
          { label: '☕ Java / Kotlin / Spring (☕)', value: '☕' },
          { label: '🐘 PHP / Laravel / Symfony (🐘)', value: '🐘' },
          { label: '🚀 General Project (🚀)', value: '🚀' },
          { label: '🧩 Tooling / Custom (🧩)', value: '🧩' },
          { label: '✏️  Enter custom emoji...', value: '__custom__' },
        ],
        defaultIndex: 0,
      });

      if (iconChoice === '__custom__' && process.stdin.isTTY) {
        const customEmoji = await promptText({
          message: 'Enter custom emoji or symbol:',
          defaultValue: '🧩',
        });
        icon = (customEmoji || '🧩').trim();
      } else {
        icon = iconChoice || '🧩';
      }
    }
    if (!icon) icon = '🧩';

    // 3. Storage Scope (Global vs Local)
    let exportScope = options.exportScope;
    if (!exportScope && process.stdin.isTTY) {
      exportScope = await promptSelect({
        message: `Where would you like to save the "${presetName}" preset?`,
        choices: [
          {
            label: '🌐 Global (~/.config/arise/presets/) [Recommended]',
            value: 'global',
            hint: 'Available to all repositories and projects on this machine',
          },
          {
            label: '📁 Local (.arise/presets/)',
            value: 'local',
            hint: 'Saved in current repo (.arise/presets/) to share with teammates',
          },
        ],
        defaultIndex: 0,
      });
    }
    if (!exportScope) exportScope = 'global';

    // 4. Setup Shell Commands
    let setupCommands = options.setup ?? options.setupCommands;
    if (!setupCommands && process.stdin.isTTY) {
      const setupInput = await promptText({
        message: 'Setup shell command(s) for fresh workspaces (comma-separated or Enter for none, e.g. "npm install, cp .env.example .env"):',
        defaultValue: '',
      });
      if (setupInput && setupInput.trim()) {
        setupCommands = setupInput.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        setupCommands = [];
      }
    }
    if (!Array.isArray(setupCommands)) {
      setupCommands = setupCommands ? [setupCommands] : [];
    }

    // 5. Cleanup Shell Commands
    let cleanupCommands = options.cleanup ?? options.cleanupCommands;
    if (!cleanupCommands && process.stdin.isTTY) {
      const cleanupInput = await promptText({
        message: 'Cleanup shell command(s) before deleting workspace (comma-separated or Enter for none, e.g. "docker compose down"):',
        defaultValue: '',
      });
      if (cleanupInput && cleanupInput.trim()) {
        cleanupCommands = cleanupInput.split(',').map((s) => s.trim()).filter(Boolean);
      } else {
        cleanupCommands = [];
      }
    }
    if (!Array.isArray(cleanupCommands)) {
      cleanupCommands = cleanupCommands ? [cleanupCommands] : [];
    }

    // 6. Layout Template & Customization
    let layout = options.layout;
    if (!layout) {
      let layoutTemplate = options.layoutTemplate;
      let editorCmd = options.editorCmd;
      let serverCmd = options.serverCmd;
      let agentCmd = options.agentCmd;

      if (!layoutTemplate && process.stdin.isTTY) {
        layoutTemplate = await promptSelect({
          message: 'Select terminal layout template:',
          choices: [
            {
              label: '🔲 4-Pane Quadrant (Editor, Dev Server, Shell, AI Agent)',
              value: '4pane',
              hint: 'Standard full-featured workspace quadrant',
            },
            {
              label: '📐 3-Pane Split (Editor, Shell, AI Agent)',
              value: '3pane',
              hint: 'Clean layout: Editor on left, Shell and AI Agent stacked on right',
            },
            {
              label: '🪟 2-Pane Split (Editor, AI Agent)',
              value: '2pane',
              hint: 'Minimal layout: Editor side-by-side with AI Agent',
            },
          ],
          defaultIndex: 0,
        });
      }

      if (layoutTemplate) {
        if (editorCmd === undefined && process.stdin.isTTY) {
          editorCmd = await promptText({
            message: 'Editor command (or Enter for blank shell):',
            defaultValue: 'nvim .',
          });
        }
        editorCmd = editorCmd || '';

        if (serverCmd === undefined && layoutTemplate === '4pane' && process.stdin.isTTY) {
          serverCmd = await promptText({
            message: 'Dev server / watcher command (or Enter for blank shell):',
            defaultValue: '',
          });
        }
        serverCmd = serverCmd || '';

        if (agentCmd === undefined && process.stdin.isTTY) {
          agentCmd = await promptText({
            message: 'AI CLI Agent command:',
            defaultValue: 'agy',
          });
        }
        agentCmd = agentCmd || 'agy';

        if (layoutTemplate === '4pane') {
          layout = [
            { id: 'editor', title: 'editor', cmd: editorCmd.trim() || null, position: 'root' },
            { id: 'server', title: 'server', cmd: serverCmd.trim() || null, split: 'right', from: 'editor' },
            { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'editor' },
            { id: 'agent', title: agentCmd.trim() || 'agent', cmd: agentCmd.trim() || 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
          ];
        } else if (layoutTemplate === '3pane') {
          layout = [
            { id: 'editor', title: 'editor', cmd: editorCmd.trim() || null, position: 'root' },
            { id: 'shell', title: 'shell', cmd: null, split: 'right', from: 'editor' },
            { id: 'agent', title: agentCmd.trim() || 'agent', cmd: agentCmd.trim() || 'agy', split: 'down', from: 'shell', focus: true, isAgent: true },
          ];
        } else {
          layout = [
            { id: 'editor', title: 'editor', cmd: editorCmd.trim() || null, position: 'root' },
            { id: 'agent', title: agentCmd.trim() || 'agent', cmd: agentCmd.trim() || 'agy', split: 'right', from: 'editor', focus: true, isAgent: true },
          ];
        }
      }
    }

    if (!layout) {
      layout = [
        { id: 'editor', title: 'editor', cmd: null, position: 'root' },
        { id: 'shell', title: 'shell', cmd: null, split: 'right', from: 'editor' },
        { id: 'agent', title: 'agent', cmd: 'agy', split: 'down', from: 'shell', focus: true, isAgent: true },
      ];
    }

    // 7. Write Preset File
    const exportDir = exportScope === 'global'
      ? path.join(os.homedir(), '.config', 'arise', 'presets')
      : path.join(cwd, '.arise', 'presets');

    await mkdir(exportDir, { recursive: true });
    const exportFilePath = path.join(exportDir, `${presetName}.js`);

    const presetCode = `module.exports = {
  name: '${presetName}',
  icon: '${icon}',

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
  },

  workspace: {
    defaultFocus: 'agent',
    agent: 'agy',
  },

  setup: ${JSON.stringify(setupCommands, null, 2)},

  cleanup: ${JSON.stringify(cleanupCommands, null, 2)},

  layout: ${JSON.stringify(layout, null, 2)},
};
`;

    await writeFile(exportFilePath, presetCode, 'utf8');

    console.log(`\n  ${ANSI.green}✔ Preset "${presetName}" (${icon}) created successfully!${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Preset location: ${exportFilePath}${ANSI.reset}`);
    if (exportScope === 'global') {
      console.log(`  ${ANSI.cyan}Scope: Global — All repositories on this machine can now use \`arise --preset ${presetName}\`${ANSI.reset}\n`);
    } else {
      console.log(`  ${ANSI.cyan}Scope: Local — Saved in \`.arise/presets/\` for this repository${ANSI.reset}\n`);
    }

    return exportFilePath;
  }

  static async handleExportPreset({
    configObj,
    configuredLayout,
    finalPreset,
    envSource,
    installCmd,
    symlinkPath,
    cwd,
    options = {},
  }) {
    if (!process.stdin.isTTY && !options.exportPreset) {
      return null;
    }

    const isCustomCandidate = finalPreset !== 'default' && finalPreset !== 'generic';

    let wantExport = options.exportPreset;
    if (typeof wantExport !== 'boolean' && process.stdin.isTTY) {
      console.log(`\n${ANSI.bold}${ANSI.cyan}── Reusable Custom Preset Export ──${ANSI.reset}`);
      console.log(`  ${ANSI.dim}Export this layout, agent, and setup commands as a standalone preset (.js) module.${ANSI.reset}\n`);

      wantExport = await promptConfirm({
        message: 'Export this setup as a reusable standalone preset module (.js)?',
        defaultYes: isCustomCandidate,
      });
    }

    if (!wantExport) {
      return null;
    }

    const defaultPresetName = isCustomCandidate
      ? finalPreset.replace(/[^a-zA-Z0-9_-]/g, '')
      : 'my-preset';

    const exportNameInput = await promptText({
      message: 'Preset identifier name (e.g. django, fastapi, rust, rails):',
      defaultValue: options.presetName || defaultPresetName,
      validate: (v) => Boolean(v && v.trim()) || 'Preset name cannot be empty',
    });

    const exportName = (exportNameInput || defaultPresetName).trim().toLowerCase();

    const iconChoice = await promptSelect({
      message: `Choose an icon/emoji for "${exportName}":`,
      choices: [
        { label: '⚡ FastAPI / Vite (⚡)', value: '⚡' },
        { label: '🐍 Python / Django / Flask (🐍)', value: '🐍' },
        { label: '🦀 Rust / Cargo (🦀)', value: '🦀' },
        { label: '🐹 Go / Golang (🐹)', value: '🐹' },
        { label: '💎 Ruby / Rails (💎)', value: '💎' },
        { label: '☕ Java / Kotlin / Spring (☕)', value: '☕' },
        { label: '🚀 Launch / Monorepo (🚀)', value: '🚀' },
        { label: '✨ Modern / Sparkle (✨)', value: '✨' },
        { label: '🧩 Custom / Plugin (🧩)', value: '🧩' },
        { label: '✏️  Type custom emoji...', value: '__custom__' },
      ],
      defaultIndex: 0,
    });

    let exportIcon = iconChoice || '🧩';
    if (iconChoice === '__custom__' && process.stdin.isTTY) {
      const customEmoji = await promptText({
        message: 'Enter custom emoji or icon symbol:',
        defaultValue: '🧩',
      });
      exportIcon = (customEmoji || '🧩').trim();
    }

    const detectMarkerInput = await promptText({
      message: 'Optional project file marker for auto-detection (e.g. "manage.py", "Cargo.toml", "go.mod" or Enter for none):',
      defaultValue: '',
    });
    const detectMarker = detectMarkerInput ? detectMarkerInput.trim() : '';

    let exportScope = options.exportScope;
    if (!exportScope && process.stdin.isTTY) {
      exportScope = await promptSelect({
        message: `Where would you like to save the "${exportName}" preset?`,
        choices: [
          {
            label: '🌐 Global (~/.config/arise/presets/)',
            value: 'global',
            hint: 'Installed globally — all repositories on this machine can use it',
          },
          {
            label: '📁 Local (.arise/presets/)',
            value: 'local',
            hint: 'Saved in this repository (.arise/presets/) for teammates',
          },
        ],
        defaultIndex: 0,
      });
    }
    if (!exportScope) exportScope = 'global';

    const exportDir = exportScope === 'global'
      ? path.join(os.homedir(), '.config', 'arise', 'presets')
      : path.join(cwd, '.arise', 'presets');

    await mkdir(exportDir, { recursive: true });
    const exportFilePath = path.join(exportDir, `${exportName}.js`);

    const setupArr = [];
    if (envSource) setupArr.push(`cp ${envSource} .env`);
    if (installCmd) setupArr.push(installCmd);
    if (Array.isArray(configObj.setup)) setupArr.push(...configObj.setup);

    const presetModuleCode = `module.exports = {
  name: '${exportName}',
  icon: '${exportIcon}',

  repo: ${JSON.stringify(configObj.repo, null, 2)},

  workspace: ${JSON.stringify(configObj.workspace, null, 2)},

  setup: ${JSON.stringify(setupArr, null, 2)},

  cleanup: ${JSON.stringify(configObj.cleanup || [], null, 2)},

  layout: ${JSON.stringify(configuredLayout, null, 2)},
};
`;

    await writeFile(exportFilePath, presetModuleCode, 'utf8');
    console.log(`\n  ${ANSI.green}✔ Standalone custom preset "${exportName}" (${exportIcon}) saved successfully!${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Preset location: ${exportFilePath}${ANSI.reset}\n`);
    return exportFilePath;
  }

  static async handleGitignore(targetFilePath, isLocal, isInsideGit, cwd, options = {}) {
    if (!isLocal) {
      return false;
    }

    let repoRoot = cwd;
    if (isInsideGit) {
      try {
        repoRoot = git.getRepoRootDir(cwd) || cwd;
      } catch {
        repoRoot = cwd;
      }
    }

    const gitignorePath = path.join(repoRoot, '.gitignore');
    const relPath = path.relative(repoRoot, targetFilePath);
    const configFileName = (relPath && !relPath.startsWith('..')) ? relPath : path.basename(targetFilePath);

    let existingContent = '';
    if (fs.existsSync(gitignorePath)) {
      try {
        existingContent = fs.readFileSync(gitignorePath, 'utf8');
      } catch {}
    }

    const lines = existingContent.split(/\r?\n/).map((l) => l.trim());
    const isAlreadyIgnored =
      lines.includes(configFileName) ||
      lines.includes(`/${configFileName}`) ||
      (path.basename(targetFilePath) !== configFileName && lines.includes(path.basename(targetFilePath)));

    if (isAlreadyIgnored) {
      return false;
    }

    let shouldAdd = false;
    if (typeof options.gitignore === 'boolean') {
      shouldAdd = options.gitignore;
    } else if (typeof options.addToGitignore === 'boolean') {
      shouldAdd = options.addToGitignore;
    } else if (process.stdin.isTTY) {
      const wantGitignore = await promptConfirm({
        message: `Add ${configFileName} to .gitignore?`,
        defaultYes: false,
      });
      shouldAdd = Boolean(wantGitignore);
    }

    if (shouldAdd) {
      try {
        const needsNewline = existingContent.length > 0 && !existingContent.endsWith('\n');
        const appendContent = `${needsNewline ? '\n' : ''}${configFileName}\n`;
        await writeFile(gitignorePath, existingContent + appendContent, 'utf8');
        console.log(`  ${ANSI.green}✔ Added ${configFileName} to .gitignore${ANSI.reset}`);
        return true;
      } catch (err) {
        console.warn(`  ${ANSI.yellow}Warning: Failed to update .gitignore: ${err.message}${ANSI.reset}`);
        return false;
      }
    }

    return false;
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
