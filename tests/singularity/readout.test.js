import { describe, expect, it } from 'vitest'
import { EDGE, MODE, createFlight, enter, stepFlight } from '@/lib/singularity/flight'
import { energyFromRest } from '@/lib/singularity/observer'
import { END, KEY_HINT, TITLE, readoutLine, screenText, statusLine } from '@/lib/singularity/readout'

const hoveringAt = (r) => {
  const flight = createFlight()
  enter(flight)
  return Object.assign(flight, { r, goal: { ...flight.goal, r } })
}
const fallingAt = (r, inside = 0) => Object.assign(hoveringAt(r), { mode: MODE.FALL, energy: energyFromRest(EDGE), inside })
const text = (segments) => segments.map((segment) => segment.text).join('')

describe('the words on screen', () => {
  it('titles the simulation and asks for enter', () => {
    expect(screenText(createFlight())).toEqual({
      line: 'this is a real physics simulation of a black hole.', detail: '', prompt: 'press enter',
    })
    expect(TITLE.prompt).toBe('press enter')
  })

  it('shows no centred screen, and a readout, while flying', () => {
    expect(screenText(hoveringAt(17))).toBeNull()
    expect(screenText(fallingAt(0.5))).toBeNull()
    expect(readoutLine(createFlight())).toBe('')
  })

  it('reads out the distance and the clock while hovering', () => {
    expect(readoutLine(hoveringAt(17))).toBe('17.0 radii from the centre   your clock runs at 97% of a distant one')
    expect(readoutLine(hoveringAt(2))).toBe('2.0 radii from the centre   your clock runs at 71% of a distant one')
  })

  it('reads the distance to two decimals under 2 radii', () => {
    expect(readoutLine(hoveringAt(1.999))).toBe('2.00 radii from the centre   your clock runs at 71% of a distant one')
    expect(readoutLine(hoveringAt(1.02))).toBe('1.02 radii from the centre   your clock runs at 14% of a distant one')
  })

  it('says falling down to the edge and inside the edge past it, with the seconds left', () => {
    expect(readoutLine(fallingAt(1.02))).toBe('falling   1.02 radii from the centre   about 68 s left on your clock')
    expect(readoutLine(fallingAt(1))).toMatch(/^falling {3}1\.00 radii from the centre {3}about \d+ s left on your clock$/)
    expect(readoutLine(fallingAt(0.9999))).toMatch(/^inside the edge {3}1\.00 radii from the centre {3}about \d+ s left on your clock$/)
    expect(readoutLine(fallingAt(0.03))).toBe('inside the edge   0.03 radii from the centre   about 0 s left on your clock')
  })

  it('says where the edge is when hovering under 1.6 radii', () => {
    expect(statusLine(hoveringAt(1.6))).toEqual([])
    expect(statusLine(hoveringAt(1.59))).toEqual([{ text: 'the edge is at 1.00. past it, nothing comes back.' }])
    expect(statusLine(hoveringAt(1.59), { outward: true })).toEqual([{ text: 'the edge is at 1.00. past it, nothing comes back.' }])
  })

  it('says the engine has given out while falling toward the edge, whatever is held', () => {
    const line = [{ text: 'this close, the engine cannot hold you. you are falling toward the edge.' }]

    expect(statusLine(fallingAt(1.02))).toEqual(line)
    expect(statusLine(fallingAt(1), { outward: true })).toEqual(line)
  })

  it('says there is no way back for the first 5 seconds inside, then nothing', () => {
    expect(statusLine(fallingAt(0.9999, 0))).toEqual([{ text: 'you are past the edge. there is no way back.' }])
    expect(statusLine(fallingAt(0.7, 4.99))).toEqual([{ text: 'you are past the edge. there is no way back.' }])
    expect(statusLine(fallingAt(0.6, 5))).toEqual([])
  })

  it('says S does nothing while outward is held inside, with S as a key', () => {
    const line = statusLine(fallingAt(0.6, 9), { outward: true })

    expect(line).toEqual([{ text: 'S', key: true }, { text: ' does nothing here. every direction leads to the centre.' }])
    expect(text(statusLine(fallingAt(0.9, 1), { outward: true }))).toBe('S does nothing here. every direction leads to the centre.')
  })

  it('says nothing on the title and end screens', () => {
    expect(statusLine(createFlight())).toEqual([])
    expect(statusLine(Object.assign(fallingAt(0.03), { mode: MODE.END }), { outward: true })).toEqual([])
  })

  it('ends at the centre, with the way out shown after a moment', () => {
    const flight = Object.assign(fallingAt(0.03), { mode: MODE.END, since: 0 })
    expect(screenText(flight)).toEqual({
      line: 'you reached the centre.', detail: 'known physics ends here, and so does the simulation.', prompt: '',
    })
    expect(readoutLine(flight)).toBe('')

    stepFlight(flight, {}, 1.21)
    expect(screenText(flight).prompt).toBe('press enter to exit')
    expect(END.prompt).toBe('press enter to exit')
  })

  it('names the keys in the hint, each as a key cap', () => {
    expect(KEY_HINT.filter((segment) => segment.key).map((segment) => segment.text)).toEqual(['W', 'S', 'A', 'D', '↑', '↓', 'q'])
    expect(text(KEY_HINT)).toBe('WS closer, further   AD around   ↑↓ over the top   q quit')
  })
})
