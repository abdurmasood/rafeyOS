// The title block, the pause and controls panels, and the controls list. Kept free of heavy imports: MinecraftApp shows
// the title block while the scene's chunk is still loading, so nothing from the atlas or the engine may come along.

export const CONTROLS = Object.freeze([
  ['W A S D', 'Walk'],
  ['Mouse', 'Look around'],
  ['Space', 'Jump, swim up'],
  ['Shift', 'Sprint'],
  ['Left click', 'Break the outlined block (hold to keep breaking)'],
  ['Right click', 'Place the selected block'],
  ['1 – 9, wheel', 'Pick a block'],
  ['Esc', 'Let go of the mouse'],
])

export const SHAPING_STATUS = 'Shaping terrain'

/**
 * The world's name over a mono status line, at the window's bottom-left. The actions row is always there, empty while
 * loading, so the name doesn't move when Play and Controls arrive.
 * @param {{ status: string, hidden?: boolean, children?: import('react').ReactNode }} props
 */
export const TitleBlock = ({ status, hidden = false, children }) => (
  <div className={hidden ? 'bk-title off' : 'bk-title'} aria-hidden={hidden || undefined}>
    <h2>Mainland</h2>
    <p className="bk-status" role="status">{status}</p>
    <div className="bk-actions">{children}</div>
  </div>
)

/** @param {{ onPlay: () => void, onControls: () => void }} props */
export const TitleActions = ({ onPlay, onControls }) => (
  <>
    <button type="button" className="btn sugg" onClick={onPlay}>Play</button>
    <button type="button" className="btn" onClick={onControls}>Controls</button>
  </>
)

// Panels stay mounted so they can fade out; hidden ones leave the accessibility tree and stop taking clicks
const Panel = ({ name, shown, className, children }) => (
  <div className={`bk-panel ${className}${shown ? ' shown' : ''}`} role="dialog" aria-label={name} aria-hidden={!shown || undefined}>
    <h3>{name}</h3>
    {children}
  </div>
)

/**
 * @param {{
 *   shown: boolean, onResume: () => void, onControls: () => void, onTitle: () => void,
 *   resumeRef?: import('react').Ref<HTMLButtonElement>,
 * }} props
 */
export const PausePanel = ({ shown, onResume, onControls, onTitle, resumeRef }) => (
  <Panel name="Paused" shown={shown} className="bk-pause">
    <button type="button" className="btn sugg" onClick={onResume} ref={resumeRef}>Resume</button>
    <button type="button" className="btn" onClick={onControls}>Controls</button>
    <button type="button" className="btn" onClick={onTitle}>Back to title</button>
  </Panel>
)

/** @param {{ shown: boolean, onBack: () => void }} props */
export const ControlsPanel = ({ shown, onBack }) => (
  <Panel name="Controls" shown={shown} className="bk-controls">
    <dl className="bk-keys">
      {CONTROLS.map(([key, action]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
    <button type="button" className="btn" onClick={onBack}>Back</button>
  </Panel>
)
