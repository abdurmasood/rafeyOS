// @vitest-environment jsdom
// The time of day in the engine: the sky, fog, blocks and underwater wash all follow the clock
import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import { SKY } from '@/components/rafeyos/apps/minecraft/logic/atmosphere'
import { DAY_SECONDS } from '@/components/rafeyos/apps/minecraft/logic/life/skyClock'
import { drawn, fogOf, installEngineHarness, start, sunk, track } from './minecraftEngineFakes'

installEngineHarness()

const MIDNIGHT = 0
const skyOf = ({ children }) => children.find((child) => child.geometry?.type === 'SphereGeometry')
const solidOf = ({ children }) => children.find((child) => child.isMesh && child.renderOrder === 0 && child.geometry.type === 'BufferGeometry').material
const brightness = (colour) => colour.r + colour.g + colour.b

describe('night in the engine', () => {
  it('darkens the fog, the sky and the blocks, and brings out the stars and moon', () => {
    const { scene } = drawn(track(start({ startTime: MIDNIGHT })))
    const { glow, night, moon } = skyOf(scene).material.uniforms

    expect(brightness(scene.fog.color)).toBeLessThan(brightness(new Color(SKY.horizon)) / 4)
    expect(brightness(solidOf(scene).color)).toBeLessThan(1.5)
    expect(glow.value).toBe(0)
    expect(night.value).toBe(1)
    expect(moon.value.y).toBeGreaterThan(0)
  })

  it('leaves a morning visit looking exactly as the day always did', () => {
    const { scene } = drawn(track(start()))

    expect(fogOf(scene)[0]).toBe(SKY.horizon)
    expect(solidOf(scene).color.getHexString()).toBe('ffffff')
    expect(skyOf(scene).material.uniforms.night.value).toBe(0)
  })

  it('dims the underwater wash at night, so the sea does not glow', () => {
    const night = track(start({ island: sunk(), startTime: MIDNIGHT }))
    night.tick()
    const day = track(start({ island: sunk() }))
    day.tick()

    const opacity = (world) => Number(world.host.querySelector('.bk-wash').style.opacity)
    expect(opacity(night)).toBeLessThan(opacity(day) / 3)
  })

  it('moves the sun as the frames go by', () => {
    const world = track(start())
    const { scene } = drawn(world)
    const before = skyOf(scene).material.uniforms.sun.value.clone()

    // 375 frames of 16 ms are 6 s of clock, a 200th of the day: the sun moves about 1.8°
    world.tick(Math.round((DAY_SECONDS / 200) / 0.016))

    expect(skyOf(scene).material.uniforms.sun.value.distanceTo(before)).toBeGreaterThan(0.005)
  })
})
