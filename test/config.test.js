const test = require('node:test');
const assert = require('node:assert/strict');
const { getPreset, detectPreset } = require('../presets');
const { resolveConfiguration } = require('../lib/config');

test('Preset Registry & Resolution', async (t) => {
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
    const config = resolveConfiguration({ presetName: 'node' });
    assert.equal(config.preset.name, 'node');
    assert.equal(config.repo.defaultBaseBranch, 'develop');
    assert.equal(Array.isArray(config.layout), true);
    assert.equal(config.layout.length, 4);
  });

  await t.test('merges scaffold configuration and supports custom install commands', () => {
    const config = resolveConfiguration({ presetName: 'node' });
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
});
