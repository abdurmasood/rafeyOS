// @ts-check
import { Suspense, lazy } from 'react'
import { HeaderBar } from '@/components/rafeyos/wm/HeaderBar'
import { useWindowChrome } from '@/components/rafeyos/wm/logic/WindowChromeContext'
import { loadStudio } from '@/lib/loadStudio'

// The live night room, loaded on first open so three.js stays out of the OS chunk
const StudioRoom = lazy(() => loadStudio().then((Studio) => ({ default: Studio })))

/** The "Rafey" app: his night room, live, in one window. It stops drawing while minimized. */
export const StudioApp = () => {
  const { minimized } = useWindowChrome()
  return (
    <>
      <HeaderBar title="Rafey" />
      <div className="studio-app">
        <Suspense fallback={null}>
          <StudioRoom paused={minimized} />
        </Suspense>
      </div>
    </>
  )
}
