'use client'

// One line of the shell's structured output, drawn in the homepage terminal's own style
import { ENTRY_KINDS, LINE_TYPES, fetchRows } from '@/components/rafeyos/core/commands/lines'
import { tilde } from '@/components/rafeyos/core/vfs/paths'
import { HOME_PANELS } from '@/components/home/shell/homeCommands'
import { BlogArticle, BlogPicker } from '@/components/home/BlogOutput'
import { MusicPlayer, MusicStory } from '@/components/home/MusicOutput'
import { NanoEditor } from '@/components/home/NanoEditor'
import { ProjectPicker } from '@/components/home/ProjectsOutput'
import { SkillRows } from '@/components/home/SkillsOutput'

// A block drops the newline it ends with, so one more keeps a trailing blank row on screen, as a terminal shows it
const shownText = (text) => (text.endsWith('\n') ? `${text}\n` : text)

/** The echoed `visitor@rafey.ai:<path>$ <cmd>` row; typed text stays text. */
const EchoedPrompt = ({ cwd, cmd }) => (
  <div className="echo">
    <span className="brown">visitor</span>
    <span className="base-color">@</span>
    <span className="green">rafey.ai</span>
    <span className="base-color">:{tilde(cwd)}$</span> {cmd}
  </div>
)

// Folders and links in rafeyOS's terminal colours; files stay plain
const ENTRY_CLASS = Object.freeze({ [ENTRY_KINDS.DIR]: 'dir', [ENTRY_KINDS.LINK]: 'lnk', [ENTRY_KINDS.FILE]: undefined })

const LsLine = ({ entries }) => (
  <div>
    {entries.map((entry, i) => (
      <span key={entry.name}>
        {i > 0 && '  '}
        <span className={ENTRY_CLASS[entry.kind]}>{entry.name}</span>
      </span>
    ))}
  </div>
)

// neofetch's block: the logo and labels in the homepage's accent, Ubuntu orange
const FetchLine = ({ line }) => (
  <div className="fetch">
    {fetchRows(line).map((row, i) => (
      <div key={i}>
        <span className="accent">{row.logo}</span>
        {row.label !== undefined && <span className="accent">{row.label}</span>}
        {row.label !== undefined && ': '}
        {row.text}
      </div>
    ))}
  </div>
)

// `onDone` writes what the panel ended with into its entry
const PANELS = Object.freeze({
  // Trusted lib HTML only (bio, contact, README, music usage), never anything typed
  [HOME_PANELS.HTML]: ({ props }) => <div dangerouslySetInnerHTML={{ __html: props.html }} />,
  [HOME_PANELS.PROJECTS_PICKER]: ({ props, active, onDone }) => (
    <ProjectPicker active={active} chosenId={props.chosenId} onDone={({ chosenId }) => onDone({ chosenId })} />
  ),
  [HOME_PANELS.BLOG_PICKER]: ({ props, active, onDone }) => (
    <BlogPicker active={active} slug={props.slug} onDone={({ slug }) => onDone({ slug })} />
  ),
  [HOME_PANELS.ARTICLE]: ({ props }) => <BlogArticle slug={props.slug} />,
  [HOME_PANELS.SKILLS]: () => <SkillRows />,
  [HOME_PANELS.MUSIC_STORY]: () => <MusicStory />,
  [HOME_PANELS.MUSIC_PLAYER]: ({ props, active, onDone }) => (
    <MusicPlayer
      trackId={props.trackId}
      active={active}
      stoppedAt={props.stoppedAt}
      duration={props.duration}
      onStop={({ at, duration }) => onDone({ stoppedAt: at, duration })}
    />
  ),
  // The folder nano's typed file names count from: the shell's, which can't change while nano has the keyboard
  [HOME_PANELS.NANO]: ({ props, active, onDone, shell }) => (
    <NanoEditor path={props.path} cwd={shell.cwd} shellFs={shell.shellFs} active={active} onDone={onDone} />
  ),
})

const PanelLine = ({ line, active, onDone, shell }) => {
  const Panel = PANELS[line.kind]
  return Panel ? <Panel props={line.props} active={active} onDone={onDone} shell={shell} /> : null
}

const RENDERERS = Object.freeze({
  [LINE_TYPES.PRE]: ({ line }) => <div>{shownText(line.text)}</div>,
  [LINE_TYPES.ERROR]: ({ line }) => <div className="error-text">{line.text}</div>,
  [LINE_TYPES.DIM]: ({ line }) => <div className="grey">{line.text}</div>,
  [LINE_TYPES.LS]: ({ line }) => <LsLine entries={line.entries} />,
  [LINE_TYPES.PROMPT]: ({ line }) => <EchoedPrompt cwd={line.cwd} cmd={line.cmd} />,
  [LINE_TYPES.PANEL]: PanelLine,
  [LINE_TYPES.FETCH]: FetchLine,
})

/**
 * @param {{ line: import('@/components/rafeyos/core/commands/lines').Line, active: boolean, onDone: Function,
 *   shell: { cwd: string, shellFs: import('@/components/rafeyos/core/vfs/shellFs').ShellFs } }} props
 *   `active` when this line's panel holds the keyboard; `shell` is the folder and filesystem nano works in
 */
export const HomeLine = ({ line, active, onDone, shell }) => {
  const Render = RENDERERS[line.type]
  if (!Render) throw new Error(`Unknown terminal line type: ${line.type}`)
  return <Render line={line} active={active} onDone={onDone} shell={shell} />
}
