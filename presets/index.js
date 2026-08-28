const nodePreset = require('./node');
const laravelPreset = require('./laravel');
const genericPreset = require('./generic');

const builtInPresets = [
  laravelPreset, // Check Laravel/PHP before generic
  nodePreset,    // Check Node before generic
  genericPreset, // Catch-all fallback
];

function getPreset(name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim();
  if (normalized === 'php' || normalized === 'laravel' || normalized === 'api' || normalized === 'be') {
    return laravelPreset;
  }
  if (normalized === 'node' || normalized === 'js' || normalized === 'ts' || normalized === 'fe' || normalized === 'react') {
    return nodePreset;
  }
  if (normalized === 'generic' || normalized === 'default') {
    return genericPreset;
  }
  return null;
}

function detectPreset(cwd = process.cwd()) {
  for (const preset of builtInPresets) {
    if (typeof preset.detect === 'function' && preset.detect(cwd)) {
      return preset;
    }
  }
  return genericPreset;
}

module.exports = {
  getPreset,
  detectPreset,
  builtInPresets,
};
