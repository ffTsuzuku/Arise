const test = require('node:test');
const assert = require('node:assert/strict');
const { PluginManager, initPluginManager } = require('../lib/plugins');

test('Plugin System & Lifecycle Hooks', async (t) => {
  await t.test('registers plugins and prevents duplicates by name', () => {
    const manager = new PluginManager();
    manager.register({ name: 'custom-p1', version: '1.0.0' });
    manager.register({ name: 'custom-p1', version: '2.0.0' });
    manager.register({ name: 'custom-p2', version: '1.0.0' });

    assert.equal(manager.getPlugins().length, 2);
    assert.equal(manager.getPlugins()[0].version, '2.0.0');
    assert.equal(manager.hasPlugin('custom-p1'), true);
    assert.equal(manager.hasPlugin('custom-p2'), true);
  });

  await t.test('hookResolveTarget allows plugin to redirect target directory and session name', async () => {
    const manager = new PluginManager();
    manager.register({
      name: 'router',
      async resolveTarget(ctx) {
        if (ctx.flags.customDir) {
          return {
            targetDir: '/tmp/redirected-dir',
            sessionName: 'redirected_session',
          };
        }
        return null;
      },
    });

    const result = await manager.hookResolveTarget({ flags: { customDir: true } });
    assert.ok(result);
    assert.equal(result.targetDir, '/tmp/redirected-dir');
    assert.equal(result.sessionName, 'redirected_session');

    const emptyResult = await manager.hookResolveTarget({ flags: {} });
    assert.equal(emptyResult, null);
  });

  await t.test('hookOnBeforeSession and hookOnAfterSession execute in order', async () => {
    const manager = new PluginManager();
    const calls = [];

    manager.register({
      name: 'logger-plugin',
      async onBeforeSession(ctx) {
        calls.push('before:' + ctx.step);
      },
      async onAfterSession(ctx) {
        calls.push('after:' + ctx.step);
      },
    });

    await manager.hookOnBeforeSession({ step: 1 });
    await manager.hookOnAfterSession({ step: 2 });

    assert.deepEqual(calls, ['before:1', 'after:2']);
  });

  await t.test('hookOnTeardown stops and returns true when handled by a plugin', async () => {
    const manager = new PluginManager();
    let secondPluginCalled = false;

    manager.register({
      name: 'cleanup-handler',
      async onTeardown(ctx) {
        if (ctx.flags.nuke) return true;
        return false;
      },
    });

    manager.register({
      name: 'fallback-cleanup',
      async onTeardown() {
        secondPluginCalled = true;
        return true;
      },
    });

    const handled = await manager.hookOnTeardown({ flags: { nuke: true } });
    assert.equal(handled, true);
    assert.equal(secondPluginCalled, false);
  });

  await t.test('initPluginManager auto-registers worktree plugin for git repos or branch flags', () => {
    const manager = initPluginManager({
      flags: { branch: 'feature/test' },
      config: {},
      cwd: '/tmp',
    });

    assert.equal(manager.hasPlugin('worktree'), true);
  });
});
