import { useCallback } from 'react'
import { SessionDispatchContext, useServices, useSettings } from '@/components/rafeyos/state/logic/contexts'
import { SESSION_EVENTS, SESSION_STATES } from '@/components/rafeyos/state/logic/sessionMachine'
import { useSession } from './logic/useSession'
import { BootSplash } from './BootSplash'
import { LockScreen, SuspendScreen } from './SessionScreens'
import { DesktopProvider } from '@/components/rafeyos/session/DesktopProvider'
import { HandoffOpener } from './HandoffOpener'
import { SettingsProvider } from '@/components/rafeyos/state/SettingsProvider'
import { SoundProvider } from '@/components/rafeyos/state/SoundProvider'
import { Desktop } from '@/components/rafeyos/shell/Desktop'

const GoneScreen = () => <div className="rafeyos-boot" aria-hidden="true" />

/** Lock and suspend sit over the desktop; its state stays mounted below them. */
const useOverlay = (state, dispatch) => {
  const unlock = useCallback(() => dispatch(SESSION_EVENTS.UNLOCK), [dispatch])
  const wake = useCallback(() => dispatch(SESSION_EVENTS.WAKE), [dispatch])
  if (state === SESSION_STATES.LOCK) return <LockScreen onUnlock={unlock} />
  if (state === SESSION_STATES.SUSPENDED) return <SuspendScreen onWake={wake} />
  return null
}

/** Boot splash, then the desktop. The desktop's state lives below, so leaving or restarting resets it. */
const SessionScreens = () => {
  const services = useServices()
  const { accent } = useSettings()
  const { state, dispatch } = useSession(services)
  const overlay = useOverlay(state, dispatch)
  if (state === SESSION_STATES.BOOT) return <BootSplash accent={accent} onSkip={() => dispatch(SESSION_EVENTS.SKIP)} />
  if (state === SESSION_STATES.EXITED) return <GoneScreen />
  return (
    <SessionDispatchContext.Provider value={dispatch}>
      <DesktopProvider>
        <HandoffOpener />
        <Desktop overlay={overlay} active={state === SESSION_STATES.DESKTOP} />
      </DesktopProvider>
    </SessionDispatchContext.Provider>
  )
}

/** Settings sit above the session, so a restart keeps them (and the boot splash shows the accent). */
export const SessionGate = () => (
  <SettingsProvider>
    <SoundProvider>
      <SessionScreens />
    </SoundProvider>
  </SettingsProvider>
)
