// `singularity` as both terminals render it: a cover over the terminal while it runs, and nothing once it has been
// left. The simulation itself (three.js and the shaders) is a chunk of its own, fetched when the command is first run.
import { Suspense, lazy } from 'react'
import { loadSingularity } from '@/lib/loadSingularity'

const SingularityScene = lazy(loadSingularity)

export const NEEDS_WEBGL = "singularity: this needs WebGL, which isn't available here"

// The homepage has one terminal, so every key is the program's
const everyKey = () => true

/**
 * @param {{
 *   active: boolean, onDone: (result: { failed?: boolean }) => void,
 *   ownsKey?: (event: KeyboardEvent) => boolean, failed?: boolean, className?: string,
 * }} props - `onDone`: `{}` when the visitor left, `{ failed: true }` when there is no WebGL; `failed`: that result
 *   handed back, so the scrollback says why nothing ran; `className`: positions the cover, which fills whatever box
 *   that gives it
 */
export function Singularity({ active, onDone, ownsKey = everyKey, failed = false, className = '' }) {
  if (!active) return failed ? <div>{NEEDS_WEBGL}</div> : null
  return (
    <div className={className} style={{ background: '#000' }}>
      <Suspense fallback={null}>
        <SingularityScene onExit={(result) => onDone(result ?? {})} ownsKey={ownsKey} />
      </Suspense>
    </div>
  )
}
