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
      // Copy .env from root if available
      ctx.copyFromRoot('.env', '.env');
    },
  },
};
