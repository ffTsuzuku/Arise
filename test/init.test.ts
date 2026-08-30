import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ANSI, stripAnsi, visibleLength, truncate, drawBox } from '../src/tui/ansi.js';
import { createPathCompleter, promptSelect, promptMultiSelect, promptConfirm, promptText } from '../src/tui/prompt.js';
import { ConfigInitWizard } from '../src/config/init.js';

describe('ANSI & Terminal Utilities (TypeScript)', () => {
  it('strips ANSI codes accurately', () => {
    const colored = `${ANSI.bold}${ANSI.cyan}Hello${ANSI.reset} ${ANSI.green}World!${ANSI.reset}`;
    assert.equal(stripAnsi(colored), 'Hello World!');
    assert.equal(visibleLength(colored), 12);
  });

  it('renders Unicode drawBox correctly', () => {
    const card = drawBox('Summary', ['Line 1', 'Line 2'], 40);
    assert.ok(Array.isArray(card));
    assert.ok(card[0]!.startsWith('┌'));
    assert.ok(card[card.length - 1]!.startsWith('└'));
  });
});

describe('Prompt Primitives Fallback (TypeScript)', () => {
  it('returns default fallback in non-interactive environment', async () => {
    const sel = await promptSelect({
      message: 'Select',
      choices: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }],
      defaultIndex: 0,
    });
    assert.equal(sel, 'a');

    const multi = await promptMultiSelect({
      message: 'Multi',
      choices: [{ label: '1', value: '1', selected: true }],
    });
    assert.deepEqual(multi, ['1']);

    const text = await promptText({
      message: 'Name',
      defaultValue: 'default',
    });
    assert.equal(text, 'default');

    const confirm = await promptConfirm({
      message: 'Continue?',
      defaultYes: true,
    });
    assert.equal(confirm, true);
  });
});

describe('ConfigInitWizard (TypeScript)', () => {
  it('creates configuration file in quick mode', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'arise-ts-init-'));
    const targetPath = join(tempDir, '.ariserc.json');

    const result = await ConfigInitWizard.run({
      quick: true,
      local: true,
      targetPath,
      cwd: tempDir,
      force: true,
    });

    assert.equal(result, targetPath);
    assert.ok(existsSync(targetPath));

    const content = readFileSync(targetPath, 'utf8');
    assert.ok(content.includes('// Arise Configuration'));

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds config to .gitignore in quick mode when gitignore option is true', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'arise-ts-init-git-'));
    const targetPath = join(tempDir, '.ariserc.json');
    const gitignorePath = join(tempDir, '.gitignore');
    writeFileSync(gitignorePath, 'node_modules/\n', 'utf8');

    const result = await ConfigInitWizard.run({
      quick: true,
      local: true,
      targetPath,
      cwd: tempDir,
      force: true,
      gitignore: true,
    });

    assert.equal(result, targetPath);
    assert.ok(existsSync(gitignorePath));
    const gitignoreContent = readFileSync(gitignorePath, 'utf8');
    assert.ok(gitignoreContent.includes('.ariserc.json'));

    rmSync(tempDir, { recursive: true, force: true });
  });
});
