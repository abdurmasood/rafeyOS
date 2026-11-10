// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SingularityScene } from '@/components/singularity/SingularityScene'

// The real engine needs WebGL. This one records what it was started with, and the test runs its frames by hand.
const fake = vi.hoisted(() => {
  class WebGLUnavailableError extends Error {}
  return { WebGLUnavailableError, engines: [], failure: null }
})
vi.mock('@/components/singularity/singularityEngine', () => ({
  WebGLUnavailableError: fake.WebGLUnavailableError,
  createSingularityEngine: (options) => {
    if (fake.failure) throw fake.failure
    const engine = { ...options, setPaused: vi.fn(), dispose: vi.fn() }
    fake.engines.push(engine)
    return engine
  },
}))

const TITLE = 'this is a real physics simulation of a black hole.'
const NEAR_EDGE = 'the edge is at 1.00. past it, nothing comes back.'
const FALLING = 'this close, the engine cannot hold you. you are falling toward the edge.'

const engine = () => fake.engines.at(-1)
/** Runs `seconds` of frames; returns the last view the scene handed the engine. */
const fly = (seconds, dt = 0.05) => {
  let view = null
  act(() => {
    for (let time = 0; time < seconds; time += dt) view = engine().onFrame(dt)
  })
  return view
}
/** Runs frames until `text` is on screen, for a minute at most. */
const flyUntil = (text) => {
  for (let time = 0; time < 60 && !screen.queryByText(text); time += 0.25) fly(0.25)
  return screen.getByText(text)
}
const key = (name, init = {}) => fireEvent.keyDown(window, { key: name, ...init })
const release = (name) => fireEvent.keyUp(window, { key: name })
const start = (props = {}) => {
  const onExit = vi.fn()
  const view = render(<SingularityScene onExit={onExit} {...props} />)
  return { onExit, ...view }
}
/** A scene taken past the title, holding W all the way to the centre and the end screen's prompt. */
const flownToTheEnd = (props) => {
  const world = start(props)
  key('Enter')
  key('w')
  fly(70)
  release('w')
  fly(1.3)
  return world
}
const distance = (view) => Math.hypot(...view.position)
const readout = () => screen.getByText(/radii from the centre/).textContent
const coarsePointer = (matches) => {
  window.matchMedia = vi.fn((query) => ({ matches: matches && query === '(pointer: coarse)' }))
}

beforeEach(() => {
  fake.engines.length = 0
  fake.failure = null
})

afterEach(() => {
  cleanup()
  delete window.matchMedia
})

describe('the singularity scene', () => {
  it('opens on the title, drawing in its own host', () => {
    const { container } = start()

    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(screen.getByText('press enter')).toBeTruthy()
    expect(screen.queryByText(/radii from the centre/)).toBeNull()
    expect(fake.engines).toHaveLength(1)
    expect(container.firstChild.contains(engine().host)).toBe(true)
    expect(fly(0.1).dim).toBe(0.45)
  })

  it('starts the flight on enter', () => {
    start()
    key('Enter')

    expect(screen.queryByText(TITLE)).toBeNull()
    expect(readout()).toBe('17.0 radii from the centre   your clock runs at 97% of a distant one')
    expect(screen.getByText('W').tagName).toBe('KBD')
    expect(fly(0.1).dim).toBe(1)
  })

  it('moves closer on W and further on S while they are held', () => {
    start()
    key('Enter')
    key('w')
    expect(distance(fly(2))).toBeLessThan(15)

    release('w')
    const settled = distance(fly(3))
    key('S')
    expect(distance(fly(2))).toBeGreaterThan(settled + 1)
  })

  it('goes around on A, D and the side arrows, and over the top on the up and down arrows', () => {
    start()
    key('Enter')
    const at = fly(0.1).position
    key('ArrowUp')
    expect(fly(2).position[1]).toBeGreaterThan(at[1] + 1)
    release('ArrowUp')
    key('ArrowDown')
    expect(fly(6).position[1]).toBeLessThan(at[1])
    release('ArrowDown')

    const angle = () => Math.atan2(fly(2).position[2], fly(0.05).position[0])
    const before = angle()
    key('d')
    const right = angle()
    expect(right).toBeGreaterThan(before + 0.1)
    release('d')
    key('ArrowLeft')
    fly(4)
    expect(angle()).toBeLessThan(right)
  })

  it('fades the key hint once the visitor has steered for a moment', () => {
    start()
    key('Enter')
    const hint = screen.getByText('W').parentElement
    expect(hint.style.opacity).toBe('1')

    key('a')
    fly(1.3)
    expect(hint.style.opacity).toBe('0')
  })

  it.each(['q', 'Q', 'Escape'])('exits once on %s from the title', (name) => {
    const { onExit } = start()
    key(name)
    key(name)
    key('Enter')

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({})
  })

  it.each(['q', 'Escape'])('exits once on %s while flying', (name) => {
    const { onExit } = start()
    key('Enter')
    fly(1)
    key(name)
    key('Escape')

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({})
  })

  it('exits on Ctrl+C, as the other terminal programs do', () => {
    const { onExit } = start()
    key('Enter')

    expect(key('c', { ctrlKey: true })).toBe(false)
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({})
  })

  it('exits on q while falling, where nothing else leads out', () => {
    const { onExit } = start()
    key('Enter')
    key('w')
    expect(flyUntil(FALLING)).toBeTruthy()

    key('q')
    expect(onExit).toHaveBeenCalledWith({})
  })

  it('ignores a key pressed before it mounted: the enter that launched it', () => {
    const { onExit } = start()
    const launching = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    Object.defineProperty(launching, 'timeStamp', { value: 0 })
    const quitting = new KeyboardEvent('keydown', { key: 'q', bubbles: true, cancelable: true })
    Object.defineProperty(quitting, 'timeStamp', { value: 0 })
    act(() => {
      window.dispatchEvent(launching)
      window.dispatchEvent(quitting)
    })

    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(onExit).not.toHaveBeenCalled()
    expect(launching.defaultPrevented).toBe(false)
  })

  it("ignores keys that are another window's", () => {
    const ownsKey = vi.fn(() => false)
    const { onExit } = start({ ownsKey })
    expect(key('Enter')).toBe(true)
    expect(key('q')).toBe(true)
    expect(key('w')).toBe(true)

    expect(ownsKey).toHaveBeenCalledTimes(3)
    expect(ownsKey.mock.calls[0][0].key).toBe('Enter')
    expect(screen.getByText(TITLE)).toBeTruthy()
    expect(onExit).not.toHaveBeenCalled()
  })

  it('follows the latest ownsKey without starting over', () => {
    const { onExit, rerender } = start({ ownsKey: () => false })
    rerender(<SingularityScene onExit={onExit} ownsKey={() => true} />)
    key('Enter')

    expect(screen.queryByText(TITLE)).toBeNull()
    expect(fake.engines).toHaveLength(1)
  })

  it('takes only the keys it handles, and none with a modifier', () => {
    start()
    key('Enter')

    for (const name of ['w', 's', 'a', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'q', 'Escape']) {
      expect(key(name)).toBe(false)
    }
    for (const name of ['x', ' ', 'Tab', 'r', 'F5']) expect(key(name)).toBe(true)
    expect(key('w', { metaKey: true })).toBe(true)
    expect(key('q', { ctrlKey: true })).toBe(true)
    // Ctrl+Shift+C is copy
    expect(key('C', { ctrlKey: true, shiftKey: true })).toBe(true)
    expect(key('Enter', { altKey: true })).toBe(true)
  })

  it('does not restart or exit on a repeating enter', () => {
    const { onExit } = start()
    key('Enter', { repeat: true })
    expect(screen.getByText(TITLE)).toBeTruthy()

    key('Enter')
    fly(1)
    key('Enter')
    expect(onExit).not.toHaveBeenCalled()
    expect(readout()).toContain('radii from the centre')
  })

  it('lets go of every held key when the window loses focus', () => {
    start()
    key('Enter')
    key('w')
    fly(1)
    fireEvent.blur(window)
    const settled = distance(fly(4))

    expect(distance(fly(2))).toBeCloseTo(settled, 2)
  })

  it('lets go of a key released in another window', () => {
    let owns = true
    start({ ownsKey: () => owns })
    key('Enter')
    key('w')
    owns = false
    release('w')
    const settled = distance(fly(4))

    expect(distance(fly(2))).toBeCloseTo(settled, 2)
  })

  it('says where the edge is, then that the engine has given out, then that there is no way back', () => {
    start()
    key('Enter')
    key('w')
    expect(flyUntil(NEAR_EDGE)).toBeTruthy()
    expect(readout()).toMatch(/^1\.\d\d radii from the centre/)

    expect(flyUntil(FALLING)).toBeTruthy()
    expect(readout()).toMatch(/^falling {3}1\.\d\d radii from the centre {3}about \d+ s left on your clock$/)

    expect(flyUntil('you are past the edge. there is no way back.')).toBeTruthy()
    expect(readout()).toMatch(/^inside the edge {3}\d\.\d\d radii from the centre {3}about \d+ s left on your clock$/)
  })

  it('says S does nothing inside the edge, and it does nothing', () => {
    start()
    key('Enter')
    key('w')
    fly(46)
    release('w')
    key('s')
    const before = distance(fly(0.05))
    const after = distance(fly(1))

    expect(after).toBeLessThan(before)
    expect(screen.getByText('S').tagName).toBe('KBD')
    expect(screen.getByText('S').parentElement.textContent).toBe('S does nothing here. every direction leads to the centre.')
  })

  it('ends at the centre and exits on enter, once', () => {
    const { onExit } = flownToTheEnd()
    expect(screen.getByText('you reached the centre.')).toBeTruthy()
    expect(screen.getByText('known physics ends here, and so does the simulation.')).toBeTruthy()
    expect(screen.getByText('press enter to exit')).toBeTruthy()
    expect(screen.queryByText(/radii from the centre/)).toBeNull()
    expect(onExit).not.toHaveBeenCalled()

    key('Enter')
    key('Enter')
    key('q')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({})
  })

  it('exits on q or escape at the end too', () => {
    const { onExit } = flownToTheEnd()
    key('Escape')

    expect(onExit).toHaveBeenCalledWith({})
  })

  it('waits for the exit prompt before enter leaves the end screen', () => {
    const world = start()
    key('Enter')
    key('w')
    fly(70)
    // Dimming to black; the prompt is not up yet... unless these frames ran past it
    const prompted = screen.queryByText('press enter to exit')
    key('Enter')

    expect(world.onExit).toHaveBeenCalledTimes(prompted ? 1 : 0)
  })

  it('exits as failed, once, when there is no WebGL', () => {
    fake.failure = new fake.WebGLUnavailableError('no WebGL')
    const onExit = vi.fn()
    render(<StrictMode><SingularityScene onExit={onExit} /></StrictMode>)
    key('q')

    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({ failed: true })
  })

  it('lets any other engine failure through', () => {
    fake.failure = new Error('a bug')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // React reports it to the window as well; without this jsdom prints it over the test output
    const quiet = (event) => event.preventDefault()
    window.addEventListener('error', quiet)

    expect(() => start()).toThrow('a bug')
    window.removeEventListener('error', quiet)
    vi.restoreAllMocks()
  })

  it('disposes of its engine when it goes, and of the extra one a strict double mount makes', () => {
    const view = render(<StrictMode><SingularityScene onExit={() => {}} /></StrictMode>)
    expect(fake.engines).toHaveLength(2)
    expect(fake.engines[0].dispose).toHaveBeenCalledTimes(1)
    expect(fake.engines[1].dispose).not.toHaveBeenCalled()

    view.unmount()
    expect(fake.engines[1].dispose).toHaveBeenCalledTimes(1)
    key('q')
  })

  it('stops listening once it has gone', () => {
    const { onExit, unmount } = start()
    unmount()
    key('q')

    expect(onExit).not.toHaveBeenCalled()
  })

  it('orbits on a drag of the canvas, and starts on a press of the title', () => {
    start()
    const { host } = engine()
    fireEvent.pointerDown(host, { clientX: 100, clientY: 100 })
    expect(screen.queryByText(TITLE)).toBeNull()

    const before = fly(1).position
    fireEvent.pointerMove(host, { clientX: 400, clientY: 100 })
    expect(fly(1).position).toEqual(before)

    fireEvent.pointerDown(host, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(host, { clientX: 400, clientY: 160 })
    const dragged = fly(3).position
    expect(dragged[1]).toBeGreaterThan(before[1] + 1)
    expect(Math.atan2(dragged[2], dragged[0])).toBeLessThan(Math.atan2(before[2], before[0]) - 0.4)

    fireEvent.pointerUp(host)
    fireEvent.pointerMove(host, { clientX: 900, clientY: 900 })
    expect(fly(3).position[1]).toBeCloseTo(dragged[1], 1)
  })

  it('exits on a press of the end screen', () => {
    const { onExit } = flownToTheEnd()
    fireEvent.pointerDown(engine().host, { clientX: 10, clientY: 10 })

    expect(onExit).toHaveBeenCalledWith({})
  })

  it('moves in and out on the wheel while hovering, keeping the page behind still', () => {
    start()
    const { host } = engine()
    expect(fireEvent.wheel(host, { deltaY: -500 })).toBe(true)

    key('Enter')
    const before = distance(fly(0.1))
    expect(fireEvent.wheel(host, { deltaY: -500 })).toBe(false)
    expect(distance(fly(3))).toBeLessThan(before - 1)
  })

  it('shows no touch row for a mouse', () => {
    coarsePointer(false)
    start()

    expect(screen.queryByText('[ quit ]')).toBeNull()
  })

  it('offers enter and quit on the title of a touch screen', () => {
    coarsePointer(true)
    const { onExit } = start()
    expect(screen.queryByText('[ closer ]')).toBeNull()

    fireEvent.click(screen.getByText('[ enter ]'))
    expect(screen.queryByText(TITLE)).toBeNull()
    expect(screen.queryByText('[ enter ]')).toBeNull()
    fireEvent.click(screen.getByText('[ quit ]'))
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(onExit).toHaveBeenCalledWith({})
  })

  it('moves while a touch control is held, with the controls in place of the key hint', () => {
    coarsePointer(true)
    start()
    fireEvent.click(screen.getByText('[ enter ]'))
    expect(screen.queryByText('W')).toBeNull()
    expect(['closer', 'further', 'left', 'right', 'up', 'down'].every((name) => screen.getByText(`[ ${name} ]`))).toBe(true)

    const closer = screen.getByText('[ closer ]')
    fireEvent.pointerDown(closer)
    expect(distance(fly(2))).toBeLessThan(15)
    fireEvent.pointerUp(closer)
    const settled = distance(fly(4))
    expect(distance(fly(2))).toBeCloseTo(settled, 2)

    fireEvent.pointerDown(screen.getByText('[ further ]'))
    fireEvent.pointerLeave(screen.getByText('[ further ]'))
    fireEvent.pointerDown(screen.getByText('[ up ]'))
    fireEvent.pointerCancel(screen.getByText('[ up ]'))
    const held = fly(4)
    expect(distance(held)).toBeCloseTo(settled, 1)
  })
})
