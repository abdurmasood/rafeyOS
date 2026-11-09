// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { PANEL, STAGE, useStartFlow } from '@/components/rafeyos/apps/minecraft/logic/useStartFlow'

afterEach(cleanup)

const fakeWorld = (editCount = 0) => ({
  engine: { play: vi.fn(), capture: vi.fn(), toTitle: vi.fn() },
  editCount: vi.fn(() => editCount),
})

/** The hook with a started world, on its title. */
const onTitle = ({ editCount = 0, active = true, playing = false } = {}) => {
  const world = fakeWorld(editCount)
  const view = renderHook((props) => useStartFlow(props), { initialProps: { world: null, active, playing } })
  act(() => view.result.current.ready(world))
  view.rerender({ world, active, playing })
  return { ...view, world, flow: () => view.result.current }
}

const arrive = (world) => act(() => world.engine.play.mock.lastCall[0]())

describe('useStartFlow', () => {
  it('loads first, then shows the title with the blocks changed counted as it appears', () => {
    const { result } = renderHook(() => useStartFlow({ world: null, active: true, playing: false }))
    expect(result.current.stage).toBe(STAGE.LOADING)
    expect(result.current.panel).toBe(PANEL.NONE)

    act(() => result.current.ready(fakeWorld(12)))
    expect(result.current.stage).toBe(STAGE.TITLE)
    expect(result.current.editCount).toBe(12)
  })

  it('glides in on Play and enters the game when the engine says it arrived', () => {
    const { world, flow } = onTitle()

    act(() => flow().play())
    expect(world.engine.play).toHaveBeenCalledTimes(1)
    expect(flow().stage).toBe(STAGE.ENTERING)

    arrive(world)
    expect(flow().stage).toBe(STAGE.GAME)
  })

  it('ignores a second Play in the same moment, as from a double click or a repeating key', () => {
    const { world, flow } = onTitle()

    act(() => {
      flow().play()
      flow().play()
    })
    act(() => flow().play())
    expect(world.engine.play).toHaveBeenCalledTimes(1)
  })

  it('does nothing on Play before the world is ready', () => {
    const { result } = renderHook(() => useStartFlow({ world: null, active: true, playing: false }))

    act(() => result.current.play())
    expect(result.current.stage).toBe(STAGE.LOADING)
  })

  it('ignores an arrival that lands after the scene started loading again', () => {
    const { world, flow } = onTitle()
    act(() => flow().play())

    act(() => flow().reset())
    arrive(world)
    expect(flow().stage).toBe(STAGE.LOADING)
  })

  it('pauses in the game only while the window is inactive or the player is not playing', () => {
    const { world, flow, rerender } = onTitle({ playing: false })
    expect(flow().paused).toBe(false)

    act(() => flow().play())
    expect(flow().paused).toBe(false)
    rerender({ world, active: true, playing: true })
    arrive(world)
    expect(flow().paused).toBe(false)

    rerender({ world, active: false, playing: true })
    expect(flow().paused).toBe(true)
    rerender({ world, active: true, playing: false })
    expect(flow().paused).toBe(true)
  })

  it('resumes by taking the mouse again, and closes any panel', () => {
    const { world, flow } = onTitle()
    act(() => flow().play())
    arrive(world)
    act(() => flow().openControls())

    act(() => flow().resume())
    expect(world.engine.capture).toHaveBeenCalledTimes(1)
    expect(flow().panel).toBe(PANEL.NONE)
  })

  it('goes back to the title, with the orbit and a fresh count of the blocks changed', () => {
    const { world, flow } = onTitle({ editCount: 0 })
    act(() => flow().play())
    arrive(world)
    world.editCount.mockReturnValue(3)

    act(() => flow().backToTitle())
    expect(world.engine.toTitle).toHaveBeenCalledTimes(1)
    expect(flow().stage).toBe(STAGE.TITLE)
    expect(flow().editCount).toBe(3)

    act(() => flow().play())
    expect(world.engine.play).toHaveBeenCalledTimes(2)
  })

  it('opens Controls over the current stage and closes back to it', () => {
    const { world, flow } = onTitle()

    act(() => flow().openControls())
    expect(flow()).toMatchObject({ stage: STAGE.TITLE, panel: PANEL.CONTROLS })
    act(() => flow().closeControls())
    expect(flow()).toMatchObject({ stage: STAGE.TITLE, panel: PANEL.NONE })

    act(() => flow().play())
    arrive(world)
    act(() => flow().openControls())
    act(() => flow().closeControls())
    expect(flow()).toMatchObject({ stage: STAGE.GAME, panel: PANEL.NONE })
  })

  it('ignores Controls while gliding in and while playing', () => {
    const { world, flow, rerender } = onTitle()
    act(() => flow().play())

    act(() => flow().openControls())
    expect(flow().panel).toBe(PANEL.NONE)

    rerender({ world, active: true, playing: true })
    arrive(world)
    act(() => flow().openControls())
    expect(flow().panel).toBe(PANEL.NONE)
  })

  it('ignores Resume and Back to title anywhere but a paused game, so a button left focused does nothing', () => {
    const { world, flow, rerender } = onTitle()
    act(() => flow().resume())
    act(() => flow().backToTitle())
    expect(world.engine.capture).not.toHaveBeenCalled()
    expect(world.engine.toTitle).not.toHaveBeenCalled()

    rerender({ world, active: true, playing: true })
    act(() => flow().play())
    arrive(world)
    act(() => flow().resume())
    act(() => flow().backToTitle())
    expect(world.engine.capture).not.toHaveBeenCalled()
    expect(world.engine.toTitle).not.toHaveBeenCalled()
  })

  it('goes back to the title once, however often Back to title is pressed', () => {
    const { world, flow } = onTitle()
    act(() => flow().play())
    arrive(world)

    act(() => {
      flow().backToTitle()
      flow().backToTitle()
    })
    expect(world.engine.toTitle).toHaveBeenCalledTimes(1)
  })

  it('clears the panel when Play starts the glide and when the scene starts loading again', () => {
    const { flow } = onTitle()
    act(() => flow().openControls())

    act(() => flow().play())
    expect(flow().panel).toBe(PANEL.NONE)

    act(() => flow().openControls())
    act(() => flow().reset())
    expect(flow()).toMatchObject({ stage: STAGE.LOADING, panel: PANEL.NONE })
  })
})
