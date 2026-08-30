const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ANSI, stripAnsi, visibleLength, truncate, wrapAnsiLine, drawBox } = require('../lib/tui/ansi');
const { createPathCompleter, promptSelect, promptMultiSelect, promptConfirm, promptText } = require('../lib/tui/prompt');
const { ConfigInitWizard } = require('../lib/config/init');
const { parseArgs } = require('../lib/cli');

function createTempDir(prefix = 'arise-init-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('ANSI & Terminal Formatting Utilities', async (t) => {
  await t.test('stripAnsi removes all escape codes', () => {
    const raw = `${ANSI.bold}${ANSI.cyan}Hello${ANSI.reset} ${ANSI.green}World!${ANSI.reset}`;
    assert.equal(stripAnsi(raw), 'Hello World!');
    assert.equal(visibleLength(raw), 12);
  });

  await t.test('truncate truncates visible text while preserving styling', () => {
    const text = `${ANSI.bold}SuperLongTitleTextThatNeedsTruncation${ANSI.reset}`;
    const truncated = truncate(text, 10);
    assert.ok(visibleLength(truncated) <= 10);
    assert.ok(stripAnsi(truncated).endsWith('…'));
  });

  await t.test('wrapAnsiLine wraps text within maxWidth', () => {
    const text = 'This is a long sentence that should be wrapped across multiple lines neatly.';
    const lines = wrapAnsiLine(text, 20);
    assert.ok(lines.length > 1);
    for (const l of lines) {
      assert.ok(visibleLength(l) <= 25);
    }
  });

  await t.test('drawBox renders Unicode box card with borders', () => {
    const lines = ['First line', 'Second line of info'];
    const box = drawBox('Test Box', lines, 40);
    assert.ok(Array.isArray(box));
    assert.ok(box[0].startsWith('┌'));
    assert.ok(box[0].includes('Test Box'));
    assert.ok(box[box.length - 1].startsWith('└'));
  });
});

test('Prompt Primitives & Path Completer', async (t) => {
  await t.test('createPathCompleter handles current directory and homedir', () => {
    const completer = createPathCompleter({ directoriesOnly: true });
    const [hits, partial] = completer('~');
    assert.ok(Array.isArray(hits));
    assert.equal(partial, '~');

    const [cwdHits] = completer('./');
    assert.ok(Array.isArray(cwdHits));
  });

  await t.test('prompt primitives fallback gracefully in non-TTY environment', async () => {
    const selectRes = await promptSelect({
      message: 'Select item',
      choices: [{ label: 'Option A', value: 'a' }, { label: 'Option B', value: 'b' }],
      defaultIndex: 1,
    });
    assert.equal(selectRes, 'b');

    const multiRes = await promptMultiSelect({
      message: 'Select items',
      choices: [{ label: 'Item 1', value: '1', selected: true }, { label: 'Item 2', value: '2' }],
    });
    assert.deepEqual(multiRes, ['1']);

    const textRes = await promptText({
      message: 'Enter text',
      defaultValue: 'default-val',
    });
    assert.equal(textRes, 'default-val');

    const confirmRes = await promptConfirm({
      message: 'Confirm action?',
      defaultYes: true,
    });
    assert.equal(confirmRes, true);
  });
});

test('CLI Argument Parsing for Init Wizard', async (t) => {
  await t.test('parses init command and flags', () => {
    const flags1 = parseArgs(['init']);
    assert.equal(flags1.isInit, true);

    const flags2 = parseArgs(['--init', '--quick', '--local']);
    assert.equal(flags2.isInit, true);
    assert.equal(flags2.quick, true);
    assert.equal(flags2.skillScope, 'local');

    const flags3 = parseArgs(['init', '-q', '-f', '--target', '/tmp/custom.json']);
    assert.equal(flags3.isInit, true);
    assert.equal(flags3.quick, true);
    assert.equal(flags3.force, true);
    assert.equal(flags3.targetPath, '/tmp/custom.json');

    const flags4 = parseArgs(['init', '--gitignore']);
    assert.equal(flags4.isInit, true);
    assert.equal(flags4.gitignore, true);

    const flags5 = parseArgs(['init', '--no-gitignore']);
    assert.equal(flags5.isInit, true);
    assert.equal(flags5.gitignore, false);
  });
});

test('ConfigInitWizard Execution & Overwrite Protection', async (t) => {
  await t.test('creates local .ariserc.json in quick mode with detected defaults', async () => {
    const tempDir = createTempDir('arise-quick-test-');
    // Create a package.json to trigger node preset detection
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test-app' }));

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      cwd: tempDir,
      force: true,
    });

    assert.ok(configPath);
    assert.ok(fs.existsSync(configPath));

    const content = fs.readFileSync(configPath, 'utf8');
    assert.ok(content.includes('// Arise Local Repository Configuration'));

    // Strip comments to parse JSON
    const jsonStr = content.replace(/\/\/.*$/gm, '').trim();
    const config = JSON.parse(jsonStr);

    assert.equal(config.preset, 'node');
    assert.ok(config.repo);
    assert.ok(config.workspace);
    assert.equal(config.workspace.agent, 'agy');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('preserves existing file when overwrite is not forced in non-TTY mode', async () => {
    const tempDir = createTempDir('arise-overwrite-test-');
    const targetFile = path.join(tempDir, '.ariserc.json');
    fs.writeFileSync(targetFile, JSON.stringify({ custom: 'original-value' }));

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      targetPath: targetFile,
      cwd: tempDir,
      force: false,
    });

    assert.equal(configPath, targetFile);
    const content = fs.readFileSync(targetFile, 'utf8');
    // Original file should remain untouched
    assert.ok(content.includes('original-value'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('overwrites existing file when force is true', async () => {
    const tempDir = createTempDir('arise-force-test-');
    const targetFile = path.join(tempDir, '.ariserc.json');
    fs.writeFileSync(targetFile, JSON.stringify({ custom: 'original-value' }));

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      targetPath: targetFile,
      cwd: tempDir,
      force: true,
    });

    assert.equal(configPath, targetFile);
    const content = fs.readFileSync(targetFile, 'utf8');
    assert.ok(!content.includes('original-value'));
    assert.ok(content.includes('// Arise Local Repository Configuration'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('guided init generates configured layout and properties', async () => {
    const tempDir = createTempDir('arise-guided-test-');
    const targetFile = path.join(tempDir, '.ariserc.json');

    const configPath = await ConfigInitWizard.run({
      quick: false,
      local: true,
      targetPath: targetFile,
      cwd: tempDir,
      force: true,
    });

    assert.equal(configPath, targetFile);
    const content = fs.readFileSync(targetFile, 'utf8');
    const jsonStr = content.replace(/\/\/.*$/gm, '').trim();
    const config = JSON.parse(jsonStr);

    assert.ok(Array.isArray(config.layout));
    assert.ok(config.layout.length >= 2);
    assert.equal(config.layout[0].position, 'root');
    assert.ok(config.layout.some(p => p.isAgent));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('supports 6-pane custom layout array in config output', async () => {
    const tempDir = createTempDir('arise-6pane-test-');
    const targetFile = path.join(tempDir, '.ariserc.json');

    const sixPanes = [
      { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
      { id: 'server', title: 'server', cmd: 'npm run dev', split: 'right', from: 'vim' },
      { id: 'shell1', title: 'shell 1', cmd: null, split: 'down', from: 'vim' },
      { id: 'shell2', title: 'shell 2', cmd: null, split: 'right', from: 'shell1' },
      { id: 'logs', title: 'logs', cmd: 'npm test -- --watch', split: 'down', from: 'server' },
      { id: 'agy', title: 'agy', cmd: 'agy', split: 'right', from: 'logs', focus: true, isAgent: true },
    ];

    const configObj = {
      preset: 'node',
      repo: { defaultBaseBranch: 'main', protectedBranches: ['main'] },
      workspace: { agent: 'agy', defaultFocus: 'agy', labelPrefix: '' },
      layout: sixPanes,
    };

    fs.writeFileSync(targetFile, JSON.stringify(configObj, null, 2), 'utf8');

    const content = fs.readFileSync(targetFile, 'utf8');
    const parsed = JSON.parse(content);
    assert.equal(parsed.layout.length, 6);
    assert.equal(parsed.layout[0].id, 'vim');
    assert.equal(parsed.layout[5].id, 'agy');
    assert.equal(parsed.layout[5].isAgent, true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('guided init sets focus flag on matching pane definition in layout', async () => {
    const tempDir = createTempDir('arise-focus-test-');
    const targetFile = path.join(tempDir, '.ariserc.json');

    const configPath = await ConfigInitWizard.run({
      quick: false,
      local: true,
      targetPath: targetFile,
      cwd: tempDir,
      force: true,
    });

    assert.equal(configPath, targetFile);
    const content = fs.readFileSync(targetFile, 'utf8');
    const jsonStr = content.replace(/\/\/.*$/gm, '').trim();
    const config = JSON.parse(jsonStr);

    assert.ok(config.workspace.defaultFocus);
    const focusedPane = config.layout.find(p => p.id === config.workspace.defaultFocus);
    assert.ok(focusedPane, 'Focused pane must exist in layout array');
    assert.equal(focusedPane.focus, true);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('adds config to .gitignore when gitignore option is true', async () => {
    const tempDir = createTempDir('arise-gitignore-add-');
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules/\n.env\n', 'utf8');

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      cwd: tempDir,
      force: true,
      gitignore: true,
    });

    assert.ok(configPath);
    assert.ok(fs.existsSync(gitignorePath));
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(gitignoreContent.includes('.ariserc.json'));
    assert.ok(gitignoreContent.includes('node_modules/'));

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('does not add config to .gitignore when gitignore option is false', async () => {
    const tempDir = createTempDir('arise-gitignore-skip-');
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules/\n', 'utf8');

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      cwd: tempDir,
      force: true,
      gitignore: false,
    });

    assert.ok(configPath);
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    assert.ok(!gitignoreContent.includes('.ariserc.json'));
    assert.equal(gitignoreContent.trim(), 'node_modules/');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('does not duplicate .gitignore entry if config is already ignored', async () => {
    const tempDir = createTempDir('arise-gitignore-dedup-');
    const gitignorePath = path.join(tempDir, '.gitignore');
    fs.writeFileSync(gitignorePath, 'node_modules/\n.ariserc.json\n', 'utf8');

    const configPath = await ConfigInitWizard.run({
      quick: true,
      local: true,
      cwd: tempDir,
      force: true,
      gitignore: true,
    });

    assert.ok(configPath);
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
    const matches = gitignoreContent.match(/\.ariserc\.json/g);
    assert.equal(matches ? matches.length : 0, 1);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});


