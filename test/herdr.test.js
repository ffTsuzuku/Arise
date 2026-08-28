const test = require('node:test');
const assert = require('node:assert/strict');
const herdr = require('../lib/herdr');

test('Herdr Installation & Utility Functions', async (t) => {
  await t.test('isHerdrInstalled returns a boolean', () => {
    const isInstalled = herdr.isHerdrInstalled();
    assert.equal(typeof isInstalled, 'boolean');
  });

  await t.test('getRecommendedInstallCommand returns platform-specific install command', () => {
    const recommendation = herdr.getRecommendedInstallCommand();
    assert.ok(recommendation);
    assert.equal(typeof recommendation.name, 'string');
    assert.equal(typeof recommendation.cmd, 'string');
    assert.equal(typeof recommendation.docsUrl, 'string');
    assert.ok(recommendation.docsUrl.startsWith('https://herdr.dev/docs/install'));
  });

  await t.test('ensureHerdrInstalled returns true if already installed', async () => {
    if (herdr.isHerdrInstalled()) {
      const result = await herdr.ensureHerdrInstalled();
      assert.equal(result, true);
    }
  });
});
