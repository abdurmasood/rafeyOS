// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'

// jsdom has no WebGL: the Canvas stands in as a div showing its props, and the scene itself never loads here
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, frameloop }) => (
    <div data-testid="canvas" data-frameloop={frameloop}>
      {children}
    </div>
  ),
}))
vi.mock('@react-three/drei', () => ({ PerformanceMonitor: ({ children }) => children }))
vi.mock('@/components/studio/StudioScene', () => ({ StudioScene: () => null }))
vi.mock('@/components/studio/StudioCamera', () => ({ StudioCamera: () => null }))
const support = vi.hoisted(() => ({ value: 'ok' }))
vi.mock('@/lib/studio/webgl', async (importOriginal) => ({
  ...(await importOriginal()),
  detectStudioSupport: () => support.value,
}))

const { Studio } = await import('@/components/studio/Studio')
const { BUILD_QUALITY, manifest } = await import('@/lib/studio/manifest')
const shippedQuality = manifest.quality

// The window the room sits in: a ResizeObserver that reports whatever size the test gives it
const box = { size: { width: 900, height: 600 }, observers: [] }
const resizeWindow = (width, height) => {
  box.size = { width, height }
  act(() => box.observers.forEach((notify) => notify([{ contentRect: box.size }])))
}

beforeEach(() => {
  box.size = { width: 900, height: 600 }
  box.observers = []
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(notify) {
        this.notify = notify
        box.observers.push(notify)
      }
      observe() {
        this.notify([{ contentRect: box.size }])
      }
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  support.value = 'ok'
  manifest.quality = shippedQuality
})

const canvasBoxOf = () => screen.getByTestId('canvas').parentElement

describe('Studio', () => {
  it('draws the room on a capable browser', () => {
    render(<Studio />)
    expect(screen.getByTestId('canvas')).toBeTruthy()
  })

  it('fills its window instead of covering the page, and follows the window as it is resized', () => {
    const { container } = render(<Studio />)
    expect(container.firstChild.className).toContain('absolute inset-0')
    expect(container.firstChild.className).not.toContain('fixed')
    expect(canvasBoxOf().style.width).toBe('900px')
    resizeWindow(700, 500)
    expect(canvasBoxOf().style.width).toBe('700px')
  })

  it('waits for its window to have a size before drawing', () => {
    box.size = { width: 0, height: 0 }
    render(<Studio />)
    expect(screen.queryByTestId('canvas')).toBeNull()
    resizeWindow(640, 480)
    expect(screen.getByTestId('canvas')).toBeTruthy()
  })

  it('stops drawing while paused, e.g. while its window is minimized', () => {
    const { rerender } = render(<Studio paused />)
    expect(screen.getByTestId('canvas').dataset.frameloop).toBe('never')
    rerender(<Studio paused={false} />)
    expect(screen.getByTestId('canvas').dataset.frameloop).toBe('always')
  })

  it('has no way out of its own: the window it lives in closes it', () => {
    render(<Studio />)
    expect(screen.queryByLabelText('Back to terminal')).toBeNull()
  })

  it('explains, in terminal text, when WebGL 2 is missing', () => {
    support.value = 'no-webgl2'
    render(<Studio />)
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(screen.getByText(/rafey: WebGL 2 is not available here/)).toBeTruthy()
  })

  it('explains when the GPU cannot hold the plates', () => {
    support.value = 'small-textures'
    render(<Studio />)
    expect(screen.getByText(/cannot hold the room’s textures/)).toBeTruthy()
  })

  it('labels a draft build so it is never mistaken for the real render', () => {
    manifest.quality = BUILD_QUALITY.DRAFT
    render(<Studio />)
    expect(screen.getByText('draft')).toBeTruthy()
  })

  it('shows no label on a final build', () => {
    manifest.quality = BUILD_QUALITY.FINAL
    render(<Studio />)
    expect(screen.queryByText('draft')).toBeNull()
  })
})
