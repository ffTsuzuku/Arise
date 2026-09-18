module.exports = {
  name: 'main',
  icon: 'terminal',

  repo: {
    defaultBaseBranch: 'main',
    protectedBranches: ['main', 'master', 'develop', 'prod', 'staging'],
  },

  workspace: {
    defaultFocus: 'codex',
    agent: 'agy',
  },

  setup: [],

  cleanup: [],

  layout: [
  {
    "id": "pane-1",
    "title": "pane-1",
    "cmd": null,
    "position": "root"
  },
  {
    "id": "pane-2",
    "title": "pane-2",
    "cmd": "vim .",
    "from": "pane-1",
    "split": "right"
  },
  {
    "id": "pane-3",
    "title": "pane-3",
    "cmd": null,
    "from": "pane-2",
    "split": "down"
  },
  {
    "id": "codex",
    "title": "codex",
    "cmd": "codex",
    "from": "pane-1",
    "split": "down",
    "focus": true
  }
],
};
