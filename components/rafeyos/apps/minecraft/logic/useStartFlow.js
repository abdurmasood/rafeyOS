// The start flow around the world: loading, the orbiting title, the glide in after Play, then the game, with the pause
// panel over a game that isn't being played and a Controls panel off the title or the pause panel
import { useCallback, useRef, useState } from 'react'

export const STAGE = Object.freeze({ LOADING: 'loading', TITLE: 'title', ENTERING: 'entering', GAME: 'game' })
export const PANEL = Object.freeze({ NONE: 'none', CONTROLS: 'controls' })

/**
 * @typedef {{ play: (onArrive: () => void) => void, capture: () => void, toTitle: () => void }} FlowEngine
 * @typedef {{ engine: FlowEngine, editCount: () => number }} StartedWorld
 */

/**
 * What the buttons do. Each checks the stage first, through `stageRef` since a double click or a repeating key calls
 * again before React re-renders, and because a button that kept focus as its surface hid must not act.
 */
const flowActions = ({ world, stageRef, goTo, setPanel, setEditCount, notPlaying }) => {
  const at = (stage) => Boolean(world) && stageRef.current === stage
  const inPause = () => at(STAGE.GAME) && notPlaying
  return {
    play: () => {
      if (!at(STAGE.TITLE)) return
      setPanel(PANEL.NONE)
      goTo(STAGE.ENTERING)
      world.engine.play(() => {
        if (stageRef.current === STAGE.ENTERING) goTo(STAGE.GAME)
      })
    },
    resume: () => {
      if (!inPause()) return
      setPanel(PANEL.NONE)
      world.engine.capture()
    },
    // The mouse is already free whenever the pause panel shows
    backToTitle: () => {
      if (!inPause()) return
      world.engine.toTitle()
      setEditCount(world.editCount())
      goTo(STAGE.TITLE)
    },
    openControls: () => {
      if (at(STAGE.TITLE) || inPause()) setPanel(PANEL.CONTROLS)
    },
    closeControls: () => setPanel(PANEL.NONE),
  }
}

/**
 * @param {{ world: StartedWorld | null, active: boolean, playing: boolean }} options - `active`: the window has the
 *   keyboard; `playing`: the engine's HUD says input is live
 */
export const useStartFlow = ({ world, active, playing }) => {
  const [stage, setStage] = useState(STAGE.LOADING)
  const [panel, setPanel] = useState(PANEL.NONE)
  // Blocks changed, counted when the title last appeared rather than on every render of a game
  const [editCount, setEditCount] = useState(0)
  const stageRef = useRef(stage)
  const goTo = useCallback((next) => {
    stageRef.current = next
    setStage(next)
  }, [])

  /** @param {StartedWorld} started */
  const ready = useCallback((started) => {
    setEditCount(started.editCount())
    goTo(STAGE.TITLE)
  }, [goTo])
  const reset = useCallback(() => {
    setPanel(PANEL.NONE)
    goTo(STAGE.LOADING)
  }, [goTo])

  const notPlaying = !(active && playing)
  const actions = flowActions({ world, stageRef, goTo, setPanel, setEditCount, notPlaying })
  return { stage, panel, editCount, paused: stage === STAGE.GAME && notPlaying, ready, reset, ...actions }
}
