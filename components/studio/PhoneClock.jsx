import { useEffect, useMemo } from 'react'
import { AdditiveBlending, CanvasTexture, Matrix4, NoColorSpace, PlaneGeometry } from 'three'
import { formatClock, msUntilNextMinute } from '@/lib/studio/clock'

const CANVAS_W = 64
const CANVAS_H = 128
// The render's Clock Glow (0.9, 0.93, 1.0) after the night grade, in display space
const DIGIT_COLOUR = 'rgb(205 214 235)'
const LIFT = 0.0008 // m off the phone screen, so it never z-fights

const drawTime = (canvas, date) => {
  const context = canvas.getContext('2d')
  const { hours, minutes } = formatClock(date)
  context.clearRect(0, 0, CANVAS_W, CANVAS_H)
  context.fillStyle = DIGIT_COLOUR
  context.font = '600 46px ui-monospace, monospace'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(hours, CANVAS_W / 2, CANVAS_H * 0.27)
  context.fillText(minutes, CANVAS_W / 2, CANVAS_H * 0.73)
}

/** The phone on the desk, showing the visitor's real time where the render said 23:33. */
export function PhoneClock({ clock }) {
  const { texture, geometry, matrix } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_W
    canvas.height = CANVAS_H
    const map = new CanvasTexture(canvas)
    map.colorSpace = NoColorSpace
    const [low, high] = clock.box
    const plane = new PlaneGeometry(high[0] - low[0], high[1] - low[1])
    plane.translate((low[0] + high[0]) / 2, (low[1] + high[1]) / 2, LIFT)
    return { texture: map, geometry: plane, matrix: new Matrix4().fromArray(clock.matrix) }
  }, [clock])

  useEffect(() => {
    let timer
    const tick = () => {
      const now = new Date()
      drawTime(texture.image, now)
      texture.needsUpdate = true
      timer = setTimeout(tick, msUntilNextMinute(now))
    }
    tick()
    return () => {
      clearTimeout(timer)
      texture.dispose()
      geometry.dispose()
    }
  }, [texture, geometry])

  return (
    <mesh geometry={geometry} matrix={matrix} matrixAutoUpdate={false} renderOrder={2} frustumCulled={false}>
      <meshBasicMaterial map={texture} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
    </mesh>
  )
}
