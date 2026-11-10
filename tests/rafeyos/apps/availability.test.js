import { describe, expect, it } from 'vitest'
import { handlerFor, isAudio, isImplemented, isWebLink, unavailableNote } from '@/components/rafeyos/core/catalog/apps'
import { realVfs } from '@/tests/rafeyos/helpers/testVfs'

describe('app availability', () => {
  it('knows which apps have a UI in this phase', () => {
    expect(isImplemented('files')).toBe(true)
    expect(isImplemented('terminal')).toBe(true)
    expect(isImplemented('editor')).toBe(true)
    expect(isImplemented('mail')).toBe(true)
    expect(isImplemented('properties')).toBe(true)
    expect(isImplemented('music')).toBe(true)
    expect(isImplemented('settings')).toBe(true)
    expect(isImplemented('minecraft')).toBe(true)
    expect(isImplemented('nope')).toBe(false)
  })

  it('recognises web links, which open through a dialog', () => {
    expect(isWebLink(realVfs, '/home/rafey/contact/linkedin.desktop')).toBe(true)
    expect(isWebLink(realVfs, '/home/rafey/contact/email.desktop')).toBe(false)
    expect(isWebLink(realVfs, '/home/rafey/nope')).toBe(false)
  })

  it('recognises audio files, which play as they open', () => {
    expect(isAudio(realVfs, '/home/rafey/Music/storms-ahead.mp3')).toBe(true)
    expect(isAudio(realVfs, '/home/rafey/Music/story.txt')).toBe(false)
    expect(isAudio(realVfs, '/home/rafey/nope')).toBe(false)
  })

  it('maps file types to the app that would open them', () => {
    expect(handlerFor({ type: 'dir' })).toBe('files')
    expect(handlerFor({ type: 'text' })).toBe('editor')
    expect(handlerFor({ type: 'audio' })).toBe('music')
    expect(handlerFor({ type: 'mailto' })).toBe('mail')
    expect(handlerFor({ type: 'weblink' })).toBeNull()
    expect(handlerFor(undefined)).toBeNull()
    expect(handlerFor(null)).toBeNull()
  })

  it('names the missing app in the note', () => {
    expect(unavailableNote('minecraft')).toBe("Minecraft isn't available yet")
    expect(unavailableNote(null)).toBe("Opening links isn't available yet")
    expect(unavailableNote('nope')).toBe("nope isn't available yet")
  })
})
