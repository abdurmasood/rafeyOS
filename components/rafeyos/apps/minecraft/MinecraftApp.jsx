// @ts-check
import { Suspense, lazy } from 'react'
import { useShellState } from '@/components/rafeyos/state/logic/contexts'
import { HeaderBar } from '@/components/rafeyos/wm/HeaderBar'
import { useWindowChrome } from '@/components/rafeyos/wm/logic/WindowChromeContext'
import { loadMinecraft } from '@/lib/loadMinecraft'

// The voxel world, loaded on first open so three.js stays out of the OS chunk
const MinecraftScene = lazy(loadMinecraft)

/** Minecraft: a 512 × 512 block voxel world to walk around, break and build in. */
export const MinecraftApp = () => {
  const { focused, minimized } = useWindowChrome()
  const { overview, menu, popup, dialog } = useShellState()
  // The keyboard belongs to the shell while it has something open
  const active = focused && !overview && !menu && !popup && !dialog
  return (
    <>
      <HeaderBar title="Minecraft" />
      <div className="minecraft">
        <Suspense fallback={null}>
          <MinecraftScene active={active} paused={minimized} />
        </Suspense>
      </div>
    </>
  )
}
