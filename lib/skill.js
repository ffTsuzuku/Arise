const { p } = require('./tui/prompt');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SKILL_CONTENT = `---
name: arise
description: User guide, CLI reference, and command executor for the \`arise\` utility (Universal terminal workspace bootstrapper across tmux and Herdr with Git worktree plugin). Activate this skill whenever the user asks questions about how to use arise, how session or worktree orchestration works, how to configure \`.ariserc.json\` or \`arise.config.js\`, or asks the assistant to boot, switch to, or manage sessions and Git worktrees on their behalf.
---

# Arise Operator & Assistant Guide

Use this skill to answer questions about \`arise\` and run session or worktree management commands on the user's behalf.

---

## 1. CLI Quick Reference & Cheatsheet

### Bootstrapping Sessions (Directory-First)
\`\`\`bash
# Bootstrap session in current directory (auto-detects project preset, boots tmux or Herdr)
arise

# Specify preferred multiplexer ('tmux', 'herdr', or 'auto')
arise --mux tmux
arise --mux herdr

# Bootstrap session for specific directory
arise /path/to/project --name my-session
\`\`\`

### Interactive Mode
\`\`\`bash
# Launch interactive menu (launch session, switch session, worktrees, config wizard)
arise
\`\`\`

### Git Worktree Subcommands (Worktree Plugin)
\`\`\`bash
# Subcommands:
arise worktree create <branch> [--base <source>]
arise worktree list
arise worktree switch <branch>
arise worktree nuke [<branch-or-dir>] [--force]

# Or via classic flags:
arise --branch <branch-name> [--base <base-branch>]
arise --nuke [<branch-or-dir>] [--force]
\`\`\`

### Session Management & Nuking
\`\`\`bash
# List active sessions
arise sessions
# (or arise --sessions)

# Close / kill active session
arise kill <session-name>
# (or arise --kill <session-name>)

# Nuke active worktree (when run inside a worktree directory)
arise worktree nuke
# (or arise --nuke)
\`\`\`

---

## 2. Configuration (\`.ariserc.json\` / \`arise.config.js\`)

\`\`\`json
{
  "multiplexer": "tmux",
  "plugins": ["worktree"],
  "preset": "laravel",
  "workspace": {
    "labelPrefix": "[API] ",
    "agent": "agy",
    "defaultFocus": "agy"
  },
  "setup": [
    "cp .env.example .env",
    "composer install --no-interaction"
  ],
  "cleanup": [
    "docker compose down -v"
  ]
}
\`\`\`

---

## 3. How to Assist the User

### When the User Asks Questions:
1. Consult the CLI options and configuration schema above.
2. If working inside a repository with local documentation or \`.ariserc.json\` / \`arise.config.js\`, inspect those files.
3. Provide clear explanations with executable CLI examples and config snippets.

### When the User Asks You to Perform an Action:
1. Formulate the appropriate \`arise\` CLI command.
2. Execute the command on behalf of the user using the available command runner.
3. Confirm the status of the created or closed session and worktree.
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
      p.log.success(`Symlinked local agent skill: ${localLink} -> ${sourceDir}`);
    } catch (err) {
      // Fallback to direct file copy if symlink creation fails
      const fallbackFile = path.join(localLink, 'SKILL.md');
      fs.mkdirSync(localLink, { recursive: true });
      fs.writeFileSync(fallbackFile, SKILL_CONTENT, 'utf8');
      installedPaths.push(fallbackFile);
      p.log.success(`Installed local agent skill (copy): ${fallbackFile}`);
    }
  } else {
    // Universal ~/.agents/skills/ directory
    const globalAgentsSkillsDir = path.join(homedir, '.agents', 'skills');
    fs.mkdirSync(globalAgentsSkillsDir, { recursive: true });
    const globalAgentsLink = path.join(globalAgentsSkillsDir, 'arise');

    try {
      safeSymlink(sourceDir, globalAgentsLink);
      installedPaths.push(globalAgentsLink);
      p.log.success(`Symlinked global agent skill: ${globalAgentsLink} -> ${sourceDir}`);
    } catch (err) {
      // Fallback to copy if symlink permissions fail
      const fallbackDir = path.join(globalAgentsSkillsDir, 'arise');
      fs.mkdirSync(fallbackDir, { recursive: true });
      const targetFile = path.join(fallbackDir, 'SKILL.md');
      fs.writeFileSync(targetFile, SKILL_CONTENT, 'utf8');
      installedPaths.push(targetFile);
      p.log.success(`Installed global agent skill (copy): ${targetFile}`);
    }

    // Link ~/.gemini/skills/arise for Antigravity CLI (agy)
    const geminiSkillsDir = path.join(homedir, '.gemini', 'skills');
    try {
      fs.mkdirSync(geminiSkillsDir, { recursive: true });
      const geminiLink = path.join(geminiSkillsDir, 'arise');
      safeSymlink(globalAgentsLink, geminiLink);
      installedPaths.push(geminiLink);
      p.log.success(`Linked to Antigravity skills: ${geminiLink} -> ${globalAgentsLink}`);
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
        p.log.success(`Linked to Claude skills: ${claudeLink} -> ${globalAgentsLink}`);
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
