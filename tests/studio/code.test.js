import { describe, expect, it } from 'vitest'
import { TOKEN, lineStarts, normaliseSource, tokenizeLine } from '@/lib/studio/code'

const kinds = (line) => tokenizeLine(line).filter((t) => t.text.trim()).map((t) => [t.text, t.kind])

describe('monitor code', () => {
  it('colours GLSL keywords, types, numbers and calls', () => {
    expect(kinds('uniform vec3 uColour;')).toEqual([
      ['uniform', TOKEN.KEYWORD],
      ['vec3', TOKEN.TYPE],
      ['uColour', TOKEN.PLAIN],
      [';', TOKEN.PLAIN],
    ])
    expect(kinds('float a = mix(b, 0.5, 1.0);')).toContainEqual(['mix', TOKEN.CALL])
    expect(kinds('float a = mix(b, 0.5, 1.0);')).toContainEqual(['0.5', TOKEN.NUMBER])
    expect(kinds('vec2 p = vec2(1.0);')).toContainEqual(['vec2', TOKEN.TYPE])
  })

  it('treats comments and directives as one token each', () => {
    expect(kinds('  x = 1; // the rest of the line')).toContainEqual(['// the rest of the line', TOKEN.COMMENT])
    expect(kinds('#define HAZE_STEPS 16')).toEqual([['#define HAZE_STEPS 16', TOKEN.DIRECTIVE]])
  })

  it('keeps every character, so typed counts line up with what is drawn', () => {
    const line = '  vec4 c = texture2D(uBase, uv) * 0.5; // dim'
    expect(tokenizeLine(line).map((t) => t.text).join('')).toBe(line)
  })

  it('trims blank edges and trailing spaces, and turns tabs into spaces', () => {
    expect(normaliseSource('\n\n\tvoid main() {  \n}\n\n')).toBe('  void main() {\n}')
  })

  it('knows where each line starts', () => {
    expect(lineStarts('ab\nc\n\nd')).toEqual([0, 3, 5, 6])
  })
})
