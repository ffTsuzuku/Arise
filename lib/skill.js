const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_CONTENT = `---
name: arise
description: User guide, CLI reference, and command executor for the \`arise\` utility (Git worktree and Herdr workspace orchestrator). Activate this skill whenever the user asks questions about how to use arise, how worktree orchestration works, how to configure \`.ariserc.json\` or \`.worktreerc.json\`, or asks the assistant to create, switch to, or nuke/clean up Git worktrees and Herdr workspaces on their behalf.
---

# Arise Operator & Assistant Guide

Use this skill to answer questions about \`arise\` and run worktree management commands on the user's behalf.

---

## 1. CLI Quick Reference & Cheatsheet

### Creating Worktrees
\`\`\`bash
# Create or open a worktree for a branch (auto-detects preset, boots Herdr workspace)
arise --branch <branch-name>

# Create worktree based off a specific base branch (e.g. develop, prod, main)
arise --branch <branch-name> --base <base-branch>

# Custom directory name or workspace name
arise -b <branch-name> -d <dir-name> -w <workspace-name>

# Explicit preset or pane focus ('agy', 'vim', 'logs', 'server', 'shell')
arise -b <branch-name> --preset laravel --focus agy
\`\`\`

### Nuking / Teardown
\`\`\`bash
# Nuke active worktree (when run inside a worktree directory)
arise --nuke

# Nuke specific worktree by branch or directory name
arise --nuke <branch-or-dir>

# Remove directory only (keep local and remote git branches)
arise --nuke <target> --dir-only

# Delete local branch and directory, but keep remote branch on origin
arise --nuke <target> --keep-remote

# Force removal even if uncommitted changes exist
arise --nuke <target> --force
\`\`\`

---

## 2. Configuration (\`.ariserc.json\` / \`.worktreerc.json\` / \`arise.config.js\`)

Projects can configure custom topology, bare repos, and layouts via \`.ariserc.json\` or \`.worktreerc.json\` in the repository root or base directory:

\`\`\`json
{
  "preset": "laravel",
  "repo": {
    "bareRepo": "/path/to/bare.git",
    "worktreesBase": "/path/to/worktrees",
    "defaultBaseBranch": "develop",
    "protectedBranches": ["main", "master", "develop", "prod", "staging"]
  },
  "workspace": {
    "labelPrefix": "[API] ",
    "defaultFocus": "agy"
  },
  "scaffold": {
    "envSource": "/path/to/shared/.env",
    "symlink": "/path/to/webserver/symlink",
    "install": "composer install --no-interaction"
  }
}
\`\`\`

---

## 3. How to Assist the User

### When the User Asks Questions:
1. Consult the CLI options and configuration schema above.
2. If working inside a repository with local documentation or \`.ariserc.json\` / \`.worktreerc.json\`, inspect those files.
3. Provide clear explanations with executable CLI examples and config snippets.

### When the User Asks You to Perform an Action:
1. Formulate the appropriate \`arise\` CLI command.
2. Execute the command on behalf of the user using the available command runner.
3. Confirm the status of the created or nuked worktree and Herdr workspace.
`;

function ensureSourceSkillExists(repoRoot) {
  const sourceDir = path.join(repoRoot, 'skills', 'arise');
  const sourceFile = path.join(sourceDir, 'SKILL.md');
  if (fs.existsSync(sourceFile)) {
    return sourceDir;
  }
  try {
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(sourceFile, SKILL_CONTENT, 'utf8');
  } catch (err) {
    // Proceed with sourceDir even if write fails (e.g. read-only global node_modules)
  }
  return sourceDir;
}

function safeSymlink(target, linkPath) {
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath).isSymbolicLink()) {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch (err) {
    // If doesn't exist, proceed
  }
  fs.symlinkSync(target, linkPath, 'dir');
}

function installSkill(options = {}) {
  const scope = options.scope || 'global';
  const cwd = options.cwd || process.cwd();
  const homedir = options.homedir || os.homedir();
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..');

  const sourceDir = ensureSourceSkillExists(repoRoot);
  const installedPaths = [];

  if (scope === 'local' || scope === 'workspace') {
    const localAgentsSkillsDir = path.join(cwd, '.agents', 'skills');
    fs.mkdirSync(localAgentsSkillsDir, { recursive: true });
    const localLink = path.join(localAgentsSkillsDir, 'arise');

    try {
      safeSymlink(sourceDir, localLink);
      installedPaths.push(localLink);
      console.log(`✓ Symlinked local agent skill: ${localLink} -> ${sourceDir}`);
    } catch (err) {
      // Fallback to direct file copy if symlink creation fails
      const fallbackFile = path.join(localLink, 'SKILL.md');
      fs.mkdirSync(localLink, { recursive: true });
      fs.writeFileSync(fallbackFile, SKILL_CONTENT, 'utf8');
      installedPaths.push(fallbackFile);
      console.log(`✓ Installed local agent skill (copy): ${fallbackFile}`);
    }
  } else {
    // Universal ~/.agents/skills/ directory
    const globalAgentsSkillsDir = path.join(homedir, '.agents', 'skills');
    fs.mkdirSync(globalAgentsSkillsDir, { recursive: true });
    const globalAgentsLink = path.join(globalAgentsSkillsDir, 'arise');

    try {
      safeSymlink(sourceDir, globalAgentsLink);
      installedPaths.push(globalAgentsLink);
      console.log(`✓ Symlinked global agent skill: ${globalAgentsLink} -> ${sourceDir}`);
    } catch (err) {
      // Fallback to copy if symlink permissions fail
      const fallbackDir = path.join(globalAgentsSkillsDir, 'arise');
      fs.mkdirSync(fallbackDir, { recursive: true });
      const targetFile = path.join(fallbackDir, 'SKILL.md');
      fs.writeFileSync(targetFile, SKILL_CONTENT, 'utf8');
      installedPaths.push(targetFile);
      console.log(`✓ Installed global agent skill (copy): ${targetFile}`);
    }

    // Link ~/.gemini/skills/arise for Antigravity CLI (agy)
    const geminiSkillsDir = path.join(homedir, '.gemini', 'skills');
    try {
      fs.mkdirSync(geminiSkillsDir, { recursive: true });
      const geminiLink = path.join(geminiSkillsDir, 'arise');
      safeSymlink(globalAgentsLink, geminiLink);
      installedPaths.push(geminiLink);
      console.log(`✓ Linked to Antigravity skills: ${geminiLink} -> ${globalAgentsLink}`);
    } catch (err) {
      // Non-fatal
    }

    // Link ~/.claude/skills/arise if Claude exists
    const claudeDir = path.join(homedir, '.claude');
    if (fs.existsSync(claudeDir)) {
      try {
        const claudeSkillsDir = path.join(claudeDir, 'skills');
        fs.mkdirSync(claudeSkillsDir, { recursive: true });
        const claudeLink = path.join(claudeSkillsDir, 'arise');
        safeSymlink(globalAgentsLink, claudeLink);
        installedPaths.push(claudeLink);
        console.log(`✓ Linked to Claude skills: ${claudeLink} -> ${globalAgentsLink}`);
      } catch (err) {
        // Non-fatal
      }
    }
  }

  return installedPaths;
}

module.exports = {
  SKILL_CONTENT,
  ensureSourceSkillExists,
  installSkill,
};
