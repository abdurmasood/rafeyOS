// The Minecraft world inside its window: has the world built off the main thread, starts the engine on it with the
// title camera, saves builds as they change, and draws the title, HUD and panels over it. Loaded on first open (see
// lib/loadMinecraft) so three.js stays out of the OS chunk.
import { useEffect, useRef, useState } from 'react'
import { useServices } from '@/components/rafeyos/state/logic/contexts'
import { WebGLUnavailableError, createMinecraftEngine } from './logic/minecraftEngine'
import { createSaveQueue } from './logic/saveQueue'
import { createStartDirector } from './logic/startDirector'
import { WORLD_ID } from './logic/terrain'
import { useStartFlow } from './logic/useStartFlow'
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
 *   host: HTMLElement, store: { load: Function, save: Function }, reducedMotion: boolean,
 *   on: { hud: Function, world: Function, problem: Function, saveResult: Function, progress: Function },
 * }} options - `on.world` gets the running engine and `editCount()`, how many blocks differ from the generated world
 */
const startWorld = ({ host, store, reducedMotion, on }) => {
  const queue = createSaveQueue({ edits: store.load(WORLD_ID), save: (edits) => store.save(WORLD_ID, edits), onResult: on.saveResult })
  const stopFlushing = flushWhenLeaving(host.ownerDocument, queue.flush)
  const load = loadWorld({ edits: queue.edits(), onProgress: (done, total) => on.progress({ done, total }) })
  let stopped = false
  let engine = null
  load.promise.then(({ island, chunkArrays }) => {
    if (stopped) return
    try {
      // One per start: StrictMode's discarded first mount must not share an orbit clock with the real one
      const director = createStartDirector({ reducedMotion })
      engine = createMinecraftEngine({
        host, island, chunkArrays, edits: queue.edits(), onHud: on.hud, onEdit: queue.record, director,
      })
    } catch (error) {
      console.error('Minecraft engine failed to start', error)
      on.problem(error instanceof WebGLUnavailableError ? WORLD_STATUS.UNAVAILABLE : WORLD_STATUS.FAILED)
      return
    }
    on.world({ engine, editCount: () => queue.edits().length })
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
  const { minecraft: store, reducedMotion } = useServices()
  const hostRef = useRef(null)
  const [world, setWorld] = useState(null)
  const [hud, setHud] = useState(STARTING_HUD)
  const [saveFailure, setSaveFailure] = useState(null)
  const [problem, setProblem] = useState(null)
  const [progress, setProgress] = useState(null)
  const flow = useStartFlow({ world, active, playing: hud.playing })
  const { ready, reset } = flow
  const engine = world?.engine ?? null

  useEffect(() => {
    const stop = startWorld({ host: hostRef.current, store, reducedMotion: reducedMotion(), on: {
      hud: setHud,
      world: (started) => {
        setWorld(started)
        ready(started)
      },
      problem: setProblem,
      progress: setProgress,
      saveResult: (result) => setSaveFailure(result.ok ? null : result.reason),
    } })
    return () => {
      stop()
      // A re-run starts loading afresh, so no card or stage from this run may linger
      setWorld(null)
      setProblem(null)
      setProgress(null)
      reset()
    }
  }, [store, reducedMotion, ready, reset])

  useEffect(() => {
    engine?.setActive(active)
  }, [engine, active])
  useEffect(() => {
    engine?.setPaused(paused)
  }, [engine, paused])

  const status = problem ?? (engine ? WORLD_STATUS.READY : WORLD_STATUS.LOADING)
  return (
    <>
      <div className="bk-view" ref={hostRef} />
      <MinecraftHud hud={hud} saveFailure={saveFailure} status={status} progress={progress} flow={flow} active={active} />
    </>
  )
}
