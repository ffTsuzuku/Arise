module.exports = {
  name: 'default',
  icon: '📦',

  detect(cwd) {
    return false; // Fallback only, does not auto-match
  },

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'develop', 'prod', 'staging', 'production'],
  },

  workspace: {
    labelPrefix: '',
    defaultFocus: 'agent',
  },

  layout: [
    { id: 'editor', title: 'editor', cmd: null, position: 'root' },
    { id: 'shell', title: 'shell', cmd: null, split: 'right', from: 'editor' },
    { id: 'agent', title: 'agent', cmd: 'agy', split: 'down', from: 'shell', focus: true, isAgent: true },
  ],

  setup: [],
  cleanup: [],
};

