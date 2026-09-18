const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const p = require('@clack/prompts');
const pc = require('picocolors');

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

function clearScreen() {
  if (process.stdout.isTTY && !process.env.CI && !process.env.NODE_TEST_CONTEXT) {
    process.stdout.write('\x1b[2J\x1b[H');
  }
}

const pathCompleter = createPathCompleter();

async function promptSelect(options = {}) {
  if (options.clear) {
    clearScreen();
  }
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];
  const defaultIndex = options.defaultIndex || 0;

  if (choices.length === 0) {
    return null;
  }

  // Normalize choices to { label, value, hint }
  const normalizedChoices = choices.map((c) => {
    if (typeof c === 'object' && c !== null) {
      return {
        label: c.label || c.title || String(c.value),
        value: c.value !== undefined ? c.value : c,
        hint: c.hint || c.description,
      };
    }
    return {
      label: String(c),
      value: c,
    };
  });

  if (!process.stdin.isTTY) {
    const idx = Math.max(0, Math.min(defaultIndex, normalizedChoices.length - 1));
    return normalizedChoices[idx].value;
  }

  const initialVal = normalizedChoices[Math.max(0, Math.min(defaultIndex, normalizedChoices.length - 1))]?.value;

  const result = await p.select({
    message,
    options: normalizedChoices.map((c) => ({
      value: c.value,
      label: c.label,
      hint: c.hint,
    })),
    initialValue: initialVal,
    maxItems: options.pageSize || options.maxItems || 10,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result;
}

async function promptMultiSelect(options = {}) {
  if (options.clear) {
    clearScreen();
  }
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];

  if (choices.length === 0) {
    return [];
  }

  const allItems = choices.map((c) => {
    if (typeof c === 'object' && c !== null) {
      return {
        label: c.label || c.title || String(c.value),
        value: c.value !== undefined ? c.value : c,
        hint: c.hint || c.description,
        selected: Boolean(c.selected),
      };
    }
    return {
      label: String(c),
      value: c,
      selected: false,
    };
  });

  if (!process.stdin.isTTY) {
    const selected = allItems.filter((c) => c.selected).map((c) => c.value);
    return selected.length > 0 ? selected : allItems.length > 0 ? [allItems[0].value] : [];
  }

  const initialValues = allItems.filter((c) => c.selected).map((c) => c.value);

  const result = await p.multiselect({
    message,
    options: allItems.map((c) => ({
      value: c.value,
      label: c.label,
      hint: c.hint,
    })),
    initialValues,
    required: options.required !== undefined ? options.required : false,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return result;
}

async function promptText(options = {}) {
  if (options.clear) {
    clearScreen();
  }
  const message = options.message || options.question || '';
  const defaultValue = options.defaultValue || '';
  const validate = options.validate || null;

  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  const result = await p.text({
    message,
    defaultValue,
    placeholder: options.placeholder || (defaultValue ? `default: ${defaultValue}` : ''),
    validate: validate
      ? (val) => {
          const inputVal = (val === undefined || val === null || val === '') ? (defaultValue || '') : val;
          const res = validate(inputVal);
          if (res !== true && typeof res === 'string') return res;
          if (res === false) return 'Invalid input';
          return undefined;
        }
      : undefined,
  });

  if (p.isCancel(result)) {
    return null;
  }

  return (result === '' && defaultValue) ? defaultValue : (result ?? defaultValue);
}

async function promptConfirm(options = {}) {
  if (options.clear) {
    clearScreen();
  }
  const message = typeof options === 'string' ? options : (options.message || options.question || '');
  const defaultYes = typeof options === 'object' ? Boolean(options.defaultYes) : false;

  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const result = await p.confirm({
    message,
    initialValue: defaultYes,
  });

  if (p.isCancel(result)) {
    return defaultYes;
  }

  return result;
}

function promptPause(message = 'Press Enter to continue...') {
  if (!process.stdin.isTTY) return Promise.resolve();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`\n${pc.dim(message)}`, () => {
      rl.close();
      resolve();
    });
  });
}

module.exports = {
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
