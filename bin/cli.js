#!/usr/bin/env node

const { run } = require('../index');
const { paint } = require('../lib/tui/theme');

run(process.argv.slice(2), process.cwd()).catch(err => {
  console.error(paint(`Fatal error: ${err.message}`, 'danger'));
  process.exit(1);
});
