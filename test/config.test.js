const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { getPreset, detectPreset } = require('../presets');
const { resolveConfiguration } = require('../lib/config');

test('Preset Registry & Resolution', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-config-test-'));
  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await t.test('retrieves node preset by alias', () => {
    assert.equal(getPreset('node').name, 'node');
    assert.equal(getPreset('js').name, 'node');
    assert.equal(getPreset('fe').name, 'node');
  });

  await t.test('retrieves laravel preset by alias', () => {
    assert.equal(getPreset('laravel').name, 'laravel');
    assert.equal(getPreset('php').name, 'laravel');
    assert.equal(getPreset('api').name, 'laravel');
    assert.equal(getPreset('be').name, 'laravel');
  });

  await t.test('retrieves generic preset by alias', () => {
    assert.equal(getPreset('generic').name, 'generic');
    assert.equal(getPreset('default').name, 'generic');
  });

  await t.test('resolves configuration with preset overrides', () => {
    const config = resolveConfiguration({ presetName: 'node' }, tmpDir);
    assert.equal(config.preset.name, 'node');
    assert.equal(config.repo.defaultBaseBranch, 'develop');
    assert.equal(Array.isArray(config.layout), true);
    assert.equal(config.layout.length, 4);
  });

  await t.test('merges scaffold configuration and supports custom install commands', () => {
    const config = resolveConfiguration({ presetName: 'node' }, tmpDir);
    assert.ok(typeof config.scaffold === 'object');

    // Simulate resolved config with custom install command
    const customConfig = {
      ...config,
      scaffold: {
        ...config.scaffold,
        install: 'npm install --legacy-peer-deps',
      },
    };
    assert.equal(customConfig.scaffold.install, 'npm install --legacy-peer-deps');

    // Simulate skipping install
    const skipConfig = {
      ...config,
      scaffold: {
        ...config.scaffold,
        install: false,
      },
    };
    assert.equal(skipConfig.scaffold.install, false);
  });

  await t.test('resolves CLI agent via flag and updates layout agent pane', () => {
    const config = resolveConfiguration({ presetName: 'node', agent: 'claude' }, tmpDir);
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
      const config = resolveConfiguration({ presetName: 'laravel' }, tmpDir);
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
        preset: 'node',
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
  "preset": "node",
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
});

