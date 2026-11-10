// The hearts over the hotbar's left end, the air bubbles over its right while the head is under water, and the red
// flash when the player is hurt
import { useEffect, useRef, useState } from 'react'
import { BUBBLE_ICON, HEART_ICON, heartStates } from './logic/life/pixelIcons'
import { MAX_AIR, MAX_HEALTH } from './logic/life/vitals'

const HURT_SHOWN_FOR = 450
const HEARTS = MAX_HEALTH / 2
const BUBBLES = MAX_AIR / 2

/** @param {{ size: { width: number, height: number }, layers: Array<{ fill: string, opacity: number, d: string }> }} props */
const PixelIcon = ({ size, layers }) => (
  <svg viewBox={`0 0 ${size.width} ${size.height}`} shapeRendering="crispEdges" aria-hidden="true">
    {layers.map((layer) => <path key={layer.fill} d={layer.d} fill={layer.fill} fillOpacity={layer.opacity} />)}
  </svg>
)

const halves = (count) => (count % 2 === 0 ? String(count / 2) : (count / 2).toFixed(1))

/** True for a moment each time `health` drops. A timer, not an animation: reduced motion turns animations off. */
const useHurtFlash = (health) => {
  const [hurt, setHurt] = useState(false)
  const previous = useRef(health)
  useEffect(() => {
    const dropped = health < previous.current
    previous.current = health
    if (!dropped) return undefined
    setHurt(true)
    const timer = setTimeout(() => setHurt(false), HURT_SHOWN_FOR)
    return () => clearTimeout(timer)
  }, [health])
  return hurt
}

/** @param {{ health?: number, air?: number }} props - in halves; missing means full */
export const Vitals = ({ health = MAX_HEALTH, air = MAX_AIR }) => {
  const hurt = useHurtFlash(health)
  const bubbles = Math.ceil(air / 2)
  return (
    <>
      <div className={hurt ? 'bk-hurt on' : 'bk-hurt'} />
      <div className="bk-stats">
        <div className="bk-hearts" role="img" aria-label={`Health ${halves(health)} of ${HEARTS}`}>
          {heartStates(health, HEARTS).map((state, i) => <PixelIcon key={i} size={HEART_ICON} layers={HEART_ICON[state]} />)}
        </div>
        {air < MAX_AIR && (
          <div className="bk-air" role="img" aria-label={`Air ${bubbles} of ${BUBBLES}`}>
            {Array.from({ length: BUBBLES }, (_, i) => (
              <span key={i} className={i < bubbles ? '' : 'gone'}><PixelIcon size={BUBBLE_ICON} layers={BUBBLE_ICON.layers} /></span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
