import { describe, it, expect } from 'vitest'
import { HELP_LINES, HELP_HINT, HOME_HELP_LINES, STARTX_HELP_LINE, helpRow } from '@/lib/help.js'

const HINT_TEXT = "<span class='grey'>Use ↑ for history, tab to autocomplete, 'clear' to reset.</span>"

// The home terminal's help: content commands, then the programs. Music stays out; typing it still works
const HOME_HELP = [
  'Available commands:',
  '',
  '  bio          biography',
  '  skills       toolkit',
  '  projects     body of work',
  '  blog         thoughts',
  '  contact      get in touch',
  '',
  'Programs:',
  '',
  '  singularity  black hole simulation',
  '  startx       start the desktop',
  '',
  HINT_TEXT,
].join('\n')
// rafeyOS's own terminal leaves startx out: the desktop is already running
const RAFEYOS_HELP = HOME_HELP.split('\n').filter((line) => !line.includes('startx')).join('\n')

/** The command name each row lists, in order. */
const listedNames = (lines) => lines.filter((line) => line.startsWith('  ')).map((line) => line.trim().split(/\s+/)[0])

describe('help text', () => {
  it('renders the home help block: commands, then programs ending with startx, then the hint', () => {
    expect([...HOME_HELP_LINES, HELP_HINT].join('\n')).toBe(HOME_HELP)
  })

  it('renders the rafeyOS help block with singularity as the only program', () => {
    expect([...HELP_LINES, HELP_HINT].join('\n')).toBe(RAFEYOS_HELP)
  })

  it('keeps the hint dim', () => {
    expect(HELP_HINT).toBe(HINT_TEXT)
  })

  it('lists startx on home only, and never os or rafeyos', () => {
    expect(listedNames(HOME_HELP_LINES)).toEqual(['bio', 'skills', 'projects', 'blog', 'contact', 'singularity', 'startx'])
    expect(listedNames(HELP_LINES)).toEqual(['bio', 'skills', 'projects', 'blog', 'contact', 'singularity'])
  })

  it('keeps music out of both lists', () => {
    expect(HELP_LINES.join('\n')).not.toContain('music')
    expect(HOME_HELP_LINES.join('\n')).not.toContain('music')
  })

  it('aligns the startx row with the existing description column', () => {
    const contactRow = HELP_LINES.find((line) => line.includes('contact'))
    const column = contactRow.indexOf('get in touch')

    expect(STARTX_HELP_LINE).toBe('  startx       start the desktop')
    expect(STARTX_HELP_LINE.indexOf('start the desktop')).toBe(column)
  })

  it('adds startx to the home list as the last program row, before the blank line', () => {
    expect(HOME_HELP_LINES.at(-2)).toBe(STARTX_HELP_LINE)
    expect(HOME_HELP_LINES.at(-1)).toBe('')
    expect(HELP_LINES).not.toContain(STARTX_HELP_LINE)
  })

  it('pads every command name to the same column', () => {
    expect(helpRow('x', 'y').indexOf('y')).toBe(helpRow('contact', 'y').indexOf('y'))
  })
})
