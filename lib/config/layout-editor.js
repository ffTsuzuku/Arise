const { clearScreen, promptSelect, promptText, p, isInteractive } = require('../tui/prompt');
const { clone, validateLayout } = require('./draft');

const templates = [
  { label: 'One pane', value: '1pane', hint: 'A single terminal. Add more panes whenever you need them.' },
  { label: 'Two columns', value: '2pane', hint: 'A left pane and a right pane.' },
  { label: 'Two rows', value: '2pane_horizontal', hint: 'A top pane and a bottom pane.' },
  { label: 'Three panes', value: '3pane', hint: 'A full-height left pane, with two stacked panes on the right.' },
  { label: 'Four-pane grid', value: '4pane', hint: 'Two columns, each split into a top and bottom pane.' },
  { label: 'Build pane by pane', value: 'custom', hint: 'Start with one terminal and add your own splits.' },
];

function isAgentCommand(command) {
  return /^(codex|agy|claude|aider|copilot|cursor)(\s|$)/i.test(command || '');
}

function makeLayout(template = '4pane', options = {}) {
  const aliases = { quadrant: '4pane', three_pane: '3pane', split_vertical: '2pane', split_horizontal: '2pane_horizontal' };
  template = aliases[template] || template;
  if (!templates.some((item) => item.value === template)) throw new Error(`Unknown layout template: ${template}`);
  const count = template === '1pane' ? 1 : template === 'custom' ? (options.paneCount || 1) : Number(template[0]);
  const layout = [];
  for (let i = 0; i < count; i++) {
    const command = options.commands?.[i] ?? (i === 0 ? options.editorCmd : i === 1 ? options.serverCmd : undefined) ??
      (i === count - 1 ? options.agentCmd : undefined) ?? null;
    const pane = { id: `pane-${i + 1}`, title: command?.trim().split(/\s+/)[0] || `Pane ${i + 1}`, cmd: command || null };
    if (i === 0) pane.position = 'root';
    else {
      pane.from = template === '4pane' && i === 2 ? 'pane-1' : template === '4pane' && i === 3 ? 'pane-2' : `pane-${i}`;
      pane.split = template === '2pane_horizontal' || (i > 1 && template !== 'custom') ? 'down' : 'right';
    }
    if (isAgentCommand(command)) pane.isAgent = true;
    layout.push(pane);
  }
  (layout.find((pane) => pane.isAgent) || layout[0]).focus = true;
  return layout;
}

function screen(title) {
  clearScreen();
  p.intro(title);
}

async function chooseTemplate() {
  screen('Layout / Choose a starting shape');
  return promptSelect({ message: 'Start with a shape, then edit any pane.', section: 'Layout', choices: templates, defaultIndex: 3 });
}

async function editPane(layout, index) {
  const pane = layout[index];
  while (true) {
    screen(`Layout / ${pane.title}`);
    const choices = [
      { label: `Title: ${pane.title}`, value: 'title', hint: 'The name shown on this terminal pane.' },
      { label: `Command: ${pane.cmd || 'Empty shell'}`, value: 'cmd', hint: 'Runs when the pane opens. Clear the field for an empty shell.' },
      { label: `ID: ${pane.id}`, value: 'id', hint: 'Used by splits and focus. Changing it also updates child panes.' },
      { label: `Agent pane: ${pane.isAgent ? 'Yes' : 'No'}`, value: 'agent', hint: 'Allow the workspace agent setting to override this pane’s command.' },
    ];
    if (index) choices.push(
      { label: `Split from: ${pane.from}`, value: 'from', hint: 'Choose an earlier pane to split.' },
      { label: `Direction: ${pane.split}`, value: 'split', hint: 'Right makes columns; down makes rows.' },
      { label: 'Remove pane', value: 'remove', danger: true, hint: 'Its child panes will move to its parent.' },
    );
    choices.push({ label: 'Back to layout', value: 'back', subtle: true });
    const action = await promptSelect({ choices, section: 'Pane' });
    if (!action || action === 'back') return;
    if (action === 'agent') { pane.isAgent = !pane.isAgent; continue; }
    if (action === 'remove') {
      layout.splice(index, 1);
      layout.forEach((child) => { if (child.from === pane.id) child.from = pane.from; });
      if (pane.focus) layout[0].focus = true;
      return;
    }
    if (action === 'from' || action === 'split') {
      const choices = action === 'from' ? layout.slice(0, index).map((parent) => ({ label: parent.title, value: parent.id })) :
        [{ label: 'Right — columns', value: 'right' }, { label: 'Down — rows', value: 'down' }];
      const value = await promptSelect({ message: action === 'from' ? 'Split from which pane?' : 'Which direction?', choices,
        defaultIndex: Math.max(0, choices.findIndex((choice) => choice.value === pane[action])) });
      if (value !== null) pane[action] = value;
      continue;
    }
    const value = await promptText({
      message: action === 'cmd' ? 'Startup command' : action === 'id' ? 'Pane ID' : 'Pane title',
      initialValue: pane[action] || '',
      hint: action === 'cmd' ? 'Keep the full shell command, including quotes and commas. Empty means a clean shell.' : 'Escape returns without changing this field.',
      validate: (value) => action === 'cmd' || (value.trim() && (action !== 'id' || !layout.some((other) => other !== pane && other.id === value.trim()))) ||
        (action === 'id' ? 'Use a non-empty, unique pane ID.' : 'Enter a title.'),
    });
    if (value === null) continue;
    if (action === 'id') {
      layout.forEach((child) => { if (child.from === pane.id) child.from = value.trim(); });
    }
    pane[action] = action === 'cmd' ? value.trim() || null : value.trim();
    if (action === 'cmd') pane.isAgent = isAgentCommand(value);
  }
}

async function editLayout(initial, options = {}) {
  let layout = clone(initial || []).map((pane) => ({
    ...pane, isAgent: pane.isAgent ?? ['agy', 'agent', 'ai'].includes(pane.id),
  }));
  if (!isInteractive()) return layout.length ? layout : makeLayout(options.layoutTemplate || '4pane', options);
  if (!layout.length) {
    const template = await chooseTemplate();
    if (!template) return null;
    layout = makeLayout(template, options);
  }
  while (true) {
    screen('Layout / Edit panes');
    const focus = layout.find((pane) => pane.focus) || layout[0];
    const error = validateLayout(layout);
    const action = await promptSelect({
      message: `${layout.length} pane${layout.length === 1 ? '' : 's'} · focus ${focus.id}`,
      choices: [
        ...layout.map((pane, index) => ({ label: `${pane.title}  ·  ${pane.cmd || 'shell'}`, value: index, group: 'Panes',
          hint: `${pane.position === 'root' ? 'Root pane' : `Split ${pane.split} from ${pane.from}`}${pane.isAgent ? ' · Agent pane' : ''}${pane.focus ? ' · Focused' : ''}` })),
        { label: 'Add pane', value: 'add', group: 'Layout', hint: 'Add a split, then choose its command and position.' },
        { label: `Default focus: ${focus.title}`, value: 'focus', group: 'Layout', hint: 'Choose which pane receives keyboard focus.' },
        { label: 'Start from another shape', value: 'template', group: 'Layout', hint: 'Replace this draft layout with a different starting shape.' },
        { label: 'Apply layout', value: 'apply', group: 'Finish', shortcut: 's', hint: error || 'Use these panes and return to configuration.' },
        { label: 'Cancel layout changes', value: 'cancel', group: 'Finish', subtle: true },
      ],
    });
    if (action === null || action === 'cancel') return null;
    if (typeof action === 'number') await editPane(layout, action);
    else if (action === 'add') {
      let number = layout.length + 1;
      while (layout.some((pane) => pane.id === `pane-${number}`)) number++;
      layout.push({ id: `pane-${number}`, title: `Pane ${number}`, cmd: null, from: layout.at(-1).id, split: 'right' });
      await editPane(layout, layout.length - 1);
    } else if (action === 'focus') {
      const selected = await promptSelect({ message: 'Focus which pane?', choices: layout.map((pane) => ({ label: pane.title, value: pane.id })),
        defaultIndex: Math.max(0, layout.indexOf(focus)) });
      if (selected !== null) layout.forEach((pane) => { pane.focus = pane.id === selected; });
    } else if (action === 'template') {
      const template = await chooseTemplate();
      if (template) layout = makeLayout(template, options);
    } else if (action === 'apply' && !error) return layout;
  }
}

module.exports = { makeLayout, editLayout, chooseTemplate, isAgentCommand };
