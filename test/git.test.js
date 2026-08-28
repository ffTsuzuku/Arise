const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const git = require("../lib/git");

test("Git operations and worktree creation", async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "arise-git-test-"));

  t.after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const repoDir = path.join(tmpDir, "repo");
  fs.mkdirSync(repoDir, { recursive: true });
  execSync("git init -b main", { cwd: repoDir, stdio: "ignore" });
  execSync("git config user.email \"test@example.com\"", { cwd: repoDir, stdio: "ignore" });
  execSync("git config user.name \"Test User\"", { cwd: repoDir, stdio: "ignore" });
  fs.writeFileSync(path.join(repoDir, "README.md"), "# Test\n");
  execSync("git add README.md && git commit -m \"Initial commit\"", { cwd: repoDir, stdio: "ignore" });

  await t.test("detects existing local branch", () => {
    assert.strictEqual(git.branchExistsLocally("main", { repoDir }), true);
    assert.strictEqual(git.branchExistsLocally("non-existent", { repoDir }), false);
  });

  await t.test("creates worktree off existing local branch", () => {
    const wtPath = path.join(tmpDir, "feature-wt");
    git.createWorktree({
      worktreePath: wtPath,
      branch: "feature-1",
      source: "main",
      repoDir,
    });

    assert.strictEqual(fs.existsSync(wtPath), true);
    assert.strictEqual(git.branchExistsLocally("feature-1", { repoDir }), true);
  });

  await t.test("throws helpful error when base source branch does not exist", () => {
    const wtPath = path.join(tmpDir, "invalid-wt");
    assert.throws(
      () => {
        git.createWorktree({
          worktreePath: wtPath,
          branch: "feature-2",
          source: "non-existent-source",
          repoDir,
        });
      },
      {
        message: /Base branch or ref "non-existent-source" does not exist locally or on remote/,
      }
    );
  });

  await t.test("removes worktree and deletes local branch", () => {
    const wtPath = path.join(tmpDir, "feature-wt");
    git.removeWorktree(wtPath, { force: true, repoDir });
    git.pruneWorktrees({ repoDir });
    assert.strictEqual(fs.existsSync(wtPath), false);

    git.deleteLocalBranch("feature-1", { repoDir });
    assert.strictEqual(git.branchExistsLocally("feature-1", { repoDir }), false);
  });
});
