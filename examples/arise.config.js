/**
 * Example JavaScript Configuration with Custom Presets and Setup Commands
 */
module.exports = {
  preset: 'default',

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

  setup: [
    'cp .env.example .env',
    'npm install',
  ],

  cleanup: [
    'docker compose down -v',
  ],
};
