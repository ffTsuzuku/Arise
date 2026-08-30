import { readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { homedir } from 'node:os';
import * as readline from 'node:readline';
import { ANSI, truncate } from './ansi.js';

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
}

export interface PathCompleterOptions {
  directoriesOnly?: boolean;
}

export function createPathCompleter(options: PathCompleterOptions = {}): readline.Completer {
  return function pathCompleter(line: string): [string[], string] {
    const raw = (line || '').trim();

    if (raw === '~') {
      return [['~/'], '~'];
    }

    let expanded = raw;
    if (raw.startsWith('~' + sep) || raw.startsWith('~/')) {
      expanded = join(homedir(), raw.slice(2));
    } else if (raw === '~') {
      expanded = homedir();
    }

    let searchDir: string;
    let partial: string;

    if (raw.endsWith('/') || raw.endsWith(sep)) {
      searchDir = expanded;
      partial = '';
    } else {
      const lastSlashIndex = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
      if (lastSlashIndex >= 0) {
        const dirPart = expanded.slice(0, expanded.lastIndexOf(sep) + 1);
        searchDir = dirPart || (sep === '\\' ? 'C:\\' : '/');
        partial = raw.slice(lastSlashIndex + 1);
      } else {
        searchDir = process.cwd();
        partial = raw;
      }
    }

    try {
      const entries = readdirSync(searchDir || '.', { withFileTypes: true });
      const hits: string[] = [];

      for (const entry of entries) {
        if (!partial.startsWith('.') && entry.name.startsWith('.')) {
          continue;
        }

        if (entry.name.startsWith(partial)) {
          let isDir = entry.isDirectory();
          if (!isDir && entry.isSymbolicLink()) {
            try {
              const fullPath = join(searchDir || '.', entry.name);
              isDir = statSync(fullPath).isDirectory();
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

export const pathCompleter: readline.Completer = createPathCompleter();

export interface PromptTextOptions {
  message?: string;
  question?: string;
  defaultValue?: string;
  validate?: (val: string) => boolean | string;
  completer?: readline.Completer | 'path' | 'dir';
}

export interface PromptSelectOptions<T = string> {
  message?: string;
  title?: string;
  choices?: (SelectOption<T> | string)[];
  items?: (SelectOption<T> | string)[];
  defaultIndex?: number;
}

export async function promptSelect<T = string>(options: PromptSelectOptions<T>): Promise<T | null> {
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];
  const defaultIndex = options.defaultIndex || 0;

  if (choices.length === 0) {
    return null;
  }

  const normalizedChoices: SelectOption<T>[] = choices.map((c) => {
    if (typeof c === 'object' && c !== null) {
      return {
        label: c.label || (c as any).title || String(c.value),
        value: c.value !== undefined ? c.value : (c as unknown as T),
        hint: c.hint || (c as any).description,
      };
    }
    return {
      label: String(c),
      value: c as unknown as T,
    };
  });

  if (!process.stdin.isTTY) {
    return normalizedChoices[Math.min(defaultIndex, normalizedChoices.length - 1)]!.value;
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

    const onData = (chunk: Buffer) => {
      const key = chunk.toString();

      if (key === '\r' || key === '\n') {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const selected = normalizedChoices[selectedIndex]!;
        const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
        resolvePromise(selected.value);
        return;
      }

      if (key === '\u0003') {
        cleanup();
        process.exit(130);
      }

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
        const selected = normalizedChoices[selectedIndex]!;
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
          const selected = normalizedChoices[selectedIndex]!;
          const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
          process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
          resolvePromise(selected.value);
          return;
        }
      }

      // Quick 'n' / 'N' key selection for boolean / confirmation choices
      if (key === 'n' || key === 'N') {
        const noIdx = normalizedChoices.findIndex(
          (c) => (c.value as any) === false || c.label.toLowerCase().startsWith('no')
        );
        if (noIdx >= 0) {
          selectedIndex = noIdx;
          cleanup();
          const termWidth = Math.max(20, process.stdout.columns || 80);
          const selected = normalizedChoices[selectedIndex]!;
          const summary = `${ANSI.bold}${ANSI.green}✔${ANSI.reset} ${message} ${ANSI.cyan}${selected.label}${ANSI.reset}`;
          process.stdout.write(ANSI.clearLine + truncate(summary, termWidth - 1) + '\n\n');
          resolvePromise(selected.value);
          return;
        }
      }

      if (key === '\u001b[A' || key === '\u001bOA' || key === 'k') {
        selectedIndex = (selectedIndex - 1 + normalizedChoices.length) % normalizedChoices.length;
        render();
      } else if (key === '\u001b[B' || key === '\u001bOB' || key === 'j') {
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

export interface MultiSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
  selected?: boolean;
}

export interface PromptMultiSelectOptions<T = string> {
  message?: string;
  title?: string;
  choices?: (MultiSelectOption<T> | string)[];
  items?: (MultiSelectOption<T> | string)[];
  pageSize?: number;
  allowCustomInput?: boolean;
}

export async function promptMultiSelect<T = string>(options: PromptMultiSelectOptions<T>): Promise<T[] | null> {
  const message = options.message || options.title || '';
  const choices = options.choices || options.items || [];
  const pageSize = options.pageSize || 8;
  const allowCustomInput = options.allowCustomInput !== false;

  if (choices.length === 0 && !allowCustomInput) {
    return [];
  }

  const allItems: Array<{ label: string; value: T; hint?: string; selected: boolean; isCustom?: boolean }> = choices.map((c) => {
    if (typeof c === 'object' && c !== null) {
      return {
        label: c.label || (c as any).title || String(c.value),
        value: c.value !== undefined ? c.value : (c as unknown as T),
        hint: c.hint || (c as any).description,
        selected: Boolean(c.selected),
      };
    }
    return {
      label: String(c),
      value: c as unknown as T,
      selected: false,
    };
  });

  if (!process.stdin.isTTY) {
    const selected = allItems.filter((c) => c.selected).map((c) => c.value);
    return selected.length > 0 ? selected : allItems.length > 0 ? [allItems[0]!.value] : [];
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
            value: filterText as unknown as T,
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

      const lines: string[] = [];

      const title = `${ANSI.bold}${ANSI.cyan}?${ANSI.reset} ${ANSI.bold}${message}${ANSI.reset} ${ANSI.dim}(<space> to toggle, "a" to toggle all, <enter> to confirm)${ANSI.reset}`;
      lines.push(ANSI.clearLine + truncate(title, termWidth - 1));

      const searchDisplay = filterText.length > 0
        ? `${ANSI.yellow}${filterText}${ANSI.reset}`
        : `${ANSI.dim}type to search...${ANSI.reset}`;
      lines.push(ANSI.clearLine + `  ${ANSI.bold}Search:${ANSI.reset} ${searchDisplay}`);

      if (startIndex > 0) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▲ ${startIndex} more above...${ANSI.reset}`);
      }

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

      if (endIndex < total) {
        lines.push(ANSI.clearLine + `  ${ANSI.dim}▼ ${total - endIndex} more below...${ANSI.reset}`);
      }

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

    const onData = (chunk: Buffer) => {
      const key = chunk.toString();

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

      if (key === '\u0003') {
        cleanup();
        process.exit(130);
      }

      if (key === '\u001b' || (chunk.length === 1 && chunk[0] === 0x1b)) {
        cleanup();
        const termWidth = Math.max(20, process.stdout.columns || 80);
        const backSummary = `${ANSI.bold}${ANSI.gray}↩${ANSI.reset} ${ANSI.dim}${message} (Cancelled)${ANSI.reset}`;
        process.stdout.write(ANSI.clearLine + truncate(backSummary, termWidth - 1) + '\n\n');
        resolvePromise(null);
        return;
      }

      if (key === '\u001b[A' || key === '\u001bOA' || key === '\u0010') {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
          render();
        }
        return;
      }

      if (key === '\u001b[B' || key === '\u001bOB' || key === '\u000e') {
        const filtered = getFilteredItems();
        if (filtered.length > 0) {
          selectedIndex = (selectedIndex + 1) % filtered.length;
          render();
        }
        return;
      }

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

      if (chunk.length === 1 && (chunk[0] === 0x7f || chunk[0] === 0x08)) {
        if (filterText.length > 0) {
          filterText = filterText.slice(0, -1);
          selectedIndex = 0;
          render();
        }
        return;
      }

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

      if (chunk.length === 1 && chunk[0]! >= 32 && chunk[0]! <= 126) {
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

export async function promptText(options: PromptTextOptions): Promise<string | null> {
  const message = options.message || options.question || '';
  const defaultValue = options.defaultValue || '';
  const validate = options.validate || null;

  if (!process.stdin.isTTY) {
    return defaultValue;
  }

  return new Promise((resolvePromise) => {
    let resolvedCompleter: readline.Completer | undefined;
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

    const onData = (chunk: Buffer) => {
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

export async function promptConfirm(options: { message?: string; question?: string; defaultYes?: boolean } | string): Promise<boolean> {
  const message = typeof options === 'string' ? options : (options.message || options.question || '');
  const defaultYes = typeof options === 'object' ? Boolean(options.defaultYes) : false;

  if (!process.stdin.isTTY) {
    return defaultYes;
  }

  const choices: SelectOption<boolean>[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
  ];

  const result = await promptSelect<boolean>({
    message,
    choices,
    defaultIndex: defaultYes ? 0 : 1,
  });

  return result !== null ? result : defaultYes;
}
