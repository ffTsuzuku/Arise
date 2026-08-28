const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { installSkill, SKILL_CONTENT } = require('../lib/skill');

test('Agent Skill Installation', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-skill-test-'));

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await t.test('installs skill locally in workspace (.agents/skills)', () => {
    const installed = installSkill({ scope: 'local', cwd: tempDir });
    assert.ok(installed.length > 0);

    const localSkillDir = path.join(tempDir, '.agents', 'skills', 'arise');
    assert.ok(fs.existsSync(localSkillDir), 'Local skill dir must exist');
    assert.ok(fs.lstatSync(localSkillDir).isSymbolicLink(), 'Local skill dir must be a symbolic link');

    const localSkillPath = path.join(localSkillDir, 'SKILL.md');
    assert.ok(fs.existsSync(localSkillPath), 'Local SKILL.md must be readable through symlink');

    const content = fs.readFileSync(localSkillPath, 'utf8');
    assert.ok(content.includes('name: arise'));
    assert.ok(content.includes('Arise Operator & Assistant Guide'));
  });

  await t.test('installs skill globally to custom homedir and sets up symlinks', () => {
    const mockHome = path.join(tempDir, 'mockhome');
    fs.mkdirSync(mockHome, { recursive: true });

    // Pre-create mock .claude dir to verify claude linking
    fs.mkdirSync(path.join(mockHome, '.claude'), { recursive: true });

    const installed = installSkill({ scope: 'global', homedir: mockHome });
    assert.ok(installed.length >= 2, 'Should install to .agents and link to .gemini and .claude');

    const globalSkillDir = path.join(mockHome, '.agents', 'skills', 'arise');
    assert.ok(fs.existsSync(globalSkillDir), 'Global skill dir must exist');
    assert.ok(fs.lstatSync(globalSkillDir).isSymbolicLink(), 'Global skill dir must be a symbolic link');

    const geminiLink = path.join(mockHome, '.gemini', 'skills', 'arise');
    assert.ok(fs.existsSync(geminiLink), 'Gemini symlink must exist');
    assert.ok(fs.lstatSync(geminiLink).isSymbolicLink(), 'Gemini link must be a symbolic link');

    const claudeLink = path.join(mockHome, '.claude', 'skills', 'arise');
    assert.ok(fs.existsSync(claudeLink), 'Claude symlink must exist');
    assert.ok(fs.lstatSync(claudeLink).isSymbolicLink(), 'Claude link must be a symbolic link');
  });
});
