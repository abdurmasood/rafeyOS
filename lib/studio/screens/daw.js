// The monitor while he makes a beat: a music app's arrange view. Track lanes with clips, a waveform on
// the top track and a playhead sweeping at his tempo. Big blocks of colour, so it reads at page size.
import { hash } from '../wind'

const COLOURS = Object.freeze({
  background: '#141823',
  lane: '#1b2130',
  laneAlt: '#181d2a',
  header: '#232a3b',
  grid: '#262e42',
  playhead: '#f2f4f8',
  wave: '#e9a55c',
})
const CLIP_COLOURS = Object.freeze(['#e9a55c', '#d0524a', '#6a8fe6', '#49b38d', '#b07be0', '#e3c25b'])
const TRACKS = 6
const HEADER_H = 26
const NAME_W = 70
const BARS_SHOWN = 8

/** Clips on a track: which bars hold something, the same for a given track every time. */
const clipsFor = (track, bars) => {
  const clips = []
  let bar = 0
  while (bar < bars) {
    const length = 1 + Math.floor(hash(track * 13.1 + bar * 3.7) * 3)
    if (hash(track * 7.3 + bar * 1.9) < 0.72) clips.push({ bar, length: Math.min(length, bars - bar) })
    bar += length
  }
  return clips
}

/**
 * @param {CanvasRenderingContext2D} context
 * @param {{ width: number, height: number, beats: number }} view  beats: how many beats have played
 */
export const drawDaw = (context, { width, height, beats }) => {
  context.fillStyle = COLOURS.background
  context.fillRect(0, 0, width, height)
  context.fillStyle = COLOURS.header
  context.fillRect(0, 0, width, HEADER_H)
  const laneH = (height - HEADER_H) / TRACKS
  const barW = (width - NAME_W) / BARS_SHOWN
  for (let track = 0; track < TRACKS; track++) {
    const y = HEADER_H + track * laneH
    context.fillStyle = track % 2 ? COLOURS.laneAlt : COLOURS.lane
    context.fillRect(0, y, width, laneH)
    context.fillStyle = CLIP_COLOURS[track % CLIP_COLOURS.length]
    context.fillRect(8, y + laneH * 0.3, NAME_W - 20, laneH * 0.4)
    for (const { bar, length } of clipsFor(track, BARS_SHOWN)) {
      context.globalAlpha = 0.85
      context.fillRect(NAME_W + bar * barW + 2, y + 4, length * barW - 4, laneH - 8)
      context.globalAlpha = 1
    }
  }
  // the top track's audio, drawn over its clips
  context.strokeStyle = COLOURS.background
  context.lineWidth = 2
  context.beginPath()
  const mid = HEADER_H + laneH / 2
  for (let x = NAME_W; x < width; x += 3) {
    const level = 0.25 + 0.75 * Math.abs(Math.sin(x * 0.13) * hash(Math.floor(x / 6)))
    context.moveTo(x, mid - (laneH / 2 - 6) * level)
    context.lineTo(x, mid + (laneH / 2 - 6) * level)
  }
  context.stroke()
  context.fillStyle = COLOURS.grid
  for (let bar = 1; bar < BARS_SHOWN; bar++) context.fillRect(NAME_W + bar * barW, HEADER_H, 1, height - HEADER_H)
  const playX = NAME_W + ((beats / 4) % BARS_SHOWN) * barW
  context.fillStyle = COLOURS.playhead
  context.fillRect(playX, 0, 3, height)
  context.fillStyle = COLOURS.wave
  context.fillRect(12, 8, 10, 10) // record light
}
