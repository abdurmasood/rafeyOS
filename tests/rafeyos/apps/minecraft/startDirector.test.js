import { describe, expect, it, vi } from 'vitest'
import { createStartDirector } from '@/components/rafeyos/apps/minecraft/logic/startDirector'

const CENTRE = 256
const SPAWN = { x: 254.5, y: 34.62, z: 352.5 }
const frameArgs = (dt, eye = SPAWN) => ({ dt, eye, yaw: -Math.PI, pitch: -0.2 })
const radiusOf = (camera) => Math.hypot(camera.x - CENTRE, camera.z - CENTRE)
const angleOf = (camera) => Math.atan2(camera.z - CENTRE, camera.x - CENTRE)

const run = (director, seconds, eye = SPAWN, step = 0.05) => {
  let shot = null
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += step) shot = director.frame(frameArgs(step, eye))
  return shot
}

describe('start director orbit', () => {
  it('orbits at radius 105, height 90 and looks at y 34', () => {
    const director = createStartDirector()
    const { camera } = director.frame(frameArgs(0.05))
    expect(radiusOf(camera)).toBeCloseTo(105, 6)
    expect(camera.y).toBe(90)
    expect(camera.pitch).toBeCloseTo(Math.atan2(34 - 90, 105), 6)
    expect(camera.pitch).toBeCloseTo(-0.49, 2)
  })

  it('faces the centre', () => {
    const { camera } = createStartDirector().frame(frameArgs(0.05))
    const forwardX = -Math.sin(camera.yaw)
    const forwardZ = -Math.cos(camera.yaw)
    const towardX = (CENTRE - camera.x) / radiusOf(camera)
    const towardZ = (CENTRE - camera.z) / radiusOf(camera)
    expect(forwardX).toBeCloseTo(towardX, 6)
    expect(forwardZ).toBeCloseTo(towardZ, 6)
  })

  it('starts on the spawn side of the continent', () => {
    const { camera } = createStartDirector().frame(frameArgs(0))
    expect(camera.z).toBeGreaterThan(CENTRE)
    expect(Math.abs(angleOf(camera) - angleOf(SPAWN))).toBeLessThan(1e-6)
  })

  it('completes one turn in 150 seconds', () => {
    const director = createStartDirector()
    const first = director.frame(frameArgs(0)).camera
    const quarter = run(director, 37.5).camera
    expect(Math.abs(Math.atan2(Math.sin(angleOf(quarter) - angleOf(first)), Math.cos(angleOf(quarter) - angleOf(first))))).toBeCloseTo(Math.PI / 2, 5)
    const full = run(director, 112.5).camera
    expect(full.x).toBeCloseTo(first.x, 4)
    expect(full.z).toBeCloseTo(first.z, 4)
  })

  it('freezes the orbit under reduced motion', () => {
    const director = createStartDirector({ reducedMotion: true })
    const first = director.frame(frameArgs(0.05)).camera
    const later = run(director, 60).camera
    expect(later).toEqual(first)
  })

  it('reports orbit mode initially', () => {
    expect(createStartDirector().mode()).toBe('orbit')
  })
})

describe('start director fog lift', () => {
  it('eases the lift over 1.8 seconds then omits it', () => {
    const director = createStartDirector()
    const half = run(director, 0.9)
    expect(half.fogLift).toBeCloseTo(1 - 0.5 ** 3, 5)
    expect(run(director, 0.85).fogLift).toBeGreaterThan(0.99)
    expect(run(director, 0.2).fogLift).toBeUndefined()
  })

  it('lifts in 0.6 seconds under reduced motion', () => {
    const director = createStartDirector({ reducedMotion: true })
    expect(run(director, 0.3).fogLift).toBeCloseTo(1 - 0.5 ** 3, 5)
    expect(run(director, 0.4).fogLift).toBeUndefined()
  })
})

describe('start director glides', () => {
  const PLAYER_EYE = { x: 254.5, y: 34.62, z: 352.5 }

  it('glides to the eye over a bounded duration and arrives once', () => {
    const director = createStartDirector()
    run(director, 1)
    const onArrive = vi.fn()
    director.toPlayer(onArrive)
    expect(director.mode()).toBe('toPlayer')
    run(director, 1.2)
    expect(onArrive).not.toHaveBeenCalled()
    run(director, 2.2)
    expect(onArrive).toHaveBeenCalledTimes(1)
    expect(director.mode()).toBe('player')
    run(director, 2)
    expect(onArrive).toHaveBeenCalledTimes(1)
  })

  it('lands exactly on the eye pose, then hands the camera back with no override', () => {
    const director = createStartDirector()
    run(director, 1)
    director.toPlayer(() => {})
    let shot
    while (director.mode() === 'toPlayer') shot = director.frame(frameArgs(0.05, PLAYER_EYE))
    expect(shot.camera.x).toBeCloseTo(PLAYER_EYE.x, 6)
    expect(shot.camera.y).toBeCloseTo(PLAYER_EYE.y, 6)
    expect(shot.camera.z).toBeCloseTo(PLAYER_EYE.z, 6)
    expect(Math.sin(shot.camera.yaw)).toBeCloseTo(Math.sin(-Math.PI), 6)
    expect(Math.cos(shot.camera.yaw)).toBeCloseTo(Math.cos(-Math.PI), 6)
    expect(shot.camera.pitch).toBeCloseTo(-0.2, 6)
    expect(director.frame(frameArgs(0.05, PLAYER_EYE))?.camera).toBeUndefined()
  })

  it('keeps an orbit camera on the landing frame and the frame after it', () => {
    const director = createStartDirector()
    run(director, 1)
    director.toPlayer(() => {})
    run(director, 4)
    director.toOrbit()
    let landing
    while (director.mode() === 'toOrbit') landing = director.frame(frameArgs(0.05))
    const next = director.frame(frameArgs(0.05))
    expect(landing.camera).toBeDefined()
    expect(next.camera).toBeDefined()
    expect(Math.hypot(next.camera.x - landing.camera.x, next.camera.z - landing.camera.z)).toBeLessThan(0.5)
  })

  it('arrives immediately when toPlayer is called before the first frame', () => {
    const director = createStartDirector()
    const onArrive = vi.fn()
    director.toPlayer(onArrive)
    expect(onArrive).toHaveBeenCalledTimes(1)
    expect(director.mode()).toBe('player')
  })

  it('ignores toOrbit before the first frame', () => {
    const director = createStartDirector()
    director.toOrbit()
    expect(director.mode()).toBe('orbit')
  })

  it.each([68, 69, 70])('glides monotonically when the gap is near a half turn (%i s)', (seconds) => {
    const director = createStartDirector()
    run(director, 1)
    director.toPlayer(() => {})
    run(director, 4)
    run(director, seconds)
    director.toOrbit()
    let previous = angleOf(director.frame(frameArgs(0.0001)).camera)
    const steps = []
    while (director.mode() === 'toOrbit') {
      const angle = angleOf(director.frame(frameArgs(0.05)).camera)
      steps.push(Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous)))
      previous = angle
    }
    expect(Math.max(...steps.map(Math.abs))).toBeLessThan(0.2)
    expect(new Set(steps.filter((step) => Math.abs(step) > 0.01).map(Math.sign)).size).toBe(1)
  })

  it('drops the pending arrival when toOrbit is called mid-glide', () => {
    const director = createStartDirector()
    run(director, 1)
    const onArrive = vi.fn()
    director.toPlayer(onArrive)
    run(director, 0.5)
    director.toOrbit()
    run(director, 6)
    expect(onArrive).not.toHaveBeenCalled()
    expect(director.mode()).toBe('orbit')
  })

  it('drops the pending arrival under reduced motion when toOrbit is called', () => {
    const director = createStartDirector({ reducedMotion: true })
    director.frame(frameArgs(0.05))
    const onArrive = vi.fn()
    director.toPlayer(onArrive)
    director.toOrbit()
    run(director, 1)
    expect(onArrive).not.toHaveBeenCalled()
  })

  it('starts toPlayer from the last applied pose when called mid toOrbit glide', () => {
    const director = createStartDirector()
    run(director, 1)
    director.toPlayer(() => {})
    run(director, 4)
    director.toOrbit()
    const mid = run(director, 1).camera
    director.toPlayer(() => {})
    const next = director.frame(frameArgs(0.0001)).camera
    expect(next.x).toBeCloseTo(mid.x, 1)
    expect(next.y).toBeCloseTo(mid.y, 1)
    expect(next.z).toBeCloseTo(mid.z, 1)
  })

  it('takes the shortest yaw arc for an unbounded player yaw', () => {
    const director = createStartDirector()
    director.frame(frameArgs(0))
    const yaw = -Math.PI + 8 * Math.PI
    director.toPlayer(() => {})
    const yaws = []
    while (director.mode() === 'toPlayer') {
      const shot = director.frame({ dt: 0.05, eye: SPAWN, yaw, pitch: -0.2 })
      yaws.push(shot.camera.yaw)
    }
    const swing = Math.max(...yaws.map((value, index) => Math.abs(value - (yaws[index - 1] ?? value))))
    expect(swing).toBeLessThan(0.5)
    expect(Math.abs(yaws[yaws.length - 1])).toBeLessThan(2 * Math.PI)
  })

  it('takes the shortest arc to the eye', () => {
    const director = createStartDirector()
    director.frame(frameArgs(0))
    run(director, 112.5)
    const before = director.frame(frameArgs(0)).camera
    director.toPlayer(() => {})
    const target = angleOf(PLAYER_EYE)
    const gap = Math.atan2(Math.sin(target - angleOf(before)), Math.cos(target - angleOf(before)))
    const mid = director.frame(frameArgs(0.6, PLAYER_EYE)).camera
    const moved = Math.atan2(Math.sin(angleOf(mid) - angleOf(before)), Math.cos(angleOf(mid) - angleOf(before)))
    expect(Math.sign(moved)).toBe(Math.sign(gap))
    expect(Math.abs(moved)).toBeLessThan(Math.abs(gap) + 1e-9)
  })

  it('starts from the last applied pose when a glide begins mid-glide', () => {
    const director = createStartDirector()
    run(director, 30)
    director.toPlayer(() => {})
    const midGlide = run(director, 1).camera
    director.toOrbit()
    const next = director.frame(frameArgs(0.0001)).camera
    expect(next.x).toBeCloseTo(midGlide.x, 1)
    expect(next.y).toBeCloseTo(midGlide.y, 1)
    expect(next.z).toBeCloseTo(midGlide.z, 1)
  })

  it('ignores a second toPlayer while gliding in or in player mode', () => {
    const director = createStartDirector()
    run(director, 1)
    const first = vi.fn()
    const second = vi.fn()
    director.toPlayer(first)
    director.toPlayer(second)
    run(director, 4)
    director.toPlayer(second)
    run(director, 4)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('glides back and lands on the live orbit pose', () => {
    const director = createStartDirector()
    run(director, 1)
    director.toPlayer(() => {})
    run(director, 4)
    director.toOrbit()
    expect(director.mode()).toBe('toOrbit')
    run(director, 4)
    expect(director.mode()).toBe('orbit')
    const { camera } = director.frame(frameArgs(0.05))
    expect(radiusOf(camera)).toBeCloseTo(105, 4)
    expect(camera.y).toBeCloseTo(90, 4)
  })

  it('cuts instantly to the player under reduced motion and arrives after 0.25 seconds', () => {
    const director = createStartDirector({ reducedMotion: true })
    director.frame(frameArgs(0.05))
    const onArrive = vi.fn()
    director.toPlayer(onArrive)
    expect(director.frame(frameArgs(0.1))?.camera).toBeUndefined()
    expect(onArrive).not.toHaveBeenCalled()
    director.frame(frameArgs(0.1))
    expect(onArrive).not.toHaveBeenCalled()
    director.frame(frameArgs(0.05))
    expect(onArrive).toHaveBeenCalledTimes(1)
    expect(director.mode()).toBe('player')
  })

  it('cuts straight back to the orbit under reduced motion', () => {
    const director = createStartDirector({ reducedMotion: true })
    director.frame(frameArgs(0.05))
    director.toPlayer(() => {})
    run(director, 0.5)
    director.toOrbit()
    expect(director.mode()).toBe('orbit')
    expect(director.frame(frameArgs(0.05)).camera).toBeDefined()
  })
})
