import { describe, it, expect } from 'vitest'
import { HELP_LINES, HELP_HINT, HOME_HELP_LINES, RAFEYOS_HELP_LINE, helpRow } from '@/lib/help.js'

// Copied verbatim from components/home/Terminal.jsx before the extraction (HEAD), plus the studio row
const ORIGINAL_HELP = [
  'Available commands:',
  '',
  '  bio         biography',
  "  skills      toolkit",
  '  projects    body of work',
  "  blog        thoughts",
  '  music       production',
  '  studio      the room, live',
  '  contact     get in touch',
  '',
  "<span class='grey'>Use ↑ for history, tab to autocomplete, 'clear' to reset.</span>",
].join('\n')
// Both terminals now leave music out of help; typing it still works
const ORIGINAL_WITHOUT_MUSIC = ORIGINAL_HELP.split('\n').filter((line) => !line.includes('music'))

describe('help text', () => {
  it('renders the help block the terminal showed before extraction, without music', () => {
    const rendered = [...HELP_LINES, HELP_HINT].join('\n')

    expect(rendered).toBe(ORIGINAL_WITHOUT_MUSIC.join('\n'))
  })

  it('keeps music out of the shared list that rafeyOS itself shows', () => {
    expect(HELP_LINES.join('\n')).not.toContain('music')
  })

  it('aligns the os row with the existing description column', () => {
    const contactRow = HELP_LINES.find((line) => line.includes('contact'))
    const column = contactRow.indexOf('get in touch')

    expect(RAFEYOS_HELP_LINE).toBe('  os          operating system')
    expect(RAFEYOS_HELP_LINE.indexOf('operating system')).toBe(column)
  })

  it('keeps the os row out of the shared list that rafeyOS itself shows', () => {
    expect(HELP_LINES).not.toContain(RAFEYOS_HELP_LINE)
  })

  it('adds os to the home list as the last command row, before the blank line', () => {
    expect(HOME_HELP_LINES.at(-2)).toBe(RAFEYOS_HELP_LINE)
    expect(HOME_HELP_LINES.at(-1)).toBe('')
  })

  it('leaves every other home help row exactly as it was, without music', () => {
    const withoutRafeyos = HOME_HELP_LINES.filter((line) => line !== RAFEYOS_HELP_LINE)

    expect([...withoutRafeyos, HELP_HINT]).toEqual(ORIGINAL_WITHOUT_MUSIC)
    expect(HOME_HELP_LINES.join('\n')).not.toContain('music')
  })

  it('never lists the hidden startx alias', () => {
    expect(HOME_HELP_LINES.join('\n')).not.toContain('startx')
  })

  it('pads every command name to the same column', () => {
    expect(helpRow('x', 'y').indexOf('y')).toBe(helpRow('contact', 'y').indexOf('y'))
  })
})
