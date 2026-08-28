const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../lib/cli');

test('CLI Argument Parsing', async (t) => {
  await t.test('parses branch creation arguments correctly', () => {
    const flags = parseArgs(['--branch', 'feature/login', '--dirname', 'my-login', '--source', 'develop', '--focus', 'vim']);
    assert.equal(flags.branch, 'feature/login');
    assert.equal(flags.dirname, 'my-login');
    assert.equal(flags.source, 'develop');
    assert.equal(flags.focusTarget, 'vim');
    assert.equal(flags.isCleanup, false);
  });

  await t.test('parses short flags correctly', () => {
    const flags = parseArgs(['-b', 'feature/auth', '-d', 'auth-dir', '-s', 'prod', '-p', 'laravel', '--focus', 'logs']);
    assert.equal(flags.branch, 'feature/auth');
    assert.equal(flags.dirname, 'auth-dir');
    assert.equal(flags.source, 'prod');
    assert.equal(flags.presetName, 'laravel');
    assert.equal(flags.focusTarget, 'logs');
  });

  await t.test('parses nuke arguments with flags', () => {
    const flags = parseArgs(['--nuke', 'feature-auth', '--dir-only', '--force']);
    assert.equal(flags.isCleanup, true);
    assert.equal(flags.cleanupTarget, 'feature-auth');
    assert.equal(flags.dirOnly, true);
    assert.equal(flags.force, true);
  });

  await t.test('parses cleanup aliases and short force flag', () => {
    const flags = parseArgs(['-c', 'feature-test', '--keep-remote', '-f']);
    assert.equal(flags.isCleanup, true);
    assert.equal(flags.cleanupTarget, 'feature-test');
    assert.equal(flags.keepRemote, true);
    assert.equal(flags.force, true);
  });

  await t.test('parses help and version flags', () => {
    const flagsHelp = parseArgs(['--help']);
    assert.equal(flagsHelp.showHelp, true);

    const flagsVersion = parseArgs(['-v']);
    assert.equal(flagsVersion.showVersion, true);
  });

  await t.test('parses skill installation flags and scopes', () => {
    const flagsDefault = parseArgs(['--install-skill']);
    assert.equal(flagsDefault.installSkill, true);
    assert.equal(flagsDefault.skillScope, 'global');

    const flagsShort = parseArgs(['-i', '--local']);
    assert.equal(flagsShort.installSkill, true);
    assert.equal(flagsShort.skillScope, 'local');

    const flagsAlias = parseArgs(['--setup-skill', '--workspace']);
    assert.equal(flagsAlias.installSkill, true);
    assert.equal(flagsAlias.skillScope, 'local');
  });
});
