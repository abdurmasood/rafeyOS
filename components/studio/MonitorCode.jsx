import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferAttribute, BufferGeometry, CanvasTexture, NoColorSpace, Vector3 } from 'three'
import { TOKEN, lineStarts, tokenizeLine } from '@/lib/studio/code'

const CANVAS_W = 640 // the screen's 0.684 x 0.376 m, at about a pixel per millimetre
const CANVAS_H = 352
const LIFT = 0.001 // m off the screen, so it never z-fights with the room
// Big enough that, at page size, each line still reads as a coloured stroke of code
const FONT = '15px ui-monospace, Menlo, monospace'
const TAB_H = 22
const LINE_H = 20
const GUTTER_W = 44
const PAD = 8
const VISIBLE_LINES = Math.floor((CANVAS_H - TAB_H - PAD) / LINE_H)
const BLINK_S = 0.53
const FILE_NAME = 'room.glsl'
// Display-space colours (the canvas is `flat linear`): a navy editor theme, near the blue glow
// the render's wallpaper casts on the wall, so the screen still looks lit
const COLOURS = Object.freeze({
  background: '#18213a',
  tab: '#212c4a',
  tabText: '#9aa4bd',
  gutter: '#4e5a78',
  cursor: '#82aaff',
  [TOKEN.PLAIN]: '#bec5d4',
  [TOKEN.KEYWORD]: '#c792ea',
  [TOKEN.TYPE]: '#82aaff',
  [TOKEN.NUMBER]: '#f78c6c',
  [TOKEN.COMMENT]: '#636d83',
  [TOKEN.DIRECTIVE]: '#89ddff',
  [TOKEN.CALL]: '#ffcb6b',
})

/** A quad over the screen, from its bottom-left, bottom-right and top-left corners. */
const screenQuad = ([bottomLeft, bottomRight, topLeft]) => {
  const origin = new Vector3(...bottomLeft)
  const across = new Vector3(...bottomRight).sub(origin)
  const up = new Vector3(...topLeft).sub(origin)
  const lift = new Vector3().crossVectors(across, up).normalize().multiplyScalar(LIFT)
  const corners = [origin.clone(), origin.clone().add(across), origin.clone().add(up), origin.clone().add(across).add(up)]
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(corners.flatMap((c) => c.add(lift).toArray())), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2))
  geometry.setIndex([0, 1, 2, 2, 1, 3])
  return geometry
}

/** The line holding character `typed`: the last line that starts at or before it. */
const cursorLineOf = (starts, typed) => {
  let line = 0
  while (line + 1 < starts.length && starts[line + 1] <= typed) line++
  return line
}

const drawEditor = (context, { lines, starts, typed, extra, cursorOn }) => {
  context.fillStyle = COLOURS.background
  context.fillRect(0, 0, CANVAS_W, CANVAS_H)
  context.fillStyle = COLOURS.tab
  context.fillRect(0, 0, CANVAS_W, TAB_H)
  context.font = FONT
  context.textBaseline = 'middle'
  context.fillStyle = COLOURS.tabText
  context.fillText(FILE_NAME, PAD, TAB_H / 2)
  const charW = context.measureText('M').width
  const cursorLine = cursorLineOf(starts, typed)
  const first = Math.max(0, cursorLine - VISIBLE_LINES + 1)
  for (let line = first; line <= cursorLine; line++) {
    const y = TAB_H + PAD + (line - first) * LINE_H + LINE_H / 2
    context.textAlign = 'right'
    context.fillStyle = COLOURS.gutter
    context.fillText(String(line + 1), GUTTER_W - 10, y)
    context.textAlign = 'left'
    let budget = line === cursorLine ? typed - starts[line] : Infinity
    let column = 0
    for (const { text, kind } of lines[line]) {
      if (budget <= 0) break
      const shown = text.slice(0, budget)
      context.fillStyle = COLOURS[kind]
      context.fillText(shown, GUTTER_W + column * charW, y)
      column += shown.length
      budget -= shown.length
    }
    if (line === cursorLine && extra) {
      // a slip he hasn't noticed yet, about to be backspaced away
      context.fillStyle = COLOURS[TOKEN.PLAIN]
      context.fillText(extra, GUTTER_W + column * charW, y)
      column += extra.length
    }
    if (line === cursorLine && cursorOn) {
      context.fillStyle = COLOURS.cursor
      context.fillRect(GUTTER_W + column * charW + 1, y - LINE_H / 2 + 2, 2, LINE_H - 4)
    }
  }
}

/** The monitor, typing out the room's own shader in step with his fingers. */
export function MonitorCode({ monitor, timeline, reducedMotion, at = null }) {
  const { texture, geometry, lines, starts } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const map = new CanvasTexture(canvas)
    map.colorSpace = NoColorSpace
    return {
      texture: map,
      geometry: screenQuad(monitor.corners),
      lines: timeline.text.split('\n').map(tokenizeLine),
      starts: lineStarts(timeline.text),
    }
  }, [monitor, timeline])
  const shown = useRef({ typed: -1, extra: '', cursorOn: false })

  useEffect(
    () => () => {
      texture.dispose()
      geometry.dispose()
    },
    [texture, geometry],
  )

  // Default priority: runs before the studio's own loop renders the frame
  useFrame((state) => {
    const time = at ?? state.clock.elapsedTime
    const { typed, extra } = reducedMotion ? { typed: timeline.text.length, extra: '' } : timeline.at(time)
    const cursorOn = reducedMotion || Math.floor(time / BLINK_S) % 2 === 0
    const last = shown.current
    if (typed === last.typed && extra === last.extra && cursorOn === last.cursorOn) return
    shown.current = { typed, extra, cursorOn }
    drawEditor(texture.image.getContext('2d'), { lines, starts, typed, extra, cursorOn })
    texture.needsUpdate = true
  })

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}
