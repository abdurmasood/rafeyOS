import { describe, it, expect } from 'vitest'
import { HOME_COMMANDS, HOME_EFFECTS, HOME_PANELS } from '@/components/home/shell/homeCommands'
import { exec, COMMANDS } from '@/components/rafeyos/core/commands/exec'
import { dim, error, panel, pre } from '@/components/rafeyos/core/commands/lines'
import { APP } from '@/components/rafeyos/core/catalog/apps'
import { buildVfs, HOME, RAFEY_HOME } from '@/components/rafeyos/core/vfs/buildVfs'
import { htmlToText } from '@/components/rafeyos/core/vfs/content'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { fsStoreOn, memoryStorage } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { realContent, realVfs } from '@/tests/rafeyos/helpers/testVfs'
import { bioDescription, readMeDescription } from '@/lib/descriptions'
import { HELP_HINT, HOME_HELP_LINES } from '@/lib/help'
import { contactHtml } from '@/lib/contact'
import { musicUsage } from '@/lib/music'

const POST = realContent.posts[0]
const TRACK = realContent.music.track
const BIO = `${RAFEY_HOME}/bio.txt`

/** Runs a line on the homepage's registry, in a fresh session over the real content. */
const run = (raw, { cwd = RAFEY_HOME, content = realContent } = {}) => {
  const fs = createShellFs({ base: content === realContent ? realVfs : buildVfs(content), store: fsStoreOn(memoryStorage()) })
  return exec(raw, { fs, cwd, env: { PWD: cwd }, lastCode: 0, content, commands: HOME_COMMANDS })
}
const texts = (out) => out.lines.map((line) => line.text)
const shown = (raw, options) => run(raw, options).lines
const handoff = (open) => ({ type: HOME_EFFECTS.HANDOFF, ...(open && { open }) })

describe('homepage registry', () => {
  it('home registry adds no new command names, so the /os registry tests stay valid', () => {
    expect(Object.keys(HOME_COMMANDS).sort()).toEqual(Object.keys(COMMANDS).sort())
  })

  it('overrides still answer --help from their man page', () => {
    expect(texts(run('projects --help'))[0]).toMatch(/^Usage: projects/)
    expect(run('nano --help').lines[0]).toMatchObject({ type: 'pre' })
  })

  it('Help is 127: names stay case-sensitive', () => {
    expect(run('Help')).toMatchObject({ lines: [error('bash: Help: command not found')], code: 127 })
    expect(run('Bio')).toMatchObject({ lines: [error('bash: Bio: command not found')], code: 127 })
  })
})

describe('help', () => {
  const todaysText = htmlToText([...HOME_HELP_LINES, HELP_HINT].join('\n'))

  it('shows the homepage list and the dim hint on screen, and the same text in a pipe', () => {
    expect(shown('help')).toEqual([pre(HOME_HELP_LINES.join('\n')), dim(htmlToText(HELP_HINT))])
    expect(texts(run('help | cat'))).toEqual([todaysText])
  })

  it('help matches today byte for byte', () => {
    const [list, hint] = shown('help')

    expect([list.type, hint.type]).toEqual(['pre', 'dim'])
    expect(`${list.text}\n${hint.text}`).toBe(todaysText)
  })
})

describe('content commands', () => {
  it('bio is an html panel and skills its own panel on screen, both plain text in a pipe', () => {
    expect(shown('bio')).toEqual([panel(HOME_PANELS.HTML, { html: bioDescription() })])
    expect(shown('skills')).toEqual([panel(HOME_PANELS.SKILLS, {})])
    expect(texts(run('bio | cat'))).toEqual([realContent.bio.slice(0, -1)])
    expect(texts(run('skills | cat'))).toEqual([realContent.skills.slice(0, -1)])
  })

  it('contact is today\'s html block on screen and plain text in a pipe', () => {
    expect(shown('contact')).toEqual([panel(HOME_PANELS.HTML, { html: contactHtml })])
    expect(texts(run('contact | head -1'))).toEqual([`email: ${realContent.contact.email}`])
  })

  it('projects opens the picker on screen and prints the list in a pipe', () => {
    expect(shown('projects')).toEqual([panel(HOME_PANELS.PROJECTS_PICKER, {}, { foreground: true })])
    expect(texts(run('projects | head -1'))[0]).toMatch(/^ {2}Arrhythmia/i)
  })

  it('projects --3d takes the LoadingBar path and prints nothing', () => {
    expect(run('projects --3d')).toMatchObject({ lines: [], effects: [{ type: HOME_EFFECTS.PROJECTS_3D }], code: 0 })
  })

  it('projects with anything else keeps today\'s error', () => {
    expect(run('projects grid')).toMatchObject({
      lines: [error("projects: unknown option 'grid'. Usage: projects [--3d]")],
      effects: [],
      code: 1,
    })
  })

  it('blog opens the picker, says total 0 with no posts, and lists posts in a pipe', () => {
    expect(shown('blog')).toEqual([panel(HOME_PANELS.BLOG_PICKER, {}, { foreground: true })])
    expect(shown('blog', { content: { ...realContent, posts: [] } })).toEqual([dim('total 0')])
    expect(texts(run('blog | head -1'))).toEqual(['total 1'])
  })

  it('music prints today\'s usage, the story ruler, the player, or today\'s error', () => {
    expect(shown('music')).toEqual([panel(HOME_PANELS.HTML, { html: musicUsage() })])
    expect(shown('music story')).toEqual([panel(HOME_PANELS.MUSIC_STORY, {})])
    expect(shown('music play')).toEqual([panel(HOME_PANELS.MUSIC_PLAYER, { trackId: TRACK.id }, { foreground: true })])
    expect(run('music remix')).toMatchObject({ lines: [error("music: unknown command 'remix'. Type 'music' for usage.")], code: 1 })
  })

  it('music story is the story text in a pipe', () => {
    expect(texts(run('music story | head -1'))).toEqual([`${realContent.music.milestones[0].year}  ${realContent.music.milestones[0].event}`])
  })
})

describe('cat and less', () => {
  it('shows each shipped file with a homepage form in that form', () => {
    expect(shown('cat bio.txt')).toEqual([panel(HOME_PANELS.HTML, { html: bioDescription() })])
    expect(shown('less skills.txt')).toEqual([panel(HOME_PANELS.SKILLS, {})])
    expect(shown('cat README.txt')).toEqual([panel(HOME_PANELS.HTML, { html: `<span class='ascii'>${readMeDescription}</span>` })])
    expect(shown('cat projects/leaf-line.txt')).toEqual([panel(HOME_PANELS.PROJECTS_PICKER, { chosenId: 4 })])
    expect(shown('less Music/story.txt')).toEqual([panel(HOME_PANELS.MUSIC_STORY, {})])
    expect(shown(`cat ${BIO}`, { cwd: HOME })).toEqual([panel(HOME_PANELS.HTML, { html: bioDescription() })])
  })

  it('follows a link to a shipped file', () => {
    expect(shown(`ln -s ${BIO} b && cat b`, { cwd: HOME })).toEqual([panel(HOME_PANELS.HTML, { html: bioDescription() })])
  })

  it('cat blog post is a panel on screen and markdown in a pipe', () => {
    expect(shown(`cat blog/${POST.slug}.md`)).toEqual([panel(HOME_PANELS.ARTICLE, { slug: POST.slug })])
    expect(texts(run(`cat blog/${POST.slug}.md | head -1`))).toEqual([`# ${POST.title}`])
    expect(texts(run(`less blog/${POST.slug}.md | wc -l`))).toEqual([String(realVfs[`${RAFEY_HOME}/blog/${POST.slug}.md`].text.split('\n').length - 1)])
  })

  it('cat with two files or a flag is the engine cat', () => {
    expect(texts(run('cat bio.txt README.txt'))).toEqual([`${realContent.bio}${realContent.readme}`.slice(0, -1)])
    expect(texts(run('cat -n README.txt'))[0]).toMatch(/^ {5}1\t/)
    expect(texts(run('less -N bio.txt'))).toEqual([realContent.bio.slice(0, -1)])
  })

  it('everything else goes to the engine, pretend files and errors included', () => {
    expect(texts(run('cat projects.txt'))).toEqual(['Use the command "projects" for all project details'])
    expect(texts(run('less music.txt'))).toEqual(['Use the command "music" to explore Rafey\'s music'])
    expect(run('cat nope.txt')).toMatchObject({ lines: [error('cat: nope.txt: No such file or directory')], code: 1 })
    expect(texts(run('cat contact/email.desktop'))[0]).toMatch(/^\[Desktop Entry\]\n/)
    expect(texts(run('cat'))).toEqual(['Usage: cat <file-name>'])
  })
})

describe('open, xdg-open and gio open', () => {
  it('open email and open linkedin keep today\'s lines', () => {
    expect(run('open email')).toMatchObject({
      lines: [pre('Opening email application...')],
      effects: [{ type: HOME_EFFECTS.MAILTO, href: realContent.contact.mailtoHref }],
    })
    expect(run('open linkedin')).toMatchObject({
      lines: [pre('Opening LinkedIn profile in a new tab...')],
      effects: [{ type: HOME_EFFECTS.NEW_TAB, href: realContent.contact.linkedinUrl }],
    })
  })

  it('opens a file by its type: web link, mail, audio, anything else', () => {
    expect(run('xdg-open contact/linkedin.desktop').effects).toEqual([{ type: HOME_EFFECTS.NEW_TAB, href: realContent.contact.linkedinUrl }])
    expect(run('open contact/email.desktop').effects).toEqual([{ type: HOME_EFFECTS.MAILTO, href: realContent.contact.mailtoHref }])
    expect(run(`xdg-open Music/${TRACK.id}.mp3`)).toMatchObject({
      lines: [panel(HOME_PANELS.MUSIC_PLAYER, { trackId: TRACK.id }, { foreground: true })],
      effects: [],
    })
    expect(run('gio open bio.txt')).toMatchObject({ lines: [pre('starting rOS…')], effects: [handoff({ path: BIO })] })
    expect(run('xdg-open blog').effects).toEqual([handoff({ path: `${RAFEY_HOME}/blog` })])
  })

  it('keeps the engine\'s error', () => {
    expect(run('xdg-open nope')).toMatchObject({ lines: [error('xdg-open: nope: No such file or directory')], effects: [], code: 1 })
  })

  it('xdg-open, open and gio open say starting rOS on screen only when they hand off', () => {
    expect(run('xdg-open bio.txt')).toMatchObject({ lines: [pre('starting rOS…')], effects: [handoff({ path: BIO })] })
    expect(run('open blog').lines).toEqual([pre('starting rOS…')])
    expect(run('xdg-open bio.txt | wc -l').lines).toEqual([pre('0')])
    expect(run(`xdg-open ${BIO} > out.txt; cat out.txt`, { cwd: HOME }).lines).toEqual([])
    expect(run('xdg-open contact/linkedin.desktop').lines).toEqual([])
    expect(run('open email').lines).toEqual([pre('Opening email application...')])
  })

  it('xdg-open in a pipe still hands off', () => {
    expect(run('xdg-open bio.txt | wc -l')).toMatchObject({ lines: [pre('0')], effects: [handoff({ path: BIO })] })
    expect(run(`xdg-open Music/${TRACK.id}.mp3 | wc -l`).effects).toEqual([handoff({ path: `${RAFEY_HOME}/Music/${TRACK.id}.mp3` })])
  })
})

describe('window commands', () => {
  it('nautilus, gedit and gnome-text-editor say starting rOS and hand off with their window', () => {
    expect(run('nautilus ~')).toMatchObject({ lines: [pre('starting rOS…')], effects: [handoff({ app: APP.FILES, path: HOME })] })
    expect(run('gedit bio.txt').effects).toEqual([handoff({ app: APP.EDITOR, path: BIO })])
    expect(run('gnome-text-editor bio.txt').lines).toEqual([pre('starting rOS…')])
  })

  it('nautilus on a file keeps the engine error', () => {
    expect(run('nautilus bio.txt')).toMatchObject({ lines: [error('nautilus: bio.txt: not a folder')], effects: [], code: 1 })
  })

  it('hands off without printing in a pipe', () => {
    expect(run('nautilus | wc -c')).toMatchObject({ lines: [pre('0')], effects: [handoff({ app: APP.FILES, path: RAFEY_HOME })] })
  })

  it('os, rafeyos and startx say starting rOS and hand off with no window', () => {
    for (const name of ['os', 'rafeyos', 'startx']) {
      expect(run(name)).toMatchObject({ lines: [pre('starting rOS…')], effects: [handoff()] })
    }
  })

  it('exit and logout print logout and start a new session', () => {
    for (const name of ['exit', 'logout']) {
      expect(run(name)).toMatchObject({ lines: [pre('logout')], effects: [{ type: HOME_EFFECTS.NEW_SESSION }] })
    }
  })
})

describe('nano, vim and vi', () => {
  it('nano opens its panel on the path against cwd, which may not exist yet', () => {
    expect(shown('nano notes/a.txt', { cwd: HOME })).toEqual([panel(HOME_PANELS.NANO, { path: `${HOME}/notes/a.txt` }, { foreground: true })])
    expect(shown('nano ../visitor/./b.txt', { cwd: HOME })).toEqual([panel(HOME_PANELS.NANO, { path: `${HOME}/b.txt` }, { foreground: true })])
    expect(shown('nano bio.txt')).toEqual([panel(HOME_PANELS.NANO, { path: BIO }, { foreground: true })])
  })

  it('nano with no name opens a new buffer', () => {
    expect(shown('nano')).toEqual([panel(HOME_PANELS.NANO, { path: null }, { foreground: true })])
  })

  it('vim and vi print the note then open nano', () => {
    for (const name of ['vim', 'vi']) {
      expect(shown(`${name} a.txt`, { cwd: HOME })).toEqual([
        dim(`${name} isn't installed here, opened nano instead`),
        panel(HOME_PANELS.NANO, { path: `${HOME}/a.txt` }, { foreground: true }),
      ])
    }
  })
})

describe('engine commands the homepage keeps', () => {
  it('ls music.txt is no such file', () => {
    expect(run('ls music.txt')).toMatchObject({ lines: [error("ls: cannot access 'music.txt': No such file or directory")], code: 2 })
  })

  it('which bio is in /usr/local/bin', () => {
    expect(texts(run('which bio'))).toEqual(['/usr/local/bin/bio'])
  })

  it('uname -a says rafey.ai', () => {
    expect(texts(run('uname -a'))[0]).toContain('rafey.ai')
  })

  it('sudo keeps its joke', () => {
    expect(run('sudo rm -rf /')).toMatchObject({ lines: [error('visitor is not in the sudoers file.  This incident will be reported.')], code: 1 })
  })
})
