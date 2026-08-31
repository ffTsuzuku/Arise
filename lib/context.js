const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

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

    setSymlink(symlinkPath, target = worktreePath) {
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
