// Commands that open apps or files: open/xdg-open/gio open, nautilus, text editors, and the programs that run in the
// terminal itself (nano, singularity)
import { PANEL_KINDS, dim, panel, pre } from '@/components/rafeyos/core/commands/lines'
import { normalize, realPath, resolvePath } from '@/components/rafeyos/core/vfs/paths'
import { isDir } from '@/components/rafeyos/core/vfs/queries'
import { failure, operands, result, EFFECTS } from './result'
import { APP } from '@/components/rafeyos/core/catalog/apps'

const openContact = (what, content) => {
  if (what === 'email') {
    return result([pre('Opening email application...')], [{ type: EFFECTS.OPEN_APP, app: APP.MAIL }])
  }
  return result(
    [pre('Opening LinkedIn profile in a new tab...')],
    [{ type: EFFECTS.OPEN_LINK, href: content.contact.linkedinUrl }],
  )
}

const open = ({ argv, name, fs, cwd, content }) => {
  // `gio open <x>`: the first arg is gio's subcommand
  const args = name === 'gio' ? operands(argv).slice(1) : operands(argv)
  const [what] = args
  if (what === 'email' || what === 'linkedin') return openContact(what, content)
  const vfs = fs.vfs()
  const path = what ? resolvePath(vfs, what, cwd) : null
  if (!path) return failure(`${name}: ${what || 'missing operand'}: No such file or directory`)
  return result([], [{ type: EFFECTS.OPEN_PATH, path: realPath(vfs, path) }])
}

const nautilus = ({ argv, fs, cwd }) => {
  const vfs = fs.vfs()
  const [arg] = operands(argv)
  const path = arg ? resolvePath(vfs, arg, cwd) : cwd
  if (!path || !isDir(vfs, path)) return failure(`nautilus: ${arg ?? ''}: not a folder`)
  return result([], [{ type: EFFECTS.OPEN_APP, app: APP.FILES, path: realPath(vfs, path) }])
}

const editor = ({ argv, name, fs, cwd }) => {
  const vfs = fs.vfs()
  const [arg] = operands(argv)
  const path = arg ? resolvePath(vfs, arg, cwd) : null
  if (!path || isDir(vfs, path)) return failure(`${name}: ${arg || 'missing file'}: No such file`)
  return result([], [{ type: EFFECTS.OPEN_APP, app: APP.EDITOR, path: realPath(vfs, path) }])
}

/** nano's panel on the file it was given, against the folder; the file may not exist yet. */
const nanoPanel = ({ argv, cwd }) => {
  const [file] = operands(argv)
  return panel(PANEL_KINDS.NANO, { path: file === undefined ? null : normalize(file, cwd) }, { foreground: true })
}

// Runs in the terminal itself, as the homepage's does; unlike the Text Editor, it opens a file that isn't there yet
const nano = (context) => result([nanoPanel(context)])

const vim = (context) => result([dim(`${context.name} isn't installed here, opened nano instead`), nanoPanel(context)])

// It draws on the screen and reads the keyboard, so it has nothing to give a pipe or a file
const singularity = ({ argv, tty }) => {
  if (argv.length) return failure(`singularity: unknown option '${argv[0]}'. Usage: singularity`)
  if (!tty) return failure('singularity: needs a terminal')
  return result([panel(PANEL_KINDS.SINGULARITY, {}, { foreground: true })])
}

export const launchCommands = Object.freeze({
  open,
  'xdg-open': open,
  gio: open,
  nautilus,
  'gnome-text-editor': editor,
  gedit: editor,
  nano,
  vim,
  vi: vim,
  singularity,
})
