const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const git = require('../lib/git');
const createWorktreePlugin = require('../lib/plugins/worktree');
const { resolveConfiguration } = require('../lib/config');

test('new worktrees use shared configs without copying them', async (t) => {
  for (const configName of ['.ariserc.json', '.ariserc', 'arise.config.js', '.ariserc.js']) {
    await t.test(configName, async (t) => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-worktree-config-'));
      t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
      const repoRoot = path.join(temp, 'project.git');
      const presetDir = path.join(repoRoot, '.arise', 'presets');
      fs.mkdirSync(presetDir, { recursive: true });
      const presetPath = path.join(presetDir, 'custom.js');
      const layout = Array.from({ length: 5 }, (_, i) => ({
        id: `pane-${i}`, cmd: null,
        ...(i === 0 ? { position: 'root' } : { split: 'right', from: 'pane-0' }),
      }));
      fs.writeFileSync(presetPath, `module.exports = {
        name: 'custom', detect() { return false; },
        layout: ${JSON.stringify(layout)}
      };\n`);
      const configPath = path.join(repoRoot, configName);
      const source = `${configName.endsWith('.js') ? 'module.exports = ' : ''}{
        // This preset is not checked out into new worktrees.
        "preset": "./.arise/presets/custom.js",
        "setup": ["echo setup"],
        "workspace": { "labelPrefix": "[APP] " }
      }\n`;
      fs.writeFileSync(configPath, source);

      t.mock.method(git, 'getRepoRootDir', () => repoRoot);
      t.mock.method(git, 'getWorkingTreeRoot', (cwd) => cwd);
      t.mock.method(git, 'isBareRepo', (dir) => dir === repoRoot);
      t.mock.method(git, 'isGitRepo', () => true);
      t.mock.method(git, 'getWorktrees', () => []);
      t.mock.method(git, 'createWorktree', ({ worktreePath }) => {
        fs.mkdirSync(worktreePath, { recursive: true });
      });

      const flags = { branch: 'new-worktree' };
      const config = resolveConfiguration(flags, repoRoot);
      const plugin = createWorktreePlugin();
      const target = await plugin.resolveTarget({ flags, config, cwd: repoRoot });
      const localConfigPath = path.join(target.targetDir, configName);
      assert.equal(fs.existsSync(localConfigPath), false);
      assert.equal(fs.readFileSync(configPath, 'utf8'), source);
      assert.equal(fs.existsSync(path.join(target.targetDir, '.arise')), false);

      const resolved = resolveConfiguration(flags, target.targetDir, repoRoot);
      assert.equal(resolved.configFile, configPath);
      assert.equal(resolved.preset.name, 'custom');
      assert.deepEqual(resolved.layout, config.layout);
      assert.equal(resolved.layout.length, 5);
      assert.deepEqual(resolved.setup, ['echo setup']);
      assert.equal(resolved.workspace.labelPrefix, '[APP] ');

      // Opening directly from the worktree also finds the shared config.
      const reopened = resolveConfiguration({}, target.targetDir);
      assert.equal(reopened.configFile, configPath);
      assert.deepEqual(reopened.layout, config.layout);

      // A config supplied by Git checkout must take precedence and stay intact.
      const localSource = `${configName.endsWith('.js') ? 'module.exports = ' : ''}{"preset":"default"}\n`;
      t.mock.method(git, 'createWorktree', ({ worktreePath }) => {
        fs.mkdirSync(worktreePath, { recursive: true });
        fs.writeFileSync(path.join(worktreePath, configName), localSource);
      });
      const trackedFlags = { branch: 'tracked-config' };
      const tracked = await plugin.resolveTarget({ flags: trackedFlags, config, cwd: repoRoot });
      const trackedConfigPath = path.join(tracked.targetDir, configName);
      assert.equal(fs.readFileSync(trackedConfigPath, 'utf8'), localSource);
      const trackedConfig = resolveConfiguration(trackedFlags, tracked.targetDir, repoRoot);
      assert.equal(trackedConfig.configFile, trackedConfigPath);
      assert.notEqual(trackedConfig.preset.name, 'custom');

      // Reopening an existing worktree must preserve its own configuration.
      fs.writeFileSync(localConfigPath, localSource);
      await plugin.resolveTarget({ flags, config, cwd: repoRoot });
      assert.equal(fs.readFileSync(localConfigPath, 'utf8'), localSource);
    });
  }
});
