// @ts-check
// System commands: who and where (whoami, hostname, uname, env), the time (date, uptime), finding commands (which,
// man), history, clear, true/false, sudo's refusal, exit, logout. Messages follow each command's GNU or bash wording.
import { HISTORY_FILE, historyLines } from '@/components/rafeyos/core/commands/history'
import { pre } from '@/components/rafeyos/core/commands/lines'
import { manPage } from '@/components/rafeyos/core/commands/manPages'
import { parseOptions } from '@/components/rafeyos/core/commands/options'
import { ENV } from '@/components/rafeyos/core/commands/run'
import { NODE_TYPES } from '@/components/rafeyos/core/vfs/buildVfs'
import { writeFile } from '@/components/rafeyos/core/vfs/fsOps'
import { joinPath, resolve } from '@/components/rafeyos/core/vfs/paths'
import { statOf } from '@/components/rafeyos/core/vfs/queries'
import { missing, usage } from './fileInfo'
import { failure, result, EFFECTS } from './result'

/**
 * @import { Vfs } from '@/components/rafeyos/core/vfs/buildVfs'
 * @import { OptionSpec, ParsedOptions } from '@/components/rafeyos/core/commands/options'
 * @import { CommandContext, CommandOutput } from './result'
 */

/** @param {string} line */
const withNewline = (line) => `${line}\n`

/** @param {number} value @param {number} [width] @param {string} [fill] */
const pad = (value, width = 2, fill = '0') => String(value).padStart(width, fill)

/** @param {readonly string[]} argv @param {OptionSpec} spec @returns {ParsedOptions | CommandOutput} */
const options = (argv, spec) => {
  const parsed = parseOptions(argv, spec)
  return 'error' in parsed ? usage(parsed) : parsed
}

/** @param {string} name @param {string} operand */
const extraOperand = (name, operand) => missing(name, `extra operand '${operand}'`)

/** @param {CommandContext} context @returns {CommandOutput} */
const whoami = ({ argv }) => {
  const parsed = options(argv, { name: 'whoami' })
  if (!('operands' in parsed)) return parsed
  return parsed.operands.length ? extraOperand('whoami', parsed.operands[0]) : { stdout: 'visitor\n' }
}

/** @returns {CommandOutput} */
const hostname = () => ({ stdout: withNewline(ENV.HOSTNAME) })

const UNAME_SPEC = Object.freeze({
  name: 'uname',
  flags: 'asnrmo',
  long: Object.freeze({ all: 'a', 'kernel-name': 's', nodename: 'n', 'kernel-release': 'r', machine: 'm', 'operating-system': 'o' }),
})
// In the order uname prints them, whatever order the flags came in; neofetch reads the release and machine
export const UNAME_FIELDS = Object.freeze([['s', 'Linux'], ['n', ENV.HOSTNAME], ['r', '6.8.0-rafey'], ['m', 'x86_64'], ['o', 'GNU/Linux']])

/** @param {CommandContext} context @returns {CommandOutput} */
const uname = ({ argv }) => {
  const parsed = options(argv, UNAME_SPEC)
  if (!('operands' in parsed)) return parsed
  if (parsed.operands.length) return extraOperand('uname', parsed.operands[0])
  const { flags } = parsed
  const picked = UNAME_FIELDS.filter(([letter]) => flags.a || flags[letter])
  return { stdout: withNewline((picked.length ? picked : UNAME_FIELDS.slice(0, 1)).map(([, value]) => value).join(' ')) }
}

/** @param {CommandContext} context @returns {CommandOutput} */
const env = ({ argv, env: variables }) => {
  const parsed = options(argv, { name: 'env' })
  if (!('operands' in parsed)) return parsed
  return { stdout: Object.entries(variables).map(([name, value]) => `${name}=${value}\n`).join('') }
}

const WEEKDAYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])
const MONTHS = Object.freeze(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])
const SHORT_NAME = 3
const DAY_MS = 24 * 60 * 60 * 1000
const MS_PER_SECOND = 1000
const NOON = 12

/** The local zone's short name ("UTC", "PDT", or "GMT+5" where there is none). @param {Date} date */
const zoneName = (date) =>
  new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'UTC'

/** @param {Date} date */
const dayOfYear = (date) => (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / DAY_MS + 1

/**
 * What each `%` letter in date's FORMAT stands for (Claude's call 10, plus %I for the default format).
 * @type {Readonly<Record<string, (date: Date) => string>>}
 */
const DATE_FIELDS = Object.freeze({
  a: (date) => WEEKDAYS[date.getDay()].slice(0, SHORT_NAME),
  A: (date) => WEEKDAYS[date.getDay()],
  b: (date) => MONTHS[date.getMonth()].slice(0, SHORT_NAME),
  B: (date) => MONTHS[date.getMonth()],
  Y: (date) => String(date.getFullYear()),
  m: (date) => pad(date.getMonth() + 1),
  d: (date) => pad(date.getDate()),
  e: (date) => pad(date.getDate(), 2, ' '),
  H: (date) => pad(date.getHours()),
  I: (date) => pad(date.getHours() % NOON || NOON),
  M: (date) => pad(date.getMinutes()),
  S: (date) => pad(date.getSeconds()),
  p: (date) => (date.getHours() < NOON ? 'AM' : 'PM'),
  j: (date) => pad(dayOfYear(date), 3),
  Z: zoneName,
  s: (date) => String(Math.floor(date.getTime() / MS_PER_SECOND)),
  '%': () => '%',
})

// What `date` prints on Ubuntu in en_US.UTF-8
const DATE_DEFAULT = '%a %b %e %I:%M:%S %p %Z %Y'

/** An unknown `%` sequence, or a lone `%` at the end, stays as it is, as GNU date leaves it. @param {string} format @param {Date} date */
const formatDate = (format, date) =>
  format.replace(/%([\s\S]?)/g, (sequence, letter) => (Object.hasOwn(DATE_FIELDS, letter) ? DATE_FIELDS[letter](date) : sequence))

/** @param {CommandContext} context @returns {CommandOutput} */
const date = ({ argv, now }) => {
  const parsed = options(argv, { name: 'date' })
  if (!('operands' in parsed)) return parsed
  const [format, extra] = parsed.operands
  if (extra !== undefined) return extraOperand('date', extra)
  if (format !== undefined && !format.startsWith('+')) return failure(`date: invalid date '${format}'`)
  return { stdout: withNewline(formatDate(format === undefined ? DATE_DEFAULT : format.slice(1), now())) }
}

const MINUTE_MS = 60 * 1000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24

/** How long the shell has run, the way procps' uptime words it: "3 min", " 1:05", "2 days,  1:05". @param {number} minutes */
const upFor = (minutes) => {
  const days = Math.floor(minutes / (MINUTES_PER_HOUR * HOURS_PER_DAY))
  const hours = Math.floor(minutes / MINUTES_PER_HOUR) % HOURS_PER_DAY
  const rest = minutes % MINUTES_PER_HOUR
  const dayPart = days ? `${days} ${days > 1 ? 'days' : 'day'}, ` : ''
  return dayPart + (hours ? `${pad(hours, 2, ' ')}:${pad(rest)}` : `${rest} min`)
}

const SECONDS_PER_MINUTE = 60

/**
 * How long the shell has run, the way neofetch words it: "42 secs", "3 mins", "1 hour, 5 mins", "2 days, 1 min".
 * A field that is 0 is left out, and seconds show only under a minute.
 * @param {number} seconds
 */
export const neofetchUptime = (seconds) => {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE)
  /** @type {[count: number, unit: string][]} */
  const fields = [
    [Math.floor(minutes / (MINUTES_PER_HOUR * HOURS_PER_DAY)), 'day'],
    [Math.floor(minutes / MINUTES_PER_HOUR) % HOURS_PER_DAY, 'hour'],
    [minutes % MINUTES_PER_HOUR, 'min'],
  ]
  const shown = fields.filter(([count]) => count > 0).map(([count, unit]) => `${count} ${unit}${count === 1 ? '' : 's'}`)
  return shown.length ? shown.join(', ') : `${seconds} secs`
}

/** @param {CommandContext} context @returns {CommandOutput} */
const uptime = ({ argv, now, startedAt }) => {
  const parsed = options(argv, { name: 'uptime' })
  if (!('operands' in parsed)) return parsed
  const at = now()
  const minutes = Math.max(0, Math.floor((at.getTime() - startedAt.getTime()) / MINUTE_MS))
  return { stdout: ` ${formatDate('%H:%M:%S', at)} up ${upFor(minutes)},  1 user,  load average: 0.00, 0.00, 0.00\n` }
}

const HISTORY_NUMBER_WIDTH = 5
const COUNT = /^\d+$/
// bash's exit status for a builtin's usage error
const BUILTIN_USAGE = 2

/**
 * bash's history builtin: the shared file, numbered; `-c` empties it and the window's ↑ list, N shows only the last N.
 * When the file couldn't record the line, the window's own lines stand in for it.
 * @param {CommandContext} context
 * @returns {CommandOutput}
 */
const history = ({ argv, fs, history: ownLines }) => {
  /** @type {string[]} */
  const counts = []
  let clear = false
  for (const arg of argv) {
    // A lone `-` is an operand, as bash reads it
    if (arg === '-' || !arg.startsWith('-')) {
      counts.push(arg)
      continue
    }
    // bash names the first letter of a combined word that isn't c
    const invalid = [...arg.slice(1)].find((letter) => letter !== 'c')
    if (invalid !== undefined) return { stderr: [`bash: history: -${invalid}: invalid option`, 'history: usage: history [-c] [n]'], code: BUILTIN_USAGE }
    clear = true
  }
  if (clear) {
    // A file that can't be emptied stays as it was, silently, as a failed recording does
    fs.apply(writeFile, { path: HISTORY_FILE, truncateOnly: true })
    return { effects: [{ type: EFFECTS.CLEAR_HISTORY }] }
  }
  if (counts.length > 1) return failure('bash: history: too many arguments')
  const [count] = counts
  if (count !== undefined && !COUNT.test(count)) return failure(`bash: history: ${count}: numeric argument required`)
  const lines = ownLines.length ? ownLines : historyLines(fs.vfs())
  const numbered = lines.map((line, index) => `${pad(index + 1, HISTORY_NUMBER_WIDTH, ' ')}  ${line}\n`)
  return { stdout: (count === undefined ? numbered : numbered.slice(numbered.length - Number(count))).join('') }
}

/** A command file: anything at `path`, through links, that isn't a folder and can be run. @param {Vfs} vfs @param {string} path */
const isProgram = (vfs, path) => {
  const spot = resolve(vfs, path, { followLast: true })
  return spot.ok && vfs[spot.path].type !== NODE_TYPES.DIR && Boolean(statOf(vfs, spot.path)?.mode.includes('x'))
}

/**
 * Where `name` runs from: a name with a slash is a path from `cwd`, printed as typed; any other is looked up in PATH.
 * @param {Vfs} vfs @param {string} name @param {{ cwd: string, folders: readonly string[] }} where
 */
const programPath = (vfs, name, { cwd, folders }) => {
  if (name.includes('/')) return isProgram(vfs, name.startsWith('/') ? name : joinPath(cwd, name)) ? name : undefined
  return folders.map((folder) => joinPath(folder, name)).find((path) => isProgram(vfs, path))
}

/** The first PATH folder holding each name; bash builtins have no file, so they print nothing. @param {CommandContext} context @returns {CommandOutput} */
const which = ({ argv, fs, cwd, env: variables }) => {
  const parsed = options(argv, { name: 'which' })
  if (!('operands' in parsed)) return parsed
  const vfs = fs.vfs()
  const where = { cwd, folders: variables.PATH.split(':') }
  const found = parsed.operands.map((name) => programPath(vfs, name, where))
  const paths = found.filter((path) => path !== undefined)
  return { stdout: paths.map(withNewline).join(''), code: found.length && paths.length === found.length ? 0 : 1 }
}

// man-db's status when a page wasn't found
const NO_MANUAL = 16

/** @param {CommandContext} context @returns {CommandOutput} */
const man = ({ argv }) => {
  const parsed = options(argv, { name: 'man' })
  if (!('operands' in parsed)) return parsed
  if (!parsed.operands.length) return { stderr: ['What manual page do you want?', "For example, try 'man man'."], code: 1 }
  const pages = parsed.operands.map((name) => ({ name, page: manPage(name) }))
  const stderr = pages.flatMap(({ name, page }) => (page === null ? [`No manual entry for ${name}`] : []))
  const found = pages.flatMap(({ page }) => (page === null ? [] : [withNewline(page)]))
  return { stdout: found.join('\n'), stderr, code: stderr.length ? NO_MANUAL : 0 }
}

// Builtins that only set $?, so && and || have something to show off
/** @returns {CommandOutput} */
const succeed = () => ({ code: 0 })
/** @returns {CommandOutput} */
const fail = () => ({ code: 1 })

const sudo = () => failure('visitor is not in the sudoers file.  This incident will be reported.')

const clear = () => result([], [{ type: EFFECTS.CLEAR }])

const exit = () => result([pre('logout')], [{ type: EFFECTS.CLOSE_SELF }])

const logout = () => result([pre('Returning to the rafey.ai terminal…')], [{ type: EFFECTS.LOGOUT }])

const alreadyRunning = () => result([pre('rOS: already running')])

export const systemCommands = Object.freeze({
  whoami,
  hostname,
  uname,
  env,
  date,
  uptime,
  history,
  which,
  man,
  true: succeed,
  false: fail,
  sudo,
  clear,
  exit,
  logout,
  startx: alreadyRunning,
})
