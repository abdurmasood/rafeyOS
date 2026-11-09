// The Minecraft world inside its window: has the world built off the main thread, starts the engine on it, saves
// builds as they change, and draws the HUD over it. Loaded on first open (see lib/loadMinecraft) so three.js stays out
// of the OS chunk.
import { useEffect, useRef, useState } from 'react'
import { useServices } from '@/components/rafeyos/state/logic/contexts'
import { WebGLUnavailableError, createMinecraftEngine } from './logic/minecraftEngine'
import { createSaveQueue } from './logic/saveQueue'
import { WORLD_ID } from './logic/terrain'
import { loadWorld } from './logic/worldLoader'
import { WORLD_STATUS } from './logic/worldStatus'
import { MinecraftHud } from './MinecraftHud'

const STARTING_HUD = Object.freeze({ playing: false, selected: 0, position: '' })

/** Saves what's waiting when the page goes away or is hidden, since React cleanup doesn't run then. */
const flushWhenLeaving = (doc, flush) => {
  const win = doc.defaultView
  const flushWhenHidden = () => {
    if (doc.visibilityState === 'hidden') flush()
  }
  win.addEventListener('pagehide', flush)
  doc.addEventListener('visibilitychange', flushWhenHidden)
  return () => {
    win.removeEventListener('pagehide', flush)
    doc.removeEventListener('visibilitychange', flushWhenHidden)
  }
}

/**
 * Loads the world, then starts the engine in `host`. Saving is wired up first, so stopping always flushes and unhooks
 * it, however far the load got. Returns what stops it all.
 * @param {{
 *   host: HTMLElement, store: { load: Function, save: Function },
 *   on: { hud: Function, engine: Function, problem: Function, saveResult: Function },
 * }} options
 */
const startWorld = ({ host, store, on }) => {
  const queue = createSaveQueue({ edits: store.load(WORLD_ID), save: (edits) => store.save(WORLD_ID, edits), onResult: on.saveResult })
  const stopFlushing = flushWhenLeaving(host.ownerDocument, queue.flush)
  const load = loadWorld({ edits: queue.edits() })
  let stopped = false
  let engine = null
  load.promise.then(({ island, chunkArrays }) => {
    if (stopped) return
    try {
      engine = createMinecraftEngine({ host, island, chunkArrays, edits: queue.edits(), onHud: on.hud, onEdit: queue.record })
    } catch (error) {
      console.error('Minecraft engine failed to start', error)
      on.problem(error instanceof WebGLUnavailableError ? WORLD_STATUS.UNAVAILABLE : WORLD_STATUS.FAILED)
      return
    }
    on.engine(engine)
  }, () => {
    if (!stopped) on.problem(WORLD_STATUS.FAILED)
  })
  return () => {
    stopped = true
    load.cancel()
    engine?.dispose()
    stopFlushing()
    queue.flush()
  }
}

/**
 * @param {{ active: boolean, paused: boolean }} props - `active`: its window has the keyboard; `paused`: minimized
 */
export const MinecraftScene = ({ active, paused }) => {
  const { minecraft: store } = useServices()
  const hostRef = useRef(null)
  const [engine, setEngine] = useState(null)
  const [hud, setHud] = useState(STARTING_HUD)
  const [saveFailure, setSaveFailure] = useState(null)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    const stop = startWorld({ host: hostRef.current, store, on: {
      hud: setHud,
      engine: setEngine,
      problem: setProblem,
      saveResult: (result) => setSaveFailure(result.ok ? null : result.reason),
    } })
    return () => {
      stop()
      // A re-run starts loading afresh, so no card from this run may linger
      setEngine(null)
      setProblem(null)
    }
  }, [store])

  useEffect(() => {
    engine?.setActive(active)
  }, [engine, active])
  useEffect(() => {
    engine?.setPaused(paused)
  }, [engine, paused])

  return (
    <>
      <div className="bk-view" ref={hostRef} />
      <MinecraftHud
        hud={hud}
        showCard={!(active && hud.playing)}
        saveFailure={saveFailure}
        status={problem ?? (engine ? WORLD_STATUS.READY : WORLD_STATUS.LOADING)}
        onPlay={() => engine?.capture()}
      />
    </>
  )
}
