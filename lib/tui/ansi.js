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

function visibleLength(text) {
  return stripAnsi(text).length;
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

    for (const c of rawCodes) {
      if (c === 0) {
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

    const tokenVisibleLen = stripAnsi(token).length;
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
        let remaining = token;
        while (remaining.length > 0) {
          const available = Math.max(1, maxWidth - currentVisibleWidth);
          const chunk = remaining.slice(0, available);
          remaining = remaining.slice(available);

          currentLine += chunk;
          currentVisibleWidth += chunk.length;

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

  const targetWidth = Math.max(1, maxWidth - 1);
  const tokenRegex = /(?:\x1b\](?:[^\x07\x1b]|\x1b[^\\])*?(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[a-zA-Z]|\x1b[@-Z\\-_]|[^\x1b])/g;
  const tokens = text.match(tokenRegex) || [];

  let result = '';
  let currentVisible = 0;

  for (const token of tokens) {
    if (token.startsWith('\x1b')) {
      result += token;
    } else {
      if (currentVisible + 1 > targetWidth) {
        break;
      }
      result += token;
      currentVisible += 1;
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
