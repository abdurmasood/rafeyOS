import { describe, it, expect } from 'vitest'
import { buildContent, htmlToText, slugify, displayLink, deepFreeze, formatDuration } from '@/components/rafeyos/core/vfs/content'
import { age } from '@/lib/descriptions'
import { projects } from '@/lib/projects'
import { getPublishedPosts } from '@/lib/posts'

describe('htmlToText', () => {
  it('strips tags and decodes the entities the terminal strings use', () => {
    const html = "<span class='grey'>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;&nbsp;f</span>"

    const text = htmlToText(html)

    expect(text).toBe(`a & b <c> "d" 'e' f`)
  })

  it('leaves plain text untouched', () => {
    expect(htmlToText('plain - text: yes')).toBe('plain - text: yes')
  })
})

describe('slugify and displayLink', () => {
  it('turns titles into hyphenated lowercase slugs', () => {
    expect(slugify('Leaf Line')).toBe('leaf-line')
    expect(slugify('  Hotel Price Tracker! ')).toBe('hotel-price-tracker')
  })

  it('shows links without scheme or trailing slash', () => {
    expect(displayLink('https://leaf.space/leaf-line/')).toBe('leaf.space/leaf-line')
  })
})

describe('buildContent', () => {
  it('includes only visible projects, keeping their index in the full list', () => {
    const content = buildContent()

    const titles = content.projects.map((p) => p.title)
    expect(titles).not.toContain('Home-Work')
    expect(titles).not.toContain('Hotel Price Tracker')
    content.projects.forEach((p) => expect(projects[p.index].title).toBe(p.title))
    expect(content.projects.find((p) => p.slug === 'rafey-shell')).toMatchObject({ index: 6, id: 7, link: 'https://github.com/abdurmasood/rafey-shell', linkName: 'source' })
    expect(content.projects.find((p) => p.slug === 'leaf-line')).toMatchObject({ linkLabel: 'leaf.space/leaf-line', linkName: 'case study' })
    expect(content.projects.find((p) => p.slug === 'arrhythmia-detector').linkName).toBe('source')
  })

  it('includes only published posts with reading minutes', () => {
    const content = buildContent()

    expect(content.posts.map((p) => p.slug)).toEqual(getPublishedPosts().map((p) => p.slug))
    content.posts.forEach((p) => expect(p.minutes).toBeGreaterThanOrEqual(1))
  })

  it('exposes plain-text bio, skills and help ending in a newline where printed', () => {
    const content = buildContent()

    expect(content.bio).toMatch(/^Rafey is a \d+-year-old/)
    expect(content.bio.endsWith('\n')).toBe(true)
    expect(content.skills.split('\n')[0]).toBe('stack           cursor · claude code · orca · linear · github · 1password · greptile')
    expect(content.help.lines.join('\n')).toContain('bio         biography')
    expect(content.help.hint).toBe("Use ↑ for history, tab to autocomplete, 'clear' to reset.")
    expect(content.help.lines.join('\n')).not.toContain('rafeyos')
  })

  it('carries the featured track metadata and contact details', () => {
    const content = buildContent()

    expect(content.music.track).toMatchObject({ id: 'storms-ahead', sizeBytes: 5073188, durationSeconds: 158 })
    expect(content.music.milestones.at(-1)).toMatchObject({ year: 2027, upcoming: true })
    expect(content.music.milestones[0].upcoming).toBe(false)
    expect(content.contact.mailtoHref).toMatch(/^mailto:abdurrafeym@gmail\.com\?subject=/)
    expect(content.contact.linkedinName).toBe('A. Rafey Masood')
  })

  it("carries Rafey's age and formats track times", () => {
    expect(buildContent().profile).toEqual({ age: age() })
    expect(formatDuration(158)).toBe('2:38')
  })

  it('is deeply frozen', () => {
    const content = buildContent()

    expect(Object.isFrozen(content)).toBe(true)
    expect(Object.isFrozen(content.projects[0])).toBe(true)
    expect(Object.isFrozen(content.music.track)).toBe(true)
  })
})

describe('deepFreeze', () => {
  it('returns primitives unchanged', () => {
    expect(deepFreeze(3)).toBe(3)
    expect(deepFreeze(null)).toBeNull()
  })
})
