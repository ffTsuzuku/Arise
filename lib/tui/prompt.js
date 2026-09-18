const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { ANSI } = require('./ansi');
const theme = require('./theme');
const { pc } = theme;

function createPathCompleter(options = {}) {
  return function pathCompleter(line) {
    const raw = (line || '').trim();

    if (raw === '~') {
      return [['~/'], '~'];
    }

    let expanded = raw;
    if (raw.startsWith('~' + path.sep) || raw.startsWith('~/')) {
      expanded = path.join(os.homedir(), raw.slice(2));
    } else if (raw === '~') {
      expanded = os.homedir();
    }

    let searchDir;
    let partial;

    if (raw.endsWith('/') || raw.endsWith(path.sep)) {
      searchDir = expanded;
      partial = '';
    } else {
      const lastSlashIndex = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
      if (lastSlashIndex >= 0) {
        const dirPart = expanded.slice(0, expanded.lastIndexOf(path.sep) + 1);
        searchDir = dirPart || (path.sep === '\\' ? 'C:\\' : '/');
        partial = raw.slice(lastSlashIndex + 1);
      } else {
        searchDir = process.cwd();
        partial = raw;
      }
    }

    try {
      const entries = fs.readdirSync(searchDir || '.', { withFileTypes: true });
      const hits = [];

      for (const entry of entries) {
        // Skip hidden files unless user started typing with a dot
        if (!partial.startsWith('.') && entry.name.startsWith('.')) {
          continue;
        }

        if (entry.name.startsWith(partial)) {
          let isDir = entry.isDirectory();
          if (!isDir && entry.isSymbolicLink()) {
            try {
              const fullPath = path.join(searchDir || '.', entry.name);
              isDir = fs.statSync(fullPath).isDirectory();
            } catch {
              isDir = false;
            }
          }

          if (options.directoriesOnly && !isDir) {
            continue;
          }

          let name = entry.name;
          if (isDir) {
            name += '/';
          }
          hits.push(name);
        }
      }

      hits.sort((a, b) => a.localeCompare(b));
      return [hits, partial];
    } catch {
      return [[], partial];
    }
  };
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.env.TERM !== 'dumb');
}

function clearScreen() {
  theme.resetPage();
  if (isInteractive() && !process.env.CI && !process.env.NODE_TEST_CONTEXT) {
    process.stdout.write(ANSI.reset + ANSI.clearScreen);
  }
}

const pathCompleter = createPathCompleter();

// Retain the small presentation API used by the wizard and built-in plugins.
// All interactive controls are rendered by the same screen renderer below.
const p = {
  intro(title) {
    theme.resetPage(title);
    if (!isInteractive()) console.log(`\n${theme.paint('A R I S E', 'accent')}  /  ${theme.clean(title)}`);
  },
  outro(message) {
    theme.notice(message, 'success');
    console.log(`\n  ${theme.paint(theme.clean(message), 'success')}\n`);
  },
  note(message) {
    theme.notice(message);
    String(message).split('\n').forEach((line) => console.log(`  ${theme.paint(theme.clean(line), 'muted')}`));
  },
  log: Object.fromEntries(Object.entries({
    step: ['›', 'accent'], info: ['·', 'muted'], success: ['●', 'success'],
    warn: ['!', 'danger'], error: ['!', 'danger'],
  }).map(([name, [symbol, tone]]) => [name, (message) => {
    theme.notice(message, tone);
    const write = name === 'error' ? console.error : name === 'warn' ? console.warn : console.log;
    String(message).split('\n').forEach((line) => {
      write(`  ${theme.paint(symbol, tone)} ${theme.paint(theme.clean(line), tone)}`);
    });
  }])),
};

function normalizeChoices(options) {
  return (options.choices || options.items || []).map((choice) => {
    if (typeof choice === 'object' && choice !== null) {
      return {
        ...choice,
        label: choice.label || choice.title || String(choice.value),
        value: choice.value !== undefined ? choice.value : choice,
        hint: choice.hint || choice.description,
      };
    }
    return { label: String(choice), value: choice };
  });
}

// Each prompt owns its terminal listeners and restores the caller's state on
// selection, cancellation, errors, input closure, and process termination.
function runPrompt(model, onKey) {
  const input = process.stdin;
  const output = process.stdout;
  const wasRaw = Boolean(input.isRaw);
  const wasFlowing = input.readableFlowing === true;
  return new Promise((resolve, reject) => {
    let finished = false;
    let alternateScreen = false;
    const restore = () => {
      input.removeListener('keypress', keypress);
      input.removeListener('end', cancel);
      input.removeListener('error', fail);
      output.removeListener('resize', render);
      process.removeListener('SIGINT', cancel);
      process.removeListener('SIGTERM', terminate);
      process.removeListener('exit', restoreOnExit);
      if (input.isTTY && input.setRawMode) input.setRawMode(wasRaw);
      if (alternateScreen) output.write(ANSI.reset + ANSI.showCursor + ANSI.altScreenExit);
      if (!wasFlowing) input.pause();
    };
    const finish = (result, error) => {
      if (finished) return;
      finished = true;
      restore();
      if (error) reject(error);
      else resolve(result);
    };
    const cancel = () => finish(null);
    const fail = (error) => finish(null, error);
    const terminate = () => { finish(null); process.exit(143); };
    const restoreOnExit = () => restore();
    const render = () => {
      try { theme.draw(model); } catch (error) { fail(error); }
    };
    const keypress = (text, key = {}) => {
      if (key.name === 'escape' || (key.ctrl && ['c', 'd'].includes(key.name))) return cancel();
      try {
        onKey(text, key, finish);
        if (!finished) render();
      } catch (error) { fail(error); }
    };
    try {
      readline.emitKeypressEvents(input);
      input.on('keypress', keypress);
      input.once('end', cancel);
      input.once('error', fail);
      output.on('resize', render);
      process.once('SIGINT', cancel);
      process.once('SIGTERM', terminate);
      process.once('exit', restoreOnExit);
      input.setRawMode(true);
      input.resume();
      output.write(ANSI.altScreenEnter + ANSI.hideCursor);
      alternateScreen = true;
      render();
    } catch (error) { fail(error); }
  });
}

async function choose(options, multi = false) {
  if (options.clear) clearScreen();
  const choices = normalizeChoices(options);
  if (!choices.length) return multi ? [] : null;
  const index = Math.max(0, Math.min(options.defaultIndex || 0, choices.length - 1));
  const selected = new Set(choices.flatMap((choice, i) => choice.selected ? [i] : []));
  if (!isInteractive()) {
    if (!multi) return choices[index].value;
    return selected.size ? [...selected].map((i) => choices[i].value) : [choices[0].value];
  }
  const model = {
    message: options.message || options.title || '',
    section: options.section,
    choices, index, selected, multi,
    pageSize: options.pageSize || options.maxItems,
    hint: options.hint,
    keys: multi ? '↑ ↓ move   space toggle   enter confirm   esc back' : options.keys,
  };
  let search = '';
  let lastTyped = 0;
  const submit = (finish) => {
    if (multi && options.required && !selected.size) {
      model.error = 'Select at least one item to continue.';
      return;
    }
    finish(multi ? choices.filter((_, i) => selected.has(i)).map((choice) => choice.value) : choices[model.index].value);
  };
  return runPrompt(model, (text, key, finish) => {
    model.error = '';
    const step = Math.max(1, Math.min(model.pageSize || choices.length, theme.metrics().rows - 12));
    if (key.name === 'up' || key.name === 'k') model.index = (model.index + choices.length - 1) % choices.length;
    else if (key.name === 'down' || key.name === 'j') model.index = (model.index + 1) % choices.length;
    else if (key.name === 'home') model.index = 0;
    else if (key.name === 'end') model.index = choices.length - 1;
    else if (key.name === 'pageup') model.index = Math.max(0, model.index - step);
    else if (key.name === 'pagedown') model.index = Math.min(choices.length - 1, model.index + step);
    else if (multi && key.name === 'space') {
      if (selected.has(model.index)) selected.delete(model.index);
      else selected.add(model.index);
    } else if (key.name === 'return' || key.name === 'enter') submit(finish);
    else if (text && !key.ctrl && !key.meta && /^[^\x00-\x1f\x7f]$/u.test(text)) {
      const shortcut = choices.findIndex((choice) => choice.shortcut?.toLowerCase() === text.toLowerCase());
      if (shortcut >= 0) {
        model.index = shortcut;
        if (multi) {
          if (selected.has(shortcut)) selected.delete(shortcut);
          else selected.add(shortcut);
        } else submit(finish);
      } else {
        search = Date.now() - lastTyped > 700 ? text : search + text;
        lastTyped = Date.now();
        const match = choices.findIndex((choice) => theme.clean(choice.label).toLowerCase().startsWith(search.toLowerCase()));
        if (match >= 0) model.index = match;
      }
    }
  });
}

function promptSelect(options = {}) {
  return choose(options);
}

function promptMultiSelect(options = {}) {
  return choose(options, true);
}

async function promptText(options = {}) {
  if (options.clear) clearScreen();
  const defaultValue = options.defaultValue || '';
  const editing = options.initialValue !== undefined;
  const initialValue = editing ? String(options.initialValue) : '';
  if (!isInteractive()) return editing ? initialValue : defaultValue;
  const model = {
    message: options.message || options.question || '',
    section: options.section,
    input: initialValue, cursor: Array.from(initialValue).length,
    placeholder: options.placeholder || (defaultValue ? `Default: ${defaultValue}` : 'Type here…'),
    hint: options.hint || (defaultValue ? `Enter to use ${defaultValue}` : 'Type a value to continue.'),
    keys: 'enter continue   ← → edit   esc back',
  };
  return runPrompt(model, (text, key, finish) => {
    model.error = '';
    const chars = Array.from(model.input);
    if (key.name === 'return' || key.name === 'enter') {
      const value = editing ? model.input : model.input || defaultValue;
      const result = options.validate ? options.validate(value) : true;
      if (result === false || typeof result === 'string') {
        model.error = typeof result === 'string' ? result : 'Invalid input';
      } else finish(value);
      return;
    }
    if (key.name === 'left') model.cursor = Math.max(0, model.cursor - 1);
    else if (key.name === 'right') model.cursor = Math.min(chars.length, model.cursor + 1);
    else if (key.name === 'home' || (key.ctrl && key.name === 'a')) model.cursor = 0;
    else if (key.name === 'end' || (key.ctrl && key.name === 'e')) model.cursor = chars.length;
    else if (key.ctrl && key.name === 'u') { chars.splice(0, model.cursor); model.cursor = 0; }
    else if (key.ctrl && key.name === 'k') chars.splice(model.cursor);
    else if (key.name === 'backspace' && model.cursor > 0) chars.splice(--model.cursor, 1);
    else if (key.name === 'delete') chars.splice(model.cursor, 1);
    else if (key.name === 'tab' && options.completer) {
      const [hits, partial] = options.completer(model.input);
      if (hits.length === 1) {
        model.input = model.input.slice(0, model.input.length - partial.length) + hits[0];
        model.cursor = Array.from(model.input).length;
        return;
      }
      if (hits.length) model.hint = hits.join('   ');
    } else if (text && !key.ctrl && !key.meta) {
      const inserted = Array.from(text.replace(/[\x00-\x1f\x7f]/g, ''));
      chars.splice(model.cursor, 0, ...inserted);
      model.cursor += inserted.length;
    }
    model.input = chars.join('');
  });
}

async function promptConfirm(options = {}) {
  const settings = typeof options === 'string' ? { message: options } : options;
  if (!isInteractive()) return Boolean(settings.defaultYes);
  return promptSelect({
    ...settings,
    message: settings.message || settings.question || '',
    section: 'Confirm',
    defaultIndex: settings.defaultYes ? 0 : 1,
    choices: [
      { label: settings.yesLabel || 'Yes, continue', value: true, shortcut: 'y', danger: settings.danger,
        hint: settings.hint || 'Continue with this action.' },
      { label: settings.noLabel || 'No', value: false, shortcut: 'n', hint: 'Decline this action.' },
    ],
  });
}

function promptPause(message = 'Press Enter to continue…') {
  if (!isInteractive()) return Promise.resolve();
  const model = { message: '', offset: 0, hint: message, keys: '↑ ↓ scroll   enter continue   esc back' };
  return runPrompt(model, (_, key, finish) => {
    if (key.name === 'return' || key.name === 'enter') finish();
    else if (key.name === 'up') model.offset = Math.max(0, model.offset - 1);
    else if (key.name === 'down') model.offset++;
    else if (key.name === 'pageup') model.offset = Math.max(0, model.offset - 10);
    else if (key.name === 'pagedown') model.offset += 10;
    else if (key.name === 'home') model.offset = 0;
  });
}

module.exports = {
  isInteractive,
  clearScreen,
  createPathCompleter,
  pathCompleter,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
  promptPause,
  p,
  pc,
};
