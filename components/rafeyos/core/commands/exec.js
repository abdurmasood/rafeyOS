import { shellCollate } from './expand'
import { runLine } from './run'
import { asksForHelp, helpText } from './manPages'
import { contentCommands } from './builtins/content'
import { filesCommands } from './builtins/files'
import { fsCommands } from './builtins/fs'
import { gsettingsCommands } from './builtins/gsettings'
import { launchCommands } from './builtins/launch'
import { neofetchCommands } from './builtins/neofetch'
import { processCommands } from './builtins/process'
import { resetHomeCommands } from './builtins/resetHome'
import { systemCommands } from './builtins/system'
import { textCommands } from './builtins/text'

export { EFFECTS } from './builtins/result'
export { ENV } from './run'

/**
 * Every command takes `--help` (echo aside): it prints the synopsis and options from its man page instead of running.
 * @param {Record<string, import('./builtins/result').Handler>} commands
 */
export const withHelp = (commands) =>
  Object.fromEntries(
    Object.entries(commands).map(([name, handler]) => {
      const help = helpText(name)
      if (help === null) return [name, handler]
      return [name, (context) => (asksForHelp(name, context.argv) ? { stdout: `${help}\n` } : handler(context))]
    }),
  )

/** Every command the shell knows, by its exact (case-sensitive) name. */
export const COMMANDS = Object.freeze(
  withHelp({
    ...contentCommands,
    ...fsCommands,
    ...filesCommands,
    ...gsettingsCommands,
    ...launchCommands,
    ...neofetchCommands,
    ...processCommands,
    ...resetHomeCommands,
    ...systemCommands,
    ...textCommands,
  }),
)

/**
 * What tab completes for the first word: every command in `registry`, in the shell's name order.
 * @param {import('./run').Registry} registry
 */
export const completionCommands = (registry) => Object.freeze(Object.keys(registry).sort(shellCollate))

export const COMPLETION_COMMANDS = completionCommands(COMMANDS)

/**
 * Runs one command line against `context.commands`, or every command the shell knows. Files change through
 * `context.fs`; every other side effect comes back as a descriptor for the caller to run. The echoed prompt row is
 * not included; the UI prints it before these lines.
 * @param {string} raw
 * @param {import('./run').ExecContext} context
 * @returns {import('./run').ExecResult}
 */
export const exec = (raw, context) => runLine(raw, context, context.commands ?? COMMANDS)
