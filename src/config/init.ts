import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { ANSI, drawBox } from '../tui/ansi.js';
import { promptConfirm, promptMultiSelect, promptSelect, promptText } from '../tui/prompt.js';

export interface InitWizardOptions {
  quick?: boolean;
  local?: boolean;
  global?: boolean;
  targetPath?: string;
  cwd?: string;
  force?: boolean;
}

export class ConfigInitWizard {
  public static async run(options: InitWizardOptions = {}): Promise<string | null> {
    const cwd = options.cwd || process.cwd();

    console.log(`\n${ANSI.bold}${ANSI.brightCyan}=== 🚀 Arise Configuration Setup Wizard ===${ANSI.reset}`);
    console.log(`  ${ANSI.dim}Configure Git worktree topology, project presets, Herdr terminal layout, and AI agents.${ANSI.reset}\n`);

    let isQuick = options.quick ?? false;
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

    let isLocal = options.local ?? false;
    if (!options.local && !options.global) {
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

    if (isQuick) {
      return this.runQuickInit(cwd, isLocal, options);
    }

    return this.runGuidedInit(cwd, isLocal, options);
  }

  private static async runQuickInit(cwd: string, isLocal: boolean, options: InitWizardOptions = {}): Promise<string | null> {
    const targetFilePath = options.targetPath || (isLocal
      ? join(cwd, '.ariserc.json')
      : join(homedir(), '.config', 'arise', '.ariserc.json'));

    if (existsSync(targetFilePath) && !options.force) {
      console.log(`  ${ANSI.yellow}Existing file found at ${targetFilePath}${ANSI.reset}\n`);
      const overwrite = await promptConfirm({
        message: `Config already exists at ${targetFilePath}. Overwrite?`,
        defaultYes: false,
      });
      if (!overwrite) {
        console.log(`  ${ANSI.yellow}Existing configuration preserved.${ANSI.reset}\n`);
        return targetFilePath;
      }
    }

    await mkdir(dirname(targetFilePath), { recursive: true });

    const configObj = {
      preset: 'node',
      repo: {
        defaultBaseBranch: 'main',
        protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
      },
      workspace: {
        agent: 'agy',
        defaultFocus: 'agy',
        labelPrefix: '',
      },
      scaffold: {
        envSource: '.env',
        install: 'npm install',
      },
    };

    const content = `// Arise Configuration (.ariserc.json)
// Documentation: https://github.com/tsuzuku/arise
//
// SETTINGS REFERENCE:
// • preset: Project preset ('node' | 'laravel' | 'generic' | custom)
// • repo.defaultBaseBranch: Default branch to branch off when creating worktrees
// • repo.protectedBranches: Branches protected from deletion during --nuke
// • workspace.agent: CLI AI agent ('agy' | 'claude' | 'aider' | 'copilot' | 'none')
// • workspace.defaultFocus: Pane to focus on workspace boot ('agy' | 'vim' | 'server' | 'shell')
// • workspace.labelPrefix: Prefix added to Herdr workspace labels (e.g. '[BE] ')
// • layout: Declarative terminal layout definitions (id, title, cmd, position, from, split, focus, isAgent)
// • scaffold.envSource: Relative or absolute path to .env template to copy
// • scaffold.install: Command to run to install dependencies upon creation
${JSON.stringify(configObj, null, 2)}
`;
    await writeFile(targetFilePath, content, 'utf8');
    this.printSuccessCard(targetFilePath, 'Configuration created with recommended defaults.');
    return targetFilePath;
  }

  private static async runGuidedInit(cwd: string, isLocal: boolean, options: InitWizardOptions = {}): Promise<string | null> {
    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 1: Project Preset & Framework Selection (preset) ──${ANSI.reset}`);
    const presetChoice = await promptSelect({
      message: 'Choose project preset:',
      choices: [
        { label: '✨ Node.js (node)', value: 'node', hint: 'npm/pnpm/yarn lifecycle, .env scaffolding, dev server pane' },
        { label: '🐘 Laravel / PHP (laravel)', value: 'laravel', hint: 'composer lifecycle, storage permissions, log tail pane' },
        { label: '📦 Generic (generic)', value: 'generic', hint: 'Universal 4-pane terminal quadrant layout' },
      ],
    });
    if (!presetChoice) return null;

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 2: Git Topology & Branch Configuration (repo) ──${ANSI.reset}`);
    const baseBranchInput = await promptText({
      message: 'Default base branch to branch off (defaultBaseBranch):',
      defaultValue: 'main',
    });
    if (baseBranchInput === null) return null;

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 3: AI CLI Agent & Herdr Workspace (workspace) ──${ANSI.reset}`);
    const agentChoice = await promptSelect({
      message: 'Select AI CLI agent for workspace quadrant:',
      choices: [
        { label: '✨ Antigravity / AGY CLI (Recommended)', value: 'agy', hint: 'Deepmind agentic pair programmer' },
        { label: '🤖 Claude Code (claude)', value: 'claude', hint: 'Anthropic Claude Code CLI' },
        { label: '⚡ Aider (aider)', value: 'aider', hint: 'AI pair programming in terminal' },
        { label: '🚫 None / Disabled', value: 'none', hint: 'Standard bash/zsh shell pane' },
      ],
    });
    if (!agentChoice) return null;

    console.log(`\n${ANSI.bold}${ANSI.cyan}── Step 4: Terminal Layout & Workspace Panes (layout) ──${ANSI.reset}`);
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

    let configuredLayout: any[] = [];

    if (layoutStyleChoice === 'custom') {
      const paneCountInput = await promptText({
        message: 'How many panes would you like to configure in this workspace? (1-6):',
        defaultValue: '4',
        validate: (val) => {
          const num = parseInt(val.trim(), 10);
          if (isNaN(num) || num < 1 || num > 6) return 'Please enter a number between 1 and 6';
          return true;
        },
      });
      const paneCount = parseInt(paneCountInput?.trim() || '4', 10) || 4;

      for (let i = 1; i <= paneCount; i++) {
        const defaultId = i === 1 ? 'vim' : (i === 2 ? 'server' : (i === 3 ? 'shell' : (i === 4 ? 'test' : (i === 5 ? 'logs' : 'agy'))));
        const defaultTitle = i === 1 ? 'editor' : (i === 2 ? 'dev server' : (i === 3 ? 'shell' : (i === 4 ? 'test runner' : (i === 5 ? 'logs' : 'ai agent'))));

        const paneIdInput = await promptText({
          message: `Pane ${i} unique identifier (id):`,
          defaultValue: defaultId,
          validate: (val) => Boolean(val.trim()) || 'Pane ID cannot be empty',
        });
        const paneId = paneIdInput?.trim() || defaultId;

        const paneTitleInput = await promptText({
          message: `Pane ${i} display title:`,
          defaultValue: defaultTitle,
        });
        const paneTitle = paneTitleInput?.trim() || paneId;

        const defaultCmd = i === 1 ? 'vim .' : (i === 2 && presetChoice === 'node' ? 'npm run dev' : (i === paneCount && agentChoice !== 'none' ? agentChoice : ''));
        const paneCmdInput = await promptText({
          message: `Pane ${i} startup command (leave empty for clean shell):`,
          defaultValue: defaultCmd,
        });
        const paneCmd = paneCmdInput?.trim() || null;

        const paneDef: any = {
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
          paneDef.from = splitFrom || configuredLayout[0]!.id;

          const splitDir = await promptSelect({
            message: `Split direction from "${paneDef.from}":`,
            choices: [
              { label: '➡️  Right (Vertical split - side-by-side)', value: 'right' },
              { label: '⬇️  Down (Horizontal split - stacked)', value: 'down' },
            ],
            defaultIndex: i % 2 === 0 ? 0 : 1,
          });
          paneDef.split = splitDir || 'right';
        }

        const isAgent = await promptConfirm({
          message: `Designate Pane "${paneTitle}" as the AI CLI Agent pane?`,
          defaultYes: paneId === 'agy' || paneId === 'agent' || (i === paneCount && agentChoice !== 'none'),
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
      const editorCmdInput = await promptText({
        message: 'Editor startup command (Top-Left / Main pane):',
        defaultValue: 'vim .',
      });
      const editorCmd = editorCmdInput?.trim() || null;

      const agentCmd = agentChoice === 'none' ? null : agentChoice;
      const agentTitle = agentChoice === 'none' ? 'shell' : agentChoice;

      if (layoutStyleChoice === 'quadrant') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: presetChoice === 'laravel' ? 'logs' : 'server', cmd: presetChoice === 'node' ? 'npm run dev' : null, split: 'right', from: 'vim' },
          { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', focus: true, isAgent: true },
        ];
      } else if (layoutStyleChoice === 'three_pane') {
        configuredLayout = [
          { id: 'vim', title: 'vim', cmd: editorCmd, position: 'root' },
          { id: 'server', title: presetChoice === 'laravel' ? 'logs' : 'server', cmd: presetChoice === 'node' ? 'npm run dev' : null, split: 'right', from: 'vim' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'server', focus: true, isAgent: true },
        ];
      } else if (layoutStyleChoice === 'split_vertical') {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'right', from: 'vim', focus: true, isAgent: true },
        ];
      } else {
        configuredLayout = [
          { id: 'vim', title: 'editor', cmd: editorCmd, position: 'root' },
          { id: 'agy', title: agentTitle, cmd: agentCmd, split: 'down', from: 'vim', focus: true, isAgent: true },
        ];
      }
    }

    const targetFilePath = options.targetPath || (isLocal
      ? join(cwd, '.ariserc.json')
      : join(homedir(), '.config', 'arise', '.ariserc.json'));

    await mkdir(dirname(targetFilePath), { recursive: true });

    const configObj = {
      $schema: './arise.schema.json',
      preset: presetChoice,
      repo: {
        defaultBaseBranch: baseBranchInput.trim() || 'main',
        protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
      },
      workspace: {
        agent: agentChoice,
        defaultFocus: 'agy',
        labelPrefix: '',
      },
      layout: configuredLayout,
    };

    const content = `// Arise Configuration
${JSON.stringify(configObj, null, 2)}
`;
    await writeFile(targetFilePath, content, 'utf8');
    this.printSuccessCard(targetFilePath, 'Configuration saved successfully.');
    return targetFilePath;
  }

  private static printSuccessCard(filePath: string, message: string): void {
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
