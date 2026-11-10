// @ts-check
import { Suspense, lazy, useState } from 'react'
import { APP } from '@/components/rafeyos/core/catalog/apps'
import { useMusic, useWindowsState } from '@/components/rafeyos/state/logic/contexts'
import { windowsForApp } from '@/components/rafeyos/state/logic/selectors'
import { HeaderBar } from '@/components/rafeyos/wm/HeaderBar'
import { useWindowChrome } from '@/components/rafeyos/wm/logic/WindowChromeContext'
import { loadStudio } from '@/lib/loadStudio'
import { ACTIVITY_LABEL } from '@/lib/studio/moods'

// The live night room, loaded on first open so three.js stays out of the OS chunk
const StudioRoom = lazy(() => loadStudio().then((Studio) => ({ default: Studio })))

/**
 * The "Rafey" app: his night room, live, in one window. The title bar says what he's doing; music playing
 * and an open Minecraft window nudge him toward the synths or a game. It stops drawing while minimized.
 */
export const StudioApp = () => {
  const { minimized } = useWindowChrome()
  const { playing } = useMusic()
  const minecraft = windowsForApp(useWindowsState(), APP.MINECRAFT).some((win) => !win.minimized)
  const [activity, setActivity] = useState(/** @type {string | null} */ (null))
  return (
    <>
      <HeaderBar title="Rafey" subtitle={activity ? /** @type {Record<string, string>} */ (ACTIVITY_LABEL)[activity] : undefined} />
      <div className="studio-app">
        <Suspense fallback={null}>
          <StudioRoom paused={minimized} onActivity={setActivity} music={playing} minecraft={minecraft} />
        </Suspense>
      </div>
    </>
  )
}
