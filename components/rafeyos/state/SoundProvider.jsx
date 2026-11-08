// UI sounds (sensory-ui) for the whole session, at the system volume: the Quick Settings slider covers them too
import { SensoryUIProvider } from '@/components/ui/sensory-ui/config/provider'
import { useSettings } from './logic/contexts'

// sensory-ui's own default level, so 100% system volume sounds as sensory-ui intends
const SOUND_LEVEL = 0.35

export const SoundProvider = ({ children }) => {
  const { volume } = useSettings()
  // Reduced motion is about movement, so sounds stay on; sensory-ui would otherwise mute them for it
  const config = { volume: (SOUND_LEVEL * volume) / 100, reducedMotion: 'force-on' }
  return <SensoryUIProvider config={config}>{children}</SensoryUIProvider>
}
