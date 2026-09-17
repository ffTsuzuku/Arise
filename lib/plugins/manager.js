const logger = require('../logger');

class PluginManager {
  constructor() {
    this.plugins = [];
  }

  register(plugin) {
    if (!plugin) return;
    const resolved = typeof plugin === 'function' ? plugin() : plugin;
    if (resolved && resolved.name) {
      const existingIndex = this.plugins.findIndex((p) => p.name === resolved.name);
      if (existingIndex >= 0) {
        this.plugins[existingIndex] = resolved;
      } else {
        this.plugins.push(resolved);
      }
      logger.debug(`Registered plugin: ${resolved.name}`);
    }
  }

  registerMany(plugins = []) {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  getPlugins() {
    return this.plugins;
  }

  hasPlugin(name) {
    return this.plugins.some((p) => p.name === name);
  }

  /**
   * Allow plugins to resolve or redirect the target directory and session name
   * (e.g. Git worktree plugin creates or locates the worktree directory)
   */
  async hookResolveTarget(context) {
    for (const plugin of this.plugins) {
      if (typeof plugin.resolveTarget === 'function') {
        try {
          const result = await plugin.resolveTarget(context);
          if (result && (result.targetDir || result.sessionName)) {
            logger.debug(`Plugin "${plugin.name}" resolved target:`, result);
            return result;
          }
        } catch (err) {
          logger.error(`Plugin "${plugin.name}" error in resolveTarget: ${err.message}`, err);
          throw err;
        }
      }
    }
    return null;
  }

  /**
   * Hook run before terminal session creation and layout rendering
   */
  async hookOnBeforeSession(context) {
    for (const plugin of this.plugins) {
      if (typeof plugin.onBeforeSession === 'function') {
        try {
          await plugin.onBeforeSession(context);
        } catch (err) {
          logger.error(`Plugin "${plugin.name}" error in onBeforeSession: ${err.message}`, err);
          throw err;
        }
      }
    }
  }

  /**
   * Hook run after terminal session creation and layout rendering
   */
  async hookOnAfterSession(context) {
    for (const plugin of this.plugins) {
      if (typeof plugin.onAfterSession === 'function') {
        try {
          await plugin.onAfterSession(context);
        } catch (err) {
          logger.error(`Plugin "${plugin.name}" error in onAfterSession: ${err.message}`, err);
        }
      }
    }
  }

  /**
   * Hook run during session teardown / nuke
   * If a plugin returns true, it handled the teardown (e.g. worktree removal & branch deletion)
   */
  async hookOnTeardown(context) {
    for (const plugin of this.plugins) {
      if (typeof plugin.onTeardown === 'function') {
        try {
          const handled = await plugin.onTeardown(context);
          if (handled) {
            return true;
          }
        } catch (err) {
          logger.error(`Plugin "${plugin.name}" error in onTeardown: ${err.message}`, err);
          throw err;
        }
      }
    }
    return false;
  }

  /**
   * Collect interactive menu actions exposed by plugins
   */
  getMenuActions(context) {
    const actions = [];
    for (const plugin of this.plugins) {
      if (typeof plugin.menuActions === 'function') {
        try {
          const acts = plugin.menuActions(context);
          if (Array.isArray(acts)) {
            actions.push(...acts);
          }
        } catch (err) {
          logger.warn(`Plugin "${plugin.name}" error in menuActions: ${err.message}`);
        }
      }
    }
    return actions;
  }

  /**
   * Allow plugins to handle custom CLI subcommands (e.g. 'worktree')
   */
  async hookHandleCommand(command, subargs, context) {
    for (const plugin of this.plugins) {
      if (typeof plugin.handleCommand === 'function') {
        try {
          const handled = await plugin.handleCommand(command, subargs, context);
          if (handled) return true;
        } catch (err) {
          logger.error(`Plugin "${plugin.name}" error in handleCommand: ${err.message}`, err);
          throw err;
        }
      }
    }
    return false;
  }
}

module.exports = {
  PluginManager,
};
