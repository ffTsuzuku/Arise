const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ConfigurationDraft, validateLayout } = require('../lib/config/draft');
const { loadConfigFile, resolveConfiguration } = require('../lib/config');
const { ConfigInitWizard } = require('../lib/config/init');

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-setup-draft-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const preset = {
    name: 'studio',
    workspace: { labelPrefix: '[studio] ', defaultFocus: 'assistant' },
    setup: ['node -e "console.log(1, 2)"'], cleanup: ['docker compose down'],
    layout: [
      { id: 'editor', title: 'Editor', cmd: 'nvim .', position: 'root' },
      { id: 'assistant', title: 'Codex', cmd: 'codex --profile dev', from: 'editor', split: 'right', isAgent: true, focus: true },
    ],
  };
  fs.mkdirSync(path.join(cwd, '.arise', 'presets'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.arise', 'presets', 'studio.js'), `module.exports = ${JSON.stringify(preset)};`);
  return { cwd, preset, target: path.join(cwd, '.ariserc.json') };
}

test('selecting a preset and editing only a prefix keeps layout, commands, and focus inherited', async (t) => {
  const { cwd, target, preset } = fixture(t);
  const draft = new ConfigurationDraft({ cwd, presetName: 'studio' });
  draft.setWorkspace('labelPrefix', '[API] ');
  assert.equal(fs.existsSync(target), false, 'editing a draft must not write a configuration');
  await draft.save();
  assert.deepEqual(loadConfigFile(target), { preset: 'studio', workspace: { labelPrefix: '[API] ' } });
  const effective = resolveConfiguration({}, cwd);
  assert.deepEqual(effective.layout, preset.layout);
  assert.equal(effective.workspace.defaultFocus, 'assistant');
  assert.deepEqual(effective.setup, preset.setup);
});

test('existing overrides remain until the user chooses to reset them', async (t) => {
  const { cwd, target } = fixture(t);
  const original = { preset: 'default', plugins: ['worktree'], multiplexer: 'tmux',
    repo: { protectedBranches: ['release'] }, workspace: { agent: 'claude', labelPrefix: '[API] ' }, setup: ['echo custom'] };
  fs.writeFileSync(target, JSON.stringify(original));
  const draft = new ConfigurationDraft({ cwd });
  draft.usePreset('studio');
  assert.equal(draft.effective().layout[1].cmd, 'claude');
  draft.usePreset('studio', true);
  assert.equal(draft.effective().layout[1].cmd, 'codex --profile dev');
  assert.equal(draft.data.workspace.labelPrefix, '[API] ');
  assert.deepEqual(draft.data.repo, original.repo);
  assert.deepEqual(draft.data.plugins, ['worktree']);
  assert.deepEqual(loadConfigFile(target), original, 'discarding this draft leaves the original intact');
});

test('saving rejects a config changed after the draft was opened', async (t) => {
  const { cwd, target } = fixture(t);
  const draft = new ConfigurationDraft({ cwd, presetName: 'studio' });
  const external = '{"preset":"default"}';
  fs.writeFileSync(target, external);
  await assert.rejects(draft.save(), /changed while setup was open/);
  assert.equal(fs.readFileSync(target, 'utf8'), external);
});

test('JSON comments do not damage URLs, shell syntax, or commas in commands', async (t) => {
  const { cwd, target } = fixture(t);
  const command = 'curl "https://example.com/a//b" && node -e "console.log(1, 2)"';
  fs.writeFileSync(target, `// A real comment\n${JSON.stringify({ preset: 'studio', setup: [command] })}`);
  const draft = new ConfigurationDraft({ cwd });
  await draft.save();
  assert.deepEqual(loadConfigFile(target).setup, [command]);
});

test('invalid and executable configurations are never silently rewritten', (t) => {
  const { cwd, target } = fixture(t);
  fs.writeFileSync(target, '{broken');
  assert.throws(() => new ConfigurationDraft({ cwd }), /Cannot read configuration/);
  assert.equal(fs.readFileSync(target, 'utf8'), '{broken');
  const executable = path.join(cwd, 'arise.config.js');
  fs.writeFileSync(executable, 'module.exports = { hooks: { onScaffold() {} } };');
  assert.throws(() => new ConfigurationDraft({ cwd, targetPath: executable }), /executable configuration/);
});

test('relative preset paths resolve against the saved config, independent of process cwd', async (t) => {
  const { cwd, target, preset } = fixture(t);
  await ConfigInitWizard.run({ cwd, quick: true, presetName: './.arise/presets/studio.js' });
  assert.equal(loadConfigFile(target).preset, './.arise/presets/studio.js');
  assert.deepEqual(resolveConfiguration({}, cwd).layout, preset.layout);
});

test('an explicit preset path is rebased when saving to another directory', async (t) => {
  const { cwd, preset } = fixture(t);
  const target = path.join(cwd, 'configuration', '.ariserc.json');
  const draft = new ConfigurationDraft({ cwd, targetPath: target, presetName: './.arise/presets/studio.js' });
  await draft.save();
  assert.equal(loadConfigFile(target).preset, '../.arise/presets/studio.js');
  assert.deepEqual(resolveConfiguration({}, path.dirname(target)).layout, preset.layout);
});

test('setup and launch find the same checkout config from a subdirectory', async (t) => {
  const { execFileSync } = require('child_process');
  const { cwd, target } = fixture(t);
  execFileSync('git', ['init', '-b', 'main', cwd], { stdio: 'ignore' });
  const nested = path.join(cwd, 'src', 'components');
  fs.mkdirSync(nested, { recursive: true });
  const draft = new ConfigurationDraft({ cwd: nested, presetName: 'studio' });
  assert.equal(fs.realpathSync(draft.projectDir), fs.realpathSync(cwd));
  await draft.save();
  assert.equal(fs.realpathSync(draft.target), fs.realpathSync(target));
  assert.equal(resolveConfiguration({}, nested).preset.name, 'studio');
});

test('custom pane commands and focus survive a preset with an agent default', async (t) => {
  const { cwd, target, preset } = fixture(t);
  preset.workspace.agent = 'agy';
  fs.writeFileSync(path.join(cwd, '.arise', 'presets', 'studio.js'), `module.exports = ${JSON.stringify(preset)};`);
  const layout = [
    { id: 'shell', title: 'Shell', cmd: null, position: 'root', focus: true },
    { id: 'agent', title: 'Codex', cmd: 'codex --profile custom', from: 'shell', split: 'right', isAgent: true },
  ];
  fs.writeFileSync(target, JSON.stringify({ preset: 'studio', layout }));
  const effective = resolveConfiguration({}, cwd);
  assert.equal(effective.layout[1].cmd, 'codex --profile custom');
  assert.equal(effective.workspace.defaultFocus, 'shell');
  assert.match(validateLayout([...layout, { ...layout[1] }]), /used more than once/);
  assert.match(validateLayout([{ ...layout[0] }, { ...layout[1], from: 'missing' }]), /earlier pane/);
});

test('preset names and commands are serialized as data', async (t) => {
  const { cwd } = fixture(t);
  const cmd = 'node -e "console.log(\'hello, world\')"';
  const target = await ConfigInitWizard.runCreatePresetWizard(cwd, {
    quick: true, presetName: 'quotes', exportScope: 'local', layoutTemplate: '1pane', commands: [cmd],
  });
  assert.equal(require(target).layout[0].cmd, cmd);
  await assert.rejects(ConfigInitWizard.runCreatePresetWizard(cwd, { quick: true, presetName: '../escape' }), /lowercase letters/);
});

test('the preset builder preserves agent titles and distinct commands at launch', async (t) => {
  const { cwd } = fixture(t);
  const layout = [
    { id: 'review', title: 'Code review', cmd: 'codex --profile review', position: 'root', isAgent: true },
    { id: 'build', title: 'Implementation', cmd: 'claude', from: 'review', split: 'right', isAgent: true, focus: true },
  ];
  const target = await ConfigInitWizard.runCreatePresetWizard(cwd, { quick: true, presetName: 'team', layout });
  const config = resolveConfiguration({ presetName: target }, cwd);
  assert.deepEqual(config.layout, layout);
  assert.equal(config.workspace.defaultFocus, 'build');
});
