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
  initTarget: 'preset' | 'project' | string | null;
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
  isNew?: boolean;
  [key: string]: any;
}

export interface PluginMenuAction {
  title: string;
  label?: string;
  description?: string;
  hint?: string;
  /** Numbered menu section; defaults to Extensions. */
  group?: string;
  /** Single-key shortcut. Reserve l, s, c, a, q for the built-in menu. */
  shortcut?: string;
  /** Render a destructive action in the warm warning color. */
  danger?: boolean;
  /** Use a muted background for secondary actions. */
  subtle?: boolean;
  value: string;
  /** Return true after creating or opening a session to leave the menu. */
  handler?: (context: PluginContext) => Promise<void | boolean> | void | boolean;
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
  /** Explicit agent override ('codex', 'agy', 'claude', custom command, etc.); omit to preserve layout commands. */
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
  /** Unique name of the preset ('default' or custom user-defined preset name) */
  name: string;
  /** Display icon or identifier */
  icon?: string;
  /** Detection rule to determine if this preset applies to a directory */
  detect?(cwd: string): boolean;
  /** Repository defaults */
  repo?: RepoConfig;
  /** Workspace defaults */
  workspace?: WorkspaceConfig;
  /** Declarative terminal layout */
  layout?: PaneDefinition[];
  /** Setup shell commands to execute upon creating a new workspace */
  setup?: string[];
  /** Cleanup shell commands to execute upon removing a workspace */
  cleanup?: string[];
  /** Scaffolding defaults (optional) */
  scaffold?: ScaffoldConfig;
  /** Lifecycle hook implementations (optional) */
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
  /** Setup shell commands to execute upon creating a new workspace */
  setup?: string[];
  /** Cleanup shell commands to execute upon removing a workspace */
  cleanup?: string[];
  /** Scaffolding configuration (optional) */
  scaffold?: ScaffoldConfig;
  /** Lifecycle hook overrides (optional) */
  hooks?: PresetHooks;
  /** Path to config file that was loaded (if any) */
  configFile?: string | null;
}

/** Saved .ariserc.json settings. Omitted values inherit from the selected preset. */
export interface AriseFileConfig {
  $schema?: string;
  /** Preset name or file path. Relative paths resolve from the directory containing the config. */
  preset?: string;
  multiplexer?: MultiplexerType;
  plugins?: AriseConfig['plugins'];
  repo?: RepoConfig;
  workspace?: WorkspaceConfig;
  layout?: PaneDefinition[];
  setup?: string | string[];
  cleanup?: string | string[];
  scaffold?: ScaffoldConfig;
  hooks?: PresetHooks;
}

/** Backward compatibility alias */
export type WorktreeConfig = AriseConfig;

export interface InitWizardOptions {
  /** Save the selected/detected defaults without the review screen. Existing files require force or confirmation. */
  quick?: boolean;
  local?: boolean;
  global?: boolean;
  targetPath?: string;
  cwd?: string;
  force?: boolean;
  gitignore?: boolean | null;
  addToGitignore?: boolean | null;
  initTarget?: 'config' | 'preset';
  presetOnly?: boolean;
  presetName?: string;
  multiplexer?: MultiplexerType;
  labelPrefix?: string;
  agent?: WorkspaceConfig['agent'];
  focusTarget?: string;
  repo?: RepoConfig;
  workspace?: WorkspaceConfig;
  icon?: string;
  exportScope?: 'global' | 'local';
  layoutTemplate?: '1pane' | '4pane' | '3pane' | '2pane' | '2pane_horizontal' | 'custom' | string;
  layout?: PaneDefinition[];
  commands?: string[];
  editorCmd?: string;
  serverCmd?: string;
  agentCmd?: string;
  setup?: string[];
  cleanup?: string[];
  setupCommands?: string[];
  cleanupCommands?: string[];
  exportPreset?: boolean;
}

export interface SelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
  group?: string;
  shortcut?: string;
  danger?: boolean;
  subtle?: boolean;
}

export interface MultiSelectOption<T = string> {
  label: string;
  value: T;
  hint?: string;
  description?: string;
  selected?: boolean;
}

export interface PromptSelectOptions<T = any> {
  message?: string;
  title?: string;
  choices?: (SelectOption<T> | string)[];
  items?: (SelectOption<T> | string)[];
  defaultIndex?: number;
  section?: string;
  hint?: string;
  keys?: string;
  pageSize?: number;
  maxItems?: number;
  clear?: boolean;
}

export interface PromptMultiSelectOptions<T = any> {
  message?: string;
  title?: string;
  choices?: (MultiSelectOption<T> | string)[];
  items?: (MultiSelectOption<T> | string)[];
  required?: boolean;
  clear?: boolean;
}

export interface PromptTextOptions {
  message?: string;
  question?: string;
  defaultValue?: string;
  /** Editable value; unlike defaultValue, clearing the field saves an empty string. */
  initialValue?: string;
  hint?: string;
  placeholder?: string;
  validate?: (val: string) => boolean | string;
  completer?: import('readline').Completer | 'path' | 'dir';
  clear?: boolean;
}

export interface PromptConfirmOptions {
  message?: string;
  question?: string;
  defaultYes?: boolean;
  clear?: boolean;
}

export declare function clearScreen(): void;

export declare class ConfigInitWizard {
  static run(options?: InitWizardOptions): Promise<string | null>;
  static runCreatePresetWizard(cwd: string, options?: InitWizardOptions): Promise<string | null>;
}
