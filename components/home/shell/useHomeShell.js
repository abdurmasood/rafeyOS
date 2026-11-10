// The homepage terminal's shell: rafeyOS's engine and the store /os shares, with the homepage's own commands on top.
// Its folder, variables and screen live in TerminalProvider, so they survive a trip to another route; the folder is
// also saved, so it survives a reload.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTerminal } from '@/components/home/TerminalProvider'
import { HOME_COMMANDS, HOME_EFFECTS } from '@/components/home/shell/homeCommands'
import { EFFECTS, ENV, exec } from '@/components/rafeyos/core/commands/exec'
import { HISTORY_FILE, recordHistory } from '@/components/rafeyos/core/commands/history'
import { LONE_SHELL } from '@/components/rafeyos/core/commands/builtins/process'
import { LINE_TYPES, dim, pre, prompt } from '@/components/rafeyos/core/commands/lines'
import { sharedSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { settingsView } from '@/components/rafeyos/core/settings/settingsView'
import { START_DIR, buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { buildContent } from '@/components/rafeyos/core/vfs/content'
import { homeChanged, mergeState } from '@/components/rafeyos/core/vfs/fsState'
import { sharedFsStore } from '@/components/rafeyos/core/vfs/fsStore'
import { isDir } from '@/components/rafeyos/core/vfs/queries'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { useOwnLines } from '@/components/rafeyos/apps/terminal/logic/useCommandRecall'
import { useQuestion } from '@/components/rafeyos/apps/terminal/logic/useQuestion'
import { localStorageOrNull } from '@/lib/browserStorage'
import { HOME_CWD_KEY } from '@/lib/storageKeys'

/** Printed after a line that changed the visitor's files, which the desktop shows too. */
export const VISIBLE_IN_RAFEYOS = '→ visible in rafeyOS'

// What Ctrl+C leaves in $?: 128 + SIGINT
const INTERRUPTED_CODE = 130
// As rafeyOS's LOGOUT_DELAY_MS: long enough to read `logout` before the screen clears
const NEW_SESSION_DELAY_MS = 300
// A double Tab's matches, spaced as the homepage always has
const MATCH_SEPARATOR = '    '

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

// The saved folder changes only when this page saves it; the store's own subscription re-checks it still exists
const noSubscription = () => () => {}

/** The folder saved by the last visit, while it is still a folder; ~ otherwise. */
const savedCwd = (vfs) => {
  try {
    const saved = localStorageOrNull()?.getItem(HOME_CWD_KEY)
    return saved && isDir(vfs, saved) ? saved : START_DIR
  } catch {
    return START_DIR
  }
}

const saveCwd = (cwd) => {
  try {
    localStorageOrNull()?.setItem(HOME_CWD_KEY, cwd)
  } catch {
    // Blocked or full storage: the folder is only lost on reload
  }
}

/**
 * Records a line in ~/.bash_history before it runs, as /os does. When the file can't take it, the result is this
 * page's own lines for `history` to list instead.
 */
const record = (shellFs, raw, ownLines) => {
  if (!raw.trim()) return []
  ownLines.current = [...ownLines.current, raw]
  return shellFs.apply(recordHistory, { line: raw }).ok ? [] : ownLines.current
}

/**
 * Runs a line's effects through the page's handlers. Returns whether the screen clears first and whether
 * `history -c` ran.
 */
const runEffects = (effects, handlers) =>
  effects.reduce(
    (outcome, effect) => {
      switch (effect.type) {
        case EFFECTS.CLEAR:
          return { ...outcome, clear: true }
        case EFFECTS.CLEAR_HISTORY:
          return { ...outcome, historyCleared: true }
        case EFFECTS.ASK:
          handlers.ask(effect)
          return outcome
        case HOME_EFFECTS.NEW_TAB:
          handlers.newTab(effect.href)
          return outcome
        case HOME_EFFECTS.MAILTO:
          handlers.mailto(effect.href)
          return outcome
        case HOME_EFFECTS.PROJECTS_3D:
          handlers.projects3d()
          return outcome
        case HOME_EFFECTS.HANDOFF:
          handlers.handoff(effect)
          return outcome
        case HOME_EFFECTS.NEW_SESSION:
          handlers.newSession()
          return outcome
        default:
          throw new Error(`Unknown homepage terminal effect: ${effect.type}`)
      }
    },
    { clear: false, historyCleared: false },
  )

/** The id of the last entry holding a foreground panel, or null. Earlier ones stay on screen, inactive. */
const lastForeground = (entries) =>
  entries.findLast((entry) => entry.line.type === LINE_TYPES.PANEL && entry.line.foreground)?.id ?? null

const toEntries = (lines) => lines.map((line) => ({ id: crypto.randomUUID(), line }))

/** Whether the visitor's system prefers dark, as rafeyOS reads it: dark where it can't tell. */
const osPrefersDark = () => globalThis.window?.matchMedia?.(DARK_SCHEME_QUERY).matches ?? true

/** What the desktop shows: the visitor's files and saved settings, as they are now. */
const desktopState = (fs) => ({ files: fs.store.getState(), settings: fs.settings.getState() })

/** Whether a line changed something rafeyOS shows, so it earns the hint. Neither /tmp nor the history file counts. */
const changedDesktop = (before, after) =>
  homeChanged(before.files, after.files, { ignore: [HISTORY_FILE] }) || before.settings !== after.settings

/** The shared store (none on the server, so a store of its own there), read live so other tabs' writes show. */
const useHomeFs = () => {
  const [fs] = useState(() => {
    const content = buildContent()
    const base = buildVfs(content)
    const store = sharedFsStore(globalThis.window)
    const settings = settingsView({ store: sharedSettingsStore(globalThis.window), prefersDark: osPrefersDark })
    return { content, base, store, settings, shellFs: createShellFs({ base, store }) }
  })
  const state = useSyncExternalStore(fs.store.subscribe, fs.store.getState, fs.store.getState)
  const vfs = useMemo(() => mergeState(fs.base, state), [fs.base, state])
  return { ...fs, vfs }
}

/** The hint, when what the desktop shows changed since `before`. */
const hintSince = (before, fs) => (changedDesktop(before, desktopState(fs)) ? [dim(VISIBLE_IN_RAFEYOS)] : [])

/** A command's [y/N] question on this page: the answer or ^C is printed, with the hint when a reset changed things. */
const useHomeQuestion = ({ fs, terminal, append }) => {
  const question = useQuestion({ fs: fs.shellFs, settings: fs.settings })
  const settle = ({ lines, code }, hint = []) => {
    append([...lines, ...hint])
    terminal.setLastCode(code)
  }
  return {
    question: question.question,
    ask: question.ask,
    answer: (input) => {
      const before = desktopState(fs)
      const outcome = question.answer(input)
      settle(outcome, hintSince(before, fs))
    },
    cancel: (input) => settle(question.cancel(input)),
  }
}

/** Calls `startFresh` after the delay, unless the terminal has gone by then. */
const useDelayedNewSession = (startFresh) => {
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(startFresh, NEW_SESSION_DELAY_MS)
  }
}

/** A fresh login after `exit`: empty screen, back in ~, the ghost again. History stays. */
const useNewSession = (terminal) =>
  useDelayedNewSession(() => {
    terminal.setEntries([])
    terminal.setInput('')
    terminal.setCwd(START_DIR)
    terminal.setEnv({})
    terminal.setLastCode(0)
    terminal.setRanThisVisit(0)
    saveCwd(START_DIR)
  })

/** The screen's entries: appended to, cleared, or one finished panel's result written in. */
const useScreen = ({ terminal, cwd, setForegroundId }) => {
  const append = (lines, { clearFirst = false } = {}) => {
    const added = toEntries(lines)
    terminal.setEntries((current) => (clearFirst ? added : [...current, ...added]))
    return added
  }
  return {
    append,
    // Ctrl+C at the prompt: the abandoned line is echoed with ^C and $? becomes 130
    interrupt: (input) => {
      terminal.setLastCode(INTERRUPTED_CODE)
      append([prompt(cwd, `${input}^C`)])
    },
    clear: () => terminal.setEntries([]),
    showMatches: (input, matches) => append([prompt(cwd, input), pre(matches.join(MATCH_SEPARATOR))]),
    finish: (entryId, props) => {
      terminal.setEntries((current) =>
        current.map((entry) => (entry.id === entryId ? { ...entry, line: { ...entry.line, props: { ...entry.line.props, ...props } } } : entry)),
      )
      setForegroundId(null)
    },
  }
}

/**
 * The homepage terminal's session.
 * @param {{ handlers: { newTab: Function, mailto: Function, projects3d: Function, handoff: Function } }} options
 *   what the page does for its own effects
 */
export const useHomeShell = ({ handlers }) => {
  const terminal = useTerminal()
  const fs = useHomeFs()
  const { content, settings, shellFs, vfs } = fs
  const restoredCwd = useSyncExternalStore(noSubscription, () => savedCwd(vfs), () => START_DIR)
  const cwd = terminal.cwd ?? restoredCwd
  // Local, not in the provider: a picker or player never resumes after navigating away and back
  const [foregroundId, setForegroundId] = useState(null)
  // When this page's shell started: uptime counts from it
  const [startedAt] = useState(() => new Date())
  const ownLines = useOwnLines(vfs)
  const newSession = useNewSession(terminal)
  const { append, ...screen } = useScreen({ terminal, cwd, setForegroundId })
  const { ask, ...question } = useHomeQuestion({ fs, terminal, append })
  const env = { PWD: cwd, ...terminal.env }

  // Tells the caller whether the line ran `history -c`, so the ↑ list can forget too
  const run = (raw) => {
    const history = record(shellFs, raw, ownLines)
    const before = desktopState(fs)
    const result = exec(raw, { fs: shellFs, cwd, env, lastCode: terminal.lastCode, content, history, startedAt, settings, processes: LONE_SHELL, commands: HOME_COMMANDS })
    const { clear, historyCleared } = runEffects(result.effects, { ...handlers, newSession, ask })
    if (historyCleared) ownLines.current = []
    const hint = hintSince(before, fs)
    const echoed = clear ? [] : [prompt(cwd, raw)]
    setForegroundId(lastForeground(append([...echoed, ...result.lines, ...hint], { clearFirst: clear })))
    terminal.setCwd(result.cwd)
    terminal.setEnv(result.env)
    terminal.setLastCode(result.code)
    terminal.setRanThisVisit((count) => count + 1)
    saveCwd(result.cwd)
    return { historyCleared }
  }

  return {
    cwd,
    shellFs,
    vfs,
    entries: terminal.entries,
    foregroundId,
    started: terminal.ranThisVisit > 0,
    run,
    ...screen,
    ...question,
    // The variables and $? as they are now, for Tab to fill in a typed `$HOME/`
    variables: () => ({ env: { ...ENV, ...env }, lastCode: terminal.lastCode }),
  }
}
