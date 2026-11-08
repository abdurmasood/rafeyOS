import { useCallback, useEffect, useRef } from 'react'
import { usePlaySound } from '@/components/ui/sensory-ui/config/use-play-sound'

const TICK = 'interaction.subtle'
// A rising tonal pop: interaction.tap is the same short noise click as the tick, only 200 Hz apart
const CLICK = 'navigation.tab'

/**
 * The dock's sounds: a soft tick each time a different icon becomes the hovered one, by pointer or keyboard (touch
 * never hovers), and a pop when any of its buttons is clicked. Returns the click handler for the dock itself.
 */
export const useDockSounds = (hot) => {
  const { play: tick } = usePlaySound({ sound: TICK })
  const { play: click } = usePlaySound({ sound: CLICK })
  // tick changes with the volume, and a volume change under a resting pointer must not tick again
  const ticked = useRef(null)
  useEffect(() => {
    if (hot && hot !== ticked.current) tick()
    ticked.current = hot
  }, [hot, tick])
  // One handler for every dock button; the separator and the gaps between icons stay silent
  return useCallback((event) => event.target.closest('button') && click(), [click])
}
