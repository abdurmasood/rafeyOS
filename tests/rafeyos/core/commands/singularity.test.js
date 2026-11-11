// singularity: a program that takes the terminal, so it runs only where its output goes straight to the screen
import { describe, expect, it } from 'vitest'
import { COMMANDS, COMPLETION_COMMANDS, exec } from '@/components/rafeyos/core/commands/exec'
import { PANEL_KINDS, error, panel } from '@/components/rafeyos/core/commands/lines'
import { manPage } from '@/components/rafeyos/core/commands/manPages'
import { HOME_COMMANDS } from '@/components/home/shell/homeCommands'
import { buildVfs, SYSTEM_COMMANDS } from '@/components/rafeyos/core/vfs/buildVfs'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { fsStoreOn, memoryStorage } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const base = buildVfs(fixtureContent)
const CWD = '/home/visitor'

/** One line run in a fresh shell, by rafeyOS's commands unless the homepage's are given. */
const run = (raw, commands = COMMANDS) => {
  const fs = createShellFs({ base, store: fsStoreOn(memoryStorage()) })
  return exec(raw, { fs, cwd: CWD, env: { PWD: CWD }, lastCode: 0, content: fixtureContent, commands })
}
const texts = (out) => out.lines.map((line) => line.text)

const REGISTRIES = [['rafeyOS', COMMANDS], ['the homepage', HOME_COMMANDS]]

describe.each(REGISTRIES)('singularity in %s', (_, commands) => {
  it('takes the terminal as a foreground panel', () => {
    expect(run('singularity', commands)).toMatchObject({
      lines: [panel(PANEL_KINDS.SINGULARITY, {}, { foreground: true })],
      effects: [],
      code: 0,
    })
  })

  it('refuses to run into a file or a pipe, where there is no terminal to take', () => {
    expect(run('singularity > out.txt', commands)).toMatchObject({ lines: [error('singularity: needs a terminal')], effects: [], code: 1 })
    // A pipeline ends with its last command's code, as in bash
    expect(run('singularity | cat', commands)).toMatchObject({ lines: [error('singularity: needs a terminal')], effects: [], code: 0 })
  })

  it.each(['now', '-x', '--fast'])('takes no operands or options: %s', (word) => {
    expect(run(`singularity ${word}`, commands)).toMatchObject({
      lines: [error(`singularity: unknown option '${word}'. Usage: singularity`)],
      effects: [],
      code: 1,
    })
  })

  it('--help prints the usage instead of running', () => {
    const out = run('singularity --help', commands)

    expect(texts(out)[0]).toMatch(/^Usage: singularity\n/)
    expect(out.lines.some((line) => line.type === 'panel')).toBe(false)
    expect(out.code).toBe(0)
  })
})

describe('singularity as an installed command', () => {
  it('has a man page that names the keys and what is simplified', () => {
    const page = manPage('singularity')

    expect(page).toContain('singularity - black hole simulation')
    expect(page).toContain('q, Esc        quit')
    expect(page).toContain('Simplified: the hole does not spin')
    expect(texts(run('man singularity')).join('\n')).toContain('singularity - black hole simulation')
  })

  it('is stubbed in /usr/bin and completes from the prompt', () => {
    expect(SYSTEM_COMMANDS).toContain('singularity')
    expect(base['/usr/bin/singularity']).toMatchObject({ type: 'text' })
    expect(texts(run('which singularity'))).toEqual(['/usr/bin/singularity'])
    expect(COMPLETION_COMMANDS).toContain('singularity')
  })

  it('reaches the homepage with no override: both terminals know the same commands', () => {
    expect(Object.keys(HOME_COMMANDS).sort()).toEqual(Object.keys(COMMANDS).sort())
    expect(HOME_COMMANDS.singularity).toBe(COMMANDS.singularity)
  })
})
