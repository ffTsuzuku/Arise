const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createContext } = require('../lib/context');

test('Execution Context & Symlink Management', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arise-context-test-'));
  const repoRoot = path.join(tmpDir, 'repo');
  const worktreePath = path.join(tmpDir, 'worktrees', 'feature-test');
  const sharedDir = path.join(tmpDir, 'shared');

  fs.mkdirSync(repoRoot, { recursive: true });
  fs.mkdirSync(worktreePath, { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });

  fs.writeFileSync(path.join(repoRoot, '.env'), 'APP_ENV=root\n', 'utf8');
  fs.writeFileSync(path.join(sharedDir, '.env.shared'), 'APP_ENV=shared\n', 'utf8');

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const ctx = createContext({
    worktreePath,
    repoRoot,
    bareRepo: null,
    branch: 'feature/test',
    source: 'main',
    flags: {},
    preset: {},
    config: {},
  });

  await t.test('copies file from source to target', () => {
    const src = path.join(sharedDir, '.env.shared');
    const dst = path.join(worktreePath, '.env');
    const result = ctx.copyFile(src, dst);
    assert.equal(result, true);
    assert.equal(fs.existsSync(dst), true);
    assert.equal(fs.readFileSync(dst, 'utf8'), 'APP_ENV=shared\n');
  });

  await t.test('copies file from root repository', () => {
    const result = ctx.copyFromRoot('.env', '.env.from-root');
    assert.equal(result, true);
    const targetFile = path.join(worktreePath, '.env.from-root');
    assert.equal(fs.existsSync(targetFile), true);
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'APP_ENV=root\n');
  });

  await t.test('creates symlink when destination does not exist yet', async () => {
    const symlinkPath = path.join(tmpDir, 'web', 'active-app');
    const success = await ctx.setSymlink(symlinkPath, worktreePath);
    assert.equal(success, true);
    assert.equal(fs.existsSync(symlinkPath), true);
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(symlinkPath), fs.realpathSync(worktreePath));
  });

  await t.test('updates existing symlink to point to new worktree target', async () => {
    const symlinkPath = path.join(tmpDir, 'web', 'active-app');
    const newWorktreePath = path.join(tmpDir, 'worktrees', 'feature-two');
    fs.mkdirSync(newWorktreePath, { recursive: true });

    const success = await ctx.setSymlink(symlinkPath, newWorktreePath);
    assert.equal(success, true);
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(symlinkPath), fs.realpathSync(newWorktreePath));
  });

  await t.test('replaces dangling / broken symlink without error', async () => {
    const symlinkPath = path.join(tmpDir, 'web', 'dangling-link');
    const deadTarget = path.join(tmpDir, 'deleted-target');
    fs.symlinkSync(deadTarget, symlinkPath);

    // Symlink exists as broken link
    assert.equal(fs.existsSync(symlinkPath), false);
    assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);

    const success = await ctx.setSymlink(symlinkPath, worktreePath);
    assert.equal(success, true);
    assert.equal(fs.existsSync(symlinkPath), true);
    assert.equal(fs.realpathSync(symlinkPath), fs.realpathSync(worktreePath));
  });

  await t.test('backs up directory or regular file if destination already exists and is not a symlink', async () => {
    const conflictPath = path.join(tmpDir, 'web', 'conflict-dir');
    fs.mkdirSync(conflictPath, { recursive: true });
    fs.writeFileSync(path.join(conflictPath, 'data.txt'), 'hello', 'utf8');

    const success = await ctx.setSymlink(conflictPath, worktreePath);
    assert.equal(success, true);
    assert.equal(fs.lstatSync(conflictPath).isSymbolicLink(), true);
    assert.equal(fs.realpathSync(conflictPath), fs.realpathSync(worktreePath));

    // Verify backup directory exists
    const webDirContents = fs.readdirSync(path.join(tmpDir, 'web'));
    const backupDir = webDirContents.find((name) => name.startsWith('conflict-dir_BAK_'));
    assert.ok(backupDir, 'Expected backup directory to exist');
    assert.equal(fs.existsSync(path.join(tmpDir, 'web', backupDir, 'data.txt')), true);
  });

  await t.test('removes symlink cleanly via removeSymlink', async () => {
    const symlinkPath = path.join(tmpDir, 'web', 'removable-link');
    await ctx.setSymlink(symlinkPath, worktreePath);
    assert.equal(fs.existsSync(symlinkPath), true);

    const removed = await ctx.removeSymlink(symlinkPath);
    assert.equal(removed, true);
    assert.equal(fs.existsSync(symlinkPath), false);
  });
});
