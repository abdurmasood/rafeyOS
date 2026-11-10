// ps and kill over rafeyOS's windows (Claude's call 3): each window is a process, PID 1000 + its window id
import { describe, expect, it } from 'vitest'
import { EFFECTS, exec } from '@/components/rafeyos/core/commands/exec'
import { windowProcesses } from '@/components/rafeyos/core/commands/builtins/process'
import { manPage } from '@/components/rafeyos/core/commands/manPages'
import { buildVfs, SYSTEM_COMMANDS } from '@/components/rafeyos/core/vfs/buildVfs'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { fsStoreOn, memoryStorage } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const base = buildVfs(fixtureContent)

// Files (1), a terminal (2, the caller), the Editor (3) and a second terminal (4); the next window would be 5
const DESKTOP = windowProcesses(
  { windows: [{ id: 1, appId: 'files' }, { id: 2, appId: 'terminal' }, { id: 3, appId: 'editor' }, { id: 4, appId: 'terminal' }], nextId: 5 },
  2,
)

const run = (raw, processes = DESKTOP) => {
  const fs = createShellFs({ base, store: fsStoreOn(memoryStorage()) })
  return exec(raw, { fs, cwd: '/home/rafey', env: { PWD: '/home/rafey' }, lastCode: 0, content: fixtureContent, processes })
}

const texts = (out) => out.lines.map((line) => line.text)

describe('ps', () => {
  it('names each app as Ubuntu would and puts ps itself last on the caller tty', () => {
    expect(texts(run('ps'))).toEqual([
      [
        '    PID TTY          TIME CMD',
        '   1001 ?        00:00:00 nautilus',
        '   1002 pts/0    00:00:00 bash',
        '   1003 ?        00:00:00 gnome-text-editor',
        '   1004 pts/1    00:00:00 bash',
        '   1005 pts/0    00:00:00 ps',
      ].join('\n'),
    ])
  })

  it('maps every app to its process name', () => {
    const apps = ['files', 'properties', 'editor', 'music', 'settings', 'mail', 'minecraft', 'terminal']
    const processes = windowProcesses({ windows: apps.map((appId, index) => ({ id: index + 1, appId })), nextId: 9 }, 8)

    expect(processes.list.map(({ cmd }) => cmd)).toEqual([
      'nautilus', 'nautilus', 'gnome-text-editor', 'gnome-music', 'gnome-control-center', 'geary', 'minecraft', 'bash',
    ])
    expect(processes).toMatchObject({ self: 1008, next: 1009 })
  })

  it('-e, -A and aux list the same processes', () => {
    const plain = texts(run('ps'))

    expect(texts(run('ps -e'))).toEqual(plain)
    expect(texts(run('ps -A'))).toEqual(plain)
    expect(texts(run('ps aux'))).toEqual(plain)
  })

  it('other options get GNU ps errors', () => {
    const usage = ['', 'Usage:', ' ps [options]', '', " Try 'ps --help <simple|list|output|threads|misc|all>'", "  or 'ps --help <s|l|o|t|m|a>'", ' for additional help text.', '', 'For more details see ps(1).']

    expect(run('ps -z')).toMatchObject({ code: 1 })
    expect(texts(run('ps -z'))).toEqual(['error: unsupported SysV option', ...usage])
    expect(texts(run('ps z'))).toEqual(['error: unsupported option (BSD syntax)', ...usage])
    expect(texts(run('ps --nope'))).toEqual(['error: unknown gnu long option', ...usage])
  })

  it('pipes as plain text', () => {
    expect(texts(run('ps | grep bash'))).toEqual(['   1002 pts/0    00:00:00 bash\n   1004 pts/1    00:00:00 bash'])
  })
})

describe('kill', () => {
  it('asks the terminal to close the window, forcing it for KILL', () => {
    expect(run('kill 1001')).toMatchObject({ lines: [], code: 0, effects: [{ type: EFFECTS.KILL, pid: 1001, force: false }] })
    expect(run('kill -9 1003').effects).toEqual([{ type: EFFECTS.KILL, pid: 1003, force: true }])
    expect(run('kill -KILL 1003').effects).toEqual([{ type: EFFECTS.KILL, pid: 1003, force: true }])
    expect(run('kill -s sigkill 1003').effects).toEqual([{ type: EFFECTS.KILL, pid: 1003, force: true }])
    expect(run('kill -TERM 1001 1004').effects).toEqual([
      { type: EFFECTS.KILL, pid: 1001, force: false },
      { type: EFFECTS.KILL, pid: 1004, force: false },
    ])
  })

  it('kill_own_bash_asks_to_close_the_terminal_without_printing_logout', () => {
    expect(run('kill 1002')).toMatchObject({ lines: [], code: 0, effects: [{ type: EFFECTS.KILL, pid: 1002, force: false }] })
  })

  it('kill_unknown_pid_says_no_such_process', () => {
    const out = run('kill 9999 1001')

    // bash carries on past the bad one, and succeeds since one was signalled
    expect(out).toMatchObject({ lines: [{ type: 'error', text: 'bash: kill: (9999) - No such process' }], code: 0 })
    expect(out.effects).toEqual([{ type: EFFECTS.KILL, pid: 1001, force: false }])
    expect(run('kill 9999')).toMatchObject({ code: 1, effects: [] })
    expect(texts(run('kill 1005'))).toEqual(['bash: kill: (1005) - No such process'])
    expect(texts(run('kill abc'))).toEqual(['bash: kill: abc: arguments must be process or job IDs'])
    expect(texts(run('kill %1'))).toEqual(['bash: kill: %1: no such job'])
  })

  it('kill_without_args_prints_usage_code_2', () => {
    const usage = 'kill: usage: kill [-s sigspec | -n signum | -sigspec] pid | jobspec ... or kill -l [sigspec]'

    expect(run('kill')).toMatchObject({ lines: [{ type: 'error', text: usage }], code: 2, effects: [] })
    expect(run('kill -9')).toMatchObject({ lines: [{ text: usage }], code: 2 })
  })

  it('refuses a signal it does not know', () => {
    expect(run('kill -FOO 1001')).toMatchObject({ lines: [{ text: 'bash: kill: FOO: invalid signal specification' }], code: 1, effects: [] })
    expect(texts(run('kill -s'))).toEqual(['bash: kill: -s: option requires an argument'])
  })

  it('reads a second -word as a process group, and signal 0 only checks the PID', () => {
    expect(run('kill -9 -1001')).toMatchObject({ lines: [{ text: 'bash: kill: (-1001) - No such process' }], code: 1, effects: [] })
    expect(run('kill -n 0 1001')).toMatchObject({ lines: [], code: 0, effects: [] })
    expect(run('kill -- 1001').effects).toEqual([{ type: EFFECTS.KILL, pid: 1001, force: false }])
  })

  it('kill_l_lists_signals', () => {
    const [list] = texts(run('kill -l'))
    const rows = list.split('\n')

    expect(rows[0]).toBe(' 1) SIGHUP\t 2) SIGINT\t 3) SIGQUIT\t 4) SIGILL\t 5) SIGTRAP')
    expect(rows[1]).toBe(' 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1')
    expect(rows[6]).toBe('31) SIGSYS\t34) SIGRTMIN\t35) SIGRTMIN+1\t36) SIGRTMIN+2\t37) SIGRTMIN+3')
    expect(rows.at(-1)).toBe('63) SIGRTMAX-1\t64) SIGRTMAX')
    expect(texts(run('kill -l 9 TERM'))).toEqual(['KILL\n15'])
  })

  it('which_kill_is_usr_bin_kill', () => {
    expect(SYSTEM_COMMANDS).toEqual(expect.arrayContaining(['ps', 'kill']))
    expect(texts(run('which kill ps'))).toEqual(['/usr/bin/kill\n/usr/bin/ps'])
    expect(manPage('ps')).toContain('ps - report a snapshot of the current processes')
    expect(manPage('kill')).toContain('kill - send a signal to a process')
  })
})
