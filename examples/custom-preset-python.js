const fs = require('fs');
const path = require('path');

/**
 * Example Custom Python / Django Preset
 */
module.exports = {
  name: 'python',

  detect(cwd) {
    return fs.existsSync(path.join(cwd, 'requirements.txt')) ||
           fs.existsSync(path.join(cwd, 'Pipfile')) ||
           fs.existsSync(path.join(cwd, 'pyproject.toml'));
  },

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'staging', 'production'],
  },

  workspace: {
    labelPrefix: '[PY] ',
    defaultFocus: 'agy',
  },

  layout: [
    { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
    { id: 'server', title: 'server', cmd: 'python manage.py runserver', split: 'right', from: 'vim' },
    { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
  ],

  hooks: {
    async onScaffold(ctx) {
      // 1. Copy environment file
      ctx.copyFromRoot('.env', '.env');

      // 2. Setup virtual environment and dependencies if requirements.txt exists
      if (fs.existsSync(path.join(ctx.worktreePath, 'requirements.txt'))) {
        console.log(`Setting up Python virtual environment...`);
        ctx.exec('python3 -m venv .venv');
        ctx.exec('.venv/bin/pip install -r requirements.txt');
      }
    },
  },
};
