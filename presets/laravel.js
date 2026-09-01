const fs = require('fs');
const path = require('path');
const git = require('../lib/git');

module.exports = {
  name: 'laravel',
  icon: '🐘',

  detect(cwd) {
    return fs.existsSync(path.join(cwd, 'artisan')) || fs.existsSync(path.join(cwd, 'composer.json'));
  },

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['staging', 'prod', 'master', 'main', 'develop'],
  },

  workspace: {
    labelPrefix: '',
    defaultFocus: 'agy',
  },

  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'logs', title: 'logs', cmd: 'tail -f storage/logs/laravel.log', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'logs', focus: true, isAgent: true },
  ],

  hooks: {
    async onSyncPrimary(ctx) {
      git.syncPrimaryBranch({
        branch: ctx.branch,
        worktreePath: ctx.worktreePath,
        repoDir: ctx.repoRoot,
        bareRepo: ctx.bareRepo,
        protectedBranches: ['staging', 'prod', 'master', 'main', 'develop'],
      });
    },

    async onScaffold(ctx) {
      // 1. Environment (.env) Setup
      console.log('==> Ensuring .env file...');
      const rootEnv = ctx.repoRoot ? path.join(ctx.repoRoot, '.env') : null;
      const targetEnv = path.join(ctx.worktreePath, '.env');

      if (!fs.existsSync(targetEnv)) {
        if (ctx.config.scaffold && ctx.config.scaffold.envSource && fs.existsSync(ctx.config.scaffold.envSource)) {
          ctx.copyFile(ctx.config.scaffold.envSource, targetEnv);
        } else if (rootEnv && fs.existsSync(rootEnv)) {
          ctx.copyFile(rootEnv, targetEnv);
        } else {
          console.warn('==> No .env source found to copy.');
        }
      }

      // 2. Dependencies & Initialization
      console.log('==> Initializing repository (permissions, composer, etc.)...');
      try {
        const installCmd = (ctx.config.scaffold && ctx.config.scaffold.install !== undefined)
          ? ctx.config.scaffold.install
          : 'composer install --no-interaction';

        if (installCmd) {
          console.log(`Running dependency installation: "${installCmd}" in "${ctx.worktreePath}"...`);
          ctx.exec(installCmd);
        } else {
          console.log('Skipping composer installation (scaffold.install is disabled).');
        }

        const permissionsScript = `
mkdir -p storage/logs
chmod 777 storage/logs
touch storage/logs/laravel.log
chmod 666 storage/logs/laravel.log
mkdir -p storage/framework/sessions
chmod o+w storage/framework/sessions
mkdir -p storage/framework/data
chmod o+w storage/framework/data
mkdir -p storage/framework/cache/data
chmod 777 storage/framework/cache/data
mkdir -p bootstrap/cache
chmod 777 bootstrap/cache
mkdir -p storage/temp
chmod 777 storage/temp
if [ -d .githooks ]; then git config core.hooksPath .githooks; fi
`;
        ctx.exec(permissionsScript);
      } catch (err) {
        console.warn(`==> Warning during repository initialization: ${err.message}`);
      }

      // 3. Update Web Server Symlink if configured
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
