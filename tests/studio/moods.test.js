import { describe, expect, it } from 'vitest'
import { roomFragment } from '@/components/studio/shaders/room.glsl'
import { lineStarts, normaliseSource } from '@/lib/studio/code'
import { ACTIVITY, ACTIVITY_LABEL, NIGHT, NUDGE, planNight } from '@/lib/studio/moods'
import { createTypingTimeline } from '@/lib/studio/typing'

const CODE = normaliseSource(roomFragment)
const timelineFor = (seed, line = 12) => createTypingTimeline(CODE, { seed, startAt: lineStarts(CODE)[line] })
const reference = timelineFor(7)
const HOUR = 3600

describe('his night', () => {
  it('is the same night for the same session', () => {
    const a = planNight({ seed: 11, timeline: timelineFor(11) })
    const b = planNight({ seed: 11, timeline: timelineFor(11) })
    expect(a.blocks).toEqual(b.blocks)
  })

  it('is mostly code: between 60% and 70% of three hours, across many visits', () => {
    let code = 0
    let total = 0
    for (let seed = 1; seed <= 50; seed++) {
      for (const block of planNight({ seed, timeline: timelineFor(seed, 20) }).blocks) {
        const seen = Math.max(0, Math.min(3 * HOUR, block.end) - Math.max(0, block.start))
        total += seen
        if (block.activity === ACTIVITY.CODE) code += seen
      }
    }
    expect(code / total).toBeGreaterThan(0.6)
    expect(code / total).toBeLessThan(0.7)
  })

  it('does all three other things in an evening', () => {
    const night = planNight({ seed: 3, timeline: timelineFor(3) })
    const done = new Set(night.blocks.filter((b) => b.start < 2 * HOUR).map((b) => b.activity))
    expect([...done].sort()).toEqual(Object.values(ACTIVITY).sort())
  })

  it('only gets up in a pause in his typing, never mid-word', () => {
    const night = planNight({ seed: 5, timeline: timelineFor(5) })
    const away = night.blocks.filter((b) => b.activity !== ACTIVITY.CODE && b.start > 0)
    expect(away.length).toBeGreaterThan(3)
    for (const block of away) {
      const { pause } = timelineFor(5).at(block.codeStart)
      expect(pause.length).toBeGreaterThanOrEqual(NIGHT.leavePause)
      expect(pause.since).toBeCloseTo(NIGHT.leaveAfter, 5)
    }
  })

  it('leaves the code where it was while he is away, and picks it up again', () => {
    const night = planNight({ seed: 9, timeline: timelineFor(9) })
    let previous = { code: night.codeTimeAt(0), index: night.activityAt(0).index }
    for (let t = 1; t < 2 * HOUR; t += 1) {
      const now = { code: night.codeTimeAt(t), index: night.activityAt(t).index }
      const { activity } = night.activityAt(t)
      if (now.index !== previous.index) expect(now.code).toBeGreaterThanOrEqual(previous.code)
      else if (activity === ACTIVITY.CODE) expect(now.code - previous.code).toBeCloseTo(1, 6)
      else expect(now.code).toBe(previous.code)
      previous = now
    }
  })

  it('opens the reference session (?at=) with five minutes of plain typing, as before moods', () => {
    const night = planNight({ seed: 7, timeline: reference, reference: true })
    expect(night.blocks[0].activity).toBe(ACTIVITY.CODE)
    for (let t = 0; t < 300; t += 0.37) expect(night.codeTimeAt(t)).toBeCloseTo(t, 9)
    expect(night.activityAt(299).activity).toBe(ACTIVITY.CODE)
  })

  it('walks other visitors in partway through a night', () => {
    const starts = new Set()
    for (let seed = 1; seed <= 20; seed++) starts.add(planNight({ seed, timeline: timelineFor(seed) }).activityAt(0).activity)
    expect(starts.size).toBeGreaterThan(1)
  })

  it('can start on any activity, for checking one', () => {
    const night = planNight({ seed: 7, timeline: reference, first: ACTIVITY.BREAK })
    expect(night.activityAt(0)).toMatchObject({ activity: ACTIVITY.BREAK, into: 0 })
  })

  it('heads for the synths within seconds of music starting, and stays while it plays', () => {
    const night = planNight({ seed: 7, timeline: reference, reference: true, nudges: [{ kind: NUDGE.MUSIC, start: 100 }] })
    const beat = night.blocks.find((b) => b.activity === ACTIVITY.BEAT)
    expect(beat.start - 100).toBeGreaterThanOrEqual(0)
    expect(beat.start - 100).toBeLessThan(10)
    expect(beat.reason).toBe(NUDGE.MUSIC)
    expect(beat.end - beat.start).toBeCloseTo(NIGHT.nudgeCap, 6)
  })

  it('plays a game when Minecraft opens', () => {
    const night = planNight({ seed: 7, timeline: reference, reference: true, nudges: [{ kind: NUDGE.MINECRAFT, start: 200, end: 230 }] })
    const game = night.blocks.find((b) => b.start >= 200)
    expect(game.activity).toBe(ACTIVITY.GAME)
    expect(game.start - 200).toBeLessThan(10)
  })

  it('cuts a break short when music starts, and goes to the synths', () => {
    const night = planNight({ seed: 7, timeline: reference, first: ACTIVITY.BREAK, nudges: [{ kind: NUDGE.MUSIC, start: 30 }] })
    expect(night.blocks[0]).toMatchObject({ activity: ACTIVITY.BREAK })
    expect(night.blocks[0].end).toBeLessThanOrEqual(30 + NIGHT.interrupt)
    expect(night.blocks[1]).toMatchObject({ activity: ACTIVITY.BEAT, reason: NUDGE.MUSIC })
  })

  it('repeats the night once it runs past the plan', () => {
    const night = planNight({ seed: 7, timeline: reference, reference: true })
    expect(night.activityAt(NIGHT.horizon + 12).activity).toBe(night.activityAt(12).activity)
  })

  it('says what he is doing in words the title bar can show', () => {
    expect(Object.keys(ACTIVITY_LABEL).sort()).toEqual(Object.values(ACTIVITY).sort())
    expect(ACTIVITY_LABEL[ACTIVITY.BEAT]).toBe('Making a beat')
  })
})
