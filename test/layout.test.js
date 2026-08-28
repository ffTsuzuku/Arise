const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_QUADRANT_LAYOUT } = require('../lib/layout');

test('Declarative Layout System', async (t) => {
  await t.test('has standard 4-pane default quadrant layout', () => {
    assert.equal(Array.isArray(DEFAULT_QUADRANT_LAYOUT), true);
    assert.equal(DEFAULT_QUADRANT_LAYOUT.length, 4);

    const rootPane = DEFAULT_QUADRANT_LAYOUT.find(p => p.position === 'root');
    assert.ok(rootPane);
    assert.equal(rootPane.id, 'vim');

    const splitPanes = DEFAULT_QUADRANT_LAYOUT.filter(p => p.from);
    assert.equal(splitPanes.length, 3);

    const agentPane = DEFAULT_QUADRANT_LAYOUT.find(p => p.isAgent);
    assert.ok(agentPane);
    assert.equal(agentPane.id, 'agy');
  });
});
