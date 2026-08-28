const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/cli');
const { builtInPresets } = require('../presets');

const BASE_DIR = path.resolve(__dirname, '..');

test('Documentation & Type Synchronization Verification', async (t) => {
  await t.test('types.d.ts contains all parsed CLI flags', () => {
    const typesPath = path.join(BASE_DIR, 'types.d.ts');
    assert.ok(fs.existsSync(typesPath), 'types.d.ts must exist');

    const typesContent = fs.readFileSync(typesPath, 'utf8');
    const parsedFlags = parseArgs([]);

    for (const flagKey of Object.keys(parsedFlags)) {
      const flagRegex = new RegExp(`\\b${flagKey}\\b`);
      assert.ok(
        flagRegex.test(typesContent),
        `Flag "${flagKey}" from lib/cli.js is missing in types.d.ts (CliFlags interface)`
      );
    }
  });

  await t.test('all built-in presets conform to Preset structure', () => {
    assert.ok(Array.isArray(builtInPresets) && builtInPresets.length > 0);

    for (const preset of builtInPresets) {
      assert.ok(preset.name, 'Preset must have a name');
      assert.equal(typeof preset.detect, 'function', `Preset "${preset.name}" must have a detect function`);
      assert.ok(preset.repo, `Preset "${preset.name}" must define repo configuration`);
      assert.ok(Array.isArray(preset.layout), `Preset "${preset.name}" must define a layout array`);
    }
  });

  await t.test('all primary documentation files exist and are populated', () => {
    const requiredDocs = [
      'AGENTS.md',
      'README.md',
      'types.d.ts',
      'worktree.schema.json',
      '.cursorrules',
      'CLAUDE.md',
      '.github/copilot-instructions.md',
      'docs/architecture.md',
      'docs/preset-guide.md',
      'docs/config-reference.md',
    ];

    for (const docFile of requiredDocs) {
      const fullPath = path.join(BASE_DIR, docFile);
      assert.ok(fs.existsSync(fullPath), `Required documentation file "${docFile}" is missing`);
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 50, `Documentation file "${docFile}" is empty or too short`);
    }
  });

  await t.test('worktree.schema.json is valid JSON with required top-level keys', () => {
    const schemaPath = path.join(BASE_DIR, 'worktree.schema.json');
    const content = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(content);

    assert.ok(schema.properties.preset, 'schema must define preset property');
    assert.ok(schema.properties.repo, 'schema must define repo property');
    assert.ok(schema.properties.workspace, 'schema must define workspace property');
    assert.ok(schema.properties.layout, 'schema must define layout property');
    assert.ok(schema.properties.scaffold, 'schema must define scaffold property');
  });

  await t.test('package.json conforms to npm distribution requirements', () => {
    const pkgPath = path.join(BASE_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.bin && pkg.bin['herdr-worktree'], 'must define herdr-worktree in bin');
    assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'must specify files whitelist');
    assert.ok(pkg.engines && pkg.engines.node, 'must specify engines.node');

    for (const fileOrDir of pkg.files) {
      const fullPath = path.join(BASE_DIR, fileOrDir);
      assert.ok(fs.existsSync(fullPath), `Packaged path "${fileOrDir}" must exist`);
    }
  });
});
