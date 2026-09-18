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

  await t.test('executeSessionCreate runs setup commands when workspace is newly provisioned', async () => {
    const mockDriver = {
      name: 'mock',
      isAvailable: () => true,
      ensureInstalled: async () => true,
      createSession: ({ name, cwd }) => ({ sessionId: 's1', rootPaneId: 'p1', name }),
      splitPane: () => 'p2',
      renamePane: () => {},
      runInPane: () => {},
      focusPane: () => {},
      focusSession: () => {},
      attachOrSwitchSession: () => {},
      listSessions: () => [],
    };

    const targetSubDir = path.join(tmpDir, 'new-workspace');
    fs.mkdirSync(targetSubDir, { recursive: true });

    const manager = new PluginManager();
    manager.register({
      name: 'test-plugin',
      async resolveTarget() {
        return {
          targetDir: targetSubDir,
          sessionName: 'new-workspace',
          isNew: true,
        };
      },
    });

    const markerFile = path.join(targetSubDir, 'setup-marker.txt');
    const config = {
      multiplexer: 'mock',
      workspace: {},
      layout: [{ id: 'main', title: 'main', cmd: null, position: 'root' }],
      setup: [`touch "${markerFile}"`],
    };

    await executeSessionCreate({
      flags: { noAttach: true, rawArgs: [] },
      config,
      cwd: tmpDir,
      pluginManager: manager,
      driver: mockDriver,
    });

    assert.ok(fs.existsSync(markerFile), 'setup command should have executed and created the marker file');
  });

  await t.test('executeSessionClose runs cleanup commands before standard session close', async () => {
    const mockDriver = {
      name: 'mock',
      closeSession: () => true,
      listSessions: () => [],
    };

    const markerFile = path.join(tmpDir, 'cleanup-marker.txt');
    const config = {
      multiplexer: 'mock',
      cleanup: [`touch "${markerFile}"`],
    };

    await executeSessionClose({
      flags: { cleanupTarget: 'test_session', rawArgs: [] },
      config,
      cwd: tmpDir,
      driver: mockDriver,
    });

    assert.ok(fs.existsSync(markerFile), 'cleanup command should have executed and created the marker file');
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

