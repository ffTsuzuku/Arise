const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { promptConfirm, p } = require('./tui/prompt');

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
      p.log.info(msg);
    },

    warn(msg) {
      p.log.warn(msg);
    },

    error(msg) {
      p.log.error(msg);
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
        p.log.info(`Copying from "${src}" to "${resolvedDst}"...`);
        const dstDir = path.dirname(resolvedDst);
        if (!fs.existsSync(dstDir)) {
          fs.mkdirSync(dstDir, { recursive: true });
        }
        fs.copyFileSync(src, resolvedDst);
        return true;
      } else {
        p.log.warn(`Source file "${src}" does not exist to copy.`);
        return false;
      }
    },

    copyFromRoot(relativeSrc, relativeDst = relativeSrc) {
      if (!repoRoot) {
        p.log.warn(`Cannot copy from root: no repo root identified.`);
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
              p.log.info(`Unlinking symlink "${symlinkPath}" with sudo...`);
              const result = spawnSync('sudo', ['rm', '-f', symlinkPath], { stdio: 'inherit' });
              return result.status === 0;
            }
            throw err;
          }
        }
        return false;
      } catch (err) {
        p.log.error(`Failed to remove symlink "${symlinkPath}": ${err.message}`);
        return false;
      }
    },

    async setSymlink(symlinkPath, target = worktreePath) {
      p.log.info(`Updating symlink "${symlinkPath}" -> "${target}"...`);
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
            p.log.warn(`Warning: "${symlinkPath}" is a directory or file, not a symlink. Backing up to "${backupPath}"`);
            fs.renameSync(symlinkPath, backupPath);
          }
        }

        const parentDir = path.dirname(symlinkPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }

        fs.symlinkSync(target, symlinkPath);
        p.log.info(`Symlink updated: ${symlinkPath} -> ${target}`);
        return true;
      } catch (err) {
        const isPermError = err.code === 'EACCES' || err.code === 'EPERM' || (err.message && err.message.toLowerCase().includes('permission denied'));
        if (isPermError && process.platform !== 'win32') {
          p.log.warn(`\nWarning: Permission denied while updating symlink: "${symlinkPath}"`);

          let shouldSudo = Boolean(flags.yes);
          if (!shouldSudo && process.stdin.isTTY) {
            shouldSudo = await promptConfirm({
              message: `Update symlink "${symlinkPath}" -> "${target}" using sudo?`,
              defaultYes: true,
            });
          }

          if (shouldSudo) {
            try {
              p.log.info(`Running elevated symlink command with sudo (enter password if prompted)...`);
              const parentDir = path.dirname(symlinkPath);
              spawnSync('sudo', ['mkdir', '-p', parentDir], { stdio: 'inherit' });
              spawnSync('sudo', ['rm', '-rf', symlinkPath], { stdio: 'inherit' });
              const result = spawnSync('sudo', ['ln', '-s', target, symlinkPath], { stdio: 'inherit' });
              if (result.status === 0) {
                p.log.info(`Symlink updated via sudo: ${symlinkPath} -> ${target}`);
                return true;
              } else {
                p.log.error(`Sudo symlink command failed with exit status ${result.status}`);
                return false;
              }
            } catch (sudoErr) {
              p.log.error(`Failed to execute sudo: ${sudoErr.message}`);
              return false;
            }
          } else {
            p.log.warn(`Sudo symlink update skipped by user.`);
          }
        }
        p.log.error(`Failed to update symlink: ${err.message}`);
        return false;
      }
    },
  };

  return ctx;
}

module.exports = {
  createContext,
};
