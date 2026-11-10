// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { VISIBLE_IN_RAFEYOS, useHomeShell } from '@/components/home/shell/useHomeShell'
import { HOME_CWD_KEY } from '@/lib/storageKeys'
import { TerminalProvider } from '@/components/home/TerminalProvider'
import { HOME_EFFECTS, HOME_PANELS } from '@/components/home/shell/homeCommands'
import { HISTORY_FILE, historyLines, recordHistory } from '@/components/rafeyos/core/commands/history'
import { LINE_TYPES, dim, pre, prompt } from '@/components/rafeyos/core/commands/lines'
import { HOME, START_DIR } from '@/components/rafeyos/core/vfs/buildVfs'
import { writeFile } from '@/components/rafeyos/core/vfs/fsOps'
import { SETTINGS_KEY, sharedSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { announceWrite, otherTab, resetSharedStore, sharedVfs } from '@/tests/home/helpers/homeStore'

const fakeHandlers = () => ({ newTab: vi.fn(), mailto: vi.fn(), projects3d: vi.fn(), handoff: vi.fn() })

/** A fresh page load: a new provider (the root layout's) around a new homepage shell. */
const load = (handlers = fakeHandlers()) => {
  const view = renderHook(() => useHomeShell({ handlers }), { wrapper: TerminalProvider })
  return { ...view, handlers }
}

const run = (view, raw) => {
  let outcome
  act(() => {
    outcome = view.result.current.run(raw)
  })
  return outcome
}

const lines = (view) => view.result.current.entries.map((entry) => entry.line)
const lastLine = (view) => lines(view).at(-1)

beforeEach(resetSharedStore)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('useHomeShell: one filesystem with rafeyOS', () => {
  it('mkdir on the homepage lands in the store /os reads, and the line ends with the rafeyOS hint', () => {
    const view = load()

    run(view, 'mkdir ~/notes')

    expect(sharedVfs()[`${HOME}/notes`]).toMatchObject({ type: 'dir' })
    expect(lines(view)).toEqual([prompt(START_DIR, 'mkdir ~/notes'), dim(VISIBLE_IN_RAFEYOS)])
  })

  it('prints the hint once per line, and never for /tmp or the history file', () => {
    const view = load()

    run(view, 'echo hi > /tmp/a.txt')
    run(view, 'echo hi')
    run(view, 'mkdir ~/a ~/b && touch ~/a/x')

    expect(lines(view).filter((line) => line.text === VISIBLE_IN_RAFEYOS)).toHaveLength(1)
    expect(lastLine(view)).toEqual(dim(VISIBLE_IN_RAFEYOS))
  })

  it('gsettings_on_home_saves_and_prints_the_hint', () => {
    const view = load()
    const set = "gsettings set org.gnome.desktop.interface accent-color 'purple'"

    run(view, 'gsettings get org.gnome.desktop.interface color-scheme')
    expect(lastLine(view)).toEqual(pre("'default'"))
    run(view, set)

    expect(sharedSettingsStore(window).getState()).toEqual({ accent: '#7764D8' })
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY))).toEqual({ v: 1, values: { accent: '#7764D8' } })
    expect(lines(view).slice(-2)).toEqual([prompt(START_DIR, set), dim(VISIBLE_IN_RAFEYOS)])
    run(view, set)
    expect(lastLine(view)).toEqual(prompt(START_DIR, set))
  })

  it('a write in another tab shows up without a reload', () => {
    const view = load()

    otherTab().apply(writeFile, { path: `${HOME}/Desktop/from-tab.txt`, text: 'hi\n' })
    announceWrite()
    run(view, 'ls ~/Desktop')

    expect(lastLine(view)).toMatchObject({ type: LINE_TYPES.LS, entries: [{ name: 'from-tab.txt' }] })
  })
})

describe('useHomeShell: folder', () => {
  it('starts in ~', () => {
    expect(load().result.current.cwd).toBe(HOME)
  })

  it('folder is restored after a reload, or falls back to ~ when it was deleted', () => {
    const first = load()
    run(first, 'mkdir ~/keep && cd ~/keep')
    expect(window.localStorage.getItem(HOME_CWD_KEY)).toBe(`${HOME}/keep`)
    first.unmount()

    const second = load()
    expect(second.result.current.cwd).toBe(`${HOME}/keep`)
    second.unmount()

    window.localStorage.setItem(HOME_CWD_KEY, `${HOME}/gone`)
    expect(load().result.current.cwd).toBe(START_DIR)
  })

  it('keeps its folder apart from the other terminals, and the next line runs there', () => {
    const view = load()

    run(view, 'cd ~/Documents')
    run(view, 'pwd')

    expect(lastLine(view)).toEqual(pre(`${HOME}/Documents`))
    expect(lines(view).at(-2)).toEqual(prompt(`${HOME}/Documents`, 'pwd'))
  })
})

describe('useHomeShell: history', () => {
  it('history is shared with /os through ~/.bash_history', () => {
    otherTab().apply(recordHistory, { line: 'typed in /os' })
    announceWrite()
    const view = load()

    run(view, 'echo from home')
    run(view, 'history')

    expect(historyLines(sharedVfs())).toEqual(['typed in /os', 'echo from home', 'history'])
    expect(lastLine(view).text).toMatch(/1 {2}typed in \/os\n.*2 {2}echo from home/)
  })

  it('history -c empties the file and tells the caller to forget its ↑ list', () => {
    const view = load()
    run(view, 'echo one')

    expect(run(view, 'history -c')).toEqual({ historyCleared: true })
    expect(historyLines(sharedVfs())).toEqual([])
    expect(run(view, 'echo two')).toEqual({ historyCleared: false })
  })

  it('records nothing for a blank line', () => {
    const view = load()

    run(view, '   ')

    expect(sharedVfs()[HISTORY_FILE]).toBeUndefined()
    expect(lines(view)).toEqual([prompt(START_DIR, '   ')])
  })
})

describe('useHomeShell: keys and sessions', () => {
  it('ctrl+c echoes the line with ^C and sets $? to 130', () => {
    const view = load()

    act(() => view.result.current.interrupt('half typed'))
    run(view, 'echo $?')

    expect(lines(view)).toEqual([prompt(START_DIR, 'half typed^C'), prompt(START_DIR, 'echo $?'), pre('130')])
  })

  it('clear and ctrl+l empty the screen', () => {
    const view = load()
    run(view, 'echo one')

    run(view, 'echo two; clear; echo three')
    expect(lines(view)).toEqual([pre('three')])

    act(() => view.result.current.clear())
    expect(lines(view)).toEqual([])
  })

  it('counts commands per visit, so the ghost returns on every fresh load', () => {
    const first = load()
    expect(first.result.current.started).toBe(false)
    run(first, 'echo hi')
    expect(first.result.current.started).toBe(true)
    first.unmount()

    expect(load().result.current.started).toBe(false)
  })

  it('exit prints logout, then starts fresh in ~ and saves that folder', () => {
    vi.useFakeTimers()
    const view = load()
    run(view, 'cd ~/Documents')

    run(view, 'exit')
    expect(lastLine(view)).toEqual(pre('logout'))
    act(() => vi.advanceTimersByTime(299))
    expect(view.result.current.cwd).toBe(`${HOME}/Documents`)
    act(() => vi.advanceTimersByTime(1))

    expect(view.result.current).toMatchObject({ entries: [], cwd: START_DIR, started: false })
    expect(window.localStorage.getItem(HOME_CWD_KEY)).toBe(START_DIR)
    expect(historyLines(sharedVfs())).toEqual(['cd ~/Documents', 'exit'])
  })

  it('ps_on_home_shows_bash_and_ps', () => {
    const view = load()

    run(view, 'ps')

    expect(lastLine(view)).toEqual(pre('    PID TTY          TIME CMD\n   1000 pts/0    00:00:00 bash\n   1001 pts/0    00:00:00 ps'))
  })

  it('kill_1000_on_home_starts_a_fresh_session', () => {
    vi.useFakeTimers()
    const view = load()
    run(view, 'cd ~/Documents')

    run(view, 'kill 1000')
    expect(lastLine(view)).toEqual(prompt(`${HOME}/Documents`, 'kill 1000'))
    run(view, 'kill 1001')
    expect(lastLine(view)).toMatchObject({ type: LINE_TYPES.ERROR, text: 'bash: kill: (1001) - No such process' })
    act(() => vi.advanceTimersByTime(300))

    expect(view.result.current).toMatchObject({ entries: [], cwd: START_DIR, started: false })
  })

  it('a new session never starts once the terminal is gone', () => {
    vi.useFakeTimers()
    const view = load()
    run(view, 'cd ~/Documents')
    run(view, 'exit')

    view.unmount()
    act(() => vi.advanceTimersByTime(1000))

    expect(window.localStorage.getItem(HOME_CWD_KEY)).toBe(`${HOME}/Documents`)
  })
})

describe('useHomeShell: effects and panels', () => {
  it('runs the homepage effects through the injected handlers, from every stage of a pipe', () => {
    const view = load()

    run(view, 'open linkedin | wc -l')
    run(view, 'open email')
    run(view, 'projects --3d')
    run(view, 'os')

    expect(view.handlers.newTab).toHaveBeenCalledWith(expect.stringContaining('linkedin'))
    expect(view.handlers.mailto).toHaveBeenCalledWith(expect.stringMatching(/^mailto:/))
    expect(view.handlers.projects3d).toHaveBeenCalledTimes(1)
    expect(view.handlers.handoff).toHaveBeenCalledWith({ type: HOME_EFFECTS.HANDOFF })
  })

  it('the last foreground panel of a line takes the keyboard, until it is done', () => {
    const view = load()

    run(view, 'projects; music play')
    const [picker, player] = view.result.current.entries.filter((entry) => entry.line.type === LINE_TYPES.PANEL)
    expect(view.result.current.foregroundId).toBe(player.id)

    act(() => view.result.current.finish(player.id, { stoppedAt: 3, duration: 10 }))

    expect(view.result.current.foregroundId).toBeNull()
    expect(view.result.current.entries.find((entry) => entry.id === player.id).line.props).toMatchObject({ stoppedAt: 3, duration: 10 })
    expect(picker.line.kind).toBe(HOME_PANELS.PROJECTS_PICKER)
  })
})
