const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'node',

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
    { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true },
  ],

  hooks: {
    async onScaffold(ctx) {
      // 1. Copy .env from root if available
      ctx.copyFromRoot('.env', '.env');

      // 2. Install dependencies
      const installCmd = (ctx.config.scaffold && ctx.config.scaffold.install !== undefined)
        ? ctx.config.scaffold.install
        : 'npm install';

      if (installCmd) {
        console.log(`Running dependency installation: "${installCmd}" in "${ctx.worktreePath}"...`);
        try {
          ctx.exec(installCmd);
        } catch (err) {
          console.warn(`Warning: Dependency installation exited with an error: ${err.message}`);
        }
      } else {
        console.log('Skipping dependency installation (scaffold.install is disabled).');
      }
    },
  },
};
