// @ts-check
import { Suspense, lazy } from 'react'
import { useShellState } from '@/components/rafeyos/state/logic/contexts'
import { HeaderBar } from '@/components/rafeyos/wm/HeaderBar'
import { useWindowChrome } from '@/components/rafeyos/wm/logic/WindowChromeContext'
import { loadBlocks } from '@/lib/loadBlocks'

// The voxel world, loaded on first open so three.js stays out of the OS chunk
const BlocksScene = lazy(loadBlocks)

/** Blocks: a small voxel world to walk around, break and build in. */
export const BlocksApp = () => {
  const { focused, minimized } = useWindowChrome()
  const { overview, menu, popup, dialog } = useShellState()
  // The keyboard belongs to the shell while it has something open
  const active = focused && !overview && !menu && !popup && !dialog
  return (
    <>
      <HeaderBar title="Blocks" />
      <div className="blocks">
        <Suspense fallback={null}>
          <BlocksScene active={active} paused={minimized} />
        </Suspense>
      </div>
    </>
  )
}
