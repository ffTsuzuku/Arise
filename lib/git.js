const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitPrefix(options = {}) {
  if (options.bareRepo) {
    return `git --git-dir="${options.bareRepo}"`;
  }
  if (options.repoDir) {
    return `git -C "${options.repoDir}"`;
  }
  return 'git';
}

function getRepoRootDir(cwd = process.cwd(), bareRepo = null) {
  if (bareRepo && fs.existsSync(bareRepo)) {
    return bareRepo;
  }
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const absoluteCommonDir = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    return path.dirname(absoluteCommonDir);
  } catch (err) {
    return cwd;
  }
}

function getWorktrees(options = {}) {
  const gitCmd = getGitPrefix(options);
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

function branchExistsLocally(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} rev-parse --verify "${branch}"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      const list = execSync(`${gitCmd} branch --list "${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return list !== '';
    } catch (err) {
      return false;
    }
  }
}

function branchExistsRemotely(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} rev-parse --verify "origin/${branch}"`, { stdio: 'ignore' });
    return true;
  } catch (e) {
    try {
      const remoteList = execSync(`${gitCmd} branch -r --list "origin/${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (remoteList) return true;
      const lsRemote = execSync(`${gitCmd} ls-remote --heads origin "${branch}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      return Boolean(lsRemote);
    } catch (err) {
      return false;
    }
  }
}

function createWorktree({ worktreePath, branch, source = 'develop', repoDir, bareRepo }) {
  const options = { repoDir, bareRepo };
  const gitCmd = getGitPrefix(options);

  const localExists = branchExistsLocally(branch, options);
  const remoteExists = branchExistsRemotely(branch, options);

  if (localExists) {
    console.log(`Branch "${branch}" exists locally. Adding worktree...`);
    execSync(`${gitCmd} worktree add "${worktreePath}" "${branch}"`, { stdio: 'inherit' });
  } else if (remoteExists) {
    console.log(`Branch "${branch}" exists on remote. Checking out and adding worktree...`);
    execSync(`${gitCmd} worktree add "${worktreePath}" -b "${branch}" "origin/${branch}"`, { stdio: 'inherit' });
  } else {
    // Creating a brand new branch off source
    console.log('Fetching latest from origin...');
    try {
      execSync(`${gitCmd} fetch origin`, { stdio: 'inherit' });
    } catch (e) {}

    const remoteSourceExists = branchExistsRemotely(source, options);
    const startPoint = remoteSourceExists ? `origin/${source}` : source;

    console.log(`Creating branch "${branch}" off "${startPoint}" and adding worktree...`);
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

  console.log(`==> Primary branch "${branch}" detected. Checking for local changes...`);
  const options = { repoDir, bareRepo };
  const gitCmd = getGitPrefix(options);

  try {
    const statusCmd = bareRepo
      ? `${gitCmd} --work-tree="${worktreePath}" status --porcelain`
      : `git -C "${worktreePath}" status --porcelain`;

    const isDirty = execSync(statusCmd, { encoding: 'utf8' }).trim() !== '';

    if (isDirty) {
      console.warn(`==> WARNING: Local changes detected in ${branch}. Skipping hard reset to origin/${branch} to prevent data loss.`);
      console.warn(`==> Please commit, stash, or discard your changes if you want to sync with origin.`);
    } else {
      console.log(`==> Syncing ${branch} with origin/${branch}...`);
      execSync(`${gitCmd} fetch origin ${branch}`, { stdio: 'inherit' });
      const resetCmd = bareRepo
        ? `${gitCmd} --work-tree="${worktreePath}" reset --hard origin/${branch}`
        : `git -C "${worktreePath}" reset --hard origin/${branch}`;
      execSync(resetCmd, { stdio: 'inherit' });
    }
  } catch (err) {
    console.warn(`==> Warning syncing primary branch: ${err.message}`);
  }
}

function removeWorktree(worktreePath, options = {}) {
  const gitCmd = getGitPrefix(options);
  const forceFlag = options.force ? '--force' : '';
  try {
    execSync(`${gitCmd} worktree remove ${forceFlag} "${worktreePath}"`, { stdio: 'inherit' });
    console.log(`Successfully removed git worktree at "${worktreePath}".`);
  } catch (err) {
    console.warn(`"git worktree remove" standard attempt failed. Trying force removal...`);
    try {
      execSync(`${gitCmd} worktree remove --force "${worktreePath}"`, { stdio: 'inherit' });
      console.log(`Successfully force-removed git worktree.`);
    } catch (e) {
      console.warn(`Git worktree force remove warning: ${e.message}`);
    }
  }
}

function pruneWorktrees(options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} worktree prune`, { stdio: 'ignore' });
  } catch (e) {}
}

function deleteLocalBranch(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} branch -D "${branch}"`, { stdio: 'inherit' });
    console.log(`Deleted local branch "${branch}".`);
  } catch (err) {
    console.error(`Failed to delete local branch "${branch}": ${err.message}`);
  }
}

function deleteRemoteBranch(branch, options = {}) {
  const gitCmd = getGitPrefix(options);
  try {
    execSync(`${gitCmd} push origin --delete "${branch}"`, { stdio: 'inherit' });
    console.log(`Deleted remote branch "${branch}" from origin.`);
  } catch (err) {
    console.error(`Failed to delete remote branch "${branch}": ${err.message}`);
  }
}

module.exports = {
  getGitPrefix,
  getRepoRootDir,
  getWorktrees,
  branchExistsLocally,
  branchExistsRemotely,
  createWorktree,
  syncPrimaryBranch,
  removeWorktree,
  pruneWorktrees,
  deleteLocalBranch,
  deleteRemoteBranch,
};
