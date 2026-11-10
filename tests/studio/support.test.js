import { describe, expect, it, vi } from 'vitest'
import { formatClock, msUntilNextMinute } from '@/lib/studio/clock'
import { QUALITY_EVENTS, TIERS, TOP_TIER, nextTier } from '@/lib/studio/quality'
import { MIN_TEXTURE_SIZE, STUDIO_SUPPORT, detectStudioSupport } from '@/lib/studio/webgl'
import { BUILD_QUALITY, StudioManifestError, manifest, validateManifest } from '@/lib/studio/manifest'
import { PLANT_MOTION, WIND_RESPONSE } from '@/lib/studio/motion'

describe('phone clock', () => {
  it('shows hours over minutes, like the render\'s 23 / 33', () => {
    expect(formatClock(new Date(2026, 10, 5, 23, 33))).toEqual({ hours: '23', minutes: '33' })
    expect(formatClock(new Date(2026, 10, 5, 9, 5))).toEqual({ hours: '09', minutes: '05' })
  })

  it('waits until the next minute turns over', () => {
    expect(msUntilNextMinute(new Date(2026, 10, 5, 23, 33, 15, 250))).toBe(44_750)
    expect(msUntilNextMinute(new Date(2026, 10, 5, 23, 33, 0, 0))).toBe(60_000)
  })
})

describe('quality tiers', () => {
  it('steps down on decline, up on incline, and stops at the ends', () => {
    expect(nextTier(TOP_TIER, QUALITY_EVENTS.DECLINE)).toBe(TOP_TIER - 1)
    expect(nextTier(0, QUALITY_EVENTS.DECLINE)).toBe(0)
    expect(nextTier(0, QUALITY_EVENTS.INCLINE)).toBe(1)
    expect(nextTier(TOP_TIER, QUALITY_EVENTS.INCLINE)).toBe(TOP_TIER)
  })

  it('holds the current tier when the monitor cannot settle, instead of dropping to the floor', () => {
    expect(nextTier(TOP_TIER, QUALITY_EVENTS.FALLBACK)).toBe(TOP_TIER)
    expect(nextTier(1, QUALITY_EVENTS.FALLBACK)).toBe(1)
  })

  it('rejects events it does not know', () => {
    expect(() => nextTier(1, 'sideways')).toThrow('Unknown quality event: sideways')
  })

  it('costs less at every lower tier, giving up sharpness only at the lowest', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i - 1].dust).toBeLessThan(TIERS[i].dust)
      expect(TIERS[i - 1].hazeSteps).toBeLessThan(TIERS[i].hazeSteps)
    }
    expect(TIERS.slice(1).every((tier) => tier.dprFactor === 1)).toBe(true)
    expect(TIERS[0].dprFactor).toBeLessThan(1)
  })
})

describe('studio support', () => {
  const canvasWith = (gl) => () => ({ getContext: vi.fn(() => gl) })
  const gl = (maxTextureSize) => {
    const loseContext = vi.fn()
    return {
      MAX_TEXTURE_SIZE: 0x0d33,
      getParameter: () => maxTextureSize,
      getExtension: () => ({ loseContext }),
      loseContext,
    }
  }

  it('needs WebGL 2 on real hardware', () => {
    expect(detectStudioSupport(canvasWith(null))).toBe(STUDIO_SUPPORT.NO_WEBGL2)
  })

  it('needs textures as wide as the plate', () => {
    expect(detectStudioSupport(canvasWith(gl(MIN_TEXTURE_SIZE - 1)))).toBe(STUDIO_SUPPORT.SMALL_TEXTURES)
  })

  it('accepts a capable GPU and releases its test context', () => {
    const context = gl(16384)
    expect(detectStudioSupport(canvasWith(context))).toBe(STUDIO_SUPPORT.OK)
    expect(context.loseContext).toHaveBeenCalled()
  })
})

describe('studio manifest', () => {
  it('accepts the exported manifest', () => {
    expect(validateManifest(manifest)).toBe(manifest)
  })

  it('names what a stale export is missing', () => {
    const { camera, ...withoutCamera } = manifest
    expect(camera).toBeDefined()
    expect(() => validateManifest(withoutCamera)).toThrow(new StudioManifestError('studio manifest is missing: camera'))
  })

  // Fails on purpose while a draft is live, so a draft can't be committed by accident
  it('ships a final build, not a draft (run tools/studio/build.sh final)', () => {
    expect(manifest.quality).toBe(BUILD_QUALITY.FINAL)
  })

  it('rejects a quality the build script never writes', () => {
    expect(() => validateManifest({ ...manifest, quality: 'preview' })).toThrow(
      new StudioManifestError("studio manifest has an unknown quality 'preview'"),
    )
  })

  it('rejects figure bones listed before their parent', () => {
    const bones = [
      { name: 'root', parent: -1, pivot: [0, 0, 0] },
      { name: 'finger', parent: 2, pivot: [0, 0, 0] },
      { name: 'hand', parent: 0, pivot: [0, 0, 0] },
    ]
    expect(() => validateManifest({ ...manifest, figure: { bones } })).toThrow(StudioManifestError)
  })

  it('rejects armrest rests that are missing a side', () => {
    const figure = { bones: [{ name: 'root', parent: -1, pivot: [0, 0, 0] }], rests: { L: [0, 0, 0] } }
    expect(() => validateManifest({ ...manifest, figure })).toThrow(new StudioManifestError('studio manifest figure rests need a wrist point for each side'))
  })

  it('rejects a mouse that is not one point', () => {
    const figure = { bones: [{ name: 'root', parent: -1, pivot: [0, 0, 0] }], mouse: [0, 0.8] }
    expect(() => validateManifest({ ...manifest, figure })).toThrow(new StudioManifestError('studio manifest figure mouse needs one point: the top of the mouse'))
  })

  it('rejects a key pitch that is not two distances', () => {
    const figure = { bones: [{ name: 'root', parent: -1, pivot: [0, 0, 0] }], keyPitch: [0.02] }
    expect(() => validateManifest({ ...manifest, figure })).toThrow(new StudioManifestError('studio manifest figure keyPitch needs two distances: across and between rows'))
  })

  it('rejects room facts for his night that are not points: the desk edge, the synths, his skull', () => {
    const root = [{ name: 'root', parent: -1, pivot: [0, 0, 0] }]
    expect(() => validateManifest({ ...manifest, figure: { bones: root, desk: { edge: [[0, 0, 0]] } } })).toThrow(
      new StudioManifestError('studio manifest figure desk needs its front edge as two points'),
    )
    expect(() => validateManifest({ ...manifest, figure: { bones: root, synth: { seat: [0, 0, 0], keys: [[0, 0, 0]], upper: [0, 0, 0] } } })).toThrow(
      new StudioManifestError('studio manifest figure synth needs a seat, a key line (two points) and an upper reach point'),
    )
    expect(() => validateManifest({ ...manifest, figure: { bones: root, headphones: { centre: [0, 0, 0], radii: [0.1], colour: [0, 0, 0] } } })).toThrow(
      new StudioManifestError('studio manifest figure headphones need his skull centre, its half-sizes and a colour'),
    )
  })

  it('has the room facts and layers his night needs', () => {
    const names = manifest.figure.bones.map((b) => b.name)
    for (const bone of ['phones', 'chair', 'guitar', 'thigh_L', 'shin_R', 'foot_L', 'toe_R']) expect(names).toContain(bone)
    expect(manifest.figure.bones.length * 4 + 25).toBeLessThanOrEqual(256) // the bones fit WebGL2's guaranteed uniforms
    for (const key of ['desk', 'synth', 'headphones', 'guitar']) expect(manifest.figure[key]).toBeTruthy()
    for (const delta of ['figure', 'body', 'guitar', 'screen']) expect(manifest.deltas[delta]).toBeTruthy()
    for (const layer of ['f', 'g']) expect(manifest.plantLayers[layer]).toBeTruthy() // the empty chair
    // Synth A's keys, pressed as he plays: the key map, a pressed render per group, a footprint per key
    for (const delta of ['keysA', 'keysB', 'keysBlack']) expect(manifest.deltas[delta]).toBeTruthy()
    expect(manifest.keys.count).toBe(manifest.figure.synthKeys.length)
    expect(manifest.figure.synthKeys.filter((k) => k.black)).toHaveLength(27)
    expect(manifest.light.probes.valid.filter(Boolean).length).toBeGreaterThan(200)
  })

  it('rejects synth keys without a footprint, and a key map without its rect', () => {
    const root = [{ name: 'root', parent: -1, pivot: [0, 0, 0] }]
    expect(() => validateManifest({ ...manifest, figure: { bones: root, synthKeys: [{ back: [0, 0, 0], front: [0, 0], half: 0.01 }] } })).toThrow(
      new StudioManifestError('studio manifest figure synthKeys need, per key (64 at most), its back and front points and a half width'),
    )
    expect(() => validateManifest({ ...manifest, keys: { file: 'keys.webp', count: 63 } })).toThrow(
      new StudioManifestError('studio manifest keys need their map file, its rect on the plate and a key count (64 at most)'),
    )
  })

  it('rejects live-light data that does not match its grid', () => {
    const { probes } = manifest.light
    const short = { ...manifest, light: { ...manifest.light, probes: { ...probes, cube: probes.cube.slice(0, 18) } } }
    expect(() => validateManifest(short)).toThrow(new StudioManifestError('studio manifest light probes need six colours and a valid flag per grid cell'))
    const noLut = { ...manifest, light: { probes, lut: { size: 33 } } }
    expect(() => validateManifest(noLut)).toThrow(new StudioManifestError('studio manifest light lut needs a size and its log2 range'))
  })

  it('rejects a packed layer that points outside its atlas', () => {
    const broken = { ...manifest, deltas: { moon: { rect: [0, 0, 1, 1], pos: { atlasRect: [0, 0, 1.2, 1] }, neg: { atlasRect: [0, 0, 1, 1] } } } }
    expect(() => validateManifest(broken)).toThrow(StudioManifestError)
  })

  it('has motion for every plant the export knows, in a place the wind reaches', () => {
    for (const { name } of manifest.plants) {
      expect(PLANT_MOTION[name], name).toBeDefined()
      expect(WIND_RESPONSE[PLANT_MOTION[name].place], name).toBeDefined()
    }
  })
})
