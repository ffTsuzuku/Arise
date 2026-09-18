const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',

  // Foreground
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Bright Foreground
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  // Background
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
  bgGray: '\x1b[100m',

  // Cursor & Screen
  clearScreen: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K\r',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  altScreenEnter: '\x1b[?1049h',
  altScreenExit: '\x1b[?1049l',
};

function stripAnsi(text) {
  if (typeof text !== 'string') return '';
  return text
    // Strip OSC sequences
    .replace(/\x1b\](?:[^\x07\x1b]|\x1b[^\\])*?(?:\x07|\x1b\\)/g, '')
    // Strip CSI sequences
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    // Strip other escape sequences
    .replace(/\x1b[@-Z\\-_]/g, '');
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function graphemes(text) {
  return Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);
}

function cellWidth(character) {
  if (/^[\p{Mark}\u200d\ufe0f]+$/u.test(character)) return 0;
  if (/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(character)) return 2;
  const code = character.codePointAt(0);
  return code >= 0x1100 && (
    code <= 0x115f || code === 0x2329 || code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  ) ? 2 : 1;
}

function visibleLength(text) {
  return graphemes(stripAnsi(text)).reduce((width, character) => width + cellWidth(character), 0);
}

class AnsiStyleTracker {
  constructor() {
    this.fg = '';
    this.bg = '';
    this.bold = false;
    this.dim = false;
    this.italic = false;
    this.underline = false;
    this.strike = false;
  }

  processCode(codeStr) {
    const match = codeStr.match(/^\x1b\[([0-9;?]*)m$/);
    if (!match) return;
    const rawCodes = match[1] ? match[1].split(';').map(Number) : [0];

    for (let i = 0; i < rawCodes.length; i++) {
      const c = rawCodes[i];
      if ((c === 38 || c === 48) && (rawCodes[i + 1] === 2 || rawCodes[i + 1] === 5)) {
        const count = rawCodes[i + 1] === 2 ? 5 : 3;
        this[c === 38 ? 'fg' : 'bg'] = `\x1b[${rawCodes.slice(i, i + count).join(';')}m`;
        i += count - 1;
      } else if (c === 0) {
        this.fg = '';
        this.bg = '';
        this.bold = false;
        this.dim = false;
        this.italic = false;
        this.underline = false;
        this.strike = false;
      } else if (c === 1) {
        this.bold = true;
      } else if (c === 2) {
        this.dim = true;
      } else if (c === 3) {
        this.italic = true;
      } else if (c === 4) {
        this.underline = true;
      } else if (c === 9) {
        this.strike = true;
      } else if (c === 22) {
        this.bold = false;
        this.dim = false;
      } else if (c === 23) {
        this.italic = false;
      } else if (c === 24) {
        this.underline = false;
      } else if (c === 29) {
        this.strike = false;
      } else if (c === 39) {
        this.fg = '';
      } else if (c === 49) {
        this.bg = '';
      } else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) {
        this.fg = `\x1b[${c}m`;
      } else if ((c >= 40 && c <= 47) || (c >= 100 && c <= 107)) {
        this.bg = `\x1b[${c}m`;
      }
    }
  }

  getActiveCodes() {
    let result = '';
    if (this.bold) result += '\x1b[1m';
    if (this.dim) result += '\x1b[2m';
    if (this.italic) result += '\x1b[3m';
    if (this.underline) result += '\x1b[4m';
    if (this.strike) result += '\x1b[9m';
    if (this.fg) result += this.fg;
    if (this.bg) result += this.bg;
    return result;
  }

  hasActiveStyles() {
    return this.bold || this.dim || this.italic || this.underline || this.strike || Boolean(this.fg) || Boolean(this.bg);
  }
}

function wrapAnsiLine(line, maxWidth, hangingIndent = '') {
  if (maxWidth <= 0) return [line];
  const totalVisible = visibleLength(line);
  if (totalVisible <= maxWidth) {
    return [line];
  }

  const tokenRegex = /(?:\x1b\](?:[^\x07\x1b]|\x1b[^\\])*?(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[a-zA-Z]|\x1b[@-Z\\-_]|[^\s\x1b]+|\s+)/g;
  const tokens = line.match(tokenRegex) || [line];

  const result = [];
  const tracker = new AnsiStyleTracker();

  let currentLine = '';
  let currentVisibleWidth = 0;
  let isFirstLine = true;
  const hangingVisibleWidth = visibleLength(hangingIndent);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.startsWith('\x1b')) {
      tracker.processCode(token);
      currentLine += token;
      continue;
    }

    const tokenVisibleLen = visibleLength(token);
    const isWhitespace = /^\s+$/.test(token);

    if (isWhitespace) {
      if (currentVisibleWidth === hangingVisibleWidth && !isFirstLine) {
        continue;
      }
      if (currentVisibleWidth + tokenVisibleLen <= maxWidth) {
        currentLine += token;
        currentVisibleWidth += tokenVisibleLen;
      } else {
        if (tracker.hasActiveStyles()) {
          currentLine += ANSI.reset;
        }
        result.push(currentLine);
        isFirstLine = false;
        currentLine = hangingIndent + tracker.getActiveCodes();
        currentVisibleWidth = hangingVisibleWidth;
      }
      continue;
    }

    // Word token
    if (currentVisibleWidth + tokenVisibleLen <= maxWidth) {
      currentLine += token;
      currentVisibleWidth += tokenVisibleLen;
    } else {
      if (currentVisibleWidth > (isFirstLine ? 0 : hangingVisibleWidth)) {
        if (tracker.hasActiveStyles()) {
          currentLine += ANSI.reset;
        }
        result.push(currentLine);
        isFirstLine = false;
        currentLine = hangingIndent + tracker.getActiveCodes();
        currentVisibleWidth = hangingVisibleWidth;
      }

      if (tokenVisibleLen > maxWidth - currentVisibleWidth) {
        const remaining = graphemes(token);
        while (remaining.length > 0) {
          const available = Math.max(1, maxWidth - currentVisibleWidth);
          let chunk = '';
          let chunkWidth = 0;
          while (remaining.length && chunkWidth + cellWidth(remaining[0]) <= available) {
            const character = remaining.shift();
            chunk += character;
            chunkWidth += cellWidth(character);
          }
          // A two-cell glyph cannot fit in a one-column viewport.
          if (!chunk && currentVisibleWidth === hangingVisibleWidth && cellWidth(remaining[0]) > maxWidth - hangingVisibleWidth) {
            remaining.shift();
            chunk = '…';
            chunkWidth = 1;
          }

          currentLine += chunk;
          currentVisibleWidth += chunkWidth;

          if (remaining.length > 0) {
            if (tracker.hasActiveStyles()) {
              currentLine += ANSI.reset;
            }
            result.push(currentLine);
            isFirstLine = false;
            currentLine = hangingIndent + tracker.getActiveCodes();
            currentVisibleWidth = hangingVisibleWidth;
          }
        }
      } else {
        currentLine += token;
        currentVisibleWidth += tokenVisibleLen;
      }
    }
  }

  if (currentLine.length > 0) {
    if (tracker.hasActiveStyles()) {
      currentLine += ANSI.reset;
    }
    result.push(currentLine);
  }

  return result.length > 0 ? result : [''];
}

function truncate(text, maxWidth) {
  if (maxWidth <= 0) return '';
  const totalVisible = visibleLength(text);
  if (totalVisible <= maxWidth) return text;

  const targetWidth = Math.max(0, maxWidth - 1);
  const tokenRegex = /(?:\x1b\](?:[^\x07\x1b]|\x1b[^\\])*?(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[a-zA-Z]|\x1b[@-Z\\-_]|[^\x1b]+)/g;
  const tokens = (text.match(tokenRegex) || []).flatMap((token) => token.startsWith('\x1b') ? [token] : graphemes(token));

  let result = '';
  let currentVisible = 0;

  for (const token of tokens) {
    if (token.startsWith('\x1b')) {
      result += token;
    } else {
      const width = cellWidth(token);
      if (currentVisible + width > targetWidth) {
        break;
      }
      result += token;
      currentVisible += width;
    }
  }

  return result + ANSI.reset + '…';
}

function drawBox(title, contentLines = [], width = 70) {
  const safeWidth = Math.max(10, width);
  const horizontal = '─'.repeat(Math.max(0, safeWidth - 2));
  const titleFormatted = title ? ` ${ANSI.bold}${title}${ANSI.reset} ` : '';
  const titleLen = visibleLength(titleFormatted);
  const topBar = `┌${titleFormatted}${'─'.repeat(Math.max(0, safeWidth - 2 - titleLen))}┐`;
  const bottomBar = `└${horizontal}┘`;

  const maxInner = Math.max(0, safeWidth - 4);
  const renderedLines = contentLines.map((line) => {
    const truncatedLine = truncate(line, maxInner);
    const plain = visibleLength(truncatedLine);
    const padding = Math.max(0, maxInner - plain);
    return `│ ${truncatedLine}${' '.repeat(padding)} │`;
  });

  return [topBar, ...renderedLines, bottomBar];
}

module.exports = {
  ANSI,
  stripAnsi,
  visibleLength,
  AnsiStyleTracker,
  wrapAnsiLine,
  truncate,
  drawBox,
};
