/**
 * Example JavaScript Configuration with Custom Lifecycle Hooks
 */
module.exports = {
  preset: 'laravel',

  repo: {
    bareRepo: '/path/to/bare/repo.git',
    worktreesBase: '/path/to/worktrees',
    defaultBaseBranch: 'main',
    protectedBranches: ['staging', 'prod', 'master', 'main', 'develop'],
  },

  workspace: {
    labelPrefix: '[API] ',
    defaultFocus: 'agy',
  },

  scaffold: {
    envSource: '/path/to/shared/.env',
    symlink: '/var/www/my-app',
  },

  hooks: {
    async onScaffold(ctx) {
      console.log('Custom project post-create hook executing...');
    },
  },
};
