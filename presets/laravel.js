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

  setup: [
    'composer install --no-interaction',
  ],
  cleanup: [],
};
