/**
 * Arise - Type Definitions
 * 
 * Provides strict structural contracts for presets, configuration,
 * declarative layouts, execution context, multiplexer drivers, plugins, and lifecycle hooks.
 */

export type MultiplexerType = 'tmux' | 'herdr' | 'auto';

export interface CliFlags {
  interactive: boolean;
  isInit: boolean;
  quick: boolean;
  isCleanup: boolean;
  cleanupTarget: string | null;
  dirOnly: boolean;
  keepRemote: boolean;
  force: boolean;
  yes: boolean;
  debug: boolean;
  verbose: boolean;
  multiplexer: string | null;
  sessionName: string | null;
  targetDir: string | null;
  subcommand: string | null;
  subargs: string[];
  isKill: boolean;
  listSessions: boolean;
  noAttach: boolean;
  branch: string | null;
  dirname: string | null;
  workspaceName: string | null;
  source: string | null;
  presetName: string | null;
  agent: string | null;
  focusTarget: string | null;
  installSkill: boolean;
  skillScope: 'global' | 'local' | null;
  targetPath: string | null;
  gitignore: boolean | null;
  showHelp: boolean;
  showVersion: boolean;
  rawArgs: string[];
}

export type SplitDirection = 'right' | 'down';

export interface PaneDefinition {
  /** Unique ID for the pane within this layout */
  id: string;
  /** Display title for the pane in multiplexer */
  title: string;
  /** Command to execute upon creation (or null for empty shell) */
  cmd: string | null;
  /** Position if this is the root pane ('root') */
  position?: 'root';
  /** ID of parent pane from which to split */
  from?: string;
  /** Direction to split ('right' | 'down') */
  split?: SplitDirection;
  /** Whether to focus this pane by default */
  focus?: boolean;
  /** Whether this pane is designated as the AI CLI agent pane */
  isAgent?: boolean;
}

export interface MultiplexerDriver {
  name: 'tmux' | 'herdr';
  isAvailable(): boolean;
  ensureInstalled(options?: { yes?: boolean }): Promise<boolean>;
  listSessions(): Array<{ id: string; name: string; label: string; cwd: string; active: boolean }>;
  createSession(options: { name: string; cwd: string }): Promise<{ sessionId: string; rootPaneId: string; name: string }> | { sessionId: string; rootPaneId: string; name: string };
  closeSession(nameOrId: string): boolean;
  closeSessionsMatching(targets: string[]): void;
  focusSession(sessionId: string): void;
  splitPane(options: { paneId: string; direction?: SplitDirection; cwd?: string; focus?: boolean }): string;
  renamePane(paneId: string, name: string): void;
  runInPane(paneId: string, command: string): void;
  focusPane(paneId: string): void;
  attachOrSwitchSession(sessionName: string): void;
}

export interface PluginContext {
  flags: CliFlags;
  config: AriseConfig;
  cwd: string;
  driver?: MultiplexerDriver;
  [key: string]: any;
}

export interface PluginTargetResult {
  targetDir?: string;
  sessionName?: string;
  branch?: string | null;
  repoRoot?: string | null;
  isWorktree?: boolean;
  worktreeExists?: boolean;
  [key: string]: any;
}

export interface PluginMenuAction {
  title: string;
  description?: string;
  value: string;
  handler?: (context: PluginContext) => Promise<void> | void;
}

export interface Plugin {
  name: string;
  version?: string;
  resolveTarget?(context: PluginContext): Promise<PluginTargetResult | null | void> | PluginTargetResult | null | void;
  onBeforeSession?(context: ExecutionContext): Promise<void> | void;
  onAfterSession?(context: { ctx: ExecutionContext; session: any; driver: MultiplexerDriver }): Promise<void> | void;
  onTeardown?(context: PluginContext): Promise<boolean | void> | boolean | void;
  menuActions?(context: { isGitRepo?: boolean; [key: string]: any }): PluginMenuAction[];
}

export interface RepoConfig {
  /** Path to bare repository (if using bare git topology) */
  bareRepo?: string | null;
  /** Base directory where worktrees should be placed */
  worktreesBase?: string | null;
  /** Default base branch to branch off (e.g. 'develop', 'prod', 'main') */
  defaultBaseBranch?: string;
  /** Array of branch names protected against deletion */
  protectedBranches?: string[];
}

export interface WorkspaceConfig {
  /** Prefix added to workspace/session labels (e.g. '[BE] ') */
  labelPrefix?: string;
  /** CLI AI agent to run in the workspace pane ('agy', 'claude', 'aider', 'copilot', 'none', etc.) */
  agent?: string | { cmd: string; title?: string; [key: string]: any } | null;
  /** Default pane to focus ('agent', 'agy', 'claude', 'vim', 'logs', 'server', 'shell') */
  defaultFocus?: string;
}

export interface ScaffoldConfig {
  /** Path to environment file (.env) to copy */
  envSource?: string | null;
  /** Target symlink path to point to the active worktree (e.g. '/var/www/my-app') */
  symlink?: string | null;
  /** Command to run to install dependencies upon creation, or false/null to skip installation */
  install?: string | boolean | null;
  [key: string]: any;
}

export interface ExecutionContext {
  /** Target worktree / workspace absolute directory */
  worktreePath: string;
  targetDir: string;
  sessionName: string;
  /** Repository root directory */
  repoRoot: string | null;
  /** Bare repo directory (if applicable) */
  bareRepo: string | null;
  /** Target branch name (if applicable) */
  branch: string | null;
  /** Base source branch */
  source: string;
  /** Parsed CLI flags */
  flags: CliFlags;
  /** Active preset */
  preset: Preset;
  /** Merged configuration */
  config: AriseConfig;
  /** Active multiplexer driver */
  driver?: MultiplexerDriver;
  isWorktree?: boolean;
  worktreeExists?: boolean;

  log(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;

  /** Execute a shell command synchronously */
  exec(command: string, options?: import('child_process').ExecSyncOptions): Buffer | string;
  /** Spawn a process synchronously with stdio inherit */
  spawn(command: string, args?: string[], options?: import('child_process').SpawnSyncOptions): import('child_process').SpawnSyncReturns<Buffer>;
  /** Copy file from src to dst */
  copyFile(src: string, dst: string): boolean;
  /** Copy file from repository root to worktree destination */
  copyFromRoot(relativeSrc: string, relativeDst?: string): boolean;
  /** Safely create or replace a symlink, with interactive sudo fallback on permission error */
  setSymlink(symlinkPath: string, target?: string): Promise<boolean>;
  /** Safely remove a symlink, with sudo fallback on permission error */
  removeSymlink(symlinkPath: string): Promise<boolean>;
}

export interface PresetHooks {
  /** Called to sync/reset primary branches before creation */
  onSyncPrimary?(ctx: ExecutionContext): Promise<void> | void;
  /** Called to scaffold environment, dependencies, and permissions */
  onScaffold?(ctx: ExecutionContext): Promise<void> | void;
  /** Called before deleting worktree and closing workspaces */
  onPreNuke?(ctx: ExecutionContext): Promise<void> | void;
  /** Called after all worktree and branch deletions complete */
  onPostNuke?(ctx: ExecutionContext): Promise<void> | void;
}

export interface Preset {
  /** Unique name of the preset ('node', 'laravel', 'generic', or custom name) */
  name: string;
  /** Display icon or emoji (e.g. '🐍', '⚡', '🦀', '✨', '🐘', '📦') */
  icon?: string;
  /** Detection rule to determine if this preset applies to a directory */
  detect?(cwd: string): boolean;
  /** Repository defaults */
  repo?: RepoConfig;
  /** Workspace defaults */
  workspace?: WorkspaceConfig;
  /** Declarative terminal layout */
  layout?: PaneDefinition[];
  /** Scaffolding defaults */
  scaffold?: ScaffoldConfig;
  /** Lifecycle hook implementations */
  hooks?: PresetHooks;
  /** Whether this is a user or project-defined custom preset */
  isCustom?: boolean;
  /** Absolute file path from which this preset was loaded (for custom presets) */
  sourcePath?: string;
}

export interface PresetListItem {
  name: string;
  label: string;
  isCustom: boolean;
  preset: Preset;
}

export interface AriseConfig {
  /** Terminal multiplexer driver to use ('tmux' | 'herdr' | 'auto') */
  multiplexer?: MultiplexerType;
  /** Loaded plugins or plugin names */
  plugins?: Array<string | Plugin | ((...args: any[]) => Plugin)>;
  /** Name of preset or preset object */
  preset?: string | Preset;
  /** Repository configuration */
  repo: RepoConfig;
  /** Workspace configuration */
  workspace: WorkspaceConfig;
  /** Declarative terminal layout */
  layout: PaneDefinition[];
  /** Scaffolding configuration */
  scaffold: ScaffoldConfig;
  /** Lifecycle hook overrides */
  hooks: PresetHooks;
  /** Path to config file that was loaded (if any) */
  configFile?: string | null;
}

/** Backward compatibility alias */
export type WorktreeConfig = AriseConfig;

export interface InitWizardOptions {
  quick?: boolean;
  local?: boolean;
  global?: boolean;
  targetPath?: string;
  cwd?: string;
  force?: boolean;
  gitignore?: boolean | null;
  addToGitignore?: boolean | null;
}

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
}

export interface MultiSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
  selected?: boolean;
}

export interface PromptTextOptions {
  message?: string;
  question?: string;
  defaultValue?: string;
  validate?: (val: string) => boolean | string;
  completer?: import('readline').Completer | 'path' | 'dir';
}

export declare class ConfigInitWizard {
  static run(options?: InitWizardOptions): Promise<string | null>;
}
