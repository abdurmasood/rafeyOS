// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

// jsdom has no WebGL: the Canvas stands in as a div, and the scene itself never loads here
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => <div data-testid="canvas">{children}</div> }))
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

afterEach(() => {
  cleanup()
  support.value = 'ok'
  manifest.quality = shippedQuality
})

describe('Studio', () => {
  it('draws the room on a capable browser', () => {
    render(<Studio onExit={() => {}} />)
    expect(screen.getByTestId('canvas')).toBeTruthy()
  })

  it('explains, in terminal text, when WebGL 2 is missing', () => {
    support.value = 'no-webgl2'
    render(<Studio onExit={() => {}} />)
    expect(screen.queryByTestId('canvas')).toBeNull()
    expect(screen.getByText(/studio: WebGL 2 is not available here/)).toBeTruthy()
  })

  it('explains when the GPU cannot hold the plates', () => {
    support.value = 'small-textures'
    render(<Studio onExit={() => {}} />)
    expect(screen.getByText(/cannot hold the room’s textures/)).toBeTruthy()
  })

  it('leaves on Esc and on the terminal icon', () => {
    const onExit = vi.fn()
    render(<Studio onExit={onExit} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByLabelText('Back to terminal'))
    expect(onExit).toHaveBeenCalledTimes(2)
  })

  it('ignores other keys', () => {
    const onExit = vi.fn()
    render(<Studio onExit={onExit} />)
    fireEvent.keyDown(window, { key: 'q' })
    expect(onExit).not.toHaveBeenCalled()
  })

  it('labels a draft build so it is never mistaken for the real render', () => {
    manifest.quality = BUILD_QUALITY.DRAFT
    render(<Studio onExit={() => {}} />)
    expect(screen.getByText('draft')).toBeTruthy()
  })

  it('shows no label on a final build', () => {
    manifest.quality = BUILD_QUALITY.FINAL
    render(<Studio onExit={() => {}} />)
    expect(screen.queryByText('draft')).toBeNull()
  })
})
