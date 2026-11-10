import { describe, expect, it } from 'vitest'
import { BUBBLE_ICON, HEART_ICON, heartStates } from '@/components/rafeyos/apps/minecraft/logic/life/pixelIcons'

const squares = (layer) => layer.d.match(/M/g).length
const total = (layers) => layers.reduce((sum, layer) => sum + squares(layer), 0)

describe('hearts', () => {
  it.each([
    [20, Array(10).fill('full')],
    [13, [...Array(6).fill('full'), 'half', ...Array(3).fill('empty')]],
    [1, ['half', ...Array(9).fill('empty')]],
    [0, Array(10).fill('empty')],
  ])('shows %i halves of health as %j', (health, states) => {
    expect(heartStates(health, 10)).toEqual(states)
  })

  it('draws every state on the same pixels, so a heart never changes shape as it empties', () => {
    expect(total(HEART_ICON.half)).toBe(total(HEART_ICON.full))
    expect(total(HEART_ICON.empty)).toBe(total(HEART_ICON.full))
    expect(HEART_ICON).toMatchObject({ width: 9, height: 8 })
  })

  it('keeps an empty heart free of red', () => {
    expect(HEART_ICON.empty.map((layer) => layer.fill)).not.toContain('#e8423f')
    expect(HEART_ICON.full.map((layer) => layer.fill)).toContain('#e8423f')
  })
})

describe('air bubbles', () => {
  it('draws a round bubble with an outline, inside its own size', () => {
    const inside = BUBBLE_ICON.layers.flatMap((layer) => [...layer.d.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => [Number(x), Number(y)]))
    expect(inside.every(([x, y]) => x < BUBBLE_ICON.width && y < BUBBLE_ICON.height)).toBe(true)
    expect(total(BUBBLE_ICON.layers)).toBeGreaterThan(20)
  })
})
