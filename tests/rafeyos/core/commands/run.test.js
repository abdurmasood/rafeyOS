import { describe, it, expect } from 'vitest'
import { ENV, runLine } from '@/components/rafeyos/core/commands/run'
import { COMMANDS } from '@/components/rafeyos/core/commands/exec'
import { panel } from '@/components/rafeyos/core/commands/lines'
import { createShellFs } from '@/components/rafeyos/core/vfs/shellFs'
import { buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { fsDisk, fsFiles, fsStoreOn, memoryStorage, quotaError, refusingWrites } from '@/tests/rafeyos/helpers/renderRafeyOS'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const base = buildVfs(fixtureContent)

// A stand-in for Task 7's wc: counts the newlines it is piped
const wc = ({ stdin }) => ({ stdout: `${(stdin ?? '').split('\n').length - 1}\n` })

/** One terminal window: lines run in turn, each starting where the last left cwd, env and $?. */
const session = ({ disk = memoryStorage(), cwd = '/home/visitor', registry = COMMANDS } = {}) => {
  const fs = createShellFs({ base, store: fsStoreOn(disk) })
  let state = { cwd, env: { PWD: cwd }, lastCode: 0 }
  const run = (raw) => {
    const out = runLine(raw, { fs, ...state, content: fixtureContent }, registry)
    state = { cwd: out.cwd, env: out.env, lastCode: out.code }
    return out
  }
  return { fs, disk, run }
}

const texts = (out) => out.lines.map((line) => line.text)
const badSubstitution = (typed) => `bash: bad substitution: no closing '}' in ${typed}`

describe('runLine pipelines', () => {
  it('pipes stdout into stdin', () => {
    const { run } = session()

    expect(texts(run('echo hi | cat'))).toEqual(['hi'])
    expect(texts(run('echo a | echo b'))).toEqual(['b'])
    expect(texts(run('bio | cat | cat'))).toEqual(['Bio text'])
  })

  it('bio piped to wc -l counts its lines', () => {
    const { run } = session({ registry: { ...COMMANDS, wc } })

    expect(texts(run('bio | wc -l'))).toEqual(['1'])
    expect(texts(run('help | wc -l'))).toEqual(['3'])
  })

  it('prints every stage\'s errors first and takes the last stage\'s code', () => {
    const { run } = session()

    const out = run('cat nope | cat gone | echo x')

    expect(out.lines).toEqual([
      { type: 'error', text: 'cat: nope: No such file or directory' },
      { type: 'error', text: 'cat: gone: No such file or directory' },
      { type: 'pre', text: 'x' },
    ])
    expect(out.code).toBe(0)
    expect(run('echo x | cat nope').code).toBe(1)
  })

  it('uses the plain form in a pipe and the on-screen form at the end', () => {
    const { run } = session({ cwd: '/home/rafey' })

    expect(run('ls').lines[0].type).toBe('ls')
    expect(texts(run('ls | cat'))).toEqual(['bio.txt\nblog\ncontact\nMusic\nprojects\nREADME.txt\nskills.txt'])
  })

  it('cd inside a pipeline leaves the window where it was', () => {
    const { run } = session()

    expect(run('cd /etc | echo x').cwd).toBe('/home/visitor')
  })

  it('collects effects from every command that ran', () => {
    const { run } = session({ cwd: '/home/rafey' })

    expect(run('xdg-open bio.txt; xdg-open blog').effects).toEqual([
      { type: 'openPath', path: '/home/rafey/bio.txt' },
      { type: 'openPath', path: '/home/rafey/blog' },
    ])
  })

  it('clear wipes what the line printed before it', () => {
    const { run } = session()

    const out = run('echo a; clear; echo b')

    expect(texts(out)).toEqual(['b'])
    expect(out.effects).toEqual([{ type: 'clear' }])
  })
})

describe('runLine lists', () => {
  it('and, or and semicolon follow exit codes', () => {
    const { run } = session()

    expect(texts(run('false; echo $?'))).toEqual(['1'])
    expect(texts(run('false || echo ok'))).toEqual(['ok'])
    expect(texts(run('true && echo yes'))).toEqual(['yes'])
    expect(run('false && echo no')).toMatchObject({ lines: [], code: 1 })
    expect(run('true || echo no')).toMatchObject({ lines: [], code: 0 })
    expect(texts(run('false && echo a || echo b'))).toEqual(['b'])
    expect(run('true; false').code).toBe(1)
  })

  it('expands each command just before it runs', () => {
    const { run } = session()

    expect(texts(run('echo hi > a.txt && echo *.txt'))).toEqual(['a.txt'])
    expect(texts(run('cd /etc; echo $PWD'))).toEqual(['/etc'])
    expect(texts(run('cd /home/rafey && cat ../visitor/a.txt'))).toEqual(['hi'])
    expect(texts(run('cd /etc; cd /tmp; echo $OLDPWD'))).toEqual(['/etc'])
  })

  it('keeps $? across lines and on a blank one', () => {
    const { run } = session()
    run('false')

    expect(run('   ')).toMatchObject({ lines: [], code: 1 })
    expect(run('# just a comment').code).toBe(1)
    expect(texts(run('echo $?'))).toEqual(['1'])
  })

  it('returns the window\'s cwd and variables', () => {
    const { run } = session()

    expect(run('cd /etc')).toEqual({ lines: [], effects: [], cwd: '/etc', env: { PWD: '/etc', OLDPWD: '/home/visitor' }, code: 0 })
  })

  it('a command whose words all vanish does nothing', () => {
    const { run } = session()

    expect(run('$NOPE')).toMatchObject({ lines: [], code: 0 })
  })

  it('fixes the environment the visitor sees', () => {
    const { run } = session()

    expect(texts(run('echo $HOME $USER $SHELL $PATH $HOSTNAME'))).toEqual(['/home/visitor visitor /bin/bash /usr/local/bin:/usr/bin:/bin rafey.ai'])
    expect(ENV).toEqual({
      HOME: '/home/visitor',
      USER: 'visitor',
      LOGNAME: 'visitor',
      SHELL: '/bin/bash',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOSTNAME: 'rafey.ai',
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
    })
  })
})

describe('runLine panels', () => {
  it('a panel on screen never reaches a pipe or file', () => {
    const shown = panel('projects', { title: 'x' }, { foreground: true })
    const { run, disk } = session({ registry: { ...COMMANDS, wc, x: () => ({ display: [shown] }) } })

    expect(run('x').lines).toEqual([shown])
    expect(texts(run('x | wc -l'))).toEqual(['0'])
    expect(run('x > f')).toMatchObject({ lines: [], code: 0 })
    expect(fsFiles(disk)['/home/visitor/f']).toBe('')
  })
})

describe('runLine redirects', () => {
  it('creates, appends and reports errno', () => {
    const { run, disk } = session()

    run('echo "hello world" > notes.txt')
    run("echo 'second line' >> notes.txt")

    expect(fsFiles(disk)['/home/visitor/notes.txt']).toBe('hello world\nsecond line\n')
    expect(texts(run('cat notes.txt'))).toEqual(['hello world\nsecond line'])
    expect(run('echo x > /etc/x')).toMatchObject({ lines: [{ type: 'error', text: 'bash: /etc/x: Permission denied' }], code: 1 })
    expect(texts(run('echo x >> nope/f'))).toEqual(['bash: nope/f: No such file or directory'])
    expect(texts(run('echo x > Documents'))).toEqual(['bash: Documents: Is a directory'])
    expect(texts(run('echo x > $NOPE'))).toEqual(['bash: $NOPE: ambiguous redirect'])
  })

  it('>> creates its file even when the command prints nothing', () => {
    const { run, disk } = session()
    run('echo kept > old')

    run('true >> f')
    run('cat nope >> log')
    run('true >> old')
    run('ln -s target dangling; true >> dangling')

    expect(fsFiles(disk)['/home/visitor/f']).toBe('')
    expect(fsFiles(disk)['/home/visitor/target']).toBe('')
    expect(fsFiles(disk)['/home/visitor/log']).toBe('')
    expect(fsFiles(disk)['/home/visitor/old']).toBe('kept\n')
  })

  it('truncates with > and sends the output to the last target', () => {
    const { run, disk } = session()
    run('echo old > a')

    run('echo hi > a > b')

    expect(fsFiles(disk)['/home/visitor/a']).toBe('')
    expect(fsFiles(disk)['/home/visitor/b']).toBe('hi\n')
  })

  it('opens the target before the command runs', () => {
    const { run, fs, disk } = session()
    run('echo a > a')

    // Were rm to run, it would delete a and complain about nope
    expect(texts(run('rm a nope > /etc/x'))).toEqual(['bash: /etc/x: Permission denied'])
    expect(fs.vfs()['/home/visitor/a']).toBeDefined()
    expect(fsFiles(disk)['/home/visitor/a']).toBe('a\n')
    expect(texts(run('echo b >> a > /etc/x'))).toEqual(['bash: /etc/x: Permission denied'])
    expect(fsFiles(disk)['/home/visitor/a']).toBe('a\n')
    expect(run('> f').code).toBe(0)
    expect(fsFiles(disk)['/home/visitor/f']).toBe('')
  })

  it('saves the plain form of a command\'s output', () => {
    const { run } = session()

    run('help > h')

    expect(texts(run('cat h'))).toEqual(['Available commands:\n\n  bio          biography'])
  })

  it('full storage on append says write error and the next command still runs', () => {
    const { run } = session({ disk: refusingWrites(fsDisk({ '/home/visitor/f': 'a\n' }), quotaError()) })

    expect(texts(run('echo x >> ~/f; echo $?'))).toEqual(['bash: echo: write error: No space left on device', '1'])
    expect(texts(run('echo next'))).toEqual(['next'])
    expect(texts(run('echo t > /tmp/x && cat /tmp/x'))).toEqual(['t'])
  })

  it('full storage on > says write error, as bash opens the file and the write fails', () => {
    const { run } = session({ disk: refusingWrites(fsDisk({ '/home/visitor/f': 'a\n' }), quotaError()) })

    expect(texts(run('echo x > ~/f; echo $?'))).toEqual(['bash: echo: write error: No space left on device', '1'])
    expect(texts(run('echo x > ~/new; echo $?'))).toEqual(['bash: echo: write error: No space left on device', '1'])
    expect(texts(run('echo x >> ~/new; echo $?'))).toEqual(['bash: echo: write error: No space left on device', '1'])
    expect(texts(run('cat ~/f'))).toEqual(['a'])
    // with nothing to write, nothing fails
    expect(texts(run('true >> ~/new; echo $?'))).toEqual(['0'])
    expect(texts(run('true > ~/f; echo $?'))).toEqual(['0'])
    expect(texts(run('cd /tmp > ~/new; echo $?'))).toEqual(['0'])
    expect(texts(run('cat nope > ~/f'))).toEqual(['cat: nope: No such file or directory'])
  })

  it('storage that refuses every write reads as a read-only file system', () => {
    const { run } = session({ disk: null })

    // >> creates a missing file as it opens, so the open is what fails
    expect(texts(run('echo x >> ~/f'))).toEqual(['bash: /home/visitor/f: Read-only file system'])
    expect(texts(run('echo x > ~/g'))).toEqual(['bash: /home/visitor/g: Read-only file system'])
  })
})

describe('runLine errors', () => {
  it('an unknown command is 127', () => {
    const { run } = session()

    expect(run('foo')).toMatchObject({ lines: [{ type: 'error', text: 'bash: foo: command not found' }], code: 127 })
    expect(texts(run('foo; echo $?'))).toEqual(['bash: foo: command not found', '127'])
  })

  it('names are case-sensitive and prototype keys are not commands', () => {
    const { run } = session()

    expect(texts(run('Help'))).toEqual(['bash: Help: command not found'])
    expect(texts(run('WHOAMI'))).toEqual(['bash: WHOAMI: command not found'])
    expect(texts(run('constructor'))).toEqual(['bash: constructor: command not found'])
  })

  it('tier-3 syntax is refused with code 2 and nothing on the line runs', () => {
    const { run, fs } = session()

    expect(run('for f in *.txt; do cat "$f"; done')).toMatchObject({ lines: [{ type: 'error', text: "bash: for: loops isn't supported here" }], code: 2 })
    expect(texts(run('echo $(whoami)'))).toEqual(["bash: $(…): command substitution isn't supported here"])
    expect(texts(run('echo hi > made.txt; (ls)'))).toEqual(["bash: (: subshells isn't supported here"])
    expect(fs.vfs()['/home/visitor/made.txt']).toBeUndefined()
  })

  it('syntax errors and open quotes are code 2', () => {
    const { run } = session()

    expect(run('| ls')).toMatchObject({ lines: [{ type: 'error', text: "bash: syntax error near unexpected token '|'" }], code: 2 })
    expect(run('echo "oops')).toMatchObject({ lines: [{ type: 'error', text: `bash: unexpected EOF while looking for matching '"'` }], code: 2 })
  })

  it('a double-quoted $${ with no } is a bad substitution that stops the rest of the line', () => {
    const { run } = session()

    expect(run('echo a && echo "$${" || echo or; echo after')).toMatchObject({
      lines: [{ type: 'pre', text: 'a' }, { type: 'error', text: badSubstitution('"$${"') }],
      code: 1,
    })
    expect(texts(run('echo $?; echo x"a$${"y "$${x"'))).toEqual(['1', badSubstitution('x"a$${"y')])
    expect(texts(run('echo "$${x}"'))).toEqual(['2817{x}'])
  })

  it('shows a bad substitution with its word exactly as typed', () => {
    const { run } = session()

    expect(texts(run('echo "\\"$${"'))).toEqual([badSubstitution('"\\"$${"')])
    expect(texts(run('echo \\x"$${"'))).toEqual([badSubstitution('\\x"$${"')])
    expect(texts(run('echo "$${" "}"'))).toEqual([badSubstitution('"$${"')])
  })

  it('a ${…} that holds no parameter is a bad substitution that stops the rest of the line', () => {
    const { run } = session()

    expect(run('echo ${}; echo after')).toMatchObject({ lines: [{ type: 'error', text: 'bash: ${}: bad substitution' }], code: 1 })
    expect(run('echo a${ b} || echo or')).toMatchObject({ lines: [{ type: 'error', text: 'bash: a${ b}: bad substitution' }], code: 1 })
    expect(texts(run('echo "${}"'))).toEqual(['bash: ${}: bad substitution'])
    expect(texts(run('echo ${HOME} ${1} ${#}'))).toEqual(['/home/visitor 0'])
  })

  it('a ${ whose } sits inside quotes or after a backslash leaves the line open, code 2', () => {
    const { run } = session()
    const cases = { "echo ${a'}'": '}', 'echo ${a\\}': '}', 'echo ${"}"': '}', "echo ${ '}'": '}', 'echo "${a\\}"': '"', 'echo "a${"b}': '"' }

    Object.entries(cases).forEach(([raw, open]) =>
      expect(run(raw), raw).toMatchObject({ lines: [{ type: 'error', text: `bash: unexpected EOF while looking for matching '${open}'` }], code: 2 }),
    )
  })

  it('echo "$${""}" keeps the inner quotes, as bash does', () => {
    const { run } = session()

    expect(run('echo "$${""}"')).toMatchObject({ lines: [{ type: 'pre', text: '2817{""}' }], code: 0 })
  })

  it('a bad substitution in a pipeline fails only its own stage', () => {
    const { run } = session()

    expect(texts(run('echo "$${" | cat; echo piped $?'))).toEqual([badSubstitution('"$${"'), 'piped 0'])
  })

  it('a bad substitution in a redirect target stops after the redirects before it opened', () => {
    const { run, disk } = session()
    run('echo old > a')

    expect(run('echo hi > a > "$${"; echo after')).toMatchObject({ lines: [{ type: 'error', text: badSubstitution('"$${"') }], code: 1 })
    expect(fsFiles(disk)['/home/visitor/a']).toBe('')
  })
})
