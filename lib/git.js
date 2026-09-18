const { p } = require('./tui/prompt');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function isBareRepo(repoPath) {
  if (!repoPath || !fs.existsSync(repoPath)) return false;
  try {
    const isBare = execSync(`git --git-dir="${repoPath}" rev-parse --is-bare-repository`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return isBare === 'true';
  } catch (e) {
    return false;
  }
}

function getLocalBranches(options = {}) {
  const gitCmd = getGitPrefix(options);
  if (!gitCmd) return [];
  try {
    const output = execSync(`${gitCmd} branch --format="%(refname:short)"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!output) return [];
    return output.split('\n').map(b => b.trim()).filter(Boolean);
  } catch (err) {
    return [];
  }
}

function getGitPrefix(options = {}) {
  if (options.bareRepo && fs.existsSync(options.bareRepo) && isBareRepo(options.bareRepo)) {
    return `git --git-dir="${options.bareRepo}"`;
  }
  if (options.repoDir && fs.existsSync(options.repoDir)) {
    const dotBare = path.join(options.repoDir, '.bare');
    if (fs.existsSync(dotBare) && isBareRepo(dotBare)) {
      return `git --git-dir="${dotBare}"`;
    }
    if (isBareRepo(options.repoDir)) {
      return `git --git-dir="${options.repoDir}"`;
    }
    return `git -C "${options.repoDir}"`;
  }
  if ('repoDir' in options || 'bareRepo' in options) {
    return null;
  }
  return 'git';
}

function isGitRepo(cwd = process.cwd()) {
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function hasUncommittedChanges(worktreePath) {
  if (!worktreePath || !fs.existsSync(worktreePath)) return false;
  try {
    const status = execSync(`git -C "${worktreePath}" status --porcelain`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

function getWorkingTreeRoot(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function getRepoRootDir(cwd = process.cwd(), bareRepo = null) {
  if (bareRepo && fs.existsSync(bareRepo)) {
    return bareRepo;
  }
  const dotBare = path.join(cwd, '.bare');
  if (fs.existsSync(dotBare)) {
    return cwd;
  }
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const absoluteCommonDir = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    if (isBareRepo(absoluteCommonDir)) {
      return absoluteCommonDir;
    }
    return path.dirname(absoluteCommonDir);
  } catch (err) {
    try {
      const topLevel = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (topLevel) return topLevel;
    } catch {}
    return null;
  }
}

function getWorktrees(options = {}) {
  const gitCmd = getGitPrefix(options);
  if (!gitCmd) return [];
  try {
    const output = execSync(`${gitCmd} worktree list --porcelain`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const worktrees = [];
    const entries = output.trim().split('\n\n');
    for (const entry of entries) {
      if (!entry.trim()) continue;
      const lines = entry.split('\n');
      let wtPath = null;
      let wtBranch = null;
      let isBare = false;
      let isDetached = false;
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.substring('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          const ref = line.substring('branch '.length).trim();
          wtBranch = ref.replace(/^refs\/heads\//, '');
        } else if (line === 'bare') {
          isBare = true;
        } else if (line === 'detached') {
          isDetached = true;
        }
      }
      if (wtPath) {
        worktrees.push({ path: wtPath, branch: wtBranch, isBare, isDetached });
      }
    }
    return worktrees;
  } catch (err) {
    // Fallback to standard worktree list if porcelain fails
    try {
      const output = execSync(`${gitCmd} worktree list`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return output.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split(/\s+/);
        const wtPath = parts[0];
        const branchMatch = line.match(/\[(.*?)\]/);
        const wtBranch = branchMatch ? branchMatch[1] : null;
        return { path: wtPath, branch: wtBranch, isBare: line.includes('(bare)'), isDetached: line.includes('(detached)') };
      });
    } catch (e) {
      return [];
    }
  }
}

function fetchOrigin(options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    const remotes = execSync(`${gitCmd} remote`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\s+/);
    if (!remotes.includes('origin')) return;

    // In bare repos, remote.origin.fetch is often not set by default.
    // Setting or fetching with the standard refspec ensures refs/remotes/origin/* are populated.
    try {
      const fetchRefspec = execSync(`${gitCmd} config --get remote.origin.fetch`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (!fetchRefspec) {
        execSync(`${gitCmd} config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`, { stdio: 'ignore' });
      }
    } catch (e) {
      try {
        execSync(`${gitCmd} config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"`, { stdio: 'ignore' });
      } catch (err) {}
    }

    execSync(`${gitCmd} fetch origin`, { stdio: 'inherit' });
  } catch (e) {
    // Network or remote fetch error - continue gracefully with local refs
  }
}

function branchExistsLocally(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} rev-parse --verify "refs/heads/${branch}"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      execSync(`${gitCmd} rev-parse --verify "${branch}"`, { stdio: 'ignore' });
      return true;
    } catch (err) {
      try {
        const list = execSync(`${gitCmd} branch --list "${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return list !== '';
      } catch (err2) {
        return false;
      }
    }
  }
}

function branchExistsRemotely(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} rev-parse --verify "refs/remotes/origin/${branch}"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      execSync(`${gitCmd} rev-parse --verify "origin/${branch}"`, { stdio: 'ignore' });
      return true;
    } catch (err) {
      try {
        const remoteList = execSync(`${gitCmd} branch -r --list "origin/${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (remoteList) return true;
        const lsRemote = execSync(`${gitCmd} ls-remote --heads origin "${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return Boolean(lsRemote);
      } catch (err2) {
        return false;
      }
    }
  }
}

function createWorktree({ worktreePath, branch, source = 'develop', repoDir, bareRepo }) {
  const options = { repoDir, bareRepo };
  const gitCmd = getGitPrefix(options);

  p.log.info('Fetching latest from origin...');
  fetchOrigin(options);

  const localExists = branchExistsLocally(branch, options);
  const remoteExists = branchExistsRemotely(branch, options);

  if (localExists) {
    p.log.info(`Branch "${branch}" exists locally. Adding worktree...`);
    execSync(`${gitCmd} worktree add "${worktreePath}" "${branch}"`, { stdio: 'inherit' });
  } else if (remoteExists) {
    p.log.info(`Branch "${branch}" exists on remote. Checking out and adding worktree...`);
    let startPoint = `origin/${branch}`;
    try {
      execSync(`${gitCmd} rev-parse --verify "${startPoint}"`, { stdio: 'ignore' });
    } catch (e) {
      startPoint = branch;
    }
    if (bareRepo) {
      execSync(`${gitCmd} branch --track "${branch}" "${startPoint}"`, { stdio: 'inherit' });
      execSync(`${gitCmd} worktree add "${worktreePath}" "${branch}"`, { stdio: 'inherit' });
    } else {
      execSync(`${gitCmd} worktree add "${worktreePath}" -b "${branch}" "${startPoint}"`, { stdio: 'inherit' });
    }
  } else {
    // Creating a brand new branch off source
    let startPoint = null;
    try {
      execSync(`${gitCmd} rev-parse --verify "origin/${source}"`, { stdio: 'ignore' });
      startPoint = `origin/${source}`;
    } catch (e) {
      try {
        execSync(`${gitCmd} rev-parse --verify "${source}"`, { stdio: 'ignore' });
        startPoint = source;
      } catch (err) {
        throw new Error(`Cannot create branch "${branch}" off "${source}": Base branch or ref "${source}" does not exist locally or on remote.`);
      }
    }

    p.log.info(`Creating branch "${branch}" off "${startPoint}" and adding worktree...`);
    if (bareRepo) {
      execSync(`${gitCmd} branch --no-track "${branch}" "${startPoint}"`, { stdio: 'inherit' });
      execSync(`${gitCmd} worktree add "${worktreePath}" "${branch}"`, { stdio: 'inherit' });
    } else {
      execSync(`${gitCmd} worktree add "${worktreePath}" -b "${branch}" "${startPoint}"`, { stdio: 'inherit' });
    }
  }
}

function syncPrimaryBranch({ branch, worktreePath, repoDir, bareRepo, protectedBranches = [] }) {
  if (!protectedBranches.includes(branch)) return;

  p.log.info(`Primary branch "${branch}" detected. Checking for local changes...`);
  const options = { repoDir, bareRepo };
  const gitCmd = getGitPrefix(options);

  try {
    const statusCmd = bareRepo
      ? `${gitCmd} --work-tree="${worktreePath}" status --porcelain`
      : `git -C "${worktreePath}" status --porcelain`;

    const isDirty = execSync(statusCmd, { encoding: 'utf8' }).trim() !== '';

    if (isDirty) {
      p.log.warn(`WARNING: Local changes detected in ${branch}. Skipping hard reset to origin/${branch} to prevent data loss.`);
      p.log.warn(`Please commit, stash, or discard your changes if you want to sync with origin.`);
    } else {
      p.log.info(`Syncing ${branch} with origin/${branch}...`);
      fetchOrigin(options);
      const resetCmd = bareRepo
        ? `${gitCmd} --work-tree="${worktreePath}" reset --hard origin/${branch}`
        : `git -C "${worktreePath}" reset --hard origin/${branch}`;
      execSync(resetCmd, { stdio: 'inherit' });
    }
  } catch (err) {
    p.log.warn(`Warning syncing primary branch: ${err.message}`);
  }
}

function removeWorktree(target, options = {}) {
  const opts = (typeof target === 'object' && target !== null) ? target : { ...options, worktreePath: target };
  const gitCmd = getGitPrefix(opts);
  const forceFlag = opts.force ? '--force' : '';
  const wtPath = opts.worktreePath;
  try {
    execSync(`${gitCmd} worktree remove ${forceFlag} "${wtPath}"`, { stdio: 'inherit' });
    p.log.info(`Successfully removed git worktree at "${wtPath}".`);
  } catch (err) {
    p.log.warn(`"git worktree remove" standard attempt failed. Trying force removal...`);
    try {
      execSync(`${gitCmd} worktree remove --force "${wtPath}"`, { stdio: 'inherit' });
      p.log.info(`Successfully force-removed git worktree.`);
    } catch (e) {
      p.log.warn(`Git worktree force remove warning: ${e.message}`);
    }
  }
}

function pruneWorktrees(options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} worktree prune`, { stdio: 'ignore' });
  } catch (e) {}
}

function deleteLocalBranch(target, options = {}) {
  const opts = (typeof target === 'object' && target !== null) ? target : { ...options, branch: target };
  const gitCmd = getGitPrefix(opts);
  const branch = opts.branch;
  try {
    execSync(`${gitCmd} branch -D "${branch}"`, { stdio: 'inherit' });
    p.log.info(`Deleted local branch "${branch}".`);
  } catch (err) {
    p.log.error(`Failed to delete local branch "${branch}": ${err.message}`);
  }
}

function deleteRemoteBranch(target, options = {}) {
  const opts = (typeof target === 'object' && target !== null) ? target : { ...options, branch: target };
  const gitCmd = getGitPrefix(opts);
  const branch = opts.branch;
  try {
    execSync(`${gitCmd} push origin --delete "${branch}"`, { stdio: 'inherit' });
    p.log.info(`Deleted remote branch "${branch}" from origin.`);
  } catch (err) {
    p.log.error(`Failed to delete remote branch "${branch}": ${err.message}`);
  }
}

function ensureGitExclude(repoDir, pattern) {
  if (!repoDir || !pattern) return;
  try {
    const relOrAbs = execSync(`git -C "${repoDir}" rev-parse --git-path info/exclude`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!relOrAbs) return;
    const excludeFile = path.isAbsolute(relOrAbs) ? relOrAbs : path.resolve(repoDir, relOrAbs);
    const infoDir = path.dirname(excludeFile);
    if (!fs.existsSync(infoDir)) {
      fs.mkdirSync(infoDir, { recursive: true });
    }
    let content = '';
    if (fs.existsSync(excludeFile)) {
      content = fs.readFileSync(excludeFile, 'utf8');
      const lines = content.split('\n').map((l) => l.trim());
      if (lines.includes(pattern)) {
        return;
      }
    }
    const newline = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(excludeFile, `${newline}${pattern}\n`, 'utf8');
  } catch (err) {
    // Ignore error if git-path or file writing fails
  }
}

module.exports = {
  getGitPrefix,
  getWorkingTreeRoot,
  getRepoRootDir,
  getWorktrees,
  fetchOrigin,
  branchExistsLocally,
  branchExistsRemotely,
  createWorktree,
  syncPrimaryBranch,
  removeWorktree,
  pruneWorktrees,
  deleteLocalBranch,
  deleteRemoteBranch,
  getLocalBranches,
  isBareRepo,
  isGitRepo,
  hasUncommittedChanges,
  ensureGitExclude,
};
