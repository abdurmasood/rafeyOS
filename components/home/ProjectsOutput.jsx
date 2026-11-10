import { useEffect, useRef, useState } from 'react'
import { getProjectById, getVisibleProjects, linkName } from '@/lib/projects'

const VISIBLE_PROJECTS = getVisibleProjects()

// Shown like a path, not a URL: no scheme or trailing slash
const displayLink = (url) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

function ProjectCard({ project }) {
  return (
    <div className="project-card">
      <h1><span className="marker"># </span>{project.title}</h1>
      <p className="project-description">{project.description}</p>
      {project.link && (
        <p className="project-link">
          <span className="dim">{linkName(project.link)}</span>
          <a href={project.link} target="_blank" rel="noopener noreferrer">{displayLink(project.link)}</a>
        </p>
      )}
    </div>
  )
}

const isPlainKey = (event, key) => event.key === key && !event.metaKey && !event.ctrlKey && !event.altKey

// The homepage has one terminal, so every key is the picker's
const everyKey = () => true

function ActivePicker({ onDone, ownsKey }) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedIndexRef = useRef(0)
  const doneRef = useRef(false)
  const onDoneRef = useRef(onDone)

  selectedIndexRef.current = selectedIndex
  onDoneRef.current = onDone

  const finish = (result) => {
    if (doneRef.current) return
    doneRef.current = true
    onDoneRef.current(result)
  }

  const open = (index) => finish({ chosenId: VISIBLE_PROJECTS[index].id })

  const move = (step) => {
    setSelectedIndex((index) => Math.min(Math.max(index + step, 0), VISIBLE_PROJECTS.length - 1))
  }

  // Phones have no arrow keys: tapping a row selects it, tapping the selected row opens it
  const handleRowTap = (index) => {
    if (index === selectedIndexRef.current) {
      open(index)
    } else {
      setSelectedIndex(index)
    }
  }

  // Read through a ref so the window listener below is attached once and never sees stale state
  const keyActionsRef = useRef(null)
  keyActionsRef.current = { move, open, finish, ownsKey }

  useEffect(() => {
    // The Enter that ran `projects` is still bubbling when this mounts; without this it would open the first project
    const mountedAt = performance.now()
    const handleKey = (event) => {
      const { move, open, finish, ownsKey } = keyActionsRef.current
      if (event.timeStamp < mountedAt || !ownsKey(event)) return
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault()
        move(event.key === 'ArrowUp' ? -1 : 1)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        open(selectedIndexRef.current)
      } else if (isPlainKey(event, 'q') || event.key === 'Escape' || (event.ctrlKey && event.key === 'c')) {
        event.preventDefault()
        finish({})
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  return (
    <div className="terminal-block picker-block">
      <div className="picker">
        <ul className="picker-list" aria-label="Projects">
          {VISIBLE_PROJECTS.map((project, index) => {
            const isSelected = index === selectedIndex
            return (
              <li
                key={project.id}
                className={`picker-row${isSelected ? ' is-selected' : ''}`}
                aria-current={isSelected ? 'true' : undefined}
              >
                {/* Only receives taps on mobile; desktop rows stay keyboard-only (see Terminal.css) */}
                <button type="button" className="picker-tap" tabIndex={-1} onClick={() => handleRowTap(index)}>
                  <span className="picker-mark" aria-hidden="true">{isSelected ? '›' : ''}</span>
                  {project.title}
                </button>
              </li>
            )
          })}
        </ul>
        <section className="picker-preview" aria-live="polite">
          <ProjectCard project={VISIBLE_PROJECTS[selectedIndex]} />
        </section>
      </div>
      <div className="gap-half" />
      <p className="music-line dim player-keys">
        <span className="player-key">↑↓</span> select · <span className="player-key">enter</span> open · <span className="player-key">esc</span> quit
      </p>
      <div className="player-taps">
        <button type="button" onClick={() => open(selectedIndexRef.current)}>[ open ]</button>
        <button type="button" onClick={() => finish({})}>[ quit ]</button>
      </div>
    </div>
  )
}

/**
 * @param {{ active: boolean, chosenId?: number, onDone: Function, ownsKey?: (event: KeyboardEvent) => boolean }} props
 *   `ownsKey`: whether a key is the picker's; on rafeyOS, only keys typed in its own window
 */
export function ProjectPicker({ active, chosenId, onDone, ownsKey = everyKey }) {
  if (active) {
    return <ActivePicker onDone={onDone} ownsKey={ownsKey} />
  }
  const chosen = chosenId === undefined ? null : getProjectById(chosenId)
  // Quitting prints nothing, like fzf on esc
  if (!chosen) return null
  return (
    <div className="terminal-block project-printed">
      <ProjectCard project={chosen} />
    </div>
  )
}
