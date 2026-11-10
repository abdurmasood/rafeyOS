// @ts-check
// Builds the filesystem from buildContent(). Absolute paths are keys ("/home/rafey/Music/story.txt");
// every node and the map itself are frozen, so the vfs can be shared freely.

export const NODE_TYPES = Object.freeze({
  DIR: 'dir',
  TEXT: 'text',
  AUDIO: 'audio',
  MAILTO: 'mailto',
  WEBLINK: 'weblink',
  SYMLINK: 'symlink',
})

/** @import { Content, Milestone, Track, Contact } from './content' */

/**
 * What a node holds, by type. `name` is the path's last segment unless the entry sets one (Trash).
 * @typedef {{ type: typeof NODE_TYPES.DIR, owned?: boolean, trashedFrom?: string }} DirFields owned: the visitor's own folder
 * @typedef {{ type: typeof NODE_TYPES.TEXT, text: string, projectIndex?: number, user?: boolean, trashedFrom?: string }} TextFields
 * @typedef {{
 *   type: typeof NODE_TYPES.AUDIO,
 *   src: string,
 *   title: string,
 *   artist: string,
 *   sizeBytes: number,
 *   durationSeconds: number,
 * }} AudioFields
 * @typedef {{ type: typeof NODE_TYPES.MAILTO, display: string, href: string, text: string }} MailtoFields
 * @typedef {{ type: typeof NODE_TYPES.WEBLINK, display: string, href: string, text: string }} WeblinkFields
 * @typedef {{ type: typeof NODE_TYPES.SYMLINK, target: string }} SymlinkFields
 * @typedef {DirFields | TextFields | AudioFields | MailtoFields | WeblinkFields | SymlinkFields} NodeFields
 */

/**
 * A vfs entry; narrow on `type` to reach its fields. `mtime` is epoch milliseconds.
 * @typedef {Readonly<NodeFields & { path: string, name: string, mtime: number }>} VfsNode
 */

/** @typedef {Readonly<Record<string, VfsNode>>} Vfs path -> node */

/** @typedef {[path: string, fields: NodeFields | (DirFields & { name: string }), mtime?: number]} Entry the shipped mtime unless one is given */

export const ROOT = '/'
/** The visitor's home: ~ in the shell, Home in Files. */
export const HOME = '/home/visitor'
/** Rafey's content, read-only. */
export const RAFEY_HOME = '/home/rafey'
/** Where both terminals start: the visitor's home, as a fresh Ubuntu terminal would. */
export const START_DIR = HOME
export const TMP = '/tmp'
export const BIN = '/usr/local/bin'
/** The system commands' stubs; /bin links here. */
export const USR_BIN = '/usr/bin'
/** When every shipped file but a blog post was last changed: a fixed build date, so listings never drift. */
export const SHIPPED_MTIME = Date.UTC(2026, 9, 1)
/** A GUI place outside the tree, so its path stays relative. */
export const TRASH = 'trash'

// Rafey's portfolio commands, shipped as stubs so `ls /usr/local/bin` lists them
const COMMANDS = Object.freeze(['bio', 'projects', 'blog', 'music', 'contact', 'skills', 'help', 'os'])

/** Every other command the shell runs, stubbed in /usr/bin as Ubuntu ships them. Bash builtins like cd stay out. */
export const SYSTEM_COMMANDS = Object.freeze([
  'ls', 'pwd', 'mkdir', 'rmdir', 'touch', 'rm', 'cp', 'mv', 'cat', 'tree', 'find', 'ln', 'stat', 'echo', 'head', 'tail', 'wc', 'grep', 'sort', 'uniq',
  'less', 'whoami', 'uname', 'date', 'uptime', 'hostname', 'clear', 'which', 'man', 'env', 'true', 'false', 'sudo', 'open', 'xdg-open', 'gio',
  'nautilus', 'gedit', 'gnome-text-editor', 'nano', 'vim', 'vi', 'rafeyos', 'startx', 'gsettings', 'ps', 'kill', 'neofetch',
  'reset-home',
])

const OS_RELEASE = 'PRETTY_NAME="rafeyOS 24.04 LTS"\nNAME="rafeyOS"\nVERSION_ID="24.04"\nID=rafeyos\n'
const PASSWD =
  'root:x:0:0:root:/root:/bin/sh\n' +
  `rafey:x:1000:1000:Rafey:${RAFEY_HOME}:/bin/sh\n` +
  `visitor:x:1001:1001:Visitor:${HOME}:/bin/sh\n`

/** @param {string} path */
const nameOf = (path) => (path === ROOT ? ROOT : path.slice(path.lastIndexOf('/') + 1))

/** @param {string} name */
const rafeyPath = (name) => `${RAFEY_HOME}/${name}`

/** @param {Content['projects'][number]} project */
const projectText = (project) => {
  const label = project.linkName === 'source' ? 'source' : 'Case study'
  const linkLine = project.link ? `\n${label}: ${project.link}\n` : ''
  return `${project.title}\n${'='.repeat(project.title.length)}\n\n${project.description}\n${linkLine}`
}

/** @param {Content['posts'][number]} post */
const postText = (post) => `# ${post.title}\n\n_${post.date}_\n\n${post.content.trim()}\n`

/** @param {readonly Milestone[]} milestones */
const storyText = (milestones) =>
  milestones.map((m) => `${m.year}  ${m.event}${m.upcoming ? ' (upcoming)' : ''}`).join('\n') + '\n'

/**
 * @param {string} name
 * @param {string} icon
 * @param {string} url
 */
const desktopEntry = (name, icon, url) =>
  `[Desktop Entry]\nType=Link\nName=${name}\nIcon=${icon}\nURL=${url}\n`

/**
 * @param {{ track: Track, milestones: readonly Milestone[] }} music
 * @returns {Entry[]}
 */
const musicNodes = ({ track, milestones }) => [
  [rafeyPath('Music'), { type: 'dir' }],
  [rafeyPath(`Music/${track.id}.mp3`), {
    type: 'audio',
    src: track.src,
    title: track.title,
    artist: track.artist,
    sizeBytes: track.sizeBytes,
    durationSeconds: track.durationSeconds,
  }],
  [rafeyPath('Music/story.txt'), { type: 'text', text: storyText(milestones) }],
]

/**
 * @param {Contact} contact
 * @returns {Entry[]}
 */
const contactNodes = (contact) => [
  [rafeyPath('contact'), { type: 'dir' }],
  [rafeyPath('contact/email.desktop'), {
    type: 'mailto',
    display: 'Email Rafey',
    href: contact.mailtoHref,
    text: desktopEntry('Email Rafey', 'mail', `mailto:${contact.email}`),
  }],
  [rafeyPath('contact/linkedin.desktop'), {
    type: 'weblink',
    display: 'LinkedIn',
    href: contact.linkedinUrl,
    text: desktopEntry('LinkedIn', 'web-browser', contact.linkedinUrl),
  }],
]

/**
 * Rafey's home: his music, posts, contact links, projects and notes.
 * @param {Content} content
 * @returns {Entry[]}
 */
const rafeyNodes = (content) => [
  [RAFEY_HOME, { type: 'dir' }],
  ...musicNodes(content.music),
  [rafeyPath('blog'), { type: 'dir' }],
  ...content.posts.map(/** @returns {Entry} */ (post) => [
    rafeyPath(`blog/${post.slug}.md`),
    { type: 'text', text: postText(post) },
    // "2023-05-15" parses as UTC midnight
    Date.parse(post.date),
  ]),
  ...contactNodes(content.contact),
  [rafeyPath('projects'), { type: 'dir' }],
  ...content.projects.map(/** @returns {Entry} */ (project) => [
    rafeyPath(`projects/${project.slug}.txt`),
    { type: 'text', projectIndex: project.index, text: projectText(project) },
  ]),
  [rafeyPath('bio.txt'), { type: 'text', text: content.bio }],
  [rafeyPath('skills.txt'), { type: 'text', text: content.skills }],
  [rafeyPath('README.txt'), { type: 'text', text: content.readme }],
]

/** @returns {Entry[]} */
const systemNodes = () => [
  ['/usr', { type: 'dir' }],
  ['/usr/local', { type: 'dir' }],
  [BIN, { type: 'dir' }],
  ...COMMANDS.map(/** @returns {Entry} */ (name) => [`${BIN}/${name}`, { type: 'text', text: `#!/bin/sh\n# rafey.ai portfolio: ${name}\n` }]),
  [USR_BIN, { type: 'dir' }],
  ...SYSTEM_COMMANDS.map(/** @returns {Entry} */ (name) => [`${USR_BIN}/${name}`, { type: 'text', text: `#!/bin/sh\n# rafeyOS: ${name}\n` }]),
  // Absolute, as Ubuntu's merged /usr ships it, so `ls /` reads bin etc home tmp usr
  ['/bin', { type: 'symlink', target: USR_BIN }],
  ['/etc', { type: 'dir' }],
  ['/etc/hostname', { type: 'text', text: 'rafey.ai\n' }],
  ['/etc/os-release', { type: 'text', text: OS_RELEASE }],
  ['/etc/passwd', { type: 'text', text: PASSWD }],
  [TMP, { type: 'dir' }],
]

/**
 * @param {Content} content
 * @returns {Entry[]}
 */
const entriesFor = (content) => [
  [ROOT, { type: 'dir' }],
  ['/home', { type: 'dir' }],
  ...rafeyNodes(content),
  // Its Desktop, Documents and Downloads are the visitor's, seeded by fsState
  [HOME, { type: 'dir' }],
  ...systemNodes(),
  [TRASH, { type: 'dir', name: 'Trash' }],
]

/**
 * @param {Content} content
 * @returns {Vfs}
 */
export const buildVfs = (content) => {
  /** @type {Record<string, VfsNode>} */
  const vfs = {}
  entriesFor(content).forEach(([path, node, mtime = SHIPPED_MTIME]) => {
    vfs[path] = Object.freeze({ path, name: nameOf(path), mtime, ...node })
  })
  return Object.freeze(vfs)
}
