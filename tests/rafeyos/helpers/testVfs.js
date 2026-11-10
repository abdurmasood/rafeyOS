// Test helper: a vfs built from the real content, plus a small fixture content for edge cases
import { buildContent } from '@/components/rafeyos/core/vfs/content'
import { buildVfs } from '@/components/rafeyos/core/vfs/buildVfs'
import { mergeState, seedState } from '@/components/rafeyos/core/vfs/fsState'

export const realContent = buildContent()
export const realVfs = buildVfs(realContent)

/** The shipped tree plus a first visit's Desktop, Documents and Downloads, as rafeyOS shows it. */
export const visitorVfs = (content = realContent) => mergeState(buildVfs(content), seedState(0))

export const fixtureContent = Object.freeze({
  bio: 'Bio text\n',
  skills: 'Skills text\n',
  readme: 'README\n',
  projects: [
    { index: 0, id: 1, title: 'Alpha Project', slug: 'alpha-project', description: 'one two three four five six seven eight', link: 'https://a.example/', linkLabel: 'a.example' },
    { index: 2, id: 3, title: 'Beta', slug: 'beta', description: 'short', link: null, linkLabel: null },
  ],
  posts: [{ slug: 'first-post', title: 'First Post', date: '2024-01-01', excerpt: 'x', content: '\nHello world\n', minutes: 1 }],
  music: {
    track: { id: 'song', title: 'Song', artist: 'Artist', src: '/song.mp3', sizeBytes: 2500000, durationSeconds: 120 },
    blurb: 'Blurb.',
    milestones: [{ year: 2000, event: 'Start', upcoming: false }, { year: 2030, event: 'Album', upcoming: true }],
  },
  contact: { email: 'me@example.com', linkedinUrl: 'https://linkedin.example/me', linkedinName: 'Me', mailtoHref: 'mailto:me@example.com' },
  help: { lines: ['Available commands:', '', '  bio          biography', ''], hint: 'hint' },
})
