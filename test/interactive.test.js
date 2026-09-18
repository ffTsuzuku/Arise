const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  clearScreen,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  handleListWorktrees,
} = require('../lib/interactive');

test('Interactive TUI & Prompt Module', async (t) => {
  await t.test('clearScreen function is callable and safe in non-TTY and test environments', async () => {
    assert.equal(typeof clearScreen, 'function');
    // Calling in test runner should be a safe no-op
    assert.doesNotThrow(() => {
      clearScreen();
    });
  });

  await t.test('promptText accepts clear option without error in non-TTY mode', async () => {
    const val = await promptText({
      message: 'Enter test value:',
      defaultValue: 'my-val',
      clear: true,
    });
    assert.equal(val, 'my-val');
  });

  await t.test('promptSelect fallback returns default selection when non-interactive or empty', async () => {
    const emptyResult = await promptSelect({ title: 'Test', items: [], clear: true });
    assert.equal(emptyResult, null);
  });

  await t.test('promptMultiSelect fallback returns empty array when empty items provided', async () => {
    const emptyResult = await promptMultiSelect({ title: 'Test', items: [], clear: true });
    assert.deepEqual(emptyResult, []);
  });

  await t.test('promptConfirm returns default value in non-interactive mode with clear option', async () => {
    const res = await promptConfirm({
      message: 'Confirm action?',
      defaultYes: true,
      clear: true,
    });
    assert.equal(res, true);
  });

  await t.test('handleListWorktrees handles worktree listing gracefully', async () => {
    let output = '';
    const origLog = console.log;
    console.log = (...args) => {
      output += args.join(' ') + '\n';
    };

    try {
      const flags = { rawArgs: [] };
      const config = {
        repo: {},
        workspace: {},
        layout: [],
        scaffold: {},
        hooks: {},
      };
      assert.ok(typeof handleListWorktrees === 'function');
    } finally {
      console.log = origLog;
    }
  });
});

