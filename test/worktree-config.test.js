const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const git = require('../lib/git');
const createWorktreePlugin = require('../lib/plugins/worktree');
const { resolveConfiguration } = require('../lib/config');

test('new worktree JSON configs retain presets outside the checkout', async (t) => {
  for (const configName of ['.ariserc.json', '.ariserc']) {
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
      const source = `{
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
      const copiedPath = path.join(target.targetDir, configName);
      const copied = JSON.parse(fs.readFileSync(copiedPath, 'utf8'));
      assert.equal(copied.preset, presetPath);
      assert.equal(fs.readFileSync(configPath, 'utf8'), source);
      assert.equal(fs.existsSync(path.join(target.targetDir, '.arise')), false);

      const resolved = resolveConfiguration(flags, target.targetDir, repoRoot);
      assert.equal(resolved.configFile, copiedPath);
      assert.equal(resolved.preset.name, 'custom');
      assert.deepEqual(resolved.layout, config.layout);
      assert.equal(resolved.layout.length, 5);
      assert.deepEqual(resolved.setup, ['echo setup']);
      assert.equal(resolved.workspace.labelPrefix, '[APP] ');

      // Reopening an existing worktree must preserve its own configuration.
      fs.writeFileSync(copiedPath, '{"preset":"default"}\n');
      await plugin.resolveTarget({ flags, config, cwd: repoRoot });
      assert.equal(fs.readFileSync(copiedPath, 'utf8'), '{"preset":"default"}\n');
    });
  }
});
