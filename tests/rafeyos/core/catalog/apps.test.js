import { describe, it, expect } from 'vitest'
import { APPS, APP_IDS, DOCK_FAVORITES, getApp } from '@/components/rafeyos/core/catalog/apps'

describe('app registry', () => {
  it('lists every app id', () => {
    expect(APP_IDS).toEqual(['files', 'terminal', 'editor', 'music', 'mail', 'projects', 'settings', 'properties', 'minecraft', 'studio'])
  })

  it('carries the mockup sizes and flags', () => {
    expect(getApp('terminal')).toEqual({ id: 'terminal', name: 'Terminal', size: [640, 400], minSize: [360, 200], multi: true, inDock: true, defaultPath: '' })
    expect(getApp('properties')).toMatchObject({ size: [340, 430], multi: false, inDock: false })
    expect(APPS.files.multi).toBe(true)
    expect(APPS.editor.multi).toBe(false)
    expect(APPS.editor.defaultPath).toBe('')
  })

  it('keeps every minimum no larger than the default size', () => {
    Object.values(APPS).forEach((app) => {
      expect(app.minSize[0]).toBeLessThanOrEqual(app.size[0])
      expect(app.minSize[1]).toBeLessThanOrEqual(app.size[1])
    })
  })

  it('pins the dock favorites, all of which are dock apps', () => {
    expect(DOCK_FAVORITES).toEqual(['files', 'terminal', 'editor', 'music', 'mail', 'projects', 'minecraft', 'settings'])
    expect(DOCK_FAVORITES.every((id) => getApp(id).inDock)).toBe(true)
  })

  it('is frozen and throws on unknown ids', () => {
    expect(Object.isFrozen(APPS)).toBe(true)
    expect(Object.isFrozen(APPS.files.size)).toBe(true)
    expect(() => getApp('browser')).toThrow('Unknown app: browser')
  })
})
