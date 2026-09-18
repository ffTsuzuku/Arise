const os = require('os');
const path = require('path');
const { ANSI, stripAnsi, visibleLength, truncate, wrapAnsiLine } = require('./ansi');
const { version } = require('../../package.json');

const palette = {
  background: '#0f1719',
  surface: '#192729',
  selected: '#203032',
  accent: '#80ded5',
  text: '#d6e0e0',
  muted: '#90a5a6',
  border: '#2b3d40',
  success: '#b4d982',
  danger: '#efa58b',
};

function colorEnabled() {
  return !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb' &&
    (Boolean(process.stdout.isTTY) || Boolean(Number(process.env.FORCE_COLOR)));
}

function color(name, background = false) {
  if (!colorEnabled()) return '';
  const hex = palette[name] || palette.text;
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `\x1b[${background ? 48 : 38};2;${rgb.join(';')}m`;
}

function clean(value) {
  return stripAnsi(String(value ?? '')).replace(/[\x00-\x1f\x7f]/g, ' ');
}

function paint(value, name = 'text') {
  return colorEnabled() ? `${color(name)}${value}${ANSI.reset}` : String(value);
}

function printSummary(title, entries = []) {
  console.log(`\n  ${paint('A R I S E', 'accent')}  ${paint(`v${version}`, 'muted')}`);
  console.log(`  ${paint('A place for every branch.', 'muted')}\n`);
  console.log(`  ${paint(`01 / ${clean(title).toUpperCase()}`, 'muted')}\n`);
  for (const [label, value] of entries) {
    console.log(`  ${paint(label.padEnd(16), 'muted')}${paint(clean(value))}`);
  }
  console.log();
}

function shortPath(value = process.cwd()) {
  const home = os.homedir();
  return value === home ? '~' : value.startsWith(home + path.sep) ? '~' + value.slice(home.length) : value;
}

// One page context is shared by all prompt kinds, including nested wizard steps.
let context = { cwd: process.cwd() };
let page = { title: '', notices: [] };

function setContext(next) {
  context = { ...next };
}

function getContext() {
  return { ...context };
}

function resetPage(title = '') {
  page = { title: clean(title), notices: [] };
}

function notice(message, tone = 'muted') {
  page.notices.push(...String(message).split('\n').map((line) => ({ text: clean(line).trim(), tone })));
}

function metrics() {
  const columns = Math.max(1, process.stdout.columns || 80);
  const rows = Math.max(1, process.stdout.rows || 24);
  const margin = columns >= 100 ? 4 : columns >= 45 ? 2 : 1;
  return { columns, rows, margin, width: Math.max(1, columns - margin * 2), roomy: rows >= 38 && columns >= 65 };
}

function fit(value, width) {
  return stripAnsi(truncate(clean(value), Math.max(0, width)));
}

function pad(value, width) {
  const fitted = fit(value, width);
  return fitted + ' '.repeat(Math.max(0, width - visibleLength(fitted)));
}

function rule(width) {
  return paint('─'.repeat(width), 'border');
}

function header(m) {
  const { width, roomy } = m;
  const lines = [];
  if (roomy) {
    lines.push('');
    lines.push(paint('    /\\', 'accent'));
    lines.push(paint('   /  \\     A R I S E', 'accent') + paint(`   v${version}`, 'muted'));
    lines.push(paint('  / /\\ \\', 'accent') + paint('   A place for every branch.', 'muted'));
    lines.push(paint(' /_/  \\_\\', 'accent'));
    lines.push('', rule(width), '');
  } else {
    lines.push(paint(' /\\  A R I S E', 'accent') + paint(`  v${version}`, 'muted'));
  }
  lines.push(paint(fit(shortPath(context.cwd || process.cwd()), width), 'muted'));
  if (context.multiplexer || context.preset || context.sessions !== undefined) {
    let detail = '';
    if (context.multiplexer) detail += paint('mux ', 'muted') + paint(context.multiplexer) + '   ';
    if (context.preset) detail += paint('preset ', 'muted') + paint(context.preset) + '   ';
    if (context.sessions !== undefined) {
      detail += paint(`● ${context.sessions} active session${context.sessions === 1 ? '' : 's'}`, 'success');
    }
    lines.push(...wrapAnsiLine(detail.trimEnd(), width));
  }
  if (roomy) lines.push('');
  lines.push(rule(width));
  if (page.title) {
    if (roomy) lines.push('');
    lines.push(paint(fit(`ARISE  /  ${page.title}`, width), 'muted'));
  }
  return lines;
}

function section(label, number, width) {
  return paint(fit(`  ${String(number).padStart(2, '0')} / ${clean(label).toUpperCase()}`, width), 'muted');
}

function menuRow(choice, active, width, { multi = false, checked = false } = {}) {
  const background = active ? 'selected' : choice.subtle ? 'surface' : 'background';
  const tone = choice.danger ? 'danger' : active ? 'accent' : 'text';
  const shortcut = choice.shortcut ? clean(choice.shortcut) : '';
  const prefix = `${active ? '▎ ❯ ' : '    '}${multi ? checked ? '● ' : '○ ' : ' '}`;
  const suffix = shortcut ? ` ${shortcut} ` : ' ';
  const labelWidth = Math.max(0, width - visibleLength(prefix) - visibleLength(suffix));
  return color(background, true) + color(tone) + prefix + pad(choice.label, labelWidth) +
    color('muted') + suffix + ANSI.reset;
}

function buildFrame(model, m = metrics()) {
  let top = header(m);
  const message = clean(model.message);
  if (message) {
    if (m.roomy) top.push('');
    top.push(...wrapAnsiLine(paint(message), m.width));
  }
  // Keep the active control and keyboard help reachable even in short windows.
  if (top.length > m.rows - 8) {
    const budget = Math.max(1, m.rows - 8);
    const question = message ? wrapAnsiLine(paint(message), m.width).slice(0, Math.max(1, budget - 2)) : [];
    top = [...header({ ...m, roomy: false }).slice(0, budget - question.length), ...question];
  }
  const footerHeight = m.roomy ? 7 : 4;
  const available = Math.max(1, m.rows - top.length - footerHeight - 1);
  let body = [];
  let description = model.error || model.hint || '';
  let position = '';

  if (model.choices) {
    const choices = model.choices;
    const groups = [...new Set(choices.map((choice) => choice.group || model.section || 'Options'))];
    const expanded = [];
    const optionLines = [];
    const spaced = m.roomy && choices.length * 2 + groups.length * 3 <= available;
    let previousGroup;
    choices.forEach((choice, index) => {
      const group = choice.group || model.section || 'Options';
      if (group !== previousGroup) {
        if (expanded.length && spaced) expanded.push('');
        expanded.push(section(group, groups.indexOf(group) + 1, m.width));
        if (spaced) expanded.push('');
        previousGroup = group;
      }
      optionLines[index] = expanded.length;
      expanded.push(menuRow(choice, index === model.index, m.width, {
        multi: model.multi,
        checked: model.selected?.has(index),
      }));
      if (spaced) expanded.push('');
    });
    const pageSize = model.pageSize > 0 ? Math.max(1, Math.floor(model.pageSize)) : choices.length;
    const capacity = Math.min(available, pageSize < choices.length ? pageSize + 1 : available);
    const focus = optionLines[model.index] || 0;
    const start = Math.max(0, Math.min(focus - Math.floor(capacity / 2), expanded.length - capacity));
    body = expanded.slice(start, start + capacity);
    if (expanded.length > capacity) position = `${model.index + 1} / ${choices.length}  ·  ↑ ↓ scroll`;
    description ||= choices[model.index]?.hint || choices[model.index]?.description || '';
  } else if (model.input !== undefined) {
    body.push(section(model.section || 'Input', 1, m.width));
    if (m.roomy) body.push('');
    const inputWidth = Math.max(1, m.width - 6);
    const chars = Array.from(model.input);
    const caret = model.cursor ?? chars.length;
    // Scroll the field horizontally with its insertion point.
    let start = caret;
    let used = 1;
    while (start > 0 && used + visibleLength(chars[start - 1]) < inputWidth) used += visibleLength(chars[--start]);
    const before = chars.slice(start, caret).join('');
    const current = chars[caret] || ' ';
    const after = fit(chars.slice(caret + 1).join(''), inputWidth - visibleLength(before + current));
    const field = before + (colorEnabled() ? ANSI.inverse + current + '\x1b[27m' : '▏' + (chars[caret] || '')) + after;
    body.push(color('selected', true) + color('accent') + '▎ ❯ ' + field +
      ' '.repeat(Math.max(0, m.width - 4 - visibleLength(field))) + ANSI.reset);
    if (model.placeholder && !model.input) body.push(paint(fit(`    ${model.placeholder}`, m.width), 'muted'));
  } else {
    const lines = page.notices.flatMap((item) => wrapAnsiLine(paint(item.text, item.tone), m.width));
    const start = Math.min(model.offset || 0, Math.max(0, lines.length - available));
    model.offset = start;
    body = lines.slice(start, start + available);
    if (lines.length > available) position = `${start + 1}–${Math.min(start + available, lines.length)} / ${lines.length}  ·  ↑ ↓ scroll`;
  }

  if (!description && page.notices.length && model.input !== undefined) description = page.notices.at(-1).text;
  const footer = [rule(m.width)];
  if (m.roomy) footer.push('');
  const detailLines = wrapAnsiLine(paint(clean(description), model.error ? 'danger' : 'muted'), m.width);
  footer.push(...detailLines.slice(0, m.roomy ? 2 : 1));
  if (position) footer.push(paint(fit(position, m.width), 'muted'));
  while (footer.length < footerHeight - 1) footer.push('');
  let keys = model.keys || '↑ ↓ move   enter select   esc back';
  if (m.width < 50 && visibleLength(keys) > m.width) {
    keys = model.multi ? '↑↓ move  space toggle  ↵ done  esc back' :
      model.input !== undefined ? '↵ continue  ←→ edit  esc back' : '↑↓ move  ↵ select  esc back';
  }
  footer.push(paint(fit(keys, m.width), 'muted'));
  const content = [...top, ...body.slice(0, available)];
  while (content.length < m.rows - footer.length - 1) content.push('');
  return { lines: [...content, ...footer].slice(0, m.rows - 1), metrics: m };
}

function draw(model) {
  const frame = buildFrame(model);
  const { columns, margin, rows } = frame.metrics;
  let output = ANSI.hideCursor + '\x1b[H';
  for (let row = 0; row < rows; row++) {
    const line = frame.lines[row] || '';
    // Reapply the canvas after nested styles reset so every cell stays dark.
    const canvas = color('background', true) + color('text');
    const content = truncate(line, Math.max(1, columns - margin * 2));
    const styled = content.replaceAll(ANSI.reset, ANSI.reset + canvas);
    output += `\x1b[${row + 1};1H` + canvas + ' '.repeat(Math.min(margin, columns - 1)) + styled + '\x1b[K';
  }
  process.stdout.write(output + ANSI.reset);
}

// Compatibility names keep existing wizard messages on the same restrained palette.
const pc = Object.fromEntries(Object.entries({
  cyan: 'accent', green: 'success', red: 'danger', yellow: 'danger',
  gray: 'muted', dim: 'muted', blue: 'accent', magenta: 'muted', white: 'text',
}).map(([name, tone]) => [name, (value) => paint(value, tone)]));
pc.bold = (value) => String(value);

module.exports = { palette, paint, color, clean, shortPath, printSummary, setContext, getContext, resetPage, notice, metrics, buildFrame, draw, pc };
