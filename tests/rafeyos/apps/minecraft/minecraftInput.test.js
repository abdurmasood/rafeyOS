// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_REPEAT, createMinecraftInput } from '@/components/rafeyos/apps/minecraft/logic/minecraftInput'

// jsdom has no pointer lock; this stands in for the browser's
let lockedElement = null
const setLock = (element) => {
  lockedElement = element
  document.dispatchEvent(new Event('pointerlockchange'))
}

const setup = ({ pointerLock = true } = {}) => {
  const canvas = document.createElement('canvas')
  if (pointerLock) canvas.requestPointerLock = vi.fn(() => setLock(canvas))
  document.body.append(canvas)
  let time = 1000
  const on = { turn: vi.fn(), breakBlock: vi.fn(), placeBlock: vi.fn(), select: vi.fn(), scroll: vi.fn(), playingChanged: vi.fn() }
  const input = createMinecraftInput({ canvas, doc: document, win: window, now: () => time, on })
  return { canvas, input, on, advance: (ms) => { time += ms }, clock: () => time }
}

const key = (type, code) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, cancelable: true }))
const mouse = (target, type, init = {}) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }))

let current
beforeEach(() => {
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockedElement })
  document.exitPointerLock = vi.fn(() => setLock(null))
})
afterEach(() => {
  current?.input.dispose()
  current?.canvas.remove()
  current = null
  lockedElement = null
})

const playing = (options) => {
  current = setup(options)
  current.input.setActive(true)
  current.input.capture()
  return current
}

describe('Minecraft input', () => {
  it('takes the mouse on capture and starts playing', () => {
    const { input, on, canvas } = playing()

    expect(canvas.requestPointerLock).toHaveBeenCalled()
    expect(input.isPlaying()).toBe(true)
    expect(on.playingChanged).toHaveBeenLastCalledWith(true)
  })

  it('reads held movement keys, and picks blocks with the number keys', () => {
    const { input, on } = playing()
    key('keydown', 'KeyW')
    key('keydown', 'KeyA')
    key('keydown', 'Space')
    key('keydown', 'ShiftLeft')
    key('keydown', 'Digit3')

    expect(input.moveInput()).toEqual({ forward: 1, strafe: -1, jump: true, sprint: true })
    expect(on.select).toHaveBeenCalledWith(2)

    key('keyup', 'KeyW')
    expect(input.moveInput().forward).toBe(0)
  })

  it('stops the page scrolling on Space', () => {
    playing()
    const space = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
    document.dispatchEvent(space)

    expect(space.defaultPrevented).toBe(true)
  })

  it('turns with mouse movement while locked', () => {
    const { on } = playing()
    mouse(document, 'mousemove', { movementX: 12, movementY: -4 })

    expect(on.turn).toHaveBeenCalledWith(12, -4)
  })

  it('breaks on left click and places on right click, repeating while held', () => {
    const { input, on, canvas, advance, clock } = playing()
    mouse(canvas, 'mousedown', { button: 0 })
    expect(on.breakBlock).toHaveBeenCalledTimes(1)

    input.tick(clock() + HOLD_REPEAT - 1)
    expect(on.breakBlock).toHaveBeenCalledTimes(1)
    input.tick(clock() + HOLD_REPEAT)
    expect(on.breakBlock).toHaveBeenCalledTimes(2)

    mouse(document, 'mouseup', { button: 0 })
    input.tick(clock() + 10 * HOLD_REPEAT)
    expect(on.breakBlock).toHaveBeenCalledTimes(2)

    advance(5)
    mouse(canvas, 'mousedown', { button: 2 })
    input.tick(clock() + HOLD_REPEAT)
    expect(on.placeBlock).toHaveBeenCalledTimes(2)
    mouse(canvas, 'mousedown', { button: 1 })
    expect(on.breakBlock).toHaveBeenCalledTimes(2)
  })

  it('picks blocks with the wheel, and keeps the right-click menu away', () => {
    const { on, canvas } = playing()
    const wheel = new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true })
    canvas.dispatchEvent(wheel)
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -40, bubbles: true, cancelable: true }))
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    canvas.dispatchEvent(menu)

    expect(on.scroll.mock.calls).toEqual([[1], [-1]])
    expect(wheel.defaultPrevented).toBe(true)
    expect(menu.defaultPrevented).toBe(true)
  })

  it('ignores everything until the player clicks in', () => {
    current = setup()
    current.input.setActive(true)
    key('keydown', 'KeyW')
    mouse(current.canvas, 'mousedown', { button: 0 })
    current.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true }))

    expect(current.input.moveInput().forward).toBe(0)
    expect(current.on.breakBlock).not.toHaveBeenCalled()
    expect(current.on.scroll).not.toHaveBeenCalled()
  })

  it('lets go of the mouse and every key when its window stops being active', () => {
    const { input, on } = playing()
    key('keydown', 'KeyW')
    input.setActive(false)

    expect(document.exitPointerLock).toHaveBeenCalled()
    expect(input.isPlaying()).toBe(false)
    expect(input.moveInput().forward).toBe(0)
    expect(on.playingChanged).toHaveBeenLastCalledWith(false)
  })

  it('hands back a lock that arrives after its window lost focus', () => {
    current = setup()
    setLock(current.canvas)

    expect(document.exitPointerLock).toHaveBeenCalled()
    expect(current.input.isPlaying()).toBe(false)
  })

  it('stops playing when the browser releases the lock (Esc), and forgets held keys', () => {
    const { input } = playing()
    key('keydown', 'KeyD')
    setLock(null)

    expect(input.isPlaying()).toBe(false)
    expect(input.moveInput().strafe).toBe(0)
  })

  it('forgets held keys when the browser window loses focus', () => {
    const { input } = playing()
    key('keydown', 'KeyS')
    window.dispatchEvent(new Event('blur'))

    expect(input.moveInput().forward).toBe(0)
  })

  describe('without pointer lock', () => {
    it('looks around by dragging, breaks on a click, and lets go on Esc', () => {
      const { input, on, canvas } = playing({ pointerLock: false })
      expect(input.isPlaying()).toBe(true)

      mouse(canvas, 'mousedown', { button: 0, clientX: 100, clientY: 100 })
      mouse(document, 'mousemove', { clientX: 130, clientY: 90 })
      mouse(document, 'mouseup', { button: 0 })
      expect(on.turn).toHaveBeenCalledWith(30, -10)
      expect(on.breakBlock).not.toHaveBeenCalled()

      mouse(canvas, 'mousedown', { button: 0, clientX: 50, clientY: 50 })
      mouse(document, 'mouseup', { button: 0 })
      expect(on.breakBlock).toHaveBeenCalledTimes(1)

      key('keydown', 'Escape')
      expect(input.isPlaying()).toBe(false)
    })

    it('switches to dragging when the browser refuses the lock', () => {
      current = setup()
      current.canvas.requestPointerLock = vi.fn(() => document.dispatchEvent(new Event('pointerlockerror')))
      current.input.setActive(true)
      current.input.capture()

      expect(current.input.isPlaying()).toBe(true)
    })

    it('also switches when requesting the lock throws or rejects', async () => {
      current = setup()
      current.canvas.requestPointerLock = vi.fn(() => { throw new Error('denied') })
      current.input.setActive(true)
      current.input.capture()
      expect(current.input.isPlaying()).toBe(true)

      const other = setup()
      other.canvas.requestPointerLock = vi.fn(() => Promise.reject(new Error('denied')))
      other.input.setActive(true)
      other.input.capture()
      await Promise.resolve()
      await Promise.resolve()
      expect(other.input.isPlaying()).toBe(true)
      other.input.dispose()
      other.canvas.remove()
    })

    it("doesn't give up on the lock when the refusal is the browser's cooldown right after Esc", () => {
      const { input, canvas, advance } = playing()
      setLock(null)
      advance(200)
      canvas.requestPointerLock = vi.fn(() => document.dispatchEvent(new Event('pointerlockerror')))
      input.capture()

      expect(input.isPlaying()).toBe(false)
    })
  })

  it('stops listening once disposed', () => {
    const { input, on } = playing()
    input.dispose()
    key('keydown', 'Digit2')

    expect(on.select).not.toHaveBeenCalled()
    expect(document.exitPointerLock).toHaveBeenCalled()
  })
})
