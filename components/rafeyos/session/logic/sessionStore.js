// Remembers, per tab, that the desktop was reached so a refresh skips the boot splash.
// Storage may be null or throw (private mode, blocked site data); that only costs the skip.

export const SESSION_KEY = 'rafeyos-session'
const DESKTOP_VALUE = 'desktop'

export const rememberDesktop = (storage) => {
  try {
    storage?.setItem(SESSION_KEY, DESKTOP_VALUE)
  } catch {
    // Not remembering is the safe fallback: the next load just boots again
  }
}

export const forgetDesktop = (storage) => {
  try {
    storage?.removeItem(SESSION_KEY)
  } catch {
    // Nothing stored that we can reach, so nothing to forget
  }
}

export const isDesktopRemembered = (storage) => {
  try {
    return storage?.getItem(SESSION_KEY) === DESKTOP_VALUE
  } catch {
    return false
  }
}

// The window the homepage asked for ({app?, path?}), opened once the desktop is up. One read uses it up.
export const HANDOFF_KEY = 'rafeyos-handoff'

/** Keeps `open` for rafeyOS to open; with none, clears an older one so a plain `startx` lands on an empty desktop. */
export const rememberHandoff = (storage, open) => {
  try {
    if (open) storage?.setItem(HANDOFF_KEY, JSON.stringify(open))
    else storage?.removeItem(HANDOFF_KEY)
  } catch {
    // Not remembering only costs the window; rafeyOS still starts
  }
}

const isOptionalString = (value) => value === undefined || typeof value === 'string'

/** The stored value when it names an app or a path (strings), else null. It's tab storage, so anything may be there. */
const parseHandoff = (raw) => {
  try {
    const open = JSON.parse(raw)
    const valid = typeof open === 'object' && open !== null
      && isOptionalString(open.app) && isOptionalString(open.path) && Boolean(open.app || open.path)
    return valid ? { app: open.app, path: open.path } : null
  } catch {
    return null
  }
}

/** The hand-off left by the homepage, or null; it's cleared either way, so it opens at most once. */
export const takeHandoff = (storage) => {
  try {
    const raw = storage?.getItem(HANDOFF_KEY) ?? null
    if (raw === null) return null
    storage.removeItem(HANDOFF_KEY)
    return parseHandoff(raw)
  } catch {
    return null
  }
}
