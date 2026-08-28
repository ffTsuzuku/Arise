#!/usr/bin/env node

const { run } = require('../index');

run(process.argv.slice(2), process.cwd()).catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
