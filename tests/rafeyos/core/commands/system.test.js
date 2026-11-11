import { describe, it, expect } from 'vitest'
import { exec, COMMANDS, EFFECTS } from '@/components/rafeyos/core/commands/exec'
import { HISTORY_FILE, HISTSIZE, recordHistory } from '@/components/rafeyos/core/commands/history'
import { manPage } from '@/components/rafeyos/core/commands/manPages'
import { buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { FIXED_NOW, fsStoreOn, memoryStorage, quotaError, refusingWrites } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const base = buildVfs(fixtureContent)
const RAFEY = '/home/rafey'
const MINUTE = 60 * 1000

/**
 * One terminal window over `disk`: each non-blank line is recorded in the history file before it runs, as the
 * terminal does, and cwd, env and $? carry over. When the file can't take a line, the window's own lines go to
 * `history` instead, and `history -c` forgets them.
 */
const session = ({ disk = memoryStorage(), cwd = RAFEY, now = FIXED_NOW, startedAt = now } = {}) => {
  const store = fsStoreOn(disk)
  const fs = createShellFs({ base, store })
  let state = { cwd, env: { PWD: cwd }, lastCode: 0 }
  let own = []
  const run = (raw) => {
    if (raw.trim()) own = [...own, raw]
    const recorded = raw.trim() ? fs.apply(recordHistory, { line: raw }) : { ok: true }
    const history = recorded.ok ? [] : own
    const out = exec(raw, { fs, ...state, content: fixtureContent, history, now: () => now, startedAt })
    if (out.effects.some((effect) => effect.type === EFFECTS.CLEAR_HISTORY)) own = []
    state = { cwd: out.cwd, env: out.env, lastCode: out.code }
    return out
  }
  return { fs, store, run }
}

/** What the screen shows, one string per line. */
const shown = (out) => out.lines.map((line) => line.text)

/** Runs `lines` in one session and returns what the last one printed. */
const last = (lines, options) => {
  const { run } = session(options)
  return lines.map(run).at(-1)
}

const historyText = (fs) => fs.vfs()[HISTORY_FILE]?.text

describe('history', () => {
  it('history_pipe_tail_lists_itself', () => {
    expect(shown(last(['cd', 'mkdir notes', 'whoami', 'history | tail -4']))).toEqual([
      '    1  cd\n    2  mkdir notes\n    3  whoami\n    4  history | tail -4',
    ])
  })

  it('history N lists the last N with their numbers', () => {
    expect(shown(last(['whoami', 'pwd', 'history 2']))).toEqual(['    2  pwd\n    3  history 2'])
  })

  it('history_c_leaves_the_file_empty', () => {
    const { fs, run } = session()
    run('whoami')

    expect(run('history -c')).toMatchObject({ lines: [], code: 0 })
    expect(historyText(fs)).toBe('')
    expect(shown(run('history'))).toEqual(['    1  history'])
  })

  it('keeps the file to the last HISTSIZE lines and skips blank ones', () => {
    const { fs, run } = session()
    for (let index = 0; index <= HISTSIZE; index += 1) run(`echo ${index}`)
    run('   ')

    const lines = historyText(fs).split('\n').filter(Boolean)
    expect(lines).toHaveLength(HISTSIZE)
    expect(lines[0]).toBe('echo 1')
    expect(lines.at(-1)).toBe(`echo ${HISTSIZE}`)
  })

  it('history_write_failure_is_silent', () => {
    const disk = refusingWrites(memoryStorage(), quotaError())
    const { run } = session({ disk })

    expect(shown(run('whoami'))).toEqual(['visitor'])
    expect(run('history')).toMatchObject({ lines: [{ type: 'pre', text: '    1  whoami\n    2  history' }], code: 0 })
  })

  it('lists the window\'s own lines when the file cannot be written, and -c forgets them', () => {
    const { run } = session({ disk: refusingWrites(memoryStorage(), quotaError()) })
    run('whoami')

    expect(shown(run('history'))).toEqual(['    1  whoami\n    2  history'])
    expect(run('history -c')).toMatchObject({ lines: [], code: 0 })
    expect(shown(run('history'))).toEqual(['    1  history'])
  })

  it('history -c asks the window to forget its ↑ list', () => {
    expect(last(['history -c']).effects).toEqual([{ type: EFFECTS.CLEAR_HISTORY }])
    expect(last(['history']).effects).toEqual([])
  })

  it('refuses bad arguments the bash way', () => {
    expect(shown(last(['history -z']))).toEqual(['bash: history: -z: invalid option', 'history: usage: history [-c] [n]'])
    expect(last(['history -z']).code).toBe(2)
    expect(shown(last(['history -cz']))[0]).toBe('bash: history: -z: invalid option')
    expect(shown(last(['history -zc']))[0]).toBe('bash: history: -z: invalid option')
    expect(last(['history -']).lines).toMatchObject([{ text: 'bash: history: -: numeric argument required' }])
    expect(last(['history abc'])).toMatchObject({ lines: [{ text: 'bash: history: abc: numeric argument required' }], code: 1 })
    expect(last(['history 1 2'])).toMatchObject({ lines: [{ text: 'bash: history: too many arguments' }], code: 1 })
  })
})

describe('which', () => {
  it('which_finds_both_bin_folders_and_skips_builtins', () => {
    expect(last(['which bio ls'])).toMatchObject({ lines: [{ text: '/usr/local/bin/bio\n/usr/bin/ls' }], code: 0 })
    expect(last(['which cd'])).toEqual(expect.objectContaining({ lines: [], code: 1 }))
    expect(last(['which history nope'])).toMatchObject({ lines: [], code: 1 })
    expect(last(['which ls nope'])).toMatchObject({ lines: [{ text: '/usr/bin/ls' }], code: 1 })
    expect(last(['which'])).toMatchObject({ lines: [], code: 1 })
  })

  it('prints a name with a slash as it is when it names a command file, from the current folder', () => {
    expect(last(['which /usr/bin/ls'])).toMatchObject({ lines: [{ text: '/usr/bin/ls' }], code: 0 })
    expect(last(['which /bin/ls ./ls'], { cwd: '/usr/bin' })).toMatchObject({ lines: [{ text: '/bin/ls\n./ls' }], code: 0 })
    expect(last(['which bin/bio'], { cwd: '/usr/local' })).toMatchObject({ lines: [{ text: 'bin/bio' }], code: 0 })
    expect(last(['which ./nope /usr/bin'], { cwd: '/usr/bin' })).toMatchObject({ lines: [], code: 1 })
    expect(last(['echo hi > /tmp/notes', 'which /tmp/notes'])).toMatchObject({ lines: [], code: 1 })
  })

  it('finds pwd and echo in /usr/bin as Ubuntu ships them, and never a folder', () => {
    expect(shown(last(['which pwd echo']))).toEqual(['/usr/bin/pwd\n/usr/bin/echo'])
    expect(last(['which ..']).code).toBe(1)
  })
})

describe('man', () => {
  it('man_prints_a_page_and_reports_missing', () => {
    const page = shown(last(['man ls']))[0]

    expect(page.startsWith('NAME\n       ls - list directory contents\n\nSYNOPSIS\n       ls [OPTION]... [FILE]...\n')).toBe(true)
    expect(page).toContain('\nDESCRIPTION\n')
    expect(page).toContain('\nOPTIONS\n       -a\n              do not ignore entries starting with .\n')
    expect(last(['man nope'])).toMatchObject({ lines: [{ type: 'error', text: 'No manual entry for nope' }], code: 16 })
    expect(last(['man'])).toMatchObject({
      lines: [{ text: 'What manual page do you want?' }, { text: "For example, try 'man man'." }],
      code: 1,
    })
  })

  it('pipes the page as plain text', () => {
    expect(shown(last(['man ls | head -2']))).toEqual(['NAME\n       ls - list directory contents'])
  })

  it('startx has a page of its own, and os and rafeyos have none', () => {
    expect(manPage('startx')).toContain('NAME\n       startx - start the rafeyOS desktop\n')
    expect(manPage('startx')).toContain('already running')
    expect(manPage('os')).toBeNull()
    expect(manPage('rafeyos')).toBeNull()
  })

  it('every command has a page whose OPTIONS lists only flags it takes', () => {
    const missing = Object.keys(COMMANDS).filter((name) => manPage(name) === null)

    expect(missing).toEqual([])
    expect(manPage('whoami')).toContain('OPTIONS\n       --help\n')
    expect(manPage('echo')).not.toContain('--help')
  })
})

describe('--help', () => {
  it('prints the synopsis and options', () => {
    expect(shown(last(['mkdir --help']))).toEqual([
      'Usage: mkdir [OPTION]... DIRECTORY...\n\n' +
        '  -p          no error if existing, make parent directories as needed\n' +
        '  -v          print a message for each created directory\n' +
        '      --help  display this help and exit',
    ])
  })

  it('works anywhere before -- and for every command but echo', () => {
    expect(shown(last(['ls -l --help']))[0]).toMatch(/^Usage: ls /)
    expect(shown(last(['which --help']))[0]).toMatch(/^Usage: which /)
    expect(last(['cat -- --help'])).toMatchObject({ lines: [{ text: 'cat: --help: No such file or directory' }] })
    expect(shown(last(['echo --help']))).toEqual(['--help'])
  })

  it('takes --help as the value of an option that needs one', () => {
    expect(shown(last(['touch /tmp/--help', 'find /tmp -name --help']))).toEqual(['/tmp/--help'])
    expect(shown(last(['find /tmp -name x --help']))[0]).toMatch(/^Usage: find /)
    expect(shown(last(['head -n --help']))[0]).toMatch(/^head: invalid number of lines: /)
    expect(shown(last(['head --lines --help']))[0]).toMatch(/^head: invalid number of lines: /)
  })

  it('sudo reads --help only before its command, as sudo stops at the first operand', () => {
    expect(shown(last(['sudo rm --help']))).toEqual(['visitor is not in the sudoers file.  This incident will be reported.'])
    expect(shown(last(['sudo --help']))[0]).toMatch(/^Usage: sudo /)
  })
})

describe('identity', () => {
  it('uname_a_says_rafey_ai', () => {
    expect(shown(last(['uname -a']))).toEqual(['Linux rafey.ai 6.8.0-rafey x86_64 GNU/Linux'])
    expect(shown(last(['uname']))).toEqual(['Linux'])
    expect(shown(last(['uname -n']))).toEqual(['rafey.ai'])
    expect(shown(last(['uname -mrs']))).toEqual(['Linux 6.8.0-rafey x86_64'])
    expect(shown(last(['uname -o --nodename']))).toEqual(['rafey.ai GNU/Linux'])
  })

  it('uname refuses operands and unknown flags', () => {
    expect(last(['uname x'])).toMatchObject({
      lines: [{ text: "uname: extra operand 'x'" }, { text: "Try 'uname --help' for more information." }],
      code: 1,
    })
    expect(last(['uname -z']).lines[0].text).toBe("uname: invalid option -- 'z'")
  })

  it('hostname and whoami', () => {
    expect(shown(last(['hostname']))).toEqual(['rafey.ai'])
    expect(shown(last(['whoami']))).toEqual(['visitor'])
  })
})

describe('date and uptime', () => {
  // 17 Oct 2026, 21:04 local (UTC in tests), a Saturday
  it('date_formats', () => {
    expect(shown(last(['date']))).toEqual(['Sat Oct 17 09:04:00 PM UTC 2026'])
    expect(shown(last(['date "+%Y-%m-%d %H:%M:%S"']))).toEqual(['2026-10-17 21:04:00'])
    expect(shown(last(['date "+%a %A %b %B %e %j %p %Z %s %% %Q"']))).toEqual([
      `Sat Saturday Oct October 17 290 PM UTC ${FIXED_NOW.getTime() / 1000} % %Q`,
    ])
    expect(shown(last(['date +%e%I'], { now: new Date(2026, 0, 5, 9, 0) }))).toEqual([' 509'])
  })

  it('date refuses what it cannot read', () => {
    expect(last(['date tomorrow'])).toMatchObject({ lines: [{ text: "date: invalid date 'tomorrow'" }], code: 1 })
    expect(last(['date +%Y +%m'])).toMatchObject({
      lines: [{ text: "date: extra operand '+%m'" }, { text: "Try 'date --help' for more information." }],
      code: 1,
    })
  })

  it('uptime counts from when the shell started', () => {
    const at = (minutes) => shown(last(['uptime'], { startedAt: new Date(FIXED_NOW.getTime() - minutes * MINUTE) }))

    expect(at(3)).toEqual([' 21:04:00 up 3 min,  1 user,  load average: 0.00, 0.00, 0.00'])
    expect(at(65)).toEqual([' 21:04:00 up  1:05,  1 user,  load average: 0.00, 0.00, 0.00'])
    expect(at(24 * 60 + 2)).toEqual([' 21:04:00 up 1 day, 2 min,  1 user,  load average: 0.00, 0.00, 0.00'])
    expect(at(3 * 24 * 60 + 125)).toEqual([' 21:04:00 up 3 days,  2:05,  1 user,  load average: 0.00, 0.00, 0.00'])
  })
})

describe('env', () => {
  it('env_lists_the_fixed_environment', () => {
    expect(shown(last(['cd /etc', 'env']))).toEqual([
      [
        'HOME=/home/visitor',
        'USER=visitor',
        'LOGNAME=visitor',
        'SHELL=/bin/bash',
        'PATH=/usr/local/bin:/usr/bin:/bin',
        'HOSTNAME=rafey.ai',
        'TERM=xterm-256color',
        'LANG=en_US.UTF-8',
        'PWD=/etc',
        'OLDPWD=/home/rafey',
      ].join('\n'),
    ])
  })

  it('env | grep picks one variable', () => {
    expect(shown(last(['env | grep ^USER=']))).toEqual(['USER=visitor'])
  })
})
