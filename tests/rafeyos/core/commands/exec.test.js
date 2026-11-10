import { describe, it, expect } from 'vitest'
import { exec, COMMANDS, COMPLETION_COMMANDS, completionCommands, withHelp } from '@/components/rafeyos/core/commands/exec'
import { buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { fsStoreOn, memoryStorage } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent, realContent, realVfs } from '@/tests/rafeyos/helpers/testVfs'
import { PANEL_KINDS, dim, error, panel, pre } from '@/components/rafeyos/core/commands/lines'

const fixtureVfs = buildVfs(fixtureContent)

/** A shell over a fresh visitor store laid on `base` (the fixture tree unless the real content is asked for). */
const shellOn = (base) => createShellFs({ base, store: fsStoreOn(memoryStorage()) })

const run = (raw, cwd = '/home/rafey', { content = fixtureContent, base = content === fixtureContent ? fixtureVfs : realVfs } = {}) =>
  exec(raw, { fs: shellOn(base), cwd, env: { PWD: cwd }, lastCode: 0, content })
const texts = (out) => out.lines.map((line) => line.text)

// Claude's call 13: bash runs these itself, so no bin folder needs to hold them
const BASH_BUILTINS = Object.freeze(['cd', 'pwd', 'echo', 'history', 'exit', 'logout', 'true', 'false'])

describe('exec basics', () => {
  it('does nothing for blank input', () => {
    expect(run('   ', '/home/rafey/Music')).toEqual({ lines: [], effects: [], cwd: '/home/rafey/Music', env: { PWD: '/home/rafey/Music' }, code: 0 })
  })

  it('reports unknown commands the bash way, with the original spelling', () => {
    expect(run('Frobnicate now')).toMatchObject({ lines: [{ type: 'error', text: 'bash: Frobnicate: command not found' }], code: 127 })
  })

  it('does not treat object prototype keys as commands', () => {
    expect(run('constructor').lines[0].type).toBe('error')
  })

  it('matches command names case-sensitively', () => {
    expect(texts(run('whoami'))).toEqual(['visitor'])
    expect(texts(run('WHOAMI'))).toEqual(['bash: WHOAMI: command not found'])
  })

  it('keeps startx runnable but out of completion', () => {
    expect(COMMANDS.startx).toBeDefined()
    expect(COMPLETION_COMMANDS).not.toContain('startx')
    expect(COMPLETION_COMMANDS).toContain('help')
  })

  it('registry commands all live in bin folders', () => {
    const outside = Object.keys(COMMANDS).filter(
      (name) => !BASH_BUILTINS.includes(name) && !realVfs[`/usr/bin/${name}`] && !realVfs[`/usr/local/bin/${name}`],
    )

    expect(outside).toEqual([])
  })

  it('true and false only set the exit code', () => {
    expect(run('true')).toMatchObject({ lines: [], code: 0 })
    expect(run('false')).toMatchObject({ lines: [], code: 1 })
  })
})

describe('a second terminal\'s own commands', () => {
  const runWith = (raw, commands) =>
    exec(raw, { fs: shellOn(fixtureVfs), cwd: '/home/rafey', env: { PWD: '/home/rafey' }, lastCode: 0, content: fixtureContent, commands })

  it('exec runs a custom registry instead of the shared one', () => {
    const commands = withHelp({ ...COMMANDS, greet: () => ({ stdout: 'hi\n' }), whoami: () => ({ stdout: 'someone\n' }) })

    expect(texts(runWith('greet', commands))).toEqual(['hi'])
    expect(texts(runWith('whoami', commands))).toEqual(['someone'])
    expect(texts(runWith('whoami --help', commands))[0]).toMatch(/^Usage: whoami/)
    expect(texts(runWith('greet', { whoami: COMMANDS.whoami }))).toEqual(['bash: greet: command not found'])
    expect(texts(run('greet'))).toEqual(['bash: greet: command not found'])
  })

  it('completion commands derive from a registry: sorted, without startx', () => {
    const handler = () => ({})

    expect(completionCommands({ zeta: handler, startx: handler, alpha: handler })).toEqual(['alpha', 'zeta'])
    expect(completionCommands(COMMANDS)).toEqual(COMPLETION_COMMANDS)
    expect(Object.isFrozen(completionCommands({ alpha: handler }))).toBe(true)
  })
})

describe('content commands', () => {
  it('help prints the help block, without music, and a dim hint', () => {
    const out = run('help', '/home/rafey', { content: realContent })

    expect(out.lines[0].text).toBe(
      "Available commands:\n\n  bio         biography\n  skills      toolkit\n" +
        "  projects    body of work\n  blog        thoughts\n" +
        '  contact     get in touch\n',
    )
    expect(out.lines[1]).toEqual({ type: 'dim', text: "Use ↑ for history, tab to autocomplete, 'clear' to reset." })
  })

  it('bio prints its text', () => {
    expect(texts(run('bio'))).toEqual(['Bio text\n'])
  })

  // The panel draws each tool as a link; text can't
  it('skills is its panel on a terminal and its text in a pipe', () => {
    expect(run('skills').lines).toEqual([panel(PANEL_KINDS.SKILLS, {})])
    expect(texts(run('skills | cat'))).toEqual(['Skills text'])
  })

  it('projects opens the picker on a terminal', () => {
    expect(run('projects')).toMatchObject({ lines: [panel(PANEL_KINDS.PROJECTS_PICKER, {}, { foreground: true })], effects: [], code: 0 })
  })

  it('projects in a pipe lists titles with a seven-word summary', () => {
    expect(texts(run('projects | cat'))).toEqual([
      `  ${'Alpha Project'.padEnd(22)}one two three four five six seven…\n  ${'Beta'.padEnd(22)}short…`,
    ])
  })

  it('projects takes no options, as on the homepage', () => {
    expect(run('projects grid')).toMatchObject({
      lines: [error("projects: unknown option 'grid'. Usage: projects")],
      effects: [],
      code: 1,
    })
  })

  it('projects --3d is refused and opens nothing', () => {
    expect(run('projects --3d')).toMatchObject({
      lines: [error("projects: unknown option '--3d'. Usage: projects")],
      effects: [],
      code: 1,
    })
  })

  it('blog opens the picker on a terminal, and says total 0 with no posts', () => {
    expect(run('blog').lines).toEqual([panel(PANEL_KINDS.BLOG_PICKER, {}, { foreground: true })])
    expect(run('blog', '/home/rafey', { content: { ...fixtureContent, posts: [] }, base: fixtureVfs }).lines).toEqual([dim('total 0')])
  })

  it('blog in a pipe lists posts with reading time', () => {
    expect(texts(run('blog | cat'))).toEqual(['total 1\n2024-01-01   1 min   First Post'])
  })

  it('blog in a pipe with no posts prints total 0', () => {
    const out = run('blog | cat', '/home/rafey', { content: { ...fixtureContent, posts: [] }, base: fixtureVfs })

    expect(texts(out)).toEqual(['total 0'])
  })

  it('music prints usage and the artist blurb', () => {
    const out = run('music')

    expect(out.lines[0].text).toBe(
      'Usage: music <command>\n\n  story      his journey as a producer\n  play       play Song\n',
    )
    expect(out.lines[1]).toEqual({ type: 'dim', text: 'Blurb.' })
  })

  it('music with an unknown subcommand falls back to usage', () => {
    expect(run('music dance').lines[0].text).toMatch(/^Usage: music/)
  })

  it('music play starts playback', () => {
    const out = run('music play')

    expect(texts(out)).toEqual(['▶ playing   Song · Artist'])
    expect(out.effects).toEqual([{ type: 'play' }])
  })

  it('music story prints the story file', () => {
    expect(texts(run('music story'))).toEqual(['2000  Start\n2030  Album (upcoming)\n'])
  })

  it('contact prints email, linkedin and usage', () => {
    expect(texts(run('contact'))).toEqual(['email: me@example.com\nlinkedin: Me\n\nUsage: open <contact-option> (e.g. open email)'])
  })
})

describe('fs commands', () => {
  it('ls of an empty cwd prints nothing', () => {
    expect(run('ls', '/home/visitor/Desktop').lines).toEqual([])
  })

  it('ls marks folders and files', () => {
    const entries = run('ls').lines[0].entries

    expect(entries[0]).toEqual({ name: 'bio.txt', kind: 'file' })
    expect(entries[1]).toEqual({ name: 'blog', kind: 'dir' })
    expect(entries.at(-1)).toEqual({ name: 'skills.txt', kind: 'file' })
  })

  it('ls on a file prints just that file; outside the tree is an error', () => {
    expect(run('ls bio.txt').lines).toEqual([{ type: 'ls', entries: [{ name: 'bio.txt', kind: 'file' }] }])
    expect(run('ls /home/visitor/../../trash').lines[0].type).toBe('error')
  })

  it('ls lists a folder, and music.txt is no longer an alias', () => {
    expect(run('ls projects').lines[0].entries.map((e) => e.name)).toEqual(['alpha-project.txt', 'beta.txt'])
    expect(texts(run('ls music.txt'))).toEqual(["ls: cannot access 'music.txt': No such file or directory"])
  })

  it('ls quotes names with spaces', () => {
    const spaced = buildVfs({ ...fixtureContent, projects: [{ ...fixtureContent.projects[1], slug: 'two words' }] })

    const out = run('ls projects', '/home/rafey', { content: fixtureContent, base: spaced })

    expect(out.lines[0].entries).toEqual([{ name: "'two words.txt'", kind: 'file' }])
  })

  it('ls of a missing path is an error with code 2', () => {
    expect(run('ls nope')).toMatchObject({ lines: [{ type: 'error', text: "ls: cannot access 'nope': No such file or directory" }], code: 2 })
  })

  it('ls of an empty folder prints nothing', () => {
    const noPosts = buildVfs({ ...fixtureContent, posts: [] })

    expect(run('ls blog', '/home/rafey', { content: fixtureContent, base: noPosts }).lines).toEqual([])
  })

  it('cd changes cwd; bare cd goes home', () => {
    expect(run('cd Music').cwd).toBe('/home/rafey/Music')
    expect(run('cd projects').cwd).toBe('/home/rafey/projects')
    expect(run('cd', '/home/rafey/Music').cwd).toBe('/home/visitor')
    expect(run('cd ..', '/home/rafey/Music').cwd).toBe('/home/rafey')
    expect(run('cd ~/Documents').cwd).toBe('/home/visitor/Documents')
  })

  it('cd reports missing paths and files', () => {
    expect(run('cd nope')).toMatchObject({ lines: [{ type: 'error', text: 'bash: cd: nope: No such file or directory' }], cwd: '/home/rafey', code: 1 })
    expect(texts(run('cd bio.txt'))).toEqual(['bash: cd: bio.txt: Not a directory'])
  })

  it('pwd prints the absolute path', () => {
    expect(texts(run('pwd', '/home/rafey/Music'))).toEqual(['/home/rafey/Music'])
    expect(texts(run('pwd', '/home/visitor'))).toEqual(['/home/visitor'])
  })

  it('cat prints files, one after another', () => {
    expect(texts(run('cat bio.txt'))).toEqual(['Bio text'])
    expect(texts(run('cat /etc/hostname'))).toEqual(['rafey.ai'])
    expect(texts(run('cat bio.txt skills.txt'))).toEqual(['Bio text\nSkills text'])
  })

  it("ls / lists the system folders, and .. climbs from Rafey's home to the visitor's", () => {
    expect(run('ls /').lines[0].entries.map((e) => e.name)).toEqual(['bin', 'etc', 'home', 'tmp', 'usr'])
    expect(run('cd ../visitor').cwd).toBe('/home/visitor')
  })

  it('cat without a file prints usage', () => {
    expect(texts(run('cat'))).toEqual(['Usage: cat <file-name>'])
  })

  it('cat projects.txt and music.txt give the home terminal messages', () => {
    expect(texts(run('cat projects.txt'))).toEqual(['Use the command "projects" for all project details'])
    expect(texts(run('cat music.txt'))).toEqual(['Use the command "music" to explore Rafey\'s music'])
    expect(texts(run('cat constructor'))).toEqual(['cat: constructor: No such file or directory'])
  })

  it('cat reports folders, missing files and binary audio', () => {
    expect(texts(run('cat Music'))).toEqual(['cat: Music: Is a directory'])
    expect(run('cat nope.txt')).toMatchObject({ lines: [{ type: 'error', text: 'cat: nope.txt: No such file or directory' }], code: 1 })
    expect(run('cat Music/song.mp3').lines).toEqual([{ type: 'error', text: 'cat: Music/song.mp3: binary file (try: music play)' }])
  })

  it('cat prints what it is piped when it has no file', () => {
    expect(texts(run('bio | cat'))).toEqual(['Bio text'])
  })
})

describe('launch commands', () => {
  it('open email opens Mail', () => {
    const out = run('open email')

    expect(texts(out)).toEqual(['Opening email application...'])
    expect(out.effects).toEqual([{ type: 'openApp', app: 'mail' }])
  })

  it('xdg-open linkedin opens the profile link', () => {
    const out = run('xdg-open linkedin')

    expect(texts(out)).toEqual(['Opening LinkedIn profile in a new tab...'])
    expect(out.effects).toEqual([{ type: 'openLink', href: 'https://linkedin.example/me' }])
  })

  it('gio open treats its first arg as the subcommand', () => {
    expect(run('gio open email').effects).toEqual([{ type: 'openApp', app: 'mail' }])
    expect(run('gio open Music').effects).toEqual([{ type: 'openPath', path: '/home/rafey/Music' }])
  })

  it('open a path emits openPath with the real path and no output', () => {
    expect(run('open projects')).toMatchObject({ lines: [], effects: [{ type: 'openPath', path: '/home/rafey/projects' }], code: 0 })
    expect(run('open /bin').effects).toEqual([{ type: 'openPath', path: '/usr/bin' }])
  })

  it('open reports missing operands and paths, music.txt included', () => {
    expect(texts(run('open'))).toEqual(['open: missing operand: No such file or directory'])
    expect(texts(run('xdg-open nope'))).toEqual(['xdg-open: nope: No such file or directory'])
    expect(run('open music.txt')).toMatchObject({ lines: [{ type: 'error', text: 'open: music.txt: No such file or directory' }], effects: [], code: 1 })
  })

  it('nautilus opens Files at a folder, defaulting to cwd', () => {
    expect(run('nautilus', '/home/rafey/Music').effects).toEqual([{ type: 'openApp', app: 'files', path: '/home/rafey/Music' }])
    expect(run('nautilus projects').effects).toEqual([{ type: 'openApp', app: 'files', path: '/home/rafey/projects' }])
  })

  it('nautilus refuses files and missing paths', () => {
    expect(texts(run('nautilus bio.txt'))).toEqual(['nautilus: bio.txt: not a folder'])
    expect(run('nautilus nope').effects).toEqual([])
  })

  it('gedit and gnome-text-editor open the editor silently', () => {
    expect(run('gedit bio.txt')).toMatchObject({ lines: [], effects: [{ type: 'openApp', app: 'editor', path: '/home/rafey/bio.txt' }], code: 0 })
    expect(run('gnome-text-editor skills.txt').effects[0].path).toBe('/home/rafey/skills.txt')
  })

  it('nano opens in the terminal on the path against cwd, which may not exist yet', () => {
    expect(run('nano skills.txt')).toMatchObject({ lines: [panel(PANEL_KINDS.NANO, { path: '/home/rafey/skills.txt' }, { foreground: true })], effects: [], code: 0 })
    expect(run('nano ../visitor/./new.txt').lines).toEqual([panel(PANEL_KINDS.NANO, { path: '/home/visitor/new.txt' }, { foreground: true })])
  })

  it('nano with no name opens a new buffer', () => {
    expect(run('nano').lines).toEqual([panel(PANEL_KINDS.NANO, { path: null }, { foreground: true })])
  })

  it.each(['vim', 'vi'])('%s prints a note and opens nano instead', (editor) => {
    expect(run(`${editor} skills.txt`).lines).toEqual([
      dim(`${editor} isn't installed here, opened nano instead`),
      panel(PANEL_KINDS.NANO, { path: '/home/rafey/skills.txt' }, { foreground: true }),
    ])
  })

  it('nano in a pipe prints nothing', () => {
    expect(run('nano skills.txt | wc -l').lines).toEqual([pre('0')])
  })

  it('the text editors refuse folders and missing files', () => {
    expect(texts(run('gedit Music'))).toEqual(['gedit: Music: No such file'])
    expect(texts(run('gnome-text-editor'))).toEqual(['gnome-text-editor: missing file: No such file'])
  })
})

describe('system commands', () => {
  it('uname with and without -a', () => {
    expect(texts(run('uname'))).toEqual(['Linux'])
    expect(texts(run('uname -a'))).toEqual(['Linux rafey.ai 6.8.0-rafey x86_64 GNU/Linux'])
  })

  it('echo repeats its words, a later -n included', () => {
    expect(texts(run('echo  hello   -n world'))).toEqual(['hello -n world'])
  })

  it('sudo is refused', () => {
    expect(run('sudo rm -rf /')).toMatchObject({
      lines: [{ type: 'error', text: 'visitor is not in the sudoers file.  This incident will be reported.' }],
      code: 1,
    })
  })

  it('clear emits clear', () => {
    expect(run('clear')).toMatchObject({ lines: [], effects: [{ type: 'clear' }], cwd: '/home/rafey' })
  })

  it('exit prints logout and closes the window', () => {
    expect(run('exit')).toMatchObject({ lines: [{ type: 'pre', text: 'logout' }], effects: [{ type: 'closeSelf' }], cwd: '/home/rafey' })
  })

  it('logout returns to the home terminal', () => {
    const out = run('logout')

    expect(texts(out)).toEqual(['Returning to the rafey.ai terminal…'])
    expect(out.effects).toEqual([{ type: 'logout' }])
  })

  it.each(['os', 'rafeyos', 'startx'])('%s says it is already running', (name) => {
    expect(texts(run(name))).toEqual(['rOS: already running'])
  })
})
