// @ts-check
// ps and kill over rafeyOS's windows (Claude's call 3): each window is a process whose PID is 1000 + its window id,
// named as Ubuntu names its app, and a terminal's shell is bash on its own pts. Windows keep no time, so every TIME is
// 00:00:00. Messages follow procps's ps and bash's kill builtin.
import { APP } from '@/components/rafeyos/core/catalog/apps'
import { EFFECTS, failure } from './result'

/**
 * @import { AppId } from '@/components/rafeyos/core/catalog/apps'
 * @import { CommandContext, CommandOutput, Effect, Processes } from './result'
 */

const PID_BASE = 1000
const SHELL = 'bash'

/** @type {Readonly<Record<AppId, string>>} */
const PROCESS_NAMES = Object.freeze({
  [APP.FILES]: 'nautilus',
  [APP.PROPERTIES]: 'nautilus',
  [APP.EDITOR]: 'gnome-text-editor',
  [APP.TERMINAL]: SHELL,
  [APP.MUSIC]: 'gnome-music',
  [APP.SETTINGS]: 'gnome-control-center',
  [APP.MAIL]: 'geary',
  [APP.PROJECTS]: 'projects',
  [APP.MINECRAFT]: 'minecraft',
})

/** @type {Processes} A terminal with no windows around it, as on the homepage: its own bash and nothing else. */
export const LONE_SHELL = Object.freeze({ list: Object.freeze([{ pid: PID_BASE, tty: 'pts/0', cmd: SHELL }]), self: PID_BASE, next: PID_BASE + 1 })

/** The window a PID names. @param {number} pid */
export const windowOfPid = (pid) => pid - PID_BASE

/**
 * rafeyOS's windows as processes; terminals get pts/0, pts/1… by ascending window id.
 * @param {{ windows: readonly { id: number, appId: AppId }[], nextId: number }} open - from the window manager's list()
 * @param {number} selfId - the calling terminal's window
 * @returns {Processes}
 */
export const windowProcesses = ({ windows, nextId }, selfId) => {
  const terminals = windows.filter(({ appId }) => appId === APP.TERMINAL).map(({ id }) => id)
  const list = windows.map(({ id, appId }) => ({
    pid: PID_BASE + id,
    tty: appId === APP.TERMINAL ? `pts/${terminals.indexOf(id)}` : '?',
    cmd: PROCESS_NAMES[appId],
  }))
  return { list, self: PID_BASE + selfId, next: PID_BASE + nextId }
}

// The options that list every process; ps lists every process anyway, as there are so few
const LISTS_ALL = new Set(['-e', '-A', 'aux'])
const PS_USAGE = Object.freeze([
  '',
  'Usage:',
  ' ps [options]',
  '',
  " Try 'ps --help <simple|list|output|threads|misc|all>'",
  "  or 'ps --help <s|l|o|t|m|a>'",
  ' for additional help text.',
  '',
  'For more details see ps(1).',
])
const NO_TIME = '00:00:00'

/** procps's complaint about a word, by the syntax it looks like. @param {string} word */
const psError = (word) => {
  if (word.startsWith('--')) return 'unknown gnu long option'
  return word.startsWith('-') ? 'unsupported SysV option' : 'unsupported option (BSD syntax)'
}

/** @param {string} pid @param {string} tty @param {string} time @param {string} cmd */
const psRow = (pid, tty, time, cmd) => `${pid.padStart(7)} ${tty.padEnd(8)} ${time.padStart(8)} ${cmd}\n`

/** Every process open when the line started, then ps itself on the caller's tty. @param {CommandContext} context @returns {CommandOutput} */
const ps = ({ argv, processes = LONE_SHELL }) => {
  const unknown = argv.find((word) => !LISTS_ALL.has(word))
  if (unknown !== undefined) return { stderr: [`error: ${psError(unknown)}`, ...PS_USAGE], code: 1 }
  const { list, self, next } = processes
  const tty = list.find(({ pid }) => pid === self)?.tty ?? '?'
  const rows = [...list, { pid: next, tty, cmd: 'ps' }].map((proc) => psRow(String(proc.pid), proc.tty, NO_TIME, proc.cmd))
  return { stdout: psRow('PID', 'TTY', 'TIME', 'CMD') + rows.join('') }
}

const STANDARD_SIGNALS = Object.freeze([
  'HUP', 'INT', 'QUIT', 'ILL', 'TRAP', 'ABRT', 'BUS', 'FPE', 'KILL', 'USR1', 'SEGV', 'USR2', 'PIPE', 'ALRM', 'TERM', 'STKFLT',
  'CHLD', 'CONT', 'STOP', 'TSTP', 'TTIN', 'TTOU', 'URG', 'XCPU', 'XFSZ', 'VTALRM', 'PROF', 'WINCH', 'IO', 'PWR', 'SYS',
])
const RT_MIN = 34
const RT_MAX = 64

/** bash's name for a real-time signal: counted from RTMIN for the lower half, back from RTMAX for the upper. @param {number} number */
const realtimeName = (number) => {
  const fromMin = number - RT_MIN
  if (fromMin === 0) return 'RTMIN'
  if (number === RT_MAX) return 'RTMAX'
  return fromMin <= (RT_MAX - RT_MIN) / 2 ? `RTMIN+${fromMin}` : `RTMAX-${RT_MAX - number}`
}

/** @type {ReadonlyMap<number, string>} Every signal `kill -l` lists, by number, without the SIG */
const SIGNALS = new Map([
  ...STANDARD_SIGNALS.map((name, index) => /** @type {[number, string]} */ ([index + 1, name])),
  ...Array.from({ length: RT_MAX - RT_MIN + 1 }, (_, index) => /** @type {[number, string]} */ ([RT_MIN + index, realtimeName(RT_MIN + index)])),
])
// Signal 0 only checks that the process is there
const NO_SIGNAL = 0
const SIGKILL = 9
const SIGTERM = 15
const SIGNALS_PER_ROW = 5
const NUMBER = /^\d+$/
const PID = /^-?\d+$/
// bash's exit status for a builtin's usage error
const BUILTIN_USAGE = 2
const KILL_USAGE = Object.freeze({
  stderr: ['kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]'],
  code: BUILTIN_USAGE,
})

/** A signal's number from its number or name (SIG optional, any case); null for one bash doesn't know. @param {string} spec */
const signalNumber = (spec) => {
  if (NUMBER.test(spec)) return Number(spec) === NO_SIGNAL || SIGNALS.has(Number(spec)) ? Number(spec) : null
  const name = spec.toUpperCase().replace(/^SIG/, '')
  return [...SIGNALS].find(([, known]) => known === name)?.[0] ?? null
}

/** @param {string} spec */
const invalidSignal = (spec) => `bash: kill: ${spec}: invalid signal specification`

/** `kill -l`: the numbered table, or each sigspec's name for a number and number for a name. @param {readonly string[]} specs @returns {CommandOutput} */
const listSignals = (specs) => {
  if (!specs.length) {
    const cells = [...SIGNALS].map(([number, name]) => `${String(number).padStart(2)}) SIG${name}`)
    const rows = Array.from({ length: Math.ceil(cells.length / SIGNALS_PER_ROW) }, (_, row) => cells.slice(row * SIGNALS_PER_ROW, (row + 1) * SIGNALS_PER_ROW).join('\t'))
    return { stdout: rows.map((row) => `${row}\n`).join('') }
  }
  const answers = specs.map((spec) => (NUMBER.test(spec) ? SIGNALS.get(Number(spec)) : signalNumber(spec)?.toString()))
  const stderr = specs.flatMap((spec, index) => (answers[index] === undefined ? [invalidSignal(spec)] : []))
  return { stdout: answers.flatMap((answer) => (answer === undefined ? [] : [`${answer}\n`])).join(''), stderr, code: stderr.length ? 1 : 0 }
}

/**
 * Reads kill's options as bash does: `-l` lists, `-s`/`-n` take the next word as the signal, the first `-sigspec`
 * names it, and `--` or any other word starts the PIDs.
 * @param {readonly string[]} argv
 * @returns {{ output: CommandOutput } | { listing: readonly string[] } | { spec: string | null, pids: readonly string[] }}
 */
const parseKill = (argv) => {
  /** @type {string | null} */
  let spec = null
  let rest = argv
  while (rest.length && rest[0].startsWith('-')) {
    const [word, ...after] = rest
    if (word === '-l' || word === '-L') return { listing: after }
    if (word === '--') return { spec, pids: after }
    if (word === '-s' || word === '-n') {
      if (!after.length) return { output: failure(`bash: kill: ${word}: option requires an argument`) }
      spec = after[0]
      rest = after.slice(1)
    } else if (spec === null) {
      spec = word.slice(1)
      rest = after
    } else break
  }
  return { spec, pids: rest }
}

/**
 * The signal to each PID: a window gets a KILL effect, which closes it, past its guard for SIGKILL. bash carries on
 * past a PID it can't signal, and succeeds when any one was signalled.
 * @param {readonly string[]} words @param {number} signal @param {Processes} processes @returns {CommandOutput}
 */
const signalAll = (words, signal, { list }) => {
  /** @type {string[]} */
  const stderr = []
  /** @type {Effect[]} */
  const effects = []
  for (const word of words) {
    const pid = PID.test(word) ? Number(word) : null
    if (pid === null) stderr.push(word.startsWith('%') ? `bash: kill: ${word}: no such job` : `bash: kill: ${word}: arguments must be process or job IDs`)
    else if (!list.some((proc) => proc.pid === pid)) stderr.push(`bash: kill: (${pid}) - No such process`)
    else if (signal !== NO_SIGNAL) effects.push({ type: EFFECTS.KILL, pid, force: signal === SIGKILL })
  }
  return { stderr, effects, code: stderr.length < words.length ? 0 : 1 }
}

/** @param {CommandContext} context @returns {CommandOutput} */
const kill = ({ argv, processes = LONE_SHELL }) => {
  if (!argv.length) return KILL_USAGE
  const parsed = parseKill(argv)
  if ('output' in parsed) return parsed.output
  if ('listing' in parsed) return listSignals(parsed.listing)
  const signal = parsed.spec === null ? SIGTERM : signalNumber(parsed.spec)
  if (signal === null) return failure(invalidSignal(String(parsed.spec)))
  return parsed.pids.length ? signalAll(parsed.pids, signal, processes) : KILL_USAGE
}

export const processCommands = Object.freeze({ ps, kill })
