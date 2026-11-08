import { describe, expect, it } from 'vitest'
import { RESULT_KINDS, firstResult, hasResults, overviewApps, overviewResults, MAX_FILE_RESULTS } from '@/components/rafeyos/shell/overview/logic/overviewSearch'
import { realVfs } from '@/tests/rafeyos/helpers/testVfs'

describe('overview search', () => {
  it('offers every launchable app, in registry order, without Properties', () => {
    expect(overviewApps()).toEqual(['files', 'terminal', 'editor', 'music', 'mail', 'projects', 'settings', 'minecraft'])
  })

  it('finds files by name, showing the folder each sits in', () => {
    const results = overviewResults(realVfs, 'bio')

    expect(results.apps).toEqual([])
    expect(results.files).toEqual([{ path: '/home/rafey/bio.txt', name: 'bio.txt', parent: '/home/rafey' }])
    expect(results.settings).toEqual([])
  })

  it('finds apps by name or id, ignoring case and spaces', () => {
    expect(overviewResults(realVfs, '  TERM ').apps).toEqual(['terminal'])
    expect(overviewResults(realVfs, 'text').apps).toEqual(['editor'])
    expect(overviewResults(realVfs, 'editor').apps).toEqual(['editor'])
  })

  it('finds Settings pages', () => {
    expect(overviewResults(realVfs, 'appearance').settings).toEqual([{ label: 'Appearance', page: 'appearance' }])
    expect(overviewResults(realVfs, 'desktop').settings).toEqual([{ label: 'Ubuntu Desktop', page: 'ubuntu' }])
    expect(overviewResults(realVfs, 'about').settings).toEqual([{ label: 'About', page: 'about' }])
  })

  it('caps the files at six', () => {
    expect(overviewResults(realVfs, '.').files.length).toBeLessThanOrEqual(MAX_FILE_RESULTS)
    expect(overviewResults(realVfs, 't').files).toHaveLength(MAX_FILE_RESULTS)
  })

  it('finds nothing for an empty query or a miss', () => {
    expect(hasResults(overviewResults(realVfs, '   '))).toBe(false)
    expect(hasResults(overviewResults(realVfs, 'zzzz'))).toBe(false)
    expect(hasResults(overviewResults(realVfs, 'bio'))).toBe(true)
  })

  it('launches apps first, then files, then settings', () => {
    expect(firstResult(overviewResults(realVfs, 'term'))).toEqual({ kind: RESULT_KINDS.APP, id: 'terminal' })
    expect(firstResult(overviewResults(realVfs, 'bio'))).toEqual({ kind: RESULT_KINDS.FILE, path: '/home/rafey/bio.txt' })
    expect(firstResult(overviewResults(realVfs, 'appearance'))).toEqual({ kind: RESULT_KINDS.SETTING, page: 'appearance' })
    expect(firstResult(overviewResults(realVfs, 'zzzz'))).toBeNull()
  })

  it('launches the first app of the app grid', () => {
    expect(firstResult(overviewResults(realVfs, ''), { appGrid: true })).toEqual({ kind: RESULT_KINDS.APP, id: 'files' })
  })
})
