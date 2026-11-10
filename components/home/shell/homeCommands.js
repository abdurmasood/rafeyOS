// The homepage terminal's commands: every command the shell knows, with the homepage's own output on top. An override
// runs the engine's handler and redraws its result the way the homepage shows it, so the engine's errors and its
// plain output in a pipe or file stay as they are.
import { COMMANDS, withHelp } from '@/components/rafeyos/core/commands/exec'
import { EFFECTS, failure, operands, result } from '@/components/rafeyos/core/commands/builtins/result'
import { PANEL_KINDS, dim, panel, pre } from '@/components/rafeyos/core/commands/lines'
import { APP } from '@/components/rafeyos/core/catalog/apps'
import { NODE_TYPES, RAFEY_HOME } from '@/components/rafeyos/core/vfs/buildVfs'
import { htmlToText } from '@/components/rafeyos/core/vfs/content'
import { joinPath, normalize, parentOf, resolve } from '@/components/rafeyos/core/vfs/paths'
import { PROJECTS_FOLDER, projectForPath } from '@/components/rafeyos/core/vfs/projectPaths'
import { bioDescription, readMeDescription } from '@/lib/descriptions'
import { HELP_HINT, HOME_HELP_LINES } from '@/lib/help'
import { contactHtml } from '@/lib/contact'
import { musicUsage } from '@/lib/music'

/** Effects only the homepage runs, next to the engine's own (clear, clearHistory). */
export const HOME_EFFECTS = Object.freeze({
  PROJECTS_3D: 'projects3d',
  MAILTO: 'mailto',
  NEW_TAB: 'newTab',
  HANDOFF: 'handoff',
  NEW_SESSION: 'newSession',
})

/** The blocks the homepage terminal draws; `html` holds trusted lib HTML only. The engine's own (nano, the pickers, skills) rafeyOS's terminal draws too. */
export const HOME_PANELS = Object.freeze({
  HTML: 'html',
  PROJECTS_PICKER: PANEL_KINDS.PROJECTS_PICKER,
  SKILLS: PANEL_KINDS.SKILLS,
  BLOG_PICKER: PANEL_KINDS.BLOG_PICKER,
  ARTICLE: 'article',
  MUSIC_STORY: 'music-story',
  MUSIC_PLAYER: 'music-player',
  NANO: PANEL_KINDS.NANO,
})

const STARTING_ROS = 'starting rOS…'
const FOREGROUND = Object.freeze({ foreground: true })
const HELP_TEXT = HOME_HELP_LINES.join('\n')
const HELP_HINT_TEXT = htmlToText(HELP_HINT)
const STORY = joinPath(RAFEY_HOME, 'Music/story.txt')
const SKILLS_FILE = joinPath(RAFEY_HOME, 'skills.txt')

// Shipped files the homepage already shows as HTML
const SHIPPED_HTML = Object.freeze({
  [joinPath(RAFEY_HOME, 'bio.txt')]: () => bioDescription(),
  [joinPath(RAFEY_HOME, 'README.txt')]: () => `<span class='ascii'>${readMeDescription}</span>`,
})

const html = (markup) => panel(HOME_PANELS.HTML, { html: markup })

const engine = (context) => COMMANDS[context.name](context)

/** Output for the screen only: nothing reaches a pipe or file, but the effects still run. */
const screenOnly = (display, effects = []) => ({ stdout: '', display, effects })

/** The homepage's form on a terminal; the engine's plain output in a pipe or file. */
const onScreen = (context, display) => (context.tty ? result(display) : engine(context))

const help = () => ({ stdout: `${HELP_TEXT}\n${HELP_HINT_TEXT}\n`, display: [pre(HELP_TEXT), dim(HELP_HINT_TEXT)] })

// The engine's picker and errors; only --3d differs, taking the LoadingBar path to the /projects page, not a window
const projects = (context) => {
  const output = engine(context)
  if (output.stderr?.length || !context.argv.length) return output
  return result([], [{ type: HOME_EFFECTS.PROJECTS_3D }])
}

const playerFor = (track) => panel(HOME_PANELS.MUSIC_PLAYER, { trackId: track.id }, FOREGROUND)

// The player is a panel, so `music play` in a pipe plays nothing and prints nothing
const music = (context) => {
  const [subcommand] = operands(context.argv)
  if (subcommand === undefined) return onScreen(context, [html(musicUsage())])
  if (subcommand === 'story') return onScreen(context, [panel(HOME_PANELS.MUSIC_STORY, {})])
  if (subcommand === 'play') return result([playerFor(context.content.music.track)])
  return failure(`music: unknown command '${subcommand}'. Type 'music' for usage.`)
}

/** How the homepage shows a shipped file it has its own form for, or null. */
const shippedForm = ({ fs, content }, path) => {
  const vfs = fs.vfs()
  const project = parentOf(path) === PROJECTS_FOLDER ? projectForPath({ vfs, content }, path) : null
  if (project) return panel(HOME_PANELS.PROJECTS_PICKER, { chosenId: project.id })
  if (path === STORY) return panel(HOME_PANELS.MUSIC_STORY, {})
  if (path === SKILLS_FILE) return panel(HOME_PANELS.SKILLS, {})
  const post = content.posts.find(({ slug }) => path === joinPath(RAFEY_HOME, `blog/${slug}.md`))
  if (post) return panel(HOME_PANELS.ARTICLE, { slug: post.slug })
  return Object.hasOwn(SHIPPED_HTML, path) ? html(SHIPPED_HTML[path]()) : null
}

// cat and less: one file, no flags, on a terminal, in its homepage form; anything else is the engine's
const reader = (context) => {
  if (!context.tty || context.argv.length !== 1) return engine(context)
  const found = resolve(context.fs.vfs(), normalize(context.argv[0], context.cwd), { followLast: true })
  const form = found.ok ? shippedForm(context, found.path) : null
  return form ? result([form]) : engine(context)
}

/**
 * What the homepage does for an effect of open or a launcher (openLink, openApp or openPath): links and mail stay in
 * the browser, the rest opens in rafeyOS.
 */
const homeEffect = (effect, { fs, content }) => {
  if (effect.type === EFFECTS.OPEN_LINK) return { type: HOME_EFFECTS.NEW_TAB, href: effect.href }
  if (effect.type === EFFECTS.OPEN_APP) {
    if (effect.app === APP.MAIL) return { type: HOME_EFFECTS.MAILTO, href: content.contact.mailtoHref }
    return { type: HOME_EFFECTS.HANDOFF, open: { app: effect.app, path: effect.path } }
  }
  const node = fs.vfs()[effect.path]
  if (node?.type === NODE_TYPES.WEBLINK) return { type: HOME_EFFECTS.NEW_TAB, href: node.href }
  if (node?.type === NODE_TYPES.MAILTO) return { type: HOME_EFFECTS.MAILTO, href: node.href }
  return { type: HOME_EFFECTS.HANDOFF, open: { path: effect.path } }
}

const homeEffects = (output, context) => (output.effects ?? []).map((effect) => homeEffect(effect, context))

/** The track an opened audio file plays, when the homepage's player has it. */
const openedTrack = ({ fs, content }, effects) => {
  const [effect] = effects
  if (effect?.type !== EFFECTS.OPEN_PATH) return null
  const node = fs.vfs()[effect.path]
  const { track } = content.music
  return node?.type === NODE_TYPES.AUDIO && node.src === track.src ? track : null
}

// Audio plays in the homepage's player, which needs a terminal; in a pipe it opens in rafeyOS like any other file.
// A hand-off says rafeyOS is starting, on screen only, as the launchers do
const open = (context) => {
  const output = engine(context)
  const track = context.tty ? openedTrack(context, output.effects ?? []) : null
  if (track) return result([playerFor(track)])
  const effects = homeEffects(output, context)
  if (effects.some((effect) => effect.type === HOME_EFFECTS.HANDOFF)) return screenOnly([pre(STARTING_ROS)], effects)
  return { ...output, effects }
}

// nautilus and the text editors: the engine's errors, or rafeyOS starting with that window
const launch = (context) => {
  const output = engine(context)
  if (output.stderr?.length) return output
  return screenOnly([pre(STARTING_ROS)], homeEffects(output, context))
}

const startRafeyOS = () => screenOnly([pre(STARTING_ROS)], [{ type: HOME_EFFECTS.HANDOFF }])

const newSession = () => screenOnly([pre('logout')], [{ type: HOME_EFFECTS.NEW_SESSION }])

// The homepage's one process is its own bash (PID 1000), so the only kill that lands starts a fresh session, without
// exit's `logout`; any other PID is the engine's "No such process"
const kill = (context) => {
  const output = engine(context)
  const effects = (output.effects ?? []).map((effect) => (effect.type === EFFECTS.KILL ? { type: HOME_EFFECTS.NEW_SESSION } : effect))
  return { ...output, effects }
}

const OVERRIDES = {
  help,
  bio: (context) => onScreen(context, [html(bioDescription())]),
  contact: (context) => onScreen(context, [html(contactHtml)]),
  projects,
  music,
  cat: reader,
  less: reader,
  open,
  'xdg-open': open,
  gio: open,
  nautilus: launch,
  gedit: launch,
  'gnome-text-editor': launch,
  os: startRafeyOS,
  rafeyos: startRafeyOS,
  startx: startRafeyOS,
  exit: newSession,
  logout: newSession,
  kill,
}

/** The homepage's registry for exec(): rafeyOS's command names. Only the overrides get --help here; COMMANDS has it. */
export const HOME_COMMANDS = Object.freeze({ ...COMMANDS, ...withHelp(OVERRIDES) })
