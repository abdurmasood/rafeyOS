// Terminal output is structured data rendered by React: no HTML strings, no innerHTML.

export const LINE_TYPES = Object.freeze({
  PRE: 'pre',
  ERROR: 'error',
  DIM: 'dim',
  LINK: 'link',
  LS: 'ls',
  PROMPT: 'prompt',
  PANEL: 'panel',
  FETCH: 'fetch',
})

export const ENTRY_KINDS = Object.freeze({ DIR: 'dir', LINK: 'link', FILE: 'file' })

/** @typedef {ReturnType<typeof pre | typeof error | typeof dim | typeof link | typeof ls | typeof prompt | typeof panel | typeof fetchLine>} Line */

export const pre = (text) => ({ type: LINE_TYPES.PRE, text })
export const error = (text) => ({ type: LINE_TYPES.ERROR, text })
export const dim = (text) => ({ type: LINE_TYPES.DIM, text })
export const link = (text, href) => ({ type: LINE_TYPES.LINK, text, href })

/** @param {{ name: string, kind: 'dir'|'link'|'file' }[]} entries */
export const ls = (entries) => ({ type: LINE_TYPES.LS, entries: entries.map((entry) => ({ ...entry })) })

/** The echoed `visitor@rafey.ai:<cwd>$ <cmd>` row; exec() never emits it, the UI does. */
export const prompt = (cwd, cmd) => ({ type: LINE_TYPES.PROMPT, cwd, cmd })

/** Panels both terminals draw; the homepage has more of its own (HOME_PANELS). */
export const PANEL_KINDS = Object.freeze({
  NANO: 'nano',
  BLOG_PICKER: 'blog-picker',
  PROJECTS_PICKER: 'projects-picker',
  SKILLS: 'skills',
  SINGULARITY: 'singularity',
})

/**
 * A rich block the terminal draws itself (a project card, a player). It is screen-only, so it never reaches a pipe or
 * file. A `foreground` panel takes the keyboard until it closes.
 * @param {string} kind
 * @param {Record<string, unknown>} props
 * @param {{ foreground?: boolean }} [options]
 */
export const panel = (kind, props, { foreground = false } = {}) => ({ type: LINE_TYPES.PANEL, kind, props, foreground })

/**
 * neofetch's block: a logo beside a title, its dashed rule and `label: value` rows. The terminals colour the logo and
 * labels; fetchRows lays it out the same way for both and for plain text.
 * @param {readonly string[]} logo
 * @param {string} title
 * @param {{ label: string, value: string }[]} rows
 */
export const fetchLine = (logo, title, rows) => ({ type: LINE_TYPES.FETCH, logo: [...logo], title, rows: rows.map((row) => ({ ...row })) })

// Spaces between the widest logo line and the text beside it, as neofetch leaves them
const FETCH_GAP = 4

/**
 * One entry per printed row: the logo's part padded to one width, then a label (absent on the title and rule) and text.
 * @param {ReturnType<typeof fetchLine>} line
 * @returns {{ logo: string, label?: string, text: string }[]}
 */
export const fetchRows = ({ logo, title, rows }) => {
  const width = Math.max(...logo.map((part) => part.length)) + FETCH_GAP
  const beside = [{ text: title }, { text: '-'.repeat(title.length) }, ...rows.map(({ label, value }) => ({ label, text: value }))]
  return Array.from({ length: Math.max(logo.length, beside.length) }, (_, index) => ({
    logo: (logo[index] ?? '').padEnd(width),
    ...(beside[index] ?? { text: '' }),
  }))
}
