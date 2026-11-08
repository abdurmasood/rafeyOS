// The Blocks world inside its window: starts the engine, saves builds as they change, and draws the HUD over it.
// Loaded on first open (see lib/loadBlocks) so three.js stays out of the OS chunk.
import { useEffect, useRef, useState } from 'react'
import { useServices } from '@/components/rafeyos/state/logic/contexts'
import { createBlocksEngine } from './logic/blocksEngine'
import { createSaveQueue } from './logic/saveQueue'
import { WORLD_ID } from './logic/terrain'
import { BlocksHud } from './BlocksHud'

const STARTING_HUD = Object.freeze({ playing: false, selected: 0, position: '' })

/**
 * @param {{ active: boolean, paused: boolean }} props - `active`: its window has the keyboard; `paused`: minimized
 */
export const BlocksScene = ({ active, paused }) => {
  const { blocks: store } = useServices()
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const [hud, setHud] = useState(STARTING_HUD)
  const [saveFailure, setSaveFailure] = useState(null)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    const queue = createSaveQueue({
      edits: store.load(WORLD_ID),
      save: (edits) => store.save(WORLD_ID, edits),
      onResult: (result) => setSaveFailure(result.ok ? null : result.reason),
    })
    let engine
    try {
      engine = createBlocksEngine({ host: hostRef.current, edits: queue.edits(), onHud: setHud, onEdit: queue.record })
    } catch {
      setUnavailable(true)
      return undefined
    }
    engineRef.current = engine
    // React cleanup doesn't run when the page goes away, so leaving or hiding it saves what's waiting
    const doc = hostRef.current.ownerDocument
    const win = doc.defaultView
    const flushWhenHidden = () => {
      if (doc.visibilityState === 'hidden') queue.flush()
    }
    win.addEventListener('pagehide', queue.flush)
    doc.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      win.removeEventListener('pagehide', queue.flush)
      doc.removeEventListener('visibilitychange', flushWhenHidden)
      engineRef.current = null
      engine.dispose()
      queue.flush()
    }
  }, [store])

  // Declared after the engine's effect, so a new engine (StrictMode remounts it) gets the current values too
  useEffect(() => {
    engineRef.current?.setActive(active)
  }, [active])
  useEffect(() => {
    engineRef.current?.setPaused(paused)
  }, [paused])

  return (
    <>
      <div className="bk-view" ref={hostRef} />
      <BlocksHud
        hud={hud}
        showCard={!(active && hud.playing)}
        saveFailure={saveFailure}
        unavailable={unavailable}
        onPlay={() => engineRef.current?.capture()}
      />
    </>
  )
}
