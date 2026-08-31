const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'generic',

  detect(cwd) {
    return true; // Fallback preset
  },

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'develop', 'prod', 'staging', 'production'],
  },

  workspace: {
    labelPrefix: '',
    defaultFocus: 'agy',
  },

  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'shell', title: 'shell', cmd: null, split: 'right', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'shell', focus: true, isAgent: true },
  ],

  hooks: {
    async onScaffold(ctx) {
      // 1. Environment (.env) Setup
      const targetEnv = path.join(ctx.worktreePath, '.env');
      if (!fs.existsSync(targetEnv)) {
        if (ctx.config.scaffold && ctx.config.scaffold.envSource && fs.existsSync(ctx.config.scaffold.envSource)) {
          ctx.copyFile(ctx.config.scaffold.envSource, targetEnv);
        } else {
          ctx.copyFromRoot('.env', '.env');
        }
      }

      // 2. Dependencies
      if (ctx.config.scaffold && ctx.config.scaffold.install) {
        console.log(`Running dependency installation: "${ctx.config.scaffold.install}" in "${ctx.worktreePath}"...`);
        try {
          ctx.exec(ctx.config.scaffold.install);
        } catch (err) {
          console.warn(`Warning: Dependency installation exited with an error: ${err.message}`);
        }
      }

      // 3. Symlink
      const symlinkPath = ctx.config.scaffold && ctx.config.scaffold.symlink;
      if (symlinkPath) {
        await ctx.setSymlink(symlinkPath, ctx.worktreePath);
      }
    },

    async onPreNuke(ctx) {
      const symlinkPath = ctx.config.scaffold && ctx.config.scaffold.symlink;
      if (symlinkPath) {
        try {
          let isSymlink = false;
          try {
            const lstat = fs.lstatSync(symlinkPath);
            isSymlink = lstat.isSymbolicLink();
          } catch (e) {}

          if (isSymlink) {
            let currentTarget = null;
            try {
              currentTarget = fs.readlinkSync(symlinkPath);
            } catch (e) {}

            const resolvedCurrent = currentTarget
              ? (path.isAbsolute(currentTarget) ? currentTarget : path.resolve(path.dirname(symlinkPath), currentTarget))
              : null;

            if (resolvedCurrent && path.resolve(resolvedCurrent) === path.resolve(ctx.worktreePath)) {
              console.log(`==> Unlinking active web symlink "${symlinkPath}" pointing to nuked worktree...`);
              await ctx.removeSymlink(symlinkPath);
            }
          }
        } catch (e) {}
      }
    },
  },
};
