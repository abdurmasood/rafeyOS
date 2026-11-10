// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  clickDock,
  desktopIcon,
  fsDisk,
  fsFiles,
  fsStoreOn,
  fsTrash,
  memoryStorage,
  openTerminal,
  quotaError,
  refusingWrites,
  renderDesktop,
  settle,
  typeCommand,
  windowsOf,
} from '@/tests/rafeyos/helpers/renderRafeyOS'
import { createSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'

afterEach(cleanup)

const log = (win) => win.querySelector('.tlog')

describe('Terminal app', () => {
  it('runs help and prints the shared command list', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'help')

    expect(log(win).textContent).toContain('Available commands:')
    expect(log(win).textContent).toContain("Use ↑ for history, tab to autocomplete, 'clear' to reset.")
    expect(log(win).querySelector('.pg').textContent).toBe('visitor@rafey.ai')
  })

  it('terminal prompt and title say rafey.ai', () => {
    const { container } = renderDesktop()
    const { win } = openTerminal(container)

    expect(win.querySelector('.tline .pg').textContent).toBe('visitor@rafey.ai')
    expect(win.getAttribute('aria-label')).toBe('visitor@rafey.ai: ~')
  })

  it('ctrl+c prints ^C, clears the input and sets $? to 130', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    fireEvent.change(input, { target: { value: 'echo oops' } })

    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })

    expect(input.value).toBe('')
    // The prompt's space is a no-break one, so it survives in the DOM
    expect(log(win).lastElementChild.textContent).toBe('visitor@rafey.ai:~$\u00a0echo oops^C')
    typeCommand(input, 'echo $?')
    expect(log(win).lastElementChild.textContent).toBe('130')
  })

  it('ctrl+shift+c leaves the input alone, so copy still works', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    fireEvent.change(input, { target: { value: 'echo oops' } })
    const lines = log(win).childElementCount

    const notCancelled = fireEvent.keyDown(input, { key: 'C', ctrlKey: true, shiftKey: true })

    expect(notCancelled).toBe(true)
    expect(input.value).toBe('echo oops')
    expect(log(win).childElementCount).toBe(lines)
  })

  it('keeps $? from one command line to the next', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'false')
    typeCommand(input, 'echo $?')

    expect(log(win).lastElementChild.textContent).toBe('1')
  })

  it('creating a file then xdg-open on one line opens it in the editor', () => {
    const { container, services } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'cd && echo hi > notes.txt && xdg-open notes.txt')

    expect(services.fs.getState().nodes['/home/visitor/notes.txt'].text).toBe('hi\n')
    expect(windowsOf(container, 'editor').map((editor) => editor.getAttribute('aria-label'))).toEqual(['notes.txt'])
  })

  it('a new terminal starts in the visitor\'s home and New Window copies the cwd', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    expect(win.getAttribute('aria-label')).toBe('visitor@rafey.ai: ~')
    typeCommand(input, 'cd ~/Documents')

    fireEvent.click(within(win).getByRole('button', { name: 'New Window' }))
    fireEvent.keyDown(document.body, { key: 't', ctrlKey: true, altKey: true })

    expect(windowsOf(container, 'terminal').map((terminal) => terminal.getAttribute('aria-label'))).toEqual([
      'visitor@rafey.ai: ~/Documents',
      'visitor@rafey.ai: ~/Documents',
      'visitor@rafey.ai: ~',
    ])
  })

  it('starts in the visitor\'s home and lists it with folders in blue', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'ls')

    const pre = log(win).querySelector('pre')
    expect(pre.textContent).toContain('Downloads')
    expect([...pre.querySelectorAll('.pb')].map((node) => node.textContent)).toContain('Documents')
  })

  it('offers help as a ghost and runs it on Enter at an empty prompt', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    expect(win.querySelector('.ghost').textContent).toBe('help')

    fireEvent.keyDown(input, { key: 'Enter' })

    expect(log(win).textContent).toContain('Available commands:')
    expect(win.querySelector('.ghost')).toBeNull()
  })

  it('nano runs in the terminal in place of the prompt, and ^X brings the prompt back', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'nano notes.txt')

    expect(win.querySelector('.nano-title').textContent).toBe('──── notes.txt ────')
    expect(win.querySelector('.nano-status').textContent).toBe('[ New File ]')
    expect(win.querySelector('.tline')).toBeNull()
    expect(windowsOf(container, 'editor')).toEqual([])

    fireEvent.keyDown(win.querySelector('.nano-buffer'), { key: 'x', ctrlKey: true })

    expect(win.querySelector('.nano')).toBeNull()
    expect(win.querySelector('.tline input')).toBeTruthy()
  })

  it('nano writes to the visitor\'s files with ^O', () => {
    const { container, services } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'nano notes.txt')
    const buffer = win.querySelector('.nano-buffer')

    fireEvent.change(buffer, { target: { value: 'hello' } })
    fireEvent.keyDown(buffer, { key: 'o', ctrlKey: true })

    expect(services.fs.getState().nodes['/home/visitor/notes.txt'].text).toBe('hello\n')
    expect(win.querySelector('.nano-status').textContent).toBe('[ Wrote 1 line ]')
  })

  it('vim notes that it opened nano instead', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'vim notes.txt')

    expect(log(win).querySelector('.dm').textContent).toBe("vim isn't installed here, opened nano instead")
    expect(win.querySelector('.nano-buffer')).toBeTruthy()
  })

  it('blog opens the picker in place of the prompt, and Enter prints the post', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'blog')

    expect(within(win).getByRole('list', { name: 'Posts' })).toBeTruthy()
    expect(win.querySelector('.tline')).toBeNull()

    act(() => {
      fireEvent.keyDown(win.querySelector('.term'), { key: 'Enter' })
    })

    expect(win.querySelector('article.article h1').textContent).toMatch(/^# /)
    expect(win.querySelector('.picker-list')).toBeNull()
    expect(win.querySelector('.tline input')).toBeTruthy()
  })

  it('the blog picker ignores keys typed in other windows, and esc quits it', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'blog')

    act(() => {
      fireEvent.keyDown(document.body, { key: 'Enter' })
    })
    expect(win.querySelector('.picker-list')).toBeTruthy()

    act(() => {
      fireEvent.keyDown(win.querySelector('.term'), { key: 'Escape' })
    })
    expect(win.querySelector('.picker-list')).toBeNull()
    expect(win.querySelector('article')).toBeNull()
    expect(win.querySelector('.tline input')).toBeTruthy()
  })

  it('projects opens the picker in place of the prompt, and Enter prints the project', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'projects')

    expect(within(win).getByRole('list', { name: 'Projects' })).toBeTruthy()
    expect(win.querySelector('.tline')).toBeNull()

    act(() => {
      fireEvent.keyDown(win.querySelector('.term'), { key: 'Enter' })
    })

    expect(win.querySelector('.project-printed .project-card h1').textContent).toMatch(/^# /)
    expect(win.querySelector('.picker-list')).toBeNull()
    expect(win.querySelector('.tline input')).toBeTruthy()
  })

  it('v does nothing in the projects picker', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'projects')
    const windowsBefore = container.querySelectorAll('.win').length

    act(() => {
      fireEvent.keyDown(win.querySelector('.term'), { key: 'v' })
    })

    expect(container.querySelectorAll('.win')).toHaveLength(windowsBefore)
    expect(win.querySelector('.picker-list')).toBeTruthy()
    expect(within(win).queryByText('[ 3D ]')).toBeNull()
  })

  it('skills lists each tool as a link that opens in a new tab', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'skills')

    const links = [...win.querySelectorAll('.skill-rows a.skill')]
    expect(links.length).toBeGreaterThan(0)
    expect(links.every((link) => link.target === '_blank' && link.rel === 'noopener noreferrer' && link.href.startsWith('https://'))).toBe(true)
  })

  it('gedit still opens the Text Editor', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'gedit /home/rafey/bio.txt')

    expect(windowsOf(container, 'editor').map((editor) => editor.getAttribute('aria-label'))).toEqual(['bio.txt'])
  })

  // Otherwise the same Enter clicks whatever the line focused, e.g. Cancel in the Open Link dialog
  it('blocks Enter\'s default action when it runs a line', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)
    fireEvent.change(input, { target: { value: 'xdg-open /home/rafey/contact/linkedin.desktop' } })

    const notCancelled = fireEvent.keyDown(input, { key: 'Enter' })

    expect(notCancelled).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Open Link' })).toBeTruthy()
  })

  it('runs the ghost when tapped', () => {
    const { container } = renderDesktop()
    const { win } = openTerminal(container)

    fireEvent.click(win.querySelector('.ghost'))

    expect(log(win).textContent).toContain('Available commands:')
  })

  it('changes directory and shows it in the title and prompt', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'cd /home/rafey/projects')

    expect(win.getAttribute('aria-label')).toBe('visitor@rafey.ai: /home/rafey/projects')
    expect(win.querySelector('.tline .cwd').textContent).toBe('/home/rafey/projects')
  })

  it('colours the prompt like the homepage: user and host coloured, @ and the path plain', () => {
    const { container } = renderDesktop()
    const { win } = openTerminal(container)

    const prompt = win.querySelector('.tline')
    expect(prompt.querySelector('.pu').textContent).toBe('visitor')
    expect(prompt.querySelector('.ph').textContent).toBe('rafey.ai')
    expect(prompt.querySelector('.cwd').textContent).toBe('~')
    expect(prompt.querySelector('.pb')).toBeNull()
  })

  it('draws a block cursor on the ghost\'s first letter, as the homepage does', () => {
    const { container } = renderDesktop()
    const { win } = openTerminal(container)

    const cursor = win.querySelector('.tline .tcursor')
    expect(cursor.textContent).toBe('h')
    expect(cursor.style.left).toBe('calc(0ch - 0px)')
  })

  it('moves the block cursor with the typed text and holds it solid while typing', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    fireEvent.keyDown(input, { key: 'l' })
    fireEvent.change(input, { target: { value: 'ls' } })

    const cursor = win.querySelector('.tline .tcursor')
    expect(cursor.textContent).toBe('')
    expect(cursor.style.left).toBe('calc(2ch - 0px)')
    expect(cursor.classList.contains('is-typing')).toBe(true)
  })

  it('keeps the blank row a block ends with, as the homepage does', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'help')

    const block = [...log(win).querySelectorAll('pre')].find((pre) => pre.textContent.startsWith('Available commands:'))
    expect(block.textContent.endsWith('\n\n')).toBe(true)
  })

  it('completes with Tab and walks history with the arrows', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)
    typeCommand(input, 'whoami')

    fireEvent.change(input, { target: { value: 'pw' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('pwd ')

    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.value).toBe('')
  })

  it('completes a path after $HOME and the window\'s $OLDPWD with Tab', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    fireEvent.change(input, { target: { value: 'cd $HOME/Doc' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('cd $HOME/Documents/')

    typeCommand(input, 'cd /home/visitor')
    typeCommand(input, 'cd /')
    fireEvent.change(input, { target: { value: 'cd $OLDPWD/Down' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('cd $OLDPWD/Downloads/')
  })

  it('lists several completions on the second Tab', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'clear')

    fireEvent.change(input, { target: { value: 'c' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    fireEvent.keyDown(input, { key: 'Tab' })

    expect(log(win).textContent).toContain('cat  cd  clear  contact  cp')
  })

  it('clears with clear and with Ctrl+L', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'whoami')

    typeCommand(input, 'clear')
    expect(log(win).children).toHaveLength(0)

    typeCommand(input, 'whoami')
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true })
    expect(log(win).children).toHaveLength(0)
  })

  it('opens folders in Files', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'xdg-open /home/rafey/projects')
    expect(windowsOf(container, 'files')).toHaveLength(1)
    expect(log(win).querySelectorAll('.dm')).toHaveLength(0)
  })

  it('opens project files in the Text Editor', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'xdg-open /home/rafey/projects/leaf-line.txt')

    expect(windowsOf(container, 'editor')).toHaveLength(1)
  })

  it('plays music without opening a window', async () => {
    const { container, services } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'music play')
    await settle()

    expect(log(win).textContent).toContain('▶ playing   Storms Ahead · Ramé Sivano')
    expect(services.createAudio.last().play).toHaveBeenCalledTimes(1)
    expect(windowsOf(container, 'music')).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toBe('Storms AheadRamé Sivano')
  })

  it('opens text files in the Text Editor and email in Mail', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'xdg-open /home/rafey/bio.txt')
    typeCommand(input, 'open email')

    expect(windowsOf(container, 'editor')[0].getAttribute('aria-label')).toBe('bio.txt')
    expect(windowsOf(container, 'mail')).toHaveLength(1)
  })

  it('opens LinkedIn in a new tab', () => {
    const { container, services } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'open linkedin')

    expect(log(win).textContent).toContain('Opening LinkedIn profile in a new tab...')
    expect(services.openExternal).toHaveBeenCalledWith('https://www.linkedin.com/in/arafeymasood/')
    expect(screen.queryByRole('dialog', { name: 'Open Link' })).toBeNull()
  })

  it('opens another terminal in the same folder from the header', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'cd /home/rafey/blog')

    fireEvent.click(within(win).getByRole('button', { name: 'New Window' }))

    const terminals = windowsOf(container, 'terminal')
    expect(terminals).toHaveLength(2)
    expect(terminals[1].getAttribute('aria-label')).toBe('visitor@rafey.ai: /home/rafey/blog')
  })

  it('closes its window on exit', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'exit')

    expect(windowsOf(container, 'terminal')).toHaveLength(0)
  })

  it('logs out to the home terminal on logout', async () => {
    const { container, services } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'logout')

    expect(log(win).textContent).toContain('Returning to the rafey.ai terminal…')
    await waitFor(() => expect(services.navigate).toHaveBeenCalledWith('/'))
  })

  it('mkdir in the terminal puts a folder on the desktop', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'mkdir ~/Desktop/notes')

    expect(desktopIcon(container, '/home/visitor/Desktop/notes')).not.toBeNull()
  })

  it('history_survives_a_remount_through_bash_history', () => {
    const disk = memoryStorage()
    const first = renderDesktop({ fs: fsStoreOn(disk) })
    typeCommand(openTerminal(first.container).input, 'whoami')
    first.unmount()

    const { container } = renderDesktop({ fs: fsStoreOn(disk) })
    const { win, input } = openTerminal(container)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')

    typeCommand(input, 'history')
    expect(log(win).lastElementChild.textContent).toBe('    1  whoami\n    2  history')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
  })

  it('history_in_one_window_shows_lines_from_another', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    fireEvent.click(within(win).getByRole('button', { name: 'New Window' }))
    const second = windowsOf(container, 'terminal')[1]
    const secondInput = within(second).getByLabelText('Terminal input')

    typeCommand(input, 'whoami')
    typeCommand(secondInput, 'history')

    expect(log(second).lastElementChild.textContent).toBe('    1  whoami\n    2  history')
    // ↑ walks the window's own lines, not the other window's
    fireEvent.change(secondInput, { target: { value: '' } })
    fireEvent.keyDown(secondInput, { key: 'ArrowUp' })
    fireEvent.keyDown(secondInput, { key: 'ArrowUp' })
    expect(secondInput.value).toBe('history')
  })

  it('a failed history write is silent and ↑ still recalls the line', () => {
    const { container } = renderDesktop({ fs: fsStoreOn(refusingWrites(memoryStorage(), quotaError())) })
    const { win, input } = openTerminal(container)

    typeCommand(input, 'whoami')

    expect(log(win).lastElementChild.textContent).toBe('visitor')
    expect(log(win).querySelector('.er')).toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('whoami')
  })

  it('a failed history write leaves history listing the window\'s own lines', () => {
    const { container } = renderDesktop({ fs: fsStoreOn(refusingWrites(memoryStorage(), quotaError())) })
    const { win, input } = openTerminal(container)

    typeCommand(input, 'whoami')
    typeCommand(input, 'history')

    expect(log(win).lastElementChild.textContent).toBe('    1  whoami\n    2  history')
  })

  it('history -c leaves ↑ with nothing to recall', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)
    typeCommand(input, 'whoami')

    typeCommand(input, 'history -c')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('')

    typeCommand(input, 'history')
    expect(log(win).lastElementChild.textContent).toBe('    1  history')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('history')
  })

  it('uptime counts from when the terminal opened', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, 'uptime')

    expect(log(win).lastElementChild.textContent).toBe(' 21:04:00 up 0 min,  1 user,  load average: 0.00, 0.00, 0.00')
  })

  it('rm in the terminal removes the desktop icon', () => {
    const { container } = renderDesktop({ fs: fsStoreOn(fsDisk({ '/home/visitor/Desktop/a.txt': 'x' })) })
    const { input } = openTerminal(container)
    expect(desktopIcon(container, '/home/visitor/Desktop/a.txt')).not.toBeNull()

    typeCommand(input, 'rm ~/Desktop/a.txt')

    expect(desktopIcon(container, '/home/visitor/Desktop/a.txt')).toBeNull()
  })
})

describe('gsettings in the Terminal', () => {
  const root = (container) => container.querySelector('.rafeyos')

  it('set_color_scheme_prefer_light_switches_the_desktop_to_light', () => {
    const { container, services } = renderDesktop()
    const { win, input } = openTerminal(container)
    expect(root(container).className).toBe('rafeyos')

    typeCommand(input, "gsettings set org.gnome.desktop.interface color-scheme 'prefer-light'")

    expect(root(container).className).toBe('rafeyos light')
    expect(services.settings.getState()).toEqual({ style: 'light' })
    typeCommand(input, 'gsettings get org.gnome.desktop.interface color-scheme')
    expect(log(win).lastElementChild.textContent).toBe("'prefer-light'")
  })

  it('accent_color_set_changes_the_accent_css_var', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, "gsettings set org.gnome.desktop.interface accent-color 'purple'")
    typeCommand(input, "gsettings set org.gnome.shell.extensions.dash-to-dock dock-position 'RIGHT'")

    expect(root(container).style.getPropertyValue('--accent')).toBe('#7764D8')
    expect(container.querySelector('.dock').className).toBe('dock right')
  })
})

describe('ps and kill in the Terminal', () => {
  const saveDialog = () => screen.queryByRole('dialog', { name: 'Save changes' })

  it('ps_lists_bash_nautilus_editor_and_itself', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    clickDock('Text Editor')
    const { win, input } = openTerminal(container)

    typeCommand(input, 'ps')

    expect(log(win).lastElementChild.textContent).toBe(
      [
        '    PID TTY          TIME CMD',
        '   1001 ?        00:00:00 nautilus',
        '   1002 ?        00:00:00 gnome-text-editor',
        '   1003 pts/0    00:00:00 bash',
        '   1004 pts/0    00:00:00 ps',
      ].join('\n'),
    )
  })

  it('ps_lists_terminals_as_bash_on_pts_by_id', () => {
    const { container } = renderDesktop()
    const { win } = openTerminal(container)
    fireEvent.click(within(win).getByRole('button', { name: 'New Window' }))
    const second = windowsOf(container, 'terminal')[1]

    typeCommand(within(second).getByLabelText('Terminal input'), 'ps')

    expect(log(second).lastElementChild.textContent).toBe(
      [
        '    PID TTY          TIME CMD',
        '   1001 pts/0    00:00:00 bash',
        '   1002 pts/1    00:00:00 bash',
        '   1003 pts/1    00:00:00 ps',
      ].join('\n'),
    )
  })

  it('kill_closes_the_files_window', () => {
    const { container } = renderDesktop()
    clickDock('Files')
    const { input } = openTerminal(container)

    typeCommand(input, 'kill 1001')

    expect(windowsOf(container, 'files')).toHaveLength(0)
    expect(windowsOf(container, 'terminal')).toHaveLength(1)
  })

  it('kill_on_a_changed_editor_asks_to_save_and_kill_9_does_not', () => {
    const { container } = renderDesktop()
    clickDock('Text Editor')
    const [editor] = windowsOf(container, 'editor')
    fireEvent.change(within(editor).getByLabelText('Untitled'), { target: { value: 'keep me' } })
    const { input } = openTerminal(container)

    typeCommand(input, 'kill 1001')
    expect(saveDialog()).not.toBeNull()
    expect(windowsOf(container, 'editor')).toEqual([editor])
    fireEvent.click(within(saveDialog()).getByRole('button', { name: 'Cancel' }))

    typeCommand(input, 'kill -9 1001')
    expect(windowsOf(container, 'editor')).toHaveLength(0)
    expect(saveDialog()).toBeNull()
  })

  it('kill_own_bash_closes_the_terminal', () => {
    const { container } = renderDesktop()
    const { input } = openTerminal(container)

    typeCommand(input, 'kill 1001')

    expect(windowsOf(container, 'terminal')).toHaveLength(0)
  })
})

describe('neofetch in the Terminal', () => {
  it('neofetch_renders_with_labels_in_the_accent_colour', () => {
    const { container } = renderDesktop()
    const { win, input } = openTerminal(container)

    typeCommand(input, "gsettings set org.gnome.desktop.interface accent-color 'purple'; neofetch")

    const block = log(win).lastElementChild
    expect(block.textContent).toContain('Theme: Dark · Purple accent')
    const accented = [...block.querySelectorAll('.ac')].map((span) => span.textContent.trimEnd()).filter(Boolean)
    expect(accented).toEqual([
      "   .-'''-.", '  /  .-.  \\', ' |  ( r )  |', 'OS', "  \\  '-'  /", 'Host', "   '-...-'", 'Kernel',
      'Uptime', 'Shell', 'DE', 'Theme', 'CPU', 'Memory',
    ])
  })
})

describe('reset-home in the Terminal', () => {
  const QUESTION = 'reset-home: erase /home/visitor, saved settings and history? [y/N]'
  const NOTES = '/home/visitor/Desktop/notes.txt'
  const HISTORY = '/home/visitor/.bash_history'
  const root = (container) => container.querySelector('.rafeyos')
  const promptOf = (win) => win.querySelector('.tline')
  const savedDisk = () => fsDisk({ [NOTES]: 'hi\n', [HISTORY]: 'ls\n' }, { '/home/visitor/old.txt': 'old\n' })
  /** A saved purple accent, light style, right-hand dock and bigger icons. */
  const savedSettings = () => {
    const settings = createSettingsStore({ storage: memoryStorage() })
    settings.set('accent', '#7764D8')
    settings.set('style', 'light')
    settings.set('dockPos', 'right')
    settings.set('iconSize', 48)
    return settings
  }

  it('reset_home_asks_and_enter_means_no', () => {
    const disk = savedDisk()
    const { container } = renderDesktop({ fs: fsStoreOn(disk) })
    const { win, input } = openTerminal(container)

    typeCommand(input, 'reset-home')
    expect(promptOf(win).textContent).toBe(`${QUESTION} `)
    expect(promptOf(win).querySelector('.pg')).toBeNull()
    expect(log(win).lastElementChild.textContent).toBe('visitor@rafey.ai:~$ reset-home')

    typeCommand(input, '')

    expect(log(win).lastElementChild.textContent).toBe(`${QUESTION} `)
    expect(promptOf(win).querySelector('.pg').textContent).toBe('visitor@rafey.ai')
    expect(fsFiles(disk)).toMatchObject({ [NOTES]: 'hi\n' })
    expect(fsTrash(disk)).toEqual({ '/home/visitor/old.txt': 'old\n' })
    typeCommand(input, 'echo $?')
    expect(log(win).lastElementChild.textContent).toBe('0')
  })

  it('reset_home_y_wipes_files_trash_history_and_settings', () => {
    const disk = savedDisk()
    const settings = savedSettings()
    const { container } = renderDesktop({ fs: fsStoreOn(disk), settings })
    const { win, input } = openTerminal(container)

    typeCommand(input, 'reset-home')
    typeCommand(input, 'y')

    expect(log(win).lastElementChild.textContent).toBe(`${QUESTION} y`)
    expect(fsFiles(disk)).toEqual({})
    expect(fsTrash(disk)).toEqual({})
    expect(settings.getState()).toEqual({})
    typeCommand(input, 'history')
    expect(log(win).lastElementChild.textContent).toBe('    1  history')
  })

  it('desktop_icons_and_accent_return_to_defaults_after_reset', () => {
    const { container } = renderDesktop({ fs: fsStoreOn(savedDisk()), settings: savedSettings() })
    const { input } = openTerminal(container)
    expect(desktopIcon(container, NOTES)).not.toBeNull()
    expect(root(container).className).toBe('rafeyos light')
    expect(root(container).style.getPropertyValue('--accent')).toBe('#7764D8')
    expect(container.querySelector('.dock').className).toBe('dock right')

    typeCommand(input, 'reset-home')
    typeCommand(input, 'YES')

    expect(desktopIcon(container, NOTES)).toBeNull()
    expect(root(container).className).toBe('rafeyos')
    expect(root(container).style.getPropertyValue('--accent')).toBe('#E95420')
    expect(container.querySelector('.dock').className).toBe('dock bottom')
  })

  it('ctrl_c_at_the_question_cancels_with_130', () => {
    const disk = savedDisk()
    const { container } = renderDesktop({ fs: fsStoreOn(disk) })
    const { win, input } = openTerminal(container)
    typeCommand(input, 'reset-home')
    fireEvent.change(input, { target: { value: 'ma' } })

    fireEvent.keyDown(input, { key: 'c', ctrlKey: true })

    expect(input.value).toBe('')
    expect(log(win).lastElementChild.textContent).toBe(`${QUESTION} ma^C`)
    expect(promptOf(win).querySelector('.pg')).not.toBeNull()
    expect(fsFiles(disk)).toMatchObject({ [NOTES]: 'hi\n' })
    typeCommand(input, 'echo $?')
    expect(log(win).lastElementChild.textContent).toBe('130')
  })

  it('answer_is_not_saved_to_history_or_up_arrow', () => {
    const disk = fsDisk()
    const { container } = renderDesktop({ fs: fsStoreOn(disk) })
    const { win, input } = openTerminal(container)
    typeCommand(input, 'reset-home')

    // Tab, ↑ and ↓ do nothing while the question waits
    for (const key of ['ArrowUp', 'Tab', 'ArrowDown']) fireEvent.keyDown(input, { key })
    expect(input.value).toBe('')
    typeCommand(input, 'nope')

    expect(fsFiles(disk)[HISTORY]).toBe('reset-home\n')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('reset-home')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('reset-home')
    typeCommand(input, 'history')
    expect(log(win).lastElementChild.textContent).toBe('    1  reset-home\n    2  history')
  })

  it('other_open_terminal_up_arrow_is_cleared', () => {
    const { container } = renderDesktop({ fs: fsStoreOn(savedDisk()) })
    const { win, input } = openTerminal(container)
    typeCommand(input, 'echo one')
    fireEvent.click(within(win).getByRole('button', { name: 'New Window' }))
    const second = within(windowsOf(container, 'terminal')[1]).getByLabelText('Terminal input')
    typeCommand(second, 'echo two')

    typeCommand(input, 'reset-home')
    typeCommand(input, 'y')

    fireEvent.keyDown(second, { key: 'ArrowUp' })
    expect(second.value).toBe('')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('')
  })

  it('a failed reset after y prints why, sets 1 and changes nothing', () => {
    const disk = refusingWrites(savedDisk(), quotaError())
    const settings = savedSettings()
    const { container } = renderDesktop({ fs: fsStoreOn(disk), settings })
    const { win, input } = openTerminal(container)

    typeCommand(input, 'reset-home')
    typeCommand(input, 'y')

    expect([...log(win).children].slice(-2).map((row) => row.textContent)).toEqual([
      `${QUESTION} y`,
      'reset-home: cannot reset: No space left on device',
    ])
    expect(desktopIcon(container, NOTES)).not.toBeNull()
    expect(settings.getState()).toMatchObject({ accent: '#7764D8' })
    typeCommand(input, 'echo $?')
    expect(log(win).lastElementChild.textContent).toBe('1')
  })
})
