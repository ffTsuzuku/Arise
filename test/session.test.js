const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { executeSessionCreate, executeSessionClose } = require('../lib/lifecycle/session');
const { PluginManager } = require('../lib/plugins');

test('Core Session Lifecycle (Agnostic Orchestrator)', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-session-test-'));

  await t.test('executeSessionCreate creates session in target directory without git', async () => {
    const actions = [];
    const mockDriver = {
      name: 'mock-driver',
      isAvailable: () => true,
      ensureInstalled: async () => true,
      createSession: ({ name, cwd }) => {
        actions.push({ type: 'createSession', name, cwd });
        return { sessionId: 'mock_sess_1', rootPaneId: 'root_pane_1', name };
      },
      closeSession: (name) => {
        actions.push({ type: 'closeSession', name });
        return true;
      },
      splitPane: ({ paneId, direction }) => {
        const id = `pane_${actions.length}`;
        actions.push({ type: 'splitPane', from: paneId, direction, id });
        return id;
      },
      renamePane: (paneId, title) => {
        actions.push({ type: 'renamePane', paneId, title });
      },
      runInPane: (paneId, cmd) => {
        actions.push({ type: 'runInPane', paneId, cmd });
      },
      focusPane: (paneId) => {
        actions.push({ type: 'focusPane', paneId });
      },
      focusSession: (id) => {
        actions.push({ type: 'focusSession', id });
      },
      attachOrSwitchSession: (name) => {
        actions.push({ type: 'attachOrSwitchSession', name });
      },
      listSessions: () => [],
    };

    const flags = {
      noAttach: true,
      workspaceName: 'my_custom_session',
      rawArgs: [],
    };

    const config = {
      multiplexer: 'mock-driver',
      workspace: { defaultFocus: 'agent' },
      layout: [
        { id: 'vim', title: 'vim', cmd: 'nvim .', position: 'root' },
        { id: 'agent', title: 'agent', cmd: 'agy', split: 'right', from: 'vim', focus: true, isAgent: true },
      ],
      hooks: {},
    };

    const pluginManager = new PluginManager();

    const result = await executeSessionCreate({
      flags,
      config,
      cwd: tmpDir,
      pluginManager,
      driver: mockDriver,
    });

    assert.ok(result);
    assert.equal(result.sessionName, 'my_custom_session');
    assert.equal(result.targetDir, tmpDir);

    const created = actions.find((a) => a.type === 'createSession');
    assert.ok(created);
    assert.equal(created.name, 'my_custom_session');
    assert.equal(created.cwd, tmpDir);

    const split = actions.find((a) => a.type === 'splitPane');
    assert.ok(split);
    assert.equal(split.from, 'root_pane_1');
    assert.equal(split.direction, 'right');

    const agentCmd = actions.find((a) => a.type === 'runInPane' && a.cmd === 'agy');
    assert.ok(agentCmd);
  });

  await t.test('executeSessionClose closes session using driver', async () => {
    let closedTarget = null;
    const mockDriver = {
      name: 'mock',
      closeSession: (name) => {
        closedTarget = name;
        return true;
      },
      listSessions: () => [],
    };

    const flags = {
      cleanupTarget: 'test_session_target',
      rawArgs: [],
    };

    const pluginManager = new PluginManager();

    const closed = await executeSessionClose({
      flags,
      config: {},
      cwd: tmpDir,
      pluginManager,
      driver: mockDriver,
    });

    assert.equal(closed, true);
    assert.equal(closedTarget, 'test_session_target');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
