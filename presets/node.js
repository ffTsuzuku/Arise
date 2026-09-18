const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'node',
  icon: '✨',

  detect(cwd) {
    return fs.existsSync(path.join(cwd, 'package.json'));
  },

  repo: {
    defaultBaseBranch: 'develop',
    protectedBranches: ['main', 'master', 'develop', 'prod', 'staging', 'production'],
  },

  workspace: {
    labelPrefix: '',
    defaultFocus: 'agy',
  },

  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'server', title: 'npm server', cmd: 'npm run dev', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
  ],

  setup: [
    'npm install',
  ],
  cleanup: [],
};
