const herdr = require('./herdr');
const logger = require('./logger');

/**
 * Default standard 4-pane quadrant layout recipe
 */
const DEFAULT_QUADRANT_LAYOUT = [
  { id: 'vim', title: 'vim', cmd: 'vim .', position: 'root' },
  { id: 'server', title: 'server', cmd: null, split: 'right', from: 'vim' },
  { id: 'shell', title: 'shell', cmd: null, split: 'down', from: 'vim' },
  { id: 'agy', title: 'agy', cmd: 'agy', split: 'down', from: 'server', focus: true, isAgent: true },
];

/**
 * Render a declarative layout onto a Herdr workspace
 * 
 * @param {Object} options
 * @param {Array} options.layout Array of pane definitions
 * @param {string} options.rootPaneId ID of the root pane created with workspace
 * @param {string} options.cwd Working directory for panes
 * @param {string} options.focusTarget Name or ID of pane to focus (e.g. 'agent', 'agy', 'claude', 'vim', 'logs', 'shell')
 */
function renderLayout({ layout = DEFAULT_QUADRANT_LAYOUT, rootPaneId, cwd, focusTarget = 'agy' }) {
  const paneMap = new Map(); // id -> paneId
  let targetFocusPaneId = null;

  logger.debug(`Rendering layout (${layout.length} panes) with rootPaneId="${rootPaneId}":`, {
    cwd,
    focusTarget,
    panes: layout.map((p) => ({ id: p.id, title: p.title, from: p.from, split: p.split, cmd: p.cmd })),
  });

  // 1. First pass: identify which pane is targeted for focus
  const normalizedFocus = (focusTarget || 'agy').toLowerCase().trim();

  // Helper to check if a pane matches focus target
  function isFocusMatch(paneDef) {
    if (!normalizedFocus) return false;
    const idMatch = paneDef.id && paneDef.id.toLowerCase() === normalizedFocus;
    const titleMatch = paneDef.title && paneDef.title.toLowerCase() === normalizedFocus;
    const cmdMatch = paneDef.cmd && paneDef.cmd.toLowerCase().split(/\s+/)[0] === normalizedFocus;
    const agentAlias = (normalizedFocus === 'agent' || normalizedFocus === 'agy' || normalizedFocus === 'ai') &&
      (paneDef.id === 'agy' || paneDef.id === 'agent' || paneDef.isAgent);
    return Boolean(idMatch || titleMatch || cmdMatch || agentAlias);
  }

  // 2. Iterate through pane definitions
  for (const paneDef of layout) {
    let currentPaneId;

    if (paneDef.position === 'root' || !paneDef.from) {
      currentPaneId = rootPaneId;
      logger.debug(`Mapped root pane "${paneDef.id}" ("${paneDef.title}") -> paneId "${currentPaneId}"`);
    } else {
      const parentPaneId = paneMap.get(paneDef.from);
      if (!parentPaneId) {
        logger.warn(`Layout: parent pane "${paneDef.from}" not found for "${paneDef.id}". Skipping split.`);
        continue;
      }

      const shouldFocus = isFocusMatch(paneDef);
      try {
        currentPaneId = herdr.splitPane({
          paneId: parentPaneId,
          direction: paneDef.split || 'right',
          cwd,
          focus: shouldFocus,
        });
        logger.debug(`Split pane "${paneDef.id}" from parent "${paneDef.from}" (${parentPaneId}) dir=${paneDef.split || 'right'} -> paneId "${currentPaneId}"`);
      } catch (err) {
        logger.error(`Failed to split pane "${paneDef.id}" from "${paneDef.from}": ${err.message}`, err);
        continue;
      }
    }

    if (currentPaneId) {
      paneMap.set(paneDef.id, currentPaneId);

      if (paneDef.title) {
        herdr.renamePane(currentPaneId, paneDef.title);
      }

      if (paneDef.cmd) {
        herdr.runInPane(currentPaneId, paneDef.cmd);
      }

      if (isFocusMatch(paneDef)) {
        targetFocusPaneId = currentPaneId;
      }
    }
  }

  return {
    paneMap,
    targetFocusPaneId,
  };
}

module.exports = {
  renderLayout,
  DEFAULT_QUADRANT_LAYOUT,
};
