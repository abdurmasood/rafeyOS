// reset-home (Claude's call 4): a [y/N] question on a terminal; in a pipe the first stdin line is the answer
import { describe, expect, it } from 'vitest'
import { exec } from '@/components/rafeyos/core/commands/exec'
import { manPage } from '@/components/rafeyos/core/commands/manPages'
import { RESET_QUESTION } from '@/components/rafeyos/core/commands/builtins/resetHome'
import { buildVfs, SYSTEM_COMMANDS } from '@/components/rafeyos/core/vfs/buildVfs'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { createSettingsStore } from '@/components/rafeyos/core/settings/settingsStore'
import { settingsView } from '@/components/rafeyos/core/settings/settingsView'
import { fsDisk, fsFiles, fsStoreOn, fsTrash, memoryStorage, quotaError, refusingWrites } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const base = buildVfs(fixtureContent)
const VISITOR = '/home/visitor'
const NOTES = `${VISITOR}/Desktop/notes.txt`
const HISTORY = `${VISITOR}/.bash_history`
const ASK = { type: 'ask', question: RESET_QUESTION, onYes: [{ type: 'resetHome' }] }

/** A visitor with a file, a trash entry, a history and a saved accent, in one terminal. */
const session = (disk = fsDisk({ [NOTES]: 'hi\n', [HISTORY]: 'ls\n' }, { [`${VISITOR}/old.txt`]: 'old\n' })) => {
  const fs = createShellFs({ base, store: fsStoreOn(disk) })
  const store = createSettingsStore({ storage: memoryStorage() })
  store.set('accent', '#7764D8')
  const settings = settingsView({ store, prefersDark: () => true })
  const run = (raw) => exec(raw, { fs, cwd: VISITOR, env: { PWD: VISITOR }, lastCode: 0, content: fixtureContent, settings })
  return { fs, disk, store, run }
}

const texts = (out) => out.lines.map((line) => line.text)

describe('reset-home', () => {
  it('asks its question as an effect and prints nothing', () => {
    const { disk, store, run } = session()

    expect(run('reset-home')).toMatchObject({ lines: [], effects: [ASK], code: 0 })
    expect(fsFiles(disk)).toMatchObject({ [NOTES]: 'hi\n' })
    expect(store.getState()).toEqual({ accent: '#7764D8' })
  })

  it('question_stops_the_rest_of_the_line', () => {
    const { fs, run } = session()

    const out = run('echo before; reset-home; echo after && touch ~/late.txt')

    expect(texts(out)).toEqual(['before'])
    expect(out.effects).toEqual([ASK])
    expect(fs.vfs()[`${VISITOR}/late.txt`]).toBeUndefined()
    expect(run('reset-home && echo after')).toMatchObject({ lines: [], effects: [ASK] })
  })

  it('asks only when its question would reach the screen', () => {
    const { disk, run } = session()

    expect(run('reset-home > /tmp/out.txt; echo next')).toMatchObject({ lines: [{ text: 'next' }], effects: [] })
    expect(run('reset-home | cat')).toMatchObject({ lines: [], effects: [], code: 0 })
    expect(fsFiles(disk)).toMatchObject({ [NOTES]: 'hi\n' })
  })

  it('echo_y_pipe_reset_home_resets_without_asking', () => {
    const { disk, store, run } = session()

    expect(run('echo y | reset-home')).toEqual(expect.objectContaining({ lines: [], effects: [{ type: 'clearHistory' }], code: 0 }))

    expect(fsFiles(disk)).toEqual({})
    expect(fsTrash(disk)).toEqual({})
    expect(store.getState()).toEqual({})
  })

  it('takes y or yes in any case, and anything else as no', () => {
    for (const answer of ['n', 'no', 'yep', '""']) {
      const { disk, store, run } = session()

      expect(run(`echo ${answer} | reset-home`)).toMatchObject({ lines: [], effects: [], code: 0 })
      expect(fsFiles(disk)).toMatchObject({ [NOTES]: 'hi\n' })
      expect(store.getState()).toEqual({ accent: '#7764D8' })
    }
    expect(session().run('true | reset-home')).toMatchObject({ lines: [], effects: [], code: 0 })
    for (const answer of ['Y', 'YES', 'Yes']) {
      const { disk, run } = session()
      run(`echo ${answer} | reset-home`)
      expect(fsFiles(disk)).toEqual({})
    }
  })

  it('reset_home_keeps_home_rafey_and_tmp', () => {
    const { fs, run } = session()
    run('touch /tmp/keep.txt; mkdir ~/drafts')

    run('echo yes | reset-home')

    const vfs = fs.vfs()
    expect(vfs['/tmp/keep.txt']).toMatchObject({ type: 'text' })
    expect(vfs['/home/rafey/bio.txt']).toEqual(base['/home/rafey/bio.txt'])
    expect(Object.keys(vfs).filter((path) => path.startsWith(`${VISITOR}/`))).toEqual([
      `${VISITOR}/Desktop`,
      `${VISITOR}/Documents`,
      `${VISITOR}/Downloads`,
    ])
  })

  it('reset_failure_changes_nothing', () => {
    const full = session(refusingWrites(fsDisk({ [NOTES]: 'hi\n' }), quotaError()))

    expect(full.run('echo y | reset-home')).toMatchObject({
      lines: [{ type: 'error', text: 'reset-home: cannot reset: No space left on device' }],
      effects: [],
      code: 1,
    })
    expect(full.fs.vfs()[NOTES]).toMatchObject({ type: 'text', text: 'hi\n' })
    expect(full.store.getState()).toEqual({ accent: '#7764D8' })

    const blocked = session(refusingWrites(fsDisk({ [NOTES]: 'hi\n' }), new Error('SecurityError')))
    expect(texts(blocked.run('echo y | reset-home'))).toEqual(['reset-home: cannot reset: Read-only file system'])
  })

  it('is a /usr/bin command with a manual page, leaving /usr/local/bin to the portfolio', () => {
    const { run } = session()

    expect(SYSTEM_COMMANDS).toContain('reset-home')
    expect(texts(run('which reset-home'))).toEqual(['/usr/bin/reset-home'])
    expect(texts(run('ls /usr/local/bin | cat'))).toEqual(['bio\nblog\ncontact\nhelp\nmusic\nos\nprojects\nskills'])
    expect(manPage('reset-home')).toContain('reset-home - erase')
  })
})
