const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { ANSI, truncate } = require('./ansi');

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

const pathCompleter = createPathCompleter();

async function promptSelect(options) {
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];
  const defaultIndex = options.defaultIndex || 0;

  if (choices.length === 0) {
    return null;
  }

  // Normalize choices to { label, value, hint, description }
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
    // Non-interactive fallback
    return normalizedChoices[Math.min(defaultIndex, normalizedChoices.length - 1)].value;
  }

  return new Promise((resolvePromise) => {
    let selectedIndex = Math.max(0, Math.min(defaultIndex, normalizedChoices.length - 1));
    let isRendered = false;

    const render = () => {
      const termWidth = Math.max(20, process.stdout.columns || 80);
      if (isRendered) {
        process.stdout.write(`\r\x1b[${normalizedChoices.length + 1}A`);
      }
      isRendered = true;

      const titleLine = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset} ${ANSI.gray}(Use arrow keys or numbers, Enter to select)${ANSI.reset}`;
      process.stdout.write(ANSI.clearLine + truncate(titleLine, termWidth - 1) + '\n');

      normalizedChoices.forEach((choice, index) => {
        const isSelected = index === selectedIndex;
        const pointer = isSelected ? `${ANSI.brightCyan}❯${ANSI.reset}` : ' ';
        const numStr = `${ANSI.gray}${index + 1})${ANSI.reset}`;
        const label = isSelected
          ? `${ANSI.bold}${ANSI.brightCyan}${choice.label}${ANSI.reset}`
          : `${ANSI.white}${choice.label}${ANSI.reset}`;
        const hint = choice.hint ? ` ${ANSI.gray}(${choice.hint})${ANSI.reset}` : '';

        const line = `  ${pointer} ${numStr} ${label}${hint}`;
        process.stdout.write(ANSI.clearLine + truncate(line, termWidth - 1) + '\n');
      });
    };

    const cleanup = () => {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write(ANSI.showCursor);
    };

    const onData = (chunk) => {
      const key = chunk.toString();

      // Enter key
      if (key === '\r' || key === '\n') {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const selected = normalizedChoices[selectedIndex];
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
        resolvePromise(selected.value);
        return;
      }

      // Ctrl+C
      if (key === '\u0003') {
        cleanup();
        process.exit(130);
      }

      // Escape key or 'q'
      if (key === '\u001b' || (chunk.length === 1 && chunk[0] === 0x1b)) {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const backSummary = `${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Cancelled)${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(backSummary, termWidth - 1) + '\n\n');
        resolvePromise(null);
        return;
      }

      // Number key selection (1..9)
      const num = parseInt(key, 10);
      if (!isNaN(num) && num >= 1 && num <= normalizedChoices.length) {
        selectedIndex = num - 1;
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const selected = normalizedChoices[selectedIndex];
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
        resolvePromise(selected.value);
        return;
      }

      // Quick 'y' / 'Y' key selection for boolean / confirmation choices
      if (key === 'y' || key === 'Y') {
        const yesIdx = normalizedChoices.findIndex(
          (c) => c.value === true || c.label.toLowerCase().startsWith('yes')
        );
        if (yesIdx >= 0) {
          selectedIndex = yesIdx;
          cleanup();
          const termWidth = Math.max(20, process.stdout.columns || 80);
          const selected = normalizedChoices[selectedIndex];
          const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
          process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
          resolvePromise(selected.value);
          return;
        }
      }

      // Quick 'n' / 'N' key selection for boolean / confirmation choices
      if (key === 'n' || key === 'N') {
        const noIdx = normalizedChoices.findIndex(
          (c) => c.value === false || c.label.toLowerCase().startsWith('no')
        );
        if (noIdx >= 0) {
          selectedIndex = noIdx;
          cleanup();
          const termWidth = Math.max(20, process.stdout.columns || 80);
          const selected = normalizedChoices[selectedIndex];
          const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
          process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
          resolvePromise(selected.value);
          return;
        }
      }

      // Up arrow or k
      if (key === '\u001b[A' || key === '\u001bOA' || key === 'k') {
        selectedIndex = (selectedIndex - 1 + normalizedChoices.length) % normalizedChoices.length;
        render();
      }
      // Down arrow or j
      else if (key === '\u001b[B' || key === '\u001bOB' || key === 'j') {
        selectedIndex = (selectedIndex + 1) % normalizedChoices.length;
        render();
      }
    };

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdout.write(ANSI.hideCursor);
    render();
    process.stdin.on('data', onData);
  });
}

async function promptMultiSelect(options) {
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];
  const pageSize = options.pageSize || 8;
  const allowCustomInput = options.allowCustomInput !== false;

  if (choices.length === 0 && !allowCustomInput) {
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

  return new Promise((resolvePromise) => {
    let filterText = '';
    let selectedIndex = 0;
    let lastRenderedLineCount = 0;

    const getFilteredItems = () => {
      const lower = filterText.toLowerCase().trim();
      const matched = lower.length === 0
        ? allItems.slice()
        : allItems.filter(
            (item) =>
              item.label.toLowerCase().includes(lower) ||
              String(item.value).toLowerCase().includes(lower) ||
              (item.hint && item.hint.toLowerCase().includes(lower))
          );

      if (allowCustomInput && lower.length > 0) {
        const exactMatch = allItems.some(
          (i) => i.label.toLowerCase() === lower || String(i.value).toLowerCase() === lower
        );
        if (!exactMatch) {
          matched.push({
            label: `➕ Add "${filterText}"`,
            value: filterText,
            hint: 'custom entry',
            selected: false,
            isCustom: true,
          });
        }
      }

      return matched;
    };

    const render = () => {
      const termWidth = Math.max(20, process.stdout.columns || 80);
      const filtered = getFilteredItems();

      if (filtered.length === 0) {
        selectedIndex = 0;
      } else if (selectedIndex >= filtered.length) {
        selectedIndex = filtered.length - 1;
      } else if (selectedIndex < 0) {
        selectedIndex = 0;
      }

      const total = filtered.length;
      let startIndex = 0;
      let endIndex = Math.min(pageSize, total);

      if (selectedIndex >= endIndex) {
        endIndex = selectedIndex + 1;
        startIndex = Math.max(0, endIndex - pageSize);
      } else if (selectedIndex < startIndex) {
        startIndex = selectedIndex;
        endIndex = Math.min(total, startIndex + pageSize);
      }

      const visibleItems = filtered.slice(startIndex, endIndex);

      if (lastRenderedLineCount > 0) {
        process.stdout.write(`\r\x1b[${lastRenderedLineCount}A`);
      }

      const lines = [];

      // 1. Title line
      const title = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset} ${ANSI.dim}(<space> to toggle, "a" to toggle all, <enter> to confirm)${ANSI.reset}`;
      lines.push(ANSI.clearLine + truncate(title, termWidth - 1));

      // 2. Search Filter line
      const searchDisplay = filterText.length > 0
        ? `${ANSI.yellow}${filterText}${ANSI.reset}`
        : `${ANSI.dim}type to search...${ANSI.reset}`;
      lines.push(ANSI.clearLine + `  ${ANSI.bold}Search:${ANSI.reset} ${searchDisplay}`);

      // 3. Top scroll indicator
      if (startIndex > 0) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▲ ${startIndex} more above...${ANSI.reset}`);
      }

      // 4. Visible items
      if (filtered.length === 0) {
        lines.push(ANSI.clearLine + `  ${ANSI.gray}No matching items found${ANSI.reset}`);
      } else {
        visibleItems.forEach((item, idx) => {
          const globalIdx = startIndex + idx;
          const isCursor = globalIdx === selectedIndex;
          const pointer = isCursor ? `${ANSI.brightCyan}❯${ANSI.reset}` : ' ';
          const checkbox = item.selected
            ? `${ANSI.bold}${ANSI.green}[✔]${ANSI.reset}`
            : `${ANSI.gray}[ ]${ANSI.reset}`;

          const label = isCursor
            ? `${ANSI.bold}${ANSI.brightCyan}${item.label}${ANSI.reset}`
            : item.selected
              ? `${ANSI.bold}${item.label}${ANSI.reset}`
              : `${ANSI.white}${item.label}${ANSI.reset}`;

          const hint = item.hint ? ` ${ANSI.gray}(${item.hint})${ANSI.reset}` : '';
          lines.push(ANSI.clearLine + `  ${pointer} ${checkbox} ${label}${hint}`);
        });
      }

      // 5. Bottom scroll indicator
      if (endIndex < total) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▼ ${total - endIndex} more below...${ANSI.reset}`);
      }

      // 6. Selected counter footer
      const selectedTotal = allItems.filter((i) => i.selected).length;
      const countDisplay = `${ANSI.dim}(${selectedTotal} selected)${ANSI.reset}`;
      lines.push(ANSI.clearLine + `  ${countDisplay}`);

      lastRenderedLineCount = lines.length;
      process.stdout.write(lines.join('\n') + '\n');
    };

    const cleanup = () => {
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write(ANSI.showCursor);
    };

    const onData = (chunk) => {
      const key = chunk.toString();

      // Enter key
      if (key === '\r' || key === '\n') {
        cleanup();
        const selected = allItems.filter((i) => i.selected).map((i) => i.value);
        const filtered = getFilteredItems();
        let finalValues = selected;
        if (finalValues.length === 0 && filtered.length > 0) {
          const current = filtered[selectedIndex];
          if (current) {
            finalValues = [current.value];
          }
        }

        const termWidth = Math.max(20, process.stdout.columns || 80);
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}[${finalValues.join(', ')}]${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
        resolvePromise(finalValues);
        return;
      }

      // Ctrl+C
      if (key === '\u0003') {
        cleanup();
        process.exit(130);
      }

      // Standalone Escape
      if (key === '\u001b' || (chunk.length === 1 && chunk[0] === 0x1b)) {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const backSummary = `${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Cancelled)${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(backSummary, termWidth - 1) + '\n\n');
        resolvePromise(null);
        return;
      }

      // Up arrow or Ctrl+P
      if (key === '\u001b[A' || key === '\u001bOA' || key === '\u0010') {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
          render();
        }
        return;
      }

      // Down arrow or Ctrl+N
      if (key === '\u001b[B' || key === '\u001bOB' || key === '\u000e') {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex + 1) % filtered.length;
          render();
        }
        return;
      }

      // Space key: Toggle checkbox
      if (key === ' ' || (chunk.length === 1 && chunk[0] === 32)) {
        const filtered = getFilteredItems();
        const current = filtered[selectedIndex];
        if (current) {
          if (current.isCustom) {
            const newItem = {
              label: String(current.value),
              value: current.value,
              selected: true,
            };
            allItems.push(newItem);
            filterText = '';
            selectedIndex = allItems.length - 1;
          } else {
            current.selected = !current.selected;
            const original = allItems.find((i) => i.value === current.value);
            if (original) original.selected = current.selected;
          }
          render();
        }
        return;
      }

      // Backspace: Delete from search filter
      if (chunk.length === 1 && (chunk[0] === 0x7f || chunk[0] === 0x08)) {
        if (filterText.length > 0) {
          filterText = filterText.slice(0, -1);
          selectedIndex = 0;
          render();
        }
        return;
      }

      // Ctrl+A (Toggle all visible items) or 'a' if filter is empty
      if (chunk.length === 1 && (chunk[0] === 0x01 || (filterText === '' && (key === 'a' || key === 'A')))) {
        const filtered = getFilteredItems();
        const allSelected = filtered.every((i) => i.selected);
        for (const item of filtered) {
          if (!item.isCustom) {
            item.selected = !allSelected;
            const original = allItems.find((i) => i.value === item.value);
            if (original) original.selected = item.selected;
          }
        }
        render();
        return;
      }

      // Printable character typing (for real-time filter search)
      if (chunk.length === 1 && chunk[0] >= 32 && chunk[0] <= 126) {
        filterText += chunk.toString();
        selectedIndex = 0;
        render();
        return;
      }
    };

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdout.write(ANSI.hideCursor);
    render();
    process.stdin.on('data', onData);
  });
}

async function promptText(options) {
  const message = options.message || options.question || '';
  const defaultValue = options.defaultValue || '';
  const validate = options.validate || null;

  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  return new Promise((resolvePromise) => {
    let resolvedCompleter;
    if (typeof options.completer === 'function') {
      resolvedCompleter = options.completer;
    } else if (options.completer === 'dir') {
      resolvedCompleter = createPathCompleter({ directoriesOnly: true });
    } else if (options.completer === 'path') {
      resolvedCompleter = pathCompleter;
    }

    process.stdin.resume();

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: resolvedCompleter,
    });

    const defaultHint = defaultValue ? `${ANSI.gray}(${defaultValue})${ANSI.reset} ` : '';
    const promptMsg = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset} ${defaultHint}`;

    const onData = (chunk) => {
      // Standalone Escape key
      if (chunk.length === 1 && chunk[0] === 0x1b) {
        cleanup();
        process.stdout.write(`\r${ANSI.clearLine}${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Cancelled)${ANSI.reset}\n\n`);
        resolvePromise(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      rl.close();
    };

    process.stdin.on('data', onData);

    const ask = () => {
      rl.question(promptMsg, (answer) => {
        const val = answer.trim() || defaultValue;
        if (validate) {
          const res = validate(val);
          if (res !== true) {
            console.log(`  ${ANSI.red}✖${ANSI.reset} ${res || 'Invalid input'}`);
            ask();
            return;
          }
        }
        cleanup();
        process.stdout.write('\n');
        resolvePromise(val);
      });
    };

    ask();
  });
}

async function promptConfirm(options) {
  const message = typeof options === 'string' ? options : (options.message || options.question || '');
  const defaultYes = typeof options === 'object' ? Boolean(options.defaultYes) : false;

  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const choices = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  const result = await promptSelect({
    message,
    choices,
    defaultIndex: defaultYes ? 0 : 1,
  });

  return result !== null ? result : defaultYes;
}

module.exports = {
  createPathCompleter,
  pathCompleter,
  promptSelect,
  promptMultiSelect,
  promptText,
  promptConfirm,
};
