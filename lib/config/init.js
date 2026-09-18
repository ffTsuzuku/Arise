const fs = require('fs');
const path = require('path');
const os = require('os');
const { writeFile } = require('fs/promises');
const { getContext, setContext, shortPath } = require('../tui/theme');
const { clearScreen, isInteractive, promptSelect, promptText, promptConfirm, p } = require('../tui/prompt');
const { listPresets } = require('../../presets');
const git = require('../git');
const {
  ConfigurationDraft, clone, commands, projectDirectory, resolvePreset,
  validateLayout, presetNameError, writeDraft,
} = require('./draft');
const { makeLayout, editLayout } = require('./layout-editor');

function screen(title) {
  clearScreen();
  p.intro(title);
}

function paneDescription(layout) {
  return layout.map((pane) => `${pane.title}: ${pane.cmd || 'shell'}`).join(' · ');
}

function inherited(data, key) {
  return Object.hasOwn(data, key) ? 'custom' : 'from preset';
}

async function editCommands(initial, title) {
  const draft = commands(initial);
  while (true) {
    screen(title);
    const action = await promptSelect({
      message: 'Each entry is one complete shell command. Quotes and commas are kept intact.',
      choices: [
        ...draft.map((command, index) => ({ label: command, value: index, group: 'Commands', hint: 'Edit this command. Clear the field to remove it.' })),
        { label: 'Add command', value: 'add', group: 'Edit', hint: 'Commands run in the order shown.' },
        { label: 'Clear all commands', value: 'clear', group: 'Edit', hint: 'Disable these lifecycle commands for this configuration.' },
        { label: 'Apply commands', value: 'apply', group: 'Finish', shortcut: 's' },
        { label: 'Cancel changes', value: 'cancel', group: 'Finish', subtle: true },
      ],
    });
    if (action === null || action === 'cancel') return null;
    if (action === 'apply') return draft;
    if (action === 'clear') { draft.length = 0; continue; }
    const value = await promptText({ message: 'Shell command', initialValue: action === 'add' ? '' : draft[action],
      hint: 'Keep the entire command on one line. Escape returns without changing it.' });
    if (value === null) continue;
    if (action === 'add') { if (value.trim()) draft.push(value.trim()); }
    else if (value.trim()) draft[action] = value.trim();
    else draft.splice(action, 1);
  }
}

async function selectPreset(draft) {
  while (true) {
    screen('Configure / Choose a preset');
    const found = listPresets(draft.searchDirs).filter((item) => !['default', 'generic'].includes(item.name));
    const choices = found.map((item) => ({
      label: `${item.name}  ·  ${item.preset.layout?.length || 0} panes`, value: item.name,
      hint: `${shortPath(item.preset.sourcePath || '')} · ${paneDescription(item.preset.layout || [])}`, group: 'Your presets',
    }));
    choices.push(
      { label: 'Default', value: 'default', group: 'Starting point', hint: 'Use Arise’s default layout. You can edit individual settings later.' },
      { label: 'Load a preset by name or path', value: '__custom__', group: 'Starting point', hint: 'Use a local module or an installed preset package.' },
      { label: 'Create a reusable preset', value: '__create__', group: 'Starting point', hint: 'Open the separate preset builder, then use the preset you save.' },
    );
    if (draft.preset && !choices.some((choice) => choice.value === draft.reference)) {
      choices.unshift({ label: draft.reference, value: draft.reference, group: 'Current preset', hint: paneDescription(draft.preset.layout || []) });
    }
    let reference = await promptSelect({ message: 'The preset supplies the layout, agent, focus, and lifecycle commands.', choices,
      defaultIndex: Math.max(0, choices.findIndex((choice) => choice.value === draft.reference)) });
    if (reference === null) return false;
    if (reference === '__custom__') {
      reference = await promptText({ message: 'Preset name or file path', initialValue: '',
        validate: (value) => Boolean(resolvePreset(value.trim(), path.dirname(draft.target), draft.searchDirs)) || 'This preset could not be loaded.' });
      if (reference === null) continue;
      reference = reference.trim();
    } else if (reference === '__create__') {
      const created = await ConfigInitWizard.runCreatePresetWizard(draft.projectDir);
      if (!created) continue;
      const relative = path.relative(path.dirname(draft.target), created);
      reference = relative.startsWith('..') ? created : `./${relative.split(path.sep).join('/')}`;
    }
    let reset = false;
    if (reference !== draft.reference && draft.hasPresetOverrides()) {
      const mode = await promptSelect({ message: 'This configuration has its own layout, agent, focus, or lifecycle settings.', section: 'Switch preset', choices: [
        { label: 'Use the selected preset’s settings', value: 'inherit', hint: 'Remove those overrides. Keep your prefix, multiplexer, plugins, and Git settings.' },
        { label: 'Keep my existing overrides', value: 'keep', hint: 'Use the new preset only for settings you have not overridden.' },
        { label: 'Back to presets', value: 'back', subtle: true },
      ] });
      if (!mode || mode === 'back') continue;
      reset = mode === 'inherit';
    }
    draft.usePreset(reference, reset);
    return true;
  }
}

async function editLayoutSetting(draft) {
  const mode = await promptSelect({ message: 'Layout', section: 'Layout', choices: [
    { label: 'Edit the current panes', value: 'edit', hint: 'Start with the layout you already have. This creates a repository override.' },
    { label: 'Use the preset layout', value: 'inherit', hint: 'Remove the layout and focus overrides; keep following the preset.' },
    { label: 'Back', value: 'back', subtle: true },
  ] });
  if (mode === 'inherit') {
    delete draft.data.layout;
    draft.setWorkspace('defaultFocus', undefined);
  } else if (mode === 'edit') {
    const effective = draft.effective();
    const initial = effective.layout.map((pane) => ({ ...pane, focus: pane.id === effective.workspace.defaultFocus }));
    const layout = await editLayout(initial);
    if (layout) {
      draft.data.layout = layout;
      draft.setWorkspace('defaultFocus', layout.find((pane) => pane.focus)?.id || layout[0].id);
      // Pane commands now belong to this explicit layout, not a stale preset agent override.
      draft.setWorkspace('agent', undefined);
    }
  }
}

async function editAgent(draft) {
  screen('Configure / Agent');
  const choices = [
    { label: 'Use the layout’s commands', value: '__inherit__', hint: 'Remove the repository’s agent override.' },
    ...['codex', 'claude', 'agy', 'aider', 'copilot'].map((cmd) => ({ label: cmd, value: cmd, hint: `Run ${cmd} in panes marked as agent panes.` })),
    { label: 'Custom command', value: '__custom__', hint: 'Enter the complete command, including arguments.' },
    { label: 'No agent — empty shell', value: 'none', hint: 'Open agent panes as empty shells.' },
  ];
  let value = await promptSelect({ choices, section: 'Agent', defaultIndex: Math.max(0, choices.findIndex((choice) => choice.value === draft.data.workspace?.agent)) });
  if (value === null) return;
  if (value === '__inherit__') return draft.setWorkspace('agent', undefined);
  if (value === '__custom__') {
    const current = draft.effective().workspace.agent;
    value = await promptText({ message: 'Agent command', initialValue: typeof current === 'string' ? current : current?.cmd || '',
      validate: (value) => Boolean(value.trim()) || 'Enter an agent command.' });
    if (value === null) return;
  }
  draft.setWorkspace('agent', value.trim());
}

async function editLifecycle(draft, key) {
  const mode = await promptSelect({ message: key === 'setup' ? 'Workspace setup commands' : 'Workspace cleanup commands', choices: [
    { label: 'Edit commands', value: 'edit', hint: 'Change, add, or remove complete shell commands.' },
    { label: 'Use preset commands', value: 'inherit', hint: 'Remove the repository override.' },
    { label: 'Back', value: 'back', subtle: true },
  ] });
  if (mode === 'inherit') delete draft.data[key];
  else if (mode === 'edit') {
    const result = await editCommands(draft.effective()[key], `Configure / ${key === 'setup' ? 'Setup' : 'Cleanup'} commands`);
    if (result !== null) draft.data[key] = result;
  }
}

async function editGit(draft) {
  while (true) {
    screen('Configure / Git defaults');
    const repo = draft.effective().repo;
    const key = await promptSelect({ choices: [
      { label: `Base branch: ${repo.defaultBaseBranch}`, value: 'defaultBaseBranch', hint: 'Used when creating a new branch.' },
      { label: `Worktree directory: ${repo.worktreesBase || 'Automatic'}`, value: 'worktreesBase', hint: 'Leave empty for Arise’s default location.' },
      { label: `Protected branches: ${repo.protectedBranches.join(', ')}`, value: 'protectedBranches', hint: 'Branches protected from cleanup. Separate names with commas.' },
      { label: 'Use preset Git defaults', value: 'inherit', hint: 'Remove branch and directory overrides. Keep bare-repository topology.' },
      { label: 'Back to configuration', value: 'back', subtle: true },
    ] });
    if (!key || key === 'back') return;
    if (key === 'inherit') {
      if (draft.data.repo) for (const key of ['defaultBaseBranch', 'worktreesBase', 'protectedBranches']) delete draft.data.repo[key];
      continue;
    }
    const initial = key === 'protectedBranches' ? repo[key].join(', ') : draft.data.repo?.[key] ?? repo[key] ?? '';
    const value = await promptText({ message: key === 'protectedBranches' ? 'Protected branch names' : key === 'defaultBaseBranch' ? 'Default base branch' : 'Worktree directory',
      initialValue: initial, validate: (value) => key !== 'defaultBaseBranch' || Boolean(value.trim()) || 'Enter a branch name.' });
    if (value !== null) {
      draft.data.repo ||= {};
      draft.data.repo[key] = key === 'protectedBranches' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value.trim() || null;
    }
  }
}

async function reviewConfiguration(draft) {
  let selectedIndex = 0;
  while (true) {
    screen(draft.global ? 'Configure / Global defaults' : 'Configure / Repository');
    const effective = draft.effective();
    setContext({ cwd: draft.projectDir, multiplexer: effective.multiplexer, preset: draft.reference });
    const error = draft.validationError();
    const focus = effective.layout.find((pane) => pane.id === effective.workspace.defaultFocus);
    const agentPanes = effective.layout.filter((pane) => pane.isAgent ?? ['agy', 'agent', 'ai'].includes(pane.id));
    const choices = [
      { label: 'Save configuration', value: 'save', group: 'Review', shortcut: 's', hint: error || `Save to ${shortPath(draft.target)}. Inherited settings stay linked to the preset.` },
      { label: `Preset: ${draft.reference}${draft.preset ? '' : ' (unavailable)'}`, value: 'preset', group: 'Workspace', hint: paneDescription(effective.layout) },
      { label: `Prefix: ${effective.workspace.labelPrefix ? JSON.stringify(effective.workspace.labelPrefix) : 'None'}`, value: 'prefix', group: 'Workspace', hint: 'Only changes session names. It does not change the layout or commands.' },
      { label: `Multiplexer: ${effective.multiplexer}`, value: 'mux', group: 'Workspace', hint: 'Choose automatic detection, tmux, or Herdr.' },
      { label: `Layout: ${effective.layout.length} panes · ${inherited(draft.data, 'layout')}`, value: 'layout', group: 'Optional overrides', hint: paneDescription(effective.layout) },
      ...(agentPanes.length ? [{ label: `Agent: ${typeof effective.workspace.agent === 'object' ? effective.workspace.agent?.cmd || 'None' : effective.workspace.agent || 'None'} · ${Object.hasOwn(draft.data.workspace || {}, 'agent') ? 'custom' : draft.data.layout ? 'from layout' : 'from preset'}`,
        value: 'agent', group: 'Optional overrides', hint: 'Change commands only in panes marked for an agent.' }] : []),
      { label: `Focus: ${focus?.title || 'First pane'} · ${Object.hasOwn(draft.data.workspace || {}, 'defaultFocus') ? 'custom' : draft.data.layout ? 'from layout' : 'from preset'}`, value: 'focus', group: 'Optional overrides', hint: 'Choose the pane that receives keyboard focus.' },
      { label: `Setup: ${effective.setup.length} commands · ${inherited(draft.data, 'setup')}`, value: 'setup', group: 'Optional overrides', hint: effective.setup.join(' → ') || 'No workspace setup commands.' },
      { label: `Cleanup: ${effective.cleanup.length} commands · ${inherited(draft.data, 'cleanup')}`, value: 'cleanup', group: 'Optional overrides', hint: effective.cleanup.join(' → ') || 'No workspace cleanup commands.' },
      ...(git.isGitRepo(draft.projectDir) || draft.data.repo ? [{ label: 'Git defaults', value: 'git', group: 'Repository', hint: `Base branch ${effective.repo.defaultBaseBranch}. Edit worktree location and protected branches.` }] : []),
      ...(!draft.global ? [{ label: `Add config to .gitignore: ${draft.gitignore ? 'Yes' : 'No'}`, value: 'gitignore', group: 'Repository', hint: 'Applied when you save. Existing ignore rules are preserved.' }] : []),
      { label: 'Cancel without saving', value: 'cancel', group: 'Finish', subtle: true, shortcut: 'q', hint: 'Discard this configuration draft.' },
    ];
    const action = await promptSelect({ message: error || `Review settings · ${shortPath(draft.target)}`, choices, defaultIndex: selectedIndex });
    selectedIndex = Math.max(0, choices.findIndex((choice) => choice.value === action));
    if (action === null || action === 'cancel') return false;
    if (action === 'save') { if (!error) return true; continue; }
    if (action === 'preset') await selectPreset(draft);
    else if (action === 'prefix') {
      const value = await promptText({ message: 'Workspace name prefix', initialValue: effective.workspace.labelPrefix,
        hint: 'For example: [API] followed by a space. Clear this field for no prefix.' });
      if (value !== null) draft.setWorkspace('labelPrefix', value);
    } else if (action === 'mux') {
      const value = await promptSelect({ message: 'Terminal multiplexer', choices: ['auto', 'tmux', 'herdr'],
        defaultIndex: Math.max(0, ['auto', 'tmux', 'herdr'].indexOf(effective.multiplexer)) });
      if (value !== null) draft.data.multiplexer = value;
    } else if (action === 'layout') await editLayoutSetting(draft);
    else if (action === 'agent') await editAgent(draft);
    else if (action === 'focus') {
      const value = await promptSelect({ message: 'Focus which pane?', choices: [
        { label: draft.data.layout ? 'Use layout focus' : 'Use preset focus', value: '__inherit__' }, ...effective.layout.map((pane) => ({ label: pane.title, value: pane.id, hint: pane.cmd || 'Empty shell' })),
      ] });
      if (value !== null) draft.setWorkspace('defaultFocus', value === '__inherit__' ? undefined : value);
    } else if (action === 'setup' || action === 'cleanup') await editLifecycle(draft, action);
    else if (action === 'git') await editGit(draft);
    else if (action === 'gitignore') draft.gitignore = !draft.gitignore;
  }
}

function presetContent(data) {
  return `// Arise reusable preset\nmodule.exports = ${JSON.stringify(data, (key, value) => {
    if (typeof value === 'function') throw new Error('Presets with JavaScript hooks must be authored as modules; the builder only writes declarative settings.');
    return value;
  }, 2)};\n`;
}

class ConfigInitWizard {
  static async run(options = {}) {
    const cwd = options.cwd || process.cwd();
    if (options.presetOnly || options.initTarget === 'preset') return this.runCreatePresetWizard(cwd, options);
    const previousContext = getContext();
    try {
      const draft = new ConfigurationDraft(options);
      if (options.layoutTemplate && !options.layout) draft.data.layout = makeLayout(options.layoutTemplate, options);
      const interactive = isInteractive() && !options.quick;
      if (interactive) {
        setContext({ cwd: draft.projectDir });
        if (draft.original === null && !options.presetName && !await selectPreset(draft)) return null;
        if (!await reviewConfiguration(draft)) return null;
      } else if (draft.original !== null && !options.force) {
        if (!isInteractive() || !await promptConfirm({ message: `Save changes to ${shortPath(draft.target)}?`, defaultYes: false })) {
          p.log.info('Existing configuration preserved.');
          return draft.target;
        }
      }
      const target = await draft.save();
      await this.handleGitignore(target, !draft.global, git.isGitRepo(draft.projectDir), draft.projectDir, { gitignore: draft.gitignore });
      this.printSuccessCard(target, 'Configuration saved.');
      return target;
    } finally {
      setContext(previousContext);
    }
  }

  // Keep programmatic entry points while both modes use the same draft model.
  static runQuickInit(cwd, isLocal, isInsideGit, options = {}) {
    return this.run({ ...options, cwd, local: isLocal, global: !isLocal, quick: true });
  }

  static runGuidedInit(cwd, isLocal, isInsideGit, options = {}) {
    return this.run({ ...options, cwd, local: isLocal, global: !isLocal, quick: false });
  }

  static async promptLayoutAgnostic(options = {}) {
    if (options.layout) return clone(options.layout);
    const initial = options.layoutTemplate ? makeLayout(options.layoutTemplate, options) : [];
    return editLayout(initial, options);
  }

  static async runCreatePresetWizard(cwd, options = {}) {
    const previousContext = getContext();
    try {
      setContext({ cwd });
      const interactive = isInteractive() && !options.quick;
      screen('Create preset');
      let name = options.presetName;
      if (!name && interactive) name = await promptText({ message: 'Preset name', initialValue: '',
        hint: 'A reusable name such as web-app or backend.', validate: (value) => presetNameError(value.trim()) ||
          (['default', 'generic'].includes(value.trim()) ? 'That name is reserved.' : true) });
      if (name === null) return null;
      name ||= path.basename(cwd).toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'custom';
      name = name.trim();
      if (presetNameError(name) || ['default', 'generic'].includes(name)) throw new Error(presetNameError(name) || 'Choose a name other than default or generic.');
      let scope = options.exportScope || (options.global ? 'global' : 'local');
      let layout = options.layout ? clone(options.layout) : options.layoutTemplate || !interactive ? makeLayout(options.layoutTemplate || '4pane', options) : await editLayout([]);
      if (!layout) return null;
      const data = {
        name, icon: options.icon || options.emoji || 'terminal',
        ...(options.repo ? { repo: clone(options.repo) } : {}),
        workspace: clone(options.workspace || {}),
        layout,
        setup: commands(options.setup ?? options.setupCommands),
        cleanup: commands(options.cleanup ?? options.cleanupCommands),
      };
      const targetFor = () => path.join(scope === 'global' ? path.join(os.homedir(), '.config', 'arise', 'presets') : path.join(projectDirectory(cwd), '.arise', 'presets'), `${data.name}.js`);
      while (true) {
        const target = targetFor();
        const error = validateLayout(data.layout);
        if (interactive) {
          screen('Create preset / Review');
          const action = await promptSelect({ message: error || shortPath(target), choices: [
            { label: 'Save preset', value: 'save', group: 'Review', shortcut: 's', hint: 'Create the reusable preset at the path shown above.' },
            { label: `Name: ${data.name}`, value: 'name', group: 'Preset' },
            { label: `Storage: ${scope === 'local' ? 'This repository' : 'Global'}`, value: 'scope', group: 'Preset', hint: 'Local presets can be committed; global presets are available across projects.' },
            { label: `Layout: ${data.layout.length} panes`, value: 'layout', group: 'Preset', hint: paneDescription(data.layout) },
            { label: `Setup: ${data.setup.length} commands`, value: 'setup', group: 'Lifecycle' },
            { label: `Cleanup: ${data.cleanup.length} commands`, value: 'cleanup', group: 'Lifecycle' },
            { label: 'Cancel without saving', value: 'cancel', group: 'Finish', subtle: true, shortcut: 'q' },
          ] });
          if (!action || action === 'cancel') return null;
          if (action === 'name') {
            const value = await promptText({ message: 'Preset name', initialValue: data.name,
              validate: (value) => presetNameError(value.trim()) || (['default', 'generic'].includes(value.trim()) ? 'That name is reserved.' : true) });
            if (value !== null) data.name = value.trim();
            continue;
          }
          if (action === 'scope') {
            const value = await promptSelect({ message: 'Where should this preset live?', choices: [
              { label: 'This repository', value: 'local', hint: '.arise/presets/' },
              { label: 'Global', value: 'global', hint: '~/.config/arise/presets/' },
            ], defaultIndex: scope === 'global' ? 1 : 0 });
            if (value !== null) scope = value;
            continue;
          }
          if (action === 'layout') {
            const value = await editLayout(data.layout);
            if (value) data.layout = value;
            continue;
          }
          if (action === 'setup' || action === 'cleanup') {
            const value = await editCommands(data[action], `Create preset / ${action}`);
            if (value !== null) data[action] = value;
            continue;
          }
        }
        if (error) { if (interactive) continue; throw new Error(error); }
        const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (original !== null && !options.force) {
          if (!interactive) { p.log.info('Existing preset preserved.'); return null; }
          if (!await promptConfirm({ message: `Replace the existing preset at ${shortPath(target)}?`, defaultYes: false, danger: true })) continue;
        }
        const focus = data.layout.find((pane) => pane.focus) || data.layout[0];
        data.workspace.defaultFocus = focus.id;
        // Pane commands and titles are the source of truth in a generated preset.
        delete data.workspace.agent;
        await writeDraft(target, presetContent(data), original);
        delete require.cache[require.resolve(target)];
        screen('Preset saved');
        p.log.success(`Preset "${data.name}" saved.`);
        p.note(target);
        return target;
      }
    } finally {
      setContext(previousContext);
    }
  }

  static async handleExportPreset({ configObj = {}, configuredLayout, finalPreset, installCmd, cwd, options = {} }) {
    if (!options.exportPreset) return null;
    return this.runCreatePresetWizard(cwd, {
      ...options, quick: !isInteractive(),
      presetName: options.presetName || (finalPreset && !['default', 'generic'].includes(finalPreset) ? finalPreset : 'my-preset'),
      repo: configObj.repo, workspace: configObj.workspace, layout: configuredLayout,
      setup: configObj.setup || (installCmd ? [installCmd] : []), cleanup: configObj.cleanup || [],
    });
  }

  static async handleGitignore(target, isLocal, isInsideGit, cwd, options = {}) {
    if (!isLocal || !(options.gitignore ?? options.addToGitignore)) return false;
    const directory = projectDirectory(cwd);
    const relative = path.relative(directory, target).split(path.sep).join('/');
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return false;
    const file = path.join(directory, '.gitignore');
    const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const entries = original.split(/\r?\n/).map((line) => line.trim());
    if (entries.includes(relative) || entries.includes(`/${relative}`)) return false;
    await writeFile(file, `${original}${original && !original.endsWith('\n') ? '\n' : ''}${relative}\n`, 'utf8');
    p.log.success(`Added ${relative} to .gitignore.`);
    return true;
  }

  static printSuccessCard(file, message) {
    screen('Configuration saved');
    p.log.success(message);
    p.note(file);
    p.note('Run arise to launch a session. Return to Configure to change individual settings.');
  }
}

module.exports = { ConfigInitWizard };
