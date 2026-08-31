const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { promptConfirm } = require('./tui/prompt');

function createContext({
  worktreePath,
  repoRoot,
  bareRepo,
  branch,
  source,
  flags = {},
  preset = {},
  config = {},
}) {
  const ctx = {
    worktreePath,
    repoRoot,
    bareRepo,
    branch,
    source,
    flags,
    preset,
    config,

    log(msg) {
      console.log(msg);
    },

    warn(msg) {
      console.warn(msg);
    },

    error(msg) {
      console.error(msg);
    },

    exec(command, options = {}) {
      const cwd = options.cwd || worktreePath;
      const shell = options.shell || '/bin/bash';
      return execSync(command, {
        cwd,
        stdio: 'inherit',
        shell,
        ...options,
      });
    },

    spawn(command, args = [], options = {}) {
      const cwd = options.cwd || worktreePath;
      const shell = options.shell !== undefined ? options.shell : true;
      return spawnSync(command, args, {
        cwd,
        stdio: 'inherit',
        shell,
        ...options,
      });
    },

    copyFile(src, dst) {
      const resolvedDst = path.isAbsolute(dst) ? dst : path.join(worktreePath, dst);
      if (fs.existsSync(src)) {
        console.log(`Copying from "${src}" to "${resolvedDst}"...`);
        const dstDir = path.dirname(resolvedDst);
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        fs.copyFileSync(src, resolvedDst);
        return true;
      } else {
        console.warn(`Source file "${src}" does not exist to copy.`);
        return false;
      }
    },

    copyFromRoot(relativeSrc, relativeDst = relativeSrc) {
      if (!repoRoot) {
        console.warn(`Cannot copy from root: no repo root identified.`);
        return false;
      }
      const src = path.join(repoRoot, relativeSrc);
      const dst = path.join(worktreePath, relativeDst);
      return ctx.copyFile(src, dst);
    },

    async removeSymlink(symlinkPath) {
      if (!symlinkPath) return false;
      try {
        let isSymlink = false;
        try {
          const lstat = fs.lstatSync(symlinkPath);
          isSymlink = lstat.isSymbolicLink();
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }

        if (isSymlink) {
          try {
            fs.unlinkSync(symlinkPath);
            return true;
          } catch (err) {
            const isPermError = err.code === 'EACCES' || err.code === 'EPERM' || (err.message && err.message.toLowerCase().includes('permission denied'));
            if (isPermError && process.platform !== 'win32') {
              console.log(`==> Unlinking symlink "${symlinkPath}" with sudo...`);
              const result = spawnSync('sudo', ['rm', '-f', symlinkPath], { stdio: 'inherit' });
              return result.status === 0;
            }
            throw err;
          }
        }
        return false;
      } catch (err) {
        console.error(`==> Failed to remove symlink "${symlinkPath}": ${err.message}`);
        return false;
      }
    },

    async setSymlink(symlinkPath, target = worktreePath) {
      console.log(`==> Updating symlink "${symlinkPath}" -> "${target}"...`);
      try {
        let isExisting = false;
        let isSymlink = false;
        try {
          const lstat = fs.lstatSync(symlinkPath);
          isExisting = true;
          isSymlink = lstat.isSymbolicLink();
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }

        if (isExisting) {
          if (isSymlink) {
            fs.unlinkSync(symlinkPath);
          } else {
            const backupPath = `${symlinkPath}_BAK_${Date.now()}`;
            console.warn(`==> Warning: "${symlinkPath}" is a directory or file, not a symlink. Backing up to "${backupPath}"`);
            fs.renameSync(symlinkPath, backupPath);
          }
        }

        const parentDir = path.dirname(symlinkPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.symlinkSync(target, symlinkPath);
        console.log(`==> Symlink updated: ${symlinkPath} -> ${target}`);
        return true;
      } catch (err) {
        const isPermError = err.code === 'EACCES' || err.code === 'EPERM' || (err.message && err.message.toLowerCase().includes('permission denied'));
        if (isPermError && process.platform !== 'win32') {
          console.warn(`\n⚠️  Permission denied while updating symlink: "${symlinkPath}"`);

          let shouldSudo = Boolean(flags.yes);
          if (!shouldSudo && process.stdin.isTTY) {
            shouldSudo = await promptConfirm({
              message: `Update symlink "${symlinkPath}" -> "${target}" using sudo?`,
              defaultYes: true,
            });
          }

          if (shouldSudo) {
            try {
              console.log(`==> Running elevated symlink command with sudo (enter password if prompted)...`);
              const parentDir = path.dirname(symlinkPath);
              spawnSync('sudo', ['mkdir', '-p', parentDir], { stdio: 'inherit' });
              spawnSync('sudo', ['rm', '-rf', symlinkPath], { stdio: 'inherit' });
              const result = spawnSync('sudo', ['ln', '-s', target, symlinkPath], { stdio: 'inherit' });
              if (result.status === 0) {
                console.log(`==> Symlink updated via sudo: ${symlinkPath} -> ${target}`);
                return true;
              } else {
                console.error(`==> Sudo symlink command failed with exit status ${result.status}`);
                return false;
              }
            } catch (sudoErr) {
              console.error(`==> Failed to execute sudo: ${sudoErr.message}`);
              return false;
            }
          } else {
            console.warn(`==> Sudo symlink update skipped by user.`);
          }
        }
        console.error(`==> Failed to update symlink: ${err.message}`);
        return false;
      }
    },
  };

  return ctx;
}

module.exports = {
  createContext,
};
