// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { realContent } from '@/tests/rafeyos/helpers/testVfs'
import { resetSharedStore, sharedVfs } from '@/tests/home/helpers/homeStore'
import { sharedSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { HOME_CWD_KEY } from '@/lib/storageKeys'
import { bioDescription } from '@/lib/descriptions'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/lib/loadRafeyOS', () => ({ loadRafeyOS: vi.fn(() => Promise.resolve({})) }))
vi.mock('@/lib/loadProjects', () => ({ loadProjects: vi.fn() }))
// The player's waveform never decodes here, so it stays on "loading…"
vi.mock('@/lib/audioSamples', () => ({ loadSamples: () => new Promise(() => {}) }))

const { default: Terminal } = await import('@/components/home/Terminal')
const { TerminalProvider } = await import('@/components/home/TerminalProvider')

const PROMPT = 'visitor@rafey.ai:'

/** The homepage as the root layout mounts it; `shown: false` is another route under the same provider. */
const Page = ({ shown = true }) => <TerminalProvider>{shown && <Terminal />}</TerminalProvider>

const input = () => screen.getByLabelText('terminal input')
const queryInput = () => screen.queryByLabelText('terminal input')

const type = (text) => fireEvent.change(input(), { target: { value: text } })
const press = (key, options = {}) => fireEvent.keyDown(input(), { key, ...options })
const run = (command) => {
  type(command)
  press('Enter')
}

/** The echoed prompt rows, as text. */
const echoes = (container) => [...container.querySelectorAll('.terminal-output > .echo')].map((row) => row.textContent)
const lastRow = (container) => container.querySelector('.terminal-output').lastElementChild

beforeEach(() => {
  resetSharedStore()
  push.mockClear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  // The player sizes its waveform to the terminal's width
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('home terminal: prompt and look', () => {
  it('prompt shows ~, then ~ paths after cd, in the homepage colours', () => {
    const { container } = render(<Page />)
    expect(container.querySelector('.prompt').textContent).toBe(`visitor@rafey.ai:~$`)

    run('cd ~/Documents')

    expect(container.querySelector('.prompt').textContent).toBe('visitor@rafey.ai:~/Documents$')
    const echo = container.querySelector('.echo')
    expect(echo.textContent).toBe(`${PROMPT}~$ cd ~/Documents`)
    expect([...echo.querySelectorAll('span')].map((span) => span.className)).toEqual(['brown', 'base-color', 'green', 'base-color'])
  })

  it('ls colours folders blue and links cyan, and leaves files plain', () => {
    const { container } = render(<Page />)

    run('cd /home/rafey')
    run('ls')

    const names = (selector) => [...lastRow(container).querySelectorAll(selector)].map((span) => span.textContent)
    expect(names('.dir')).toEqual(expect.arrayContaining(['blog', 'Music', 'projects']))
    expect(names('span:not([class])')).toEqual(expect.arrayContaining(['bio.txt', 'README.txt']))
    expect(lastRow(container).textContent).toMatch(/bio\.txt {2}blog/)
  })

  it('help keeps today\'s list with a blank row before the dim hint', () => {
    const { container } = render(<Page />)

    run('help')

    const [list, hint] = [...container.querySelectorAll('.terminal-output > :not(.echo)')]
    expect(list.textContent).toMatch(/^Available commands:\n\n {2}bio/)
    expect(list.textContent).toMatch(/operating system\n\n$/)
    expect(hint).toHaveProperty('className', 'grey')
    expect(hint.textContent).toBe("Use ↑ for history, tab to autocomplete, 'clear' to reset.")
  })

  it('errors read the way bash says them, in the error colour', () => {
    const { container } = render(<Page />)

    run('Help')

    expect(lastRow(container)).toHaveProperty('className', 'error-text')
    expect(lastRow(container).textContent).toBe('bash: Help: command not found')
  })

  it('typed html is escaped in the echoed prompt', () => {
    const { container } = render(<Page />)

    run('echo <b>bold</b>')

    expect(echoes(container)).toEqual([`${PROMPT}~$ echo <b>bold</b>`])
    expect(container.querySelector('.terminal-output b')).toBeNull()
  })
})

describe('home terminal: keys', () => {
  it('the ghost returns on every fresh load, and Enter on the empty prompt runs help', () => {
    const first = render(<Page />)
    expect(first.container.querySelector('.ghost-suggestion')).not.toBeNull()
    press('Enter')
    expect(first.container.textContent).toContain('Available commands:')
    expect(first.container.querySelector('.ghost-suggestion')).toBeNull()
    first.unmount()

    const second = render(<Page />)

    expect(second.container.querySelector('.ghost-suggestion')).not.toBeNull()
    press('Tab')
    expect(input().value).toBe('help')
  })

  it('a tap on the ghost runs help', () => {
    const { container } = render(<Page />)

    fireEvent.click(screen.getByRole('button', { name: 'Run help' }))

    expect(echoes(container)).toEqual([`${PROMPT}~$ help`])
    expect(container.querySelector('.ghost-suggestion')).toBeNull()
  })

  it('ctrl+c prints ^C and sets $? to 130', () => {
    const { container } = render(<Page />)
    type('half typed')

    press('c', { ctrlKey: true })
    run('echo $?')

    expect(echoes(container)).toEqual([`${PROMPT}~$ half typed^C`, `${PROMPT}~$ echo $?`])
    expect(lastRow(container).textContent).toBe('130')
  })

  it('ctrl+shift+c leaves the line alone, and ctrl+l clears the screen', () => {
    const { container } = render(<Page />)
    run('echo one')
    type('kept')

    press('C', { ctrlKey: true, shiftKey: true })
    expect(input().value).toBe('kept')
    press('l', { ctrlKey: true })

    expect(container.querySelector('.terminal-output').childElementCount).toBe(0)
  })

  it('Enter at the prompt is kept from typing into what it opens', () => {
    render(<Page />)
    type('echo hi')

    expect(fireEvent.keyDown(input(), { key: 'Enter' })).toBe(false)
  })

  it('tab completes "cd Doc" to "cd Documents/"', () => {
    render(<Page />)
    run('help')
    type('cd Doc')

    press('Tab')

    expect(input().value).toBe('cd Documents/')
  })

  it('double tab on "cd ~/D" lists Desktop, Documents and Downloads four spaces apart', () => {
    const { container } = render(<Page />)
    run('help')
    type('cd ~/D')

    press('Tab')
    press('Tab')

    expect(echoes(container).at(-1)).toBe(`${PROMPT}~$ cd ~/D`)
    expect(lastRow(container).textContent).toBe('Desktop/    Documents/    Downloads/')
    expect(input().value).toBe('cd ~/D')
  })

  it('↑ recalls this visit\'s lines and ↓ walks back to an empty prompt', () => {
    render(<Page />)
    run('echo one')
    run('echo two')

    press('ArrowUp')
    expect(input().value).toBe('echo two')
    press('ArrowUp')
    expect(input().value).toBe('echo one')
    press('ArrowDown')
    press('ArrowDown')
    expect(input().value).toBe('')
  })
})

describe('home terminal: panels', () => {
  it('projects picker, music player and blog article still render', () => {
    const { container } = render(<Page />)
    const post = realContent.posts[0]

    run('projects')
    expect(screen.getByRole('list', { name: 'Projects' })).toBeTruthy()
    expect(queryInput()).toBeNull()
    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(container.querySelector('.project-printed')).not.toBeNull()

    run('music play')
    expect(container.querySelector('.music-player')).not.toBeNull()
    act(() => {
      fireEvent.keyDown(window, { key: 'q' })
    })
    expect(queryInput()).not.toBeNull()

    run(`cat /home/rafey/blog/${post.slug}.md`)
    expect(container.querySelector('article.article h1').textContent).toBe(`# ${post.title}`)
  })

  it.each([
    ['projects --3d', () => {}],
    ['projects', () => act(() => {
      fireEvent.keyDown(window, { key: 'v' })
    })],
  ])('%s takes the LoadingBar path to the 3D projects page', (command, then) => {
    vi.useFakeTimers()
    const { container } = render(<Page />)

    run(command)
    then()

    expect(container.querySelector('.terminal-output')).toBeNull()
    act(() => vi.advanceTimersByTime(5499))
    expect(push).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(push).toHaveBeenCalledWith('/projects')
    vi.useRealTimers()
  })

  it('open linkedin opens it in a new tab with today\'s line', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = render(<Page />)

    run('open linkedin')

    expect(open).toHaveBeenCalledWith(realContent.contact.linkedinUrl, '_blank')
    expect(lastRow(container).textContent).toBe('Opening LinkedIn profile in a new tab...')
  })

  it('bio is today\'s html block', () => {
    const { container } = render(<Page />)

    run('bio')

    expect(lastRow(container).textContent).toBe(bioDescription())
  })

  it('a picker does not resume after navigating away and back', () => {
    const view = render(<Page />)
    run('projects')
    expect(queryInput()).toBeNull()

    view.rerender(<Page shown={false} />)
    view.rerender(<Page />)

    expect(queryInput()).not.toBeNull()
    expect(screen.queryByRole('list', { name: 'Projects' })).toBeNull()
  })
})

describe('home terminal: neofetch', () => {
  it('neofetch_renders_on_home_with_accent_labels', () => {
    const { container } = render(<Page />)

    run('neofetch')

    const block = lastRow(container)
    const rows = [...block.children].map((row) => row.textContent)
    expect(rows).toHaveLength(11)
    expect(rows.slice(0, 3)).toEqual([
      "   .-'''-.      visitor@rafey.ai",
      '  /  .-.  \\     ----------------',
      ' |  ( r )  |    OS: rafeyOS 24.04 LTS x86_64',
    ])
    expect(rows.at(-1)).toMatch(/^ {16}Memory: \d+ years$/)
    // The logo and every label take the homepage's accent, Ubuntu orange
    const accented = [...block.querySelectorAll('.accent')].map((span) => span.textContent.trimEnd()).filter(Boolean)
    expect(accented).toEqual([
      "   .-'''-.", '  /  .-.  \\', ' |  ( r )  |', 'OS', "  \\  '-'  /", 'Host', "   '-...-'", 'Kernel',
      'Uptime', 'Shell', 'DE', 'Theme', 'CPU', 'Memory',
    ])
  })
})

describe('home terminal: reset-home', () => {
  const QUESTION = 'reset-home: erase /home/visitor, saved settings and history? [y/N]'
  const promptRow = (container) => container.querySelector('.terminal-input')

  it('reset_home_on_home_works_shows_the_hint_and_resets_the_saved_folder', () => {
    const { container } = render(<Page />)
    run("mkdir ~/notes && cd ~/Documents && gsettings set org.gnome.desktop.interface accent-color 'purple'")
    expect(window.localStorage.getItem(HOME_CWD_KEY)).toBe('/home/visitor/Documents')

    run('reset-home')
    expect(promptRow(container).textContent).toBe(QUESTION)
    expect(promptRow(container).querySelector('.prompt')).toBeNull()
    // Tab, ↑ and ↓ do nothing while the question waits
    for (const key of ['Tab', 'ArrowUp', 'ArrowDown']) press(key)
    expect(input().value).toBe('')
    run('y')

    const rows = [...container.querySelector('.terminal-output').children].slice(-2).map((row) => row.textContent)
    expect(rows).toEqual([`${QUESTION} y`, '→ visible in rafeyOS'])
    expect(sharedVfs()['/home/visitor/notes']).toBeUndefined()
    expect(sharedSettingsStore(window).getState()).toEqual({})
    expect(window.localStorage.getItem(HOME_CWD_KEY)).toBeNull()
    expect(promptRow(container).textContent).toBe(`${PROMPT}~/Documents$`)
    press('ArrowUp')
    expect(input().value).toBe('')
    run('echo $?')
    expect(lastRow(container).textContent).toBe('0')
  })

  it('Enter alone means no, and ctrl+c cancels with 130, both kept out of history', () => {
    const { container } = render(<Page />)
    run('mkdir ~/notes')

    run('reset-home')
    press('Enter')
    expect(lastRow(container).textContent).toBe(`${QUESTION} `)
    run('reset-home')
    type('ma')
    press('c', { ctrlKey: true })

    expect(lastRow(container).textContent).toBe(`${QUESTION} ma^C`)
    expect(sharedVfs()['/home/visitor/notes']).toMatchObject({ type: 'dir' })
    run('echo $?')
    expect(lastRow(container).textContent).toBe('130')
    press('ArrowUp')
    press('ArrowUp')
    expect(input().value).toBe('reset-home')
    press('ArrowUp')
    press('ArrowUp')
    expect(input().value).toBe('mkdir ~/notes')
  })
})
