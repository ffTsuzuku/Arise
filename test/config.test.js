const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPreset, detectPreset, listPresets, loadCustomPresets } = require('../presets');
const { resolveConfiguration } = require('../lib/config');

test('Preset Registry & Resolution', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-config-test-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('has empty built-in presets list by default (user-defined only)', () => {
    const { builtInPresets } = require('../presets');
    assert.deepEqual(builtInPresets, []);
  });

  await t.test('retrieves default fallback preset by alias', () => {
    assert.equal(getPreset('generic').name, 'default');
    assert.equal(getPreset('default').name, 'default');
  });

  await t.test('returns null for unknown preset without matches', () => {
    assert.equal(getPreset('nonexistent-preset'), null);
  });

  await t.test('resolves configuration with default preset when none specified', () => {
    const config = resolveConfiguration({}, tmpDir);
    assert.equal(config.preset.name, 'default');
    assert.equal(config.repo.defaultBaseBranch, 'main');
    assert.equal(Array.isArray(config.layout), true);
    assert.equal(config.layout.length, 3);
    assert.deepEqual(config.setup, []);
    assert.deepEqual(config.cleanup, []);
  });

  await t.test('resolves configuration with user-defined custom preset', () => {
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-preset-res-'));
    try {
      const presetDir = path.join(customDir, '.arise', 'presets');
      fs.mkdirSync(presetDir, { recursive: true });
      fs.writeFileSync(
        path.join(presetDir, 'my-stack.js'),
        `module.exports = {
          name: 'my-stack',
          repo: { defaultBaseBranch: 'develop' },
          setup: ['npm install'],
          cleanup: ['npm run clean'],
          layout: [
            { id: 'editor', title: 'editor', cmd: 'code .', position: 'root' },
            { id: 'server', title: 'server', cmd: 'npm start', split: 'right', from: 'editor' },
          ],
        };`
      );

      const config = resolveConfiguration({ presetName: 'my-stack' }, customDir);
      assert.equal(config.preset.name, 'my-stack');
      assert.equal(config.repo.defaultBaseBranch, 'develop');
      assert.deepEqual(config.setup, ['npm install']);
      assert.deepEqual(config.cleanup, ['npm run clean']);
      assert.equal(config.layout.length, 2);
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  });

  await t.test('resolves and merges setup and cleanup shell command arrays', () => {
    // 1. Default config has empty setup and cleanup
    const defaultConfig = resolveConfiguration({}, tmpDir);
    assert.deepEqual(defaultConfig.setup, []);
    assert.deepEqual(defaultConfig.cleanup, []);

    // 2. Custom setup and cleanup arrays in file config
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-setup-cleanup-test-'));
    try {
      fs.writeFileSync(
        path.join(testDir, '.ariserc.json'),
        JSON.stringify({
          preset: 'default',
          setup: ['cp .env.example .env', 'composer install'],
          cleanup: ['docker compose down -v'],
        }),
        'utf8'
      );
      const fileConfig = resolveConfiguration({}, testDir);
      assert.deepEqual(fileConfig.setup, ['cp .env.example .env', 'composer install']);
      assert.deepEqual(fileConfig.cleanup, ['docker compose down -v']);

      // 3. Normalizes string setup/cleanup to array
      fs.writeFileSync(
        path.join(testDir, '.ariserc.json'),
        JSON.stringify({
          setup: 'cargo build',
          cleanup: 'cargo clean',
        }),
        'utf8'
      );
      const strConfig = resolveConfiguration({}, testDir);
      assert.deepEqual(strConfig.setup, ['cargo build']);
      assert.deepEqual(strConfig.cleanup, ['cargo clean']);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('resolves CLI agent via flag and updates layout agent pane', () => {
    const config = resolveConfiguration({ presetName: 'default', agent: 'claude' }, tmpDir);
    assert.equal(config.workspace.agent, 'claude');

    const agentPane = config.layout.find((p) => p.isAgent || p.id === 'agy' || p.id === 'agent');
    assert.ok(agentPane);
    assert.equal(agentPane.cmd, 'claude');
    assert.equal(agentPane.title, 'claude');
    assert.equal(agentPane.isAgent, true);
  });

  await t.test('resolves CLI agent via ARISE_AGENT environment variable', () => {
    const originalEnv = process.env.ARISE_AGENT;
    try {
      process.env.ARISE_AGENT = 'aider';
      const config = resolveConfiguration({ presetName: 'default' }, tmpDir);
      assert.equal(config.workspace.agent, 'aider');

      const agentPane = config.layout.find((p) => p.isAgent || p.id === 'agy' || p.id === 'agent');
      assert.ok(agentPane);
      assert.equal(agentPane.cmd, 'aider');
      assert.equal(agentPane.title, 'aider');
    } finally {
      if (originalEnv === undefined) {
        delete process.env.ARISE_AGENT;
      } else {
        process.env.ARISE_AGENT = originalEnv;
      }
    }
  });

  await t.test('handles agent disabling when set to "none"', () => {
    const config = resolveConfiguration({ presetName: 'generic', agent: 'none' }, tmpDir);
    assert.equal(config.workspace.agent, 'none');

    const agentPane = config.layout.find((p) => p.isAgent || p.id === 'agy' || p.id === 'agent');
    assert.ok(agentPane);
    assert.equal(agentPane.cmd, null);
    assert.equal(agentPane.title, 'shell');
  });

  await t.test('discovers configuration file across worktrees in bare repo topology', () => {
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-bare-test-'));
    const initRepo = path.join(tmpDir, 'init-repo');
    const bareDir = path.join(tmpDir, '.bare');
    const mainDir = path.join(tmpDir, 'main');

    try {
      // 1. Create initial repo with a commit
      fs.mkdirSync(initRepo, { recursive: true });
      execSync('git init -b main', { cwd: initRepo, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: initRepo, stdio: 'ignore' });
      execSync('git config user.name "Test User"', { cwd: initRepo, stdio: 'ignore' });
      fs.writeFileSync(path.join(initRepo, 'README.md'), '# Test\n');
      execSync('git add README.md && git commit -m "Initial commit"', { cwd: initRepo, stdio: 'ignore' });

      // 2. Clone as bare repo
      execSync(`git clone --bare "${initRepo}" "${bareDir}"`, { stdio: 'ignore' });

      // 3. Add main worktree
      execSync(`git -C "${bareDir}" worktree add "${mainDir}" main`, { stdio: 'ignore' });

      // 4. Add a custom .ariserc.json in the main worktree
      const customConfig = {
        preset: 'default',
        layout: [
          { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
          { id: 'test', title: 'test watcher', cmd: 'npm test -- --watch', split: 'right', from: 'vim' },
        ],
      };
      fs.writeFileSync(path.join(mainDir, '.ariserc.json'), JSON.stringify(customConfig, null, 2));

      // Resolve configuration from bare repo root (tmpDir)
      const resolved = resolveConfiguration({}, tmpDir);
      assert.ok(resolved.configFile);
      assert.equal(fs.realpathSync(resolved.configFile), fs.realpathSync(path.join(mainDir, '.ariserc.json')));
      assert.equal(resolved.layout.length, 2);
      assert.equal(resolved.layout[1].id, 'test');
      assert.equal(resolved.layout[1].title, 'test watcher');
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {}
    }
  });

  await t.test('loads and parses .ariserc.json containing comments (JSONC) and 5-pane custom layout', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-jsonc-test-'));
    try {
      const jsoncContent = `// Arise Local Repository Configuration
// SETTINGS REFERENCE
/* Block comment explaining options */
{
  "$schema": "./arise.schema.json",
  "preset": "default",
  "layout": [
    { "id": "vim", "title": "editor", "cmd": "vim .", "position": "root" },
    { "id": "server", "title": "dev server", "cmd": null, "from": "vim", "split": "right" },
    { "id": "shell", "title": "shell", "cmd": null, "from": "server", "split": "down" },
    { "id": "test", "title": "test runner", "cmd": "agy", "from": "shell", "split": "right" },
    { "id": "logs", "title": "system logs", "cmd": null, "from": "test", "split": "down", "isAgent": true, "focus": true }
  ]
}
`;
      fs.writeFileSync(path.join(testDir, '.ariserc.json'), jsoncContent, 'utf8');

      const resolved = resolveConfiguration({}, testDir);
      assert.equal(resolved.layout.length, 5);
      assert.equal(resolved.layout[0].id, 'vim');
      assert.equal(resolved.layout[4].id, 'logs');
      assert.equal(resolved.layout[4].isAgent, true);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('discovers and loads custom preset from .arise/presets/ directory', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-custom-preset-'));
    try {
      const presetDir = path.join(testDir, '.arise', 'presets');
      fs.mkdirSync(presetDir, { recursive: true });

      const customPresetCode = `
module.exports = {
  name: 'django',
  detect: (cwd) => require('fs').existsSync(require('path').join(cwd, 'manage.py')),
  repo: { defaultBaseBranch: 'main' },
  workspace: { defaultFocus: 'agent' },
  layout: [
    { id: 'vim', title: 'editor', cmd: 'vim .', position: 'root' },
    { id: 'server', title: 'django server', cmd: 'python manage.py runserver', split: 'right', from: 'vim' },
  ],
};
`;
      fs.writeFileSync(path.join(presetDir, 'django.js'), customPresetCode, 'utf8');

      // 1. getPreset by name from searchDirs
      const preset = getPreset('django', [testDir]);
      assert.ok(preset);
      assert.equal(preset.name, 'django');
      assert.equal(preset.isCustom, true);
      assert.equal(preset.layout.length, 2);

      // 2. listPresets includes custom preset
      const list = listPresets([testDir]);
      assert.ok(list.some((p) => p.name === 'django' && p.isCustom));

      // 3. detectPreset matches when marker file is present
      fs.writeFileSync(path.join(testDir, 'manage.py'), '#!/usr/bin/env python');
      const detected = detectPreset(testDir, [testDir]);
      assert.ok(detected);
      assert.equal(detected.name, 'django');
      assert.equal(detected.isCustom, true);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('loads custom preset from explicit relative or absolute file path', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-filepath-preset-'));
    try {
      const customPath = path.join(testDir, 'my-preset.js');
      const customCode = `
module.exports = {
  name: 'custom-tooling',
  layout: [
    { id: 'main', title: 'workspace', cmd: 'bash', position: 'root' },
  ],
};
`;
      fs.writeFileSync(customPath, customCode, 'utf8');

      // Direct relative/absolute path
      const loaded = getPreset(customPath);
      assert.ok(loaded);
      assert.equal(loaded.name, 'custom-tooling');
      assert.equal(loaded.isCustom, true);
      assert.equal(loaded.layout.length, 1);

      // Resolve configuration using file path preset
      fs.writeFileSync(
        path.join(testDir, '.ariserc.json'),
        JSON.stringify({ preset: customPath }),
        'utf8'
      );
      const config = resolveConfiguration({}, testDir);
      assert.equal(config.preset.name, 'custom-tooling');
      assert.equal(config.layout[0].id, 'main');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('resolves multiplexer and plugins from config and flags', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-mux-config-'));
    try {
      fs.writeFileSync(
        path.join(testDir, '.ariserc.json'),
        JSON.stringify({
          multiplexer: 'tmux',
          plugins: ['worktree'],
        }),
        'utf8'
      );

      const configFromFile = resolveConfiguration({}, testDir);
      assert.equal(configFromFile.multiplexer, 'tmux');
      assert.deepEqual(configFromFile.plugins, ['worktree']);

      const configFromFlags = resolveConfiguration({ multiplexer: 'herdr' }, testDir);
      assert.equal(configFromFlags.multiplexer, 'herdr');
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  await t.test('safely discards non-existent or foreign bareRepo and worktreesBase paths', () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-ghost-paths-'));
    try {
      fs.writeFileSync(
        path.join(testDir, '.ariserc.json'),
        JSON.stringify({
          repo: {
            bareRepo: '/Users/nonexistent/path/.bare',
            worktreesBase: '/Users/nonexistent/worktrees',
          },
        }),
        'utf8'
      );

      const resolved = resolveConfiguration({}, testDir);
      assert.equal(resolved.repo.bareRepo, null);
      assert.equal(resolved.repo.worktreesBase, null);
    } finally {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });
});


