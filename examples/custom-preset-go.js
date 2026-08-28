const fs = require('fs');
const path = require('path');

/**
 * Example Custom Go Microservice Preset
 */
module.exports = {
  name: 'go',

  detect(cwd) {
    return fs.existsSync(path.join(cwd, 'go.mod'));
  },

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'production'],
  },

  workspace: {
    labelPrefix: '[GO] ',
    defaultFocus: 'agy',
  },

  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'server', title: 'air watcher', cmd: 'air', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
  ],

  hooks: {
    async onScaffold(ctx) {
      ctx.copyFromRoot('.env', '.env');
      ctx.exec('go mod download');
    },
  },
};
