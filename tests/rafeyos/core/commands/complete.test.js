import { describe, it, expect } from 'vitest'
import { complete } from '@/components/rafeyos/core/commands/complete'
import { COMPLETION_COMMANDS, ENV } from '@/components/rafeyos/core/commands/exec'
import { buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { mergeState, parseState, seedState } from '@/components/rafeyos/core/vfs/fsState'
import { fixtureContent } from '@/tests/rafeyos/helpers/testVfs'

const file = (text = '') => ({ type: 'text', text, mtime: 1 })

/** The fixture's shipped tree plus these visitor nodes (path relative to the visitor's home -> node). */
const vfsWith = (nodes) => {
  const absolute = Object.fromEntries(Object.entries(nodes).map(([path, node]) => [`/home/visitor/${path}`, node]))
  return mergeState(buildVfs(fixtureContent), parseState({ v: 2, nodes: { ...seedState(1).nodes, ...absolute }, trash: {} }))
}

const vfs = vfsWith({
  '.profile': file(),
  '.config': { type: 'dir', mtime: 1 },
  'my notes.txt': file(),
  "don't.txt": file(),
  'say "hi".txt': file(),
  'Documents/report.txt': file(),
  docs: { type: 'symlink', target: 'Documents', mtime: 1 },
})
const tab = (input, { cwd = '/home/rafey', tabCount = 1 } = {}) => {
  const env = { ...ENV, PWD: cwd, OLDPWD: '/home/rafey/Music' }
  return complete(input, { vfs, cwd, env, lastCode: 0, commands: COMPLETION_COMMANDS, tabCount })
}

describe('complete', () => {
  it('fills a unique command with a trailing space', () => {
    expect(tab('who')).toEqual({ value: 'whoami ' })
  })

  it('offers startx, and nothing for os or rafeyos, which are not commands', () => {
    expect(tab('star')).toEqual({ value: 'startx ' })
    expect(tab('os')).toEqual({ value: 'os' })
    expect(tab('rafey')).toEqual({ value: 'rafey' })
  })

  it('lists several matches only on the second tab', () => {
    expect(tab('c')).toEqual({ value: 'c' })
    expect(tab('c', { tabCount: 2 })).toEqual({ list: ['cat', 'cd', 'clear', 'contact', 'cp'] })
  })

  it('completes a folder with a trailing slash', () => {
    expect(tab('cd Mu')).toEqual({ value: 'cd Music/' })
  })

  it('completes a file with a trailing space', () => {
    expect(tab('cat sk')).toEqual({ value: 'cat skills.txt ' })
  })

  it('completes inside a typed folder, keeping the prefix', () => {
    expect(tab('cat Music/st')).toEqual({ value: 'cat Music/story.txt ' })
    expect(tab('cat ../bio', { cwd: '/home/rafey/Music' })).toEqual({ value: 'cat ../bio.txt ' })
  })

  it('completes inside a folder', () => {
    expect(tab('ls proj')).toEqual({ value: 'ls projects/' })
    expect(tab('ls projects/b')).toEqual({ value: 'ls projects/beta.txt ' })
  })

  it('lists path matches relative to cwd on the second tab', () => {
    expect(tab('cat s', { cwd: '/home/rafey/Music', tabCount: 2 })).toEqual({ list: ['song.mp3', 'story.txt'] })
    expect(tab('ls b', { tabCount: 2 })).toEqual({ list: ['blog/', 'bio.txt'] })
  })

  it('leaves input alone when nothing matches or the folder is missing', () => {
    expect(tab('cat zz')).toEqual({ value: 'cat zz' })
    expect(tab('cat nope/x')).toEqual({ value: 'cat nope/x' })
    expect(tab('cat bio.txt/x')).toEqual({ value: 'cat bio.txt/x' })
  })

  it('completes_command_after_pipe', () => {
    expect(tab('cat bio.txt | hea')).toEqual({ value: 'cat bio.txt | head ' })
    expect(tab('true && who')).toEqual({ value: 'true && whoami ' })
    expect(tab('false || who')).toEqual({ value: 'false || whoami ' })
    expect(tab('cd;pw')).toEqual({ value: 'cd;pwd ' })
  })

  it('offers commands from the registry, not a fixed list', () => {
    expect(tab('mkd')).toEqual({ value: 'mkdir ' })
    expect(tab('gre')).toEqual({ value: 'grep ' })
  })

  it('completes a file name after a redirect rather than a command', () => {
    expect(tab('echo hi > bi')).toEqual({ value: 'echo hi > bio.txt ' })
    expect(tab('echo hi >> sk')).toEqual({ value: 'echo hi >> skills.txt ' })
  })

  it('completes_path_after_tilde', () => {
    expect(tab('ls ~/D', { tabCount: 2 })).toEqual({ list: ['Desktop/', 'Documents/', 'Downloads/'] })
    expect(tab('cd ~/Doc')).toEqual({ value: 'cd ~/Documents/' })
    expect(tab('cat ~/Documents/re')).toEqual({ value: 'cat ~/Documents/report.txt ' })
  })

  it('completes through a symlinked folder', () => {
    expect(tab('cat ~/docs/re')).toEqual({ value: 'cat ~/docs/report.txt ' })
  })

  it('completes_inside_quotes', () => {
    expect(tab('cat "my n', { cwd: '/home/visitor' })).toEqual({ value: 'cat "my notes.txt" ' })
    expect(tab("cat 'my n", { cwd: '/home/visitor' })).toEqual({ value: "cat 'my notes.txt' " })
    expect(tab('cd "Doc', { cwd: '/home/visitor' })).toEqual({ value: 'cd "Documents/' })
  })

  it('escapes a blank it fills in outside quotes', () => {
    expect(tab('cat my', { cwd: '/home/visitor' })).toEqual({ value: 'cat my\\ notes.txt ' })
    expect(tab('cat my\\ n', { cwd: '/home/visitor' })).toEqual({ value: 'cat my\\ notes.txt ' })
  })

  it('escapes quotes in a name the way the word is quoted', () => {
    const home = { cwd: '/home/visitor' }
    expect(tab('cat don', home)).toEqual({ value: "cat don\\'t.txt " })
    expect(tab("cat 'don", home)).toEqual({ value: "cat 'don'\\''t.txt' " })
    expect(tab('cat "sa', home)).toEqual({ value: 'cat "say \\"hi\\".txt" ' })
  })

  it('leaves a line ending in a lone backslash alone', () => {
    expect(tab('cat my\\', { cwd: '/home/visitor' })).toEqual({ value: 'cat my\\' })
    expect(tab('cat "my\\', { cwd: '/home/visitor' })).toEqual({ value: 'cat "my\\' })
  })

  it('hides_dotfiles_unless_typed', () => {
    expect(tab('ls ', { cwd: '/home/visitor', tabCount: 2 })).toEqual({
      list: ['Desktop/', 'docs/', 'Documents/', 'Downloads/', "don't.txt", 'my notes.txt', 'say "hi".txt'],
    })
    expect(tab('cat .pr', { cwd: '/home/visitor' })).toEqual({ value: 'cat .profile ' })
    expect(tab('ls ~/.', { tabCount: 2 })).toEqual({ list: ['./', '../', '.config/', '.profile'] })
  })

  it('completes after a variable in the folder part, keeping the variable as typed', () => {
    expect(tab('cd $HOME/Doc')).toEqual({ value: 'cd $HOME/Documents/' })
    expect(tab('cat ${HOME}/Documents/re')).toEqual({ value: 'cat ${HOME}/Documents/report.txt ' })
    expect(tab('cd "$HOME/Doc')).toEqual({ value: 'cd "$HOME/Documents/' })
    expect(tab('cat $OLDPWD/st')).toEqual({ value: 'cat $OLDPWD/story.txt ' })
    expect(tab('cat $PWD/sk')).toEqual({ value: 'cat $PWD/skills.txt ' })
  })

  it('leaves a single-quoted or escaped $ unexpanded', () => {
    expect(tab("cd '$HOME/Doc")).toEqual({ value: "cd '$HOME/Doc" })
    expect(tab('cd \\$HOME/Doc')).toEqual({ value: 'cd \\$HOME/Doc' })
  })

  it('completes . and .. to ./ and ../', () => {
    expect(tab('cd ..')).toEqual({ value: 'cd ../' })
    expect(tab('cd Music/..')).toEqual({ value: 'cd Music/../' })
    expect(tab('ls .', { tabCount: 2 })).toEqual({ list: ['./', '../'] })
  })

  it('keeps ~/ as home inside an open quote', () => {
    expect(tab('cd "~/Doc')).toEqual({ value: 'cd "~/Documents/' })
  })

  it('leaves a comment alone', () => {
    expect(tab('echo hi # bi')).toEqual({ value: 'echo hi # bi' })
  })
})
