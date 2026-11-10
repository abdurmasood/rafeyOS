import { useEffect, useRef } from 'react'
import { isImplemented } from '@/components/rafeyos/core/catalog/apps'
import { useServices, useWindowManager } from '@/components/rafeyos/state/logic/contexts'
import { takeHandoff } from './logic/sessionStore'

/** The app a link asks for with `/os?app=<id>` (e.g. `/os?app=studio&at=45`), if rafeyOS has it. */
const linkedApp = (search) => {
  const id = new URLSearchParams(search).get('app')
  return id && isImplemented(id) ? id : null
}

/**
 * Opens the window a homepage command asked for (`nautilus ~`, `xdg-open bio.txt`), or the app a link names,
 * once the desktop is up. In an effect, since strict mode runs render twice; taking the hand-off clears it,
 * and the link is followed once.
 */
export const HandoffOpener = () => {
  const { storage } = useServices()
  const windowManager = useWindowManager()
  const followedLink = useRef(false)
  useEffect(() => {
    const open = takeHandoff(storage)
    if (open?.app) windowManager.openApp(open.app, { path: open.path })
    else if (open) windowManager.openPath(open.path)
    const linked = followedLink.current ? null : linkedApp(window.location.search)
    followedLink.current = true
    if (linked) windowManager.openApp(linked)
  }, [storage, windowManager])
  return null
}
