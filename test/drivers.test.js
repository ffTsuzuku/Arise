const test = require('node:test');
const assert = require('node:assert/strict');
const { getDriver, resolveDriver, listAvailableDrivers } = require('../lib/drivers');
const tmuxDriver = require('../lib/drivers/tmux');
const herdrDriver = require('../lib/drivers/herdr');
const { renderLayout } = require('../lib/layout');

test('Terminal Multiplexer Drivers', async (t) => {
  await t.test('resolves tmux and herdr drivers by name', () => {
    const tmux = getDriver('tmux');
    assert.equal(tmux.name, 'tmux');
    assert.equal(typeof tmux.createSession, 'function');
    assert.equal(typeof tmux.splitPane, 'function');

    const herdr = getDriver('herdr');
    assert.equal(herdr.name, 'herdr');
    assert.equal(typeof herdr.createSession, 'function');
    assert.equal(typeof herdr.splitPane, 'function');
  });

  await t.test('throws on unsupported driver name', () => {
    assert.throws(() => {
      getDriver('unsupported_mux');
    }, /Unsupported terminal multiplexer driver/);
  });

  await t.test('resolveDriver obeys CLI flag override', () => {
    const driver = resolveDriver('auto', { mux: 'tmux' });
    assert.equal(driver.name, 'tmux');

    const herdrChoice = resolveDriver('auto', { multiplexer: 'herdr' });
    assert.equal(herdrChoice.name, 'herdr');
  });

  await t.test('renderLayout works seamlessly with custom driver interface', () => {
    const actions = [];
    let paneCounter = 1;

    const mockDriver = {
      name: 'mock',
      splitPane({ paneId, direction, cwd, focus }) {
        const newPaneId = `pane_${++paneCounter}`;
        actions.push({ type: 'split', from: paneId, direction, newPaneId, focus });
        return newPaneId;
      },
      renamePane(paneId, title) {
        actions.push({ type: 'rename', paneId, title });
      },
      runInPane(paneId, cmd) {
        actions.push({ type: 'cmd', paneId, cmd });
      },
      focusPane(paneId) {
        actions.push({ type: 'focus', paneId });
      },
    };

    const layout = [
      { id: 'editor', title: 'editor', cmd: 'nvim .', position: 'root' },
      { id: 'logs', title: 'logs', cmd: 'tail -f dev.log', split: 'right', from: 'editor' },
      { id: 'agent', title: 'agent', cmd: 'claude', split: 'down', from: 'editor', focus: true },
    ];

    const result = renderLayout({
      layout,
      rootPaneId: 'pane_1',
      cwd: '/tmp/test-project',
      focusTarget: 'agent',
      driver: mockDriver,
    });

    assert.ok(result.paneMap);
    assert.equal(result.paneMap.get('editor'), 'pane_1');
    assert.equal(result.paneMap.get('logs'), 'pane_2');
    assert.equal(result.paneMap.get('agent'), 'pane_3');
    assert.equal(result.targetFocusPaneId, 'pane_3');

    // Verify actions were recorded in sequence
    const splitLogs = actions.find(a => a.type === 'split' && a.from === 'pane_1' && a.direction === 'right');
    assert.ok(splitLogs);

    const splitAgent = actions.find(a => a.type === 'split' && a.from === 'pane_1' && a.direction === 'down');
    assert.ok(splitAgent);
    assert.equal(splitAgent.focus, true);

    const agentCmd = actions.find(a => a.type === 'cmd' && a.cmd === 'claude');
    assert.ok(agentCmd);
  });

  if (tmuxDriver.isAvailable()) {
    await t.test('tmux driver real lifecycle: create, split, and kill session', () => {
      const testSessionName = 'arise_test_spec_' + Date.now();
      try {
        const session = tmuxDriver.createSession({ name: testSessionName, cwd: '/tmp' });
        assert.equal(session.name, testSessionName);
        assert.ok(session.rootPaneId);

        const newPane = tmuxDriver.splitPane({
          paneId: session.rootPaneId,
          direction: 'right',
          cwd: '/tmp',
          focus: false,
        });
        assert.ok(newPane);

        tmuxDriver.renamePane(newPane, 'test-pane');
        tmuxDriver.runInPane(newPane, 'echo "test"');

        const sessions = tmuxDriver.listSessions();
        const found = sessions.find(s => s.name === testSessionName);
        assert.ok(found, `Session ${testSessionName} should be in listSessions`);
      } finally {
        tmuxDriver.closeSession(testSessionName);
        assert.equal(tmuxDriver.hasSession(testSessionName), false);
      }
    });
  }
});
