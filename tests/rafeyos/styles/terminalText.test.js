import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const withoutComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const apps = withoutComments(readFileSync('components/rafeyos/styles/apps.css', 'utf8'))
const base = withoutComments(readFileSync('components/rafeyos/styles/base.css', 'utf8'))
const STYLES = 'components/rafeyos/styles'
const allSelectors = () =>
  readdirSync(STYLES)
    .filter((file) => file.endsWith('.css'))
    .flatMap((file) => [...withoutComments(readFileSync(`${STYLES}/${file}`, 'utf8')).matchAll(/([^{}@]+)\{/g)])
    .flatMap(([, group]) => group.split(','))
    .map((selector) => selector.trim())

/** Every rule whose selector targets the terminal, as [selector, body]. */
const termRules = () =>
  [...apps.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => [selector.trim(), body])
    .filter(([selector]) => /\.term\b|\.tline\b/.test(selector))
const termRoot = () => termRules().find(([selector]) => selector === ':where(.rafeyos) .term')[1]

describe('terminal text matches the homepage terminal', () => {
  it('sets JetBrains Mono at the homepage line height', () => {
    expect(termRoot()).toMatch(/font-family:\s*var\(--font-terminal\)/)
    expect(termRoot()).toMatch(/line-height:\s*1\.5\b/)
  })

  it('draws nothing bold, since only the regular weight is loaded', () => {
    for (const [selector, body] of termRules()) expect(body, selector).not.toMatch(/font-weight:\s*(700|bold)/)
  })

  it('defines the prompt colours for both themes', () => {
    const darkTokens = base.match(/^\.rafeyos\s*\{([^}]*)\}/m)[1]
    const lightTokens = base.match(/\.rafeyos\.light\s*\{([^}]*)\}/)[1]
    for (const tokens of [darkTokens, lightTokens]) {
      expect(tokens).toMatch(/--tuser:\s*#[0-9a-f]{6}/i)
      expect(tokens).toMatch(/--thost:\s*#[0-9a-f]{6}/i)
    }
  })

  it('styles the prompt classes only inside the terminal, so no other rafeyOS rule reaches them', () => {
    for (const name of ['pg', 'pu', 'ph', 'cwd', 'tcursor']) {
      const outside = allSelectors().filter((selector) => new RegExp(`\\.${name}\\b`).test(selector) && !/\.(term|tline)\b/.test(selector))
      expect(outside, `.${name}`).toEqual([])
    }
  })

  it('hides the native caret behind a block cursor in the text colour', () => {
    const input = termRules().find(([selector]) => selector === ':where(.rafeyos) .tline input')[1]
    const cursor = termRules().find(([selector]) => selector === ':where(.rafeyos) .tline .tcursor')[1]
    expect(input).toMatch(/caret-color:\s*transparent/)
    expect(cursor).toMatch(/background:\s*var\(--tfg\)/)
    expect(cursor).toMatch(/color:\s*var\(--tbg\)/)
  })
})

describe('the cover a terminal program draws (singularity)', () => {
  const rule = (css, selector) => [...css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)].find(([, found]) => found.trim() === selector)[2]
  const windows = withoutComments(readFileSync(`${STYLES}/window.css`, 'utf8'))

  it('is placed against the box around the pane, which does not scroll, so the scrollback cannot carry it away', () => {
    expect(rule(apps, ':where(.rafeyos) .term-body')).toMatch(/position:\s*relative/)
    expect(rule(apps, ':where(.rafeyos) .term-body')).not.toMatch(/overflow/)
    // A positioned pane would become the cover's containing block, and the pane scrolls
    expect(termRoot()).toMatch(/overflow:\s*auto/)
    expect(termRoot()).not.toMatch(/position:/)
    expect(rule(apps, ':where(.rafeyos) .term .singularity-cover')).toMatch(/position:\s*absolute;\s*inset:\s*0;/)
  })

  it("takes the dark pane card's inset and corners, as window.css sets them", () => {
    const pane = rule(windows, ':where(.rafeyos:not(.light)) .pane')
    const cover = rule(apps, ':where(.rafeyos:not(.light)) .term .singularity-cover')
    const [, margin] = pane.match(/margin:\s*([^;]+);/)
    const [, radius] = pane.match(/border-radius:\s*([^;]+);/)

    expect(cover).toContain(`inset: ${margin};`)
    expect(cover).toContain(`border-radius: ${radius};`)
  })
})
