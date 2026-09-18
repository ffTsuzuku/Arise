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

    // Step 4: Terminal Layout & Workspace Panes (layout)
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Terminal Layout & Workspace Panes (layout) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Configure how Arise partitions your terminal workspace into panes and startup commands.${ANSI.reset}\n`
    );

    let configuredLayout = options.layout;
    if (!configuredLayout) {
      let defaultServerCmd = '';
      if (presetObj && Array.isArray(presetObj.layout)) {
        const serverPane = presetObj.layout.find((p) => p.id === 'server' || p.id === 'watch' || p.id === 'dev');
        if (serverPane && serverPane.cmd) defaultServerCmd = serverPane.cmd;
      }

      configuredLayout = await this.promptLayoutAgnostic({
        context: 'guided',
        layoutTemplate: options.layoutTemplate,
        editorCmd: options.editorCmd !== undefined ? options.editorCmd : 'vim .',
        serverCmd: options.serverCmd !== undefined ? options.serverCmd : defaultServerCmd,
        agentCmd: options.agentCmd !== undefined ? options.agentCmd : (finalAgent !== 'none' ? finalAgent : ''),
        commands: options.commands,
        finalAgent,
      });
      if (!configuredLayout) return null;
    }

    const focusedPane = configuredLayout.find((p) => p.focus) || configuredLayout[0];
    const focusChoice = focusedPane ? focusedPane.id : 'pane-1';

    // Step 5: Workspace Lifecycle Commands (setup & cleanup)
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 5: Workspace Lifecycle Commands (setup & cleanup) ──${ANSI.reset}`);
    console.log(
      `  ${ANSI.dim}Automate workspace setup (e.g. dependency installation, .env copying) and cleanup commands.${ANSI.reset}\n`
    );

    let defaultSetup = (presetObj && Array.isArray(presetObj.setup) && presetObj.setup.join(', ')) || '';
    const setupInput = await promptText({
      message: 'Setup command(s) for fresh workspaces (comma-separated or Enter to skip, e.g. "npm install, cp .env.example .env"):',
      defaultValue: defaultSetup,
    });
    if (setupInput === null) return null;
    const setupCommands = setupInput.trim()
      ? setupInput.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    let defaultCleanup = (presetObj && Array.isArray(presetObj.cleanup) && presetObj.cleanup.join(', ')) || '';
    const cleanupInput = await promptText({
      message: 'Cleanup command(s) before deleting workspace (comma-separated or Enter to skip, e.g. "docker compose down"):',
      defaultValue: defaultCleanup,
    });
    if (cleanupInput === null) return null;
    const cleanupCommands = cleanupInput.trim()
      ? cleanupInput.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

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

    const finalSetup = options.setup
      ? (Array.isArray(options.setup) ? options.setup : [options.setup])
      : setupCommands;
    const finalCleanup = options.cleanup
      ? (Array.isArray(options.cleanup) ? options.cleanup : [options.cleanup])
      : cleanupCommands;

    if (finalSetup.length > 0) {
      configObj.setup = finalSetup;
    }
    if (finalCleanup.length > 0) {
      configObj.cleanup = finalCleanup;
    }

    // Backward compatibility for legacy scaffold options
    if (options.envSource || options.installCmd || options.symlinkPath) {
      configObj.scaffold = {};
      if (options.envSource) configObj.scaffold.envSource = options.envSource;
      if (options.installCmd) configObj.scaffold.install = options.installCmd;
      if (options.symlinkPath) configObj.scaffold.symlink = options.symlinkPath;
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
// • setup: Shell commands run in workspace directory upon creating a new workspace
// • cleanup: Shell commands run in workspace directory before deleting a workspace
${JSON.stringify(configObj, null, 2)}
`;

    await writeFile(targetFilePath, content, 'utf8');
    await this.handleGitignore(targetFilePath, isLocal, isInsideGit, cwd, options);
    await this.handleExportPreset({
      configObj,
      configuredLayout,
      finalPreset,
      cwd,
      options,
    });
    this.printSuccessCard(targetFilePath, `Configuration saved successfully to ${targetFilePath}.`);
    return targetFilePath;
  }

  /**
   * Agnostic layout builder supporting custom pane-by-pane construction and standard templates
   */
  static async promptLayoutAgnostic({
    context = 'preset',
    layout = null,
    layoutTemplate = null,
    editorCmd = undefined,
    serverCmd = undefined,
    agentCmd = undefined,
    commands = null,
    finalAgent = null,
  } = {}) {
    if (layout && Array.isArray(layout)) {
      return layout;
    }

    let layoutChoice = layoutTemplate;

    if (!layoutChoice && process.stdin.isTTY) {
      console.log(`  ${ANSI.bold}Available Layout Architectures:${ANSI.reset}`);
      console.log(`  ${ANSI.cyan}• 🛠️  Custom Pane-by-Pane Builder:${ANSI.reset}  Interactively define every pane, startup command, parent, and split direction.`);
      console.log(`  ${ANSI.yellow}• 🪟 4-Pane Quadrant (2x2 Grid):${ANSI.reset}     Pane 1: Top-Left | Pane 2: Top-Right | Pane 3: Bottom-Left | Pane 4: Bottom-Right.`);
      console.log(`  ${ANSI.green}• 🧱 3-Pane Side-Stack:${ANSI.reset}              Pane 1: Left | Pane 2: Top-Right | Pane 3: Bottom-Right.`);
      console.log(`  ${ANSI.blue}• 🌗 2-Pane Side-by-Side (Vertical):${ANSI.reset}   Pane 1: Left | Pane 2: Right.`);
      console.log(`  ${ANSI.magenta}• ⬒ 2-Pane Top / Bottom (Horizontal):${ANSI.reset} Pane 1: Top | Pane 2: Bottom.\n`);

      layoutChoice = await promptSelect({
        message: 'Select terminal workspace layout architecture:',
        choices: [
          {
            label: '🛠️  Custom Pane-by-Pane Builder',
            value: 'custom',
            hint: 'Interactively define every pane, startup command, split parent, and direction',
          },
          {
            label: '🪟 4-Pane Quadrant (2x2 Grid)',
            value: '4pane',
            hint: 'Pane 1: Top-Left | Pane 2: Top-Right | Pane 3: Bottom-Left | Pane 4: Bottom-Right',
          },
          {
            label: '🧱 3-Pane Side-Stack',
            value: '3pane',
            hint: 'Pane 1: Left | Pane 2: Top-Right | Pane 3: Bottom-Right',
          },
          {
            label: '🌗 2-Pane Side-by-Side (Vertical Split)',
            value: '2pane',
            hint: 'Pane 1: Left | Pane 2: Right',
          },
          {
            label: '⬒ 2-Pane Top / Bottom (Horizontal Split)',
            value: '2pane_horizontal',
            hint: 'Pane 1: Top | Pane 2: Bottom',
          },
        ],
        defaultIndex: 0,
      });

      if (!layoutChoice) return null;
    }

    if (!layoutChoice) {
      layoutChoice = '4pane';
    }

    let configuredLayout = [];

    if (layoutChoice === 'custom') {
      console.log(`\n  ${ANSI.bold}🛠️  Custom Pane Layout Builder:${ANSI.reset}`);
      console.log(`  ${ANSI.dim}Configure each pane in order. The first pane is the root pane; subsequent panes split from an existing pane.${ANSI.reset}\n`);

      let paneCount = 4;
      if (process.stdin.isTTY) {
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
        paneCount = parseInt(paneCountInput.trim(), 10) || 4;
      }

      for (let i = 1; i <= paneCount; i++) {
        const defaultId = `pane-${i}`;
        const defaultTitle = `Pane ${i}`;

        let paneId = defaultId;
        let paneTitle = defaultTitle;
        let paneCmd = null;

        if (process.stdin.isTTY) {
          const paneIdInput = await promptText({
            message: `Pane ${i} unique identifier (id):`,
            defaultValue: defaultId,
            validate: (val) => Boolean(val.trim()) || 'Pane ID cannot be empty',
          });
          if (paneIdInput === null) return null;
          paneId = paneIdInput.trim();

          const paneTitleInput = await promptText({
            message: `Pane ${i} display title:`,
            defaultValue: paneId || defaultTitle,
          });
          if (paneTitleInput === null) return null;
          paneTitle = paneTitleInput.trim() || paneId;

          const paneCmdInput = await promptText({
            message: `Pane ${i} startup command (leave empty for clean shell):`,
            defaultValue: '',
          });
          if (paneCmdInput === null) return null;
          paneCmd = paneCmdInput.trim() || null;
        }

        const paneDef = {
          id: paneId,
          title: paneTitle,
          cmd: paneCmd,
        };

        if (i === 1) {
          paneDef.position = 'root';
        } else {
          let splitFrom = configuredLayout[configuredLayout.length - 1].id;
          let splitDir = i % 2 === 0 ? 'right' : 'down';

          if (process.stdin.isTTY) {
            const previousPanes = configuredLayout.map((p) => ({
              label: `Pane "${p.title}" (id: ${p.id})`,
              value: p.id,
            }));

            const chosenSplitFrom = await promptSelect({
              message: `Split Pane ${i} from which existing pane?`,
              choices: previousPanes,
              defaultIndex: previousPanes.length - 1,
            });
            if (!chosenSplitFrom) return null;
            splitFrom = chosenSplitFrom;

            const chosenSplitDir = await promptSelect({
              message: `Split direction from "${splitFrom}":`,
              choices: [
                { label: '➡️  Right (Vertical split - side-by-side)', value: 'right' },
                { label: '⬇️  Down (Horizontal split - stacked)', value: 'down' },
              ],
              defaultIndex: i % 2 === 0 ? 0 : 1,
            });
            if (!chosenSplitDir) return null;
            splitDir = chosenSplitDir;
          }

          paneDef.from = splitFrom;
          paneDef.split = splitDir;
        }

        if (paneCmd) {
          const firstWord = paneCmd.split(/\s+/)[0].toLowerCase();
          if (['agy', 'claude', 'aider', 'copilot', 'cursor'].includes(firstWord) ||
              ['agy', 'agent', 'ai'].includes(paneId.toLowerCase()) ||
              (finalAgent && finalAgent !== 'none' && paneCmd === finalAgent)) {
            paneDef.isAgent = true;
          }
        }

        configuredLayout.push(paneDef);
      }
    } else {
      const normalizedChoice =
        layoutChoice === 'quadrant' ? '4pane' :
        layoutChoice === 'three_pane' ? '3pane' :
        layoutChoice === 'split_vertical' ? '2pane' :
        layoutChoice === 'split_horizontal' ? '2pane_horizontal' :
        layoutChoice;

      let templatePanes = [];
      if (normalizedChoice === '4pane') {
        templatePanes = [
          { id: 'pane-1', defaultTitle: 'Pane 1', label: 'Pane 1 (Top-Left, Root)', position: 'root' },
          { id: 'pane-2', defaultTitle: 'Pane 2', label: 'Pane 2 (Top-Right)', from: 'pane-1', split: 'right' },
          { id: 'pane-3', defaultTitle: 'Pane 3', label: 'Pane 3 (Bottom-Left)', from: 'pane-1', split: 'down' },
          { id: 'pane-4', defaultTitle: 'Pane 4', label: 'Pane 4 (Bottom-Right)', from: 'pane-2', split: 'down' },
        ];
      } else if (normalizedChoice === '3pane') {
        templatePanes = [
          { id: 'pane-1', defaultTitle: 'Pane 1', label: 'Pane 1 (Left, Root)', position: 'root' },
          { id: 'pane-2', defaultTitle: 'Pane 2', label: 'Pane 2 (Top-Right)', from: 'pane-1', split: 'right' },
          { id: 'pane-3', defaultTitle: 'Pane 3', label: 'Pane 3 (Bottom-Right)', from: 'pane-2', split: 'down' },
        ];
      } else if (normalizedChoice === '2pane_horizontal') {
        templatePanes = [
          { id: 'pane-1', defaultTitle: 'Pane 1', label: 'Pane 1 (Top, Root)', position: 'root' },
          { id: 'pane-2', defaultTitle: 'Pane 2', label: 'Pane 2 (Bottom)', from: 'pane-1', split: 'down' },
        ];
      } else {
        // 2pane
        templatePanes = [
          { id: 'pane-1', defaultTitle: 'Pane 1', label: 'Pane 1 (Left, Root)', position: 'root' },
          { id: 'pane-2', defaultTitle: 'Pane 2', label: 'Pane 2 (Right)', from: 'pane-1', split: 'right' },
        ];
      }

      console.log(`\n  ${ANSI.bold}Configure Pane Commands:${ANSI.reset}`);
      console.log(`  ${ANSI.dim}Enter a command for each pane, or press Enter for a clean interactive shell.${ANSI.reset}\n`);

      for (let i = 0; i < templatePanes.length; i++) {
        const tp = templatePanes[i];
        let defaultCmd = '';

        if (Array.isArray(commands) && commands[i] !== undefined) {
          defaultCmd = commands[i] || '';
        } else if (i === 0 && editorCmd !== undefined) {
          defaultCmd = editorCmd || '';
        } else if (i === 1 && serverCmd !== undefined) {
          defaultCmd = serverCmd || '';
        } else if (i === templatePanes.length - 1 && agentCmd !== undefined) {
          defaultCmd = agentCmd || '';
        } else if (context === 'guided') {
          if (i === 0 && editorCmd === undefined) defaultCmd = 'vim .';
          else if (i === templatePanes.length - 1 && finalAgent && finalAgent !== 'none') defaultCmd = finalAgent;
        }

        let cmd = defaultCmd;
        if (process.stdin.isTTY) {
          const input = await promptText({
            message: `${tp.label} command (or Enter for clean shell):`,
            defaultValue: defaultCmd,
          });
          if (input === null) return null;
          cmd = input.trim();
        }

        const paneCmd = cmd || null;
        const firstWord = paneCmd ? paneCmd.split(/\s+/)[0].replace(/[^a-zA-Z0-9_-]/g, '') : '';
        const paneTitle = firstWord || tp.defaultTitle;

        const paneDef = {
          id: tp.id,
          title: paneTitle,
          cmd: paneCmd,
        };
        if (tp.position) paneDef.position = tp.position;
        if (tp.from) paneDef.from = tp.from;
        if (tp.split) paneDef.split = tp.split;

        if (paneCmd) {
          const cmdLower = paneCmd.split(/\s+/)[0].toLowerCase();
          if (['agy', 'claude', 'aider', 'copilot', 'cursor'].includes(cmdLower) ||
              (finalAgent && finalAgent !== 'none' && paneCmd === finalAgent)) {
            paneDef.isAgent = true;
          }
        }

        configuredLayout.push(paneDef);
      }
    }

    // Default pane focus selection
    if (configuredLayout.length > 0) {
      let selectedFocusId = null;

      if (process.stdin.isTTY) {
        const focusChoices = configuredLayout.map((p) => {
          const desc = p.isAgent
            ? 'AI Agent'
            : (p.cmd ? `command: "${p.cmd}"` : 'clean shell');
          return {
            label: `Pane "${p.title}" (id: ${p.id}) — [${desc}]`,
            value: p.id,
            hint: `Focus pane "${p.title}" upon workspace boot`,
          };
        });

        const agentIdx = configuredLayout.findIndex((p) => p.isAgent);
        const defaultIdx = agentIdx >= 0 ? agentIdx : 0;

        selectedFocusId = await promptSelect({
          message: 'Default pane to focus upon creation (defaultFocus):',
          choices: focusChoices,
          defaultIndex: defaultIdx,
        });
        if (!selectedFocusId) return null;
      }

      if (!selectedFocusId) {
        const agentPane = configuredLayout.find((p) => p.isAgent);
        selectedFocusId = agentPane ? agentPane.id : configuredLayout[0].id;
      }

      for (const p of configuredLayout) {
        if (p.id === selectedFocusId) {
          p.focus = true;
        } else {
          delete p.focus;
        }
      }
    }

    return configuredLayout;
  }

  static async runCreatePresetWizard(cwd, options = {}) {
    console.log(`\n${ANSI.bold}${ANSI.brightCyan}── ✨ Create Reusable Preset ──${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Presets bundle terminal layout, pane startup commands, and workspace focus settings.${ANSI.reset}\n`);

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

    const setupCommands = Array.isArray(options.setup ?? options.setupCommands)
      ? (options.setup ?? options.setupCommands)
      : (options.setup ? [options.setup] : []);
    const cleanupCommands = Array.isArray(options.cleanup ?? options.cleanupCommands)
      ? (options.cleanup ?? options.cleanupCommands)
      : (options.cleanup ? [options.cleanup] : []);

    // 4. Layout Architecture & Agnostic Pane Definition
    let layout = options.layout;
    if (!layout) {
      layout = await this.promptLayoutAgnostic({
        context: 'preset',
        layoutTemplate: options.layoutTemplate,
        editorCmd: options.editorCmd,
        serverCmd: options.serverCmd,
        agentCmd: options.agentCmd,
        commands: options.commands,
      });
      if (!layout) return null;
    }

    const focusedPane = layout.find((p) => p.focus) || layout[0];
    const defaultFocusId = focusedPane ? focusedPane.id : 'pane-1';
    const agentPane = layout.find((p) => p.isAgent);
    const agentCmd = agentPane && agentPane.cmd ? agentPane.cmd.split(/\s+/)[0] : 'agy';

    // 5. Write Preset File
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
    defaultFocus: '${defaultFocusId}',
    agent: '${agentCmd}',
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

    const setupArr = Array.isArray(configObj.setup) ? [...configObj.setup] : [];
    if (setupArr.length === 0 && (envSource || installCmd)) {
      if (envSource) setupArr.push(`cp ${envSource} .env`);
      if (installCmd) setupArr.push(installCmd);
    }
    const cleanupArr = Array.isArray(configObj.cleanup) ? [...configObj.cleanup] : [];

    const presetModuleCode = `module.exports = {
  name: '${exportName}',
  icon: '${exportIcon}',

  repo: ${JSON.stringify(configObj.repo, null, 2)},

  workspace: ${JSON.stringify(configObj.workspace, null, 2)},

  setup: ${JSON.stringify(setupArr, null, 2)},

  cleanup: ${JSON.stringify(cleanupArr, null, 2)},

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
