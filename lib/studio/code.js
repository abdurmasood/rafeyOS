// What the monitor shows: the room's own fragment shader, split into coloured tokens per line.

export const TOKEN = Object.freeze({
  KEYWORD: 'keyword',
  TYPE: 'type',
  NUMBER: 'number',
  COMMENT: 'comment',
  DIRECTIVE: 'directive',
  CALL: 'call',
  PLAIN: 'plain',
})

const KEYWORDS = new Set(['uniform', 'varying', 'attribute', 'const', 'if', 'else', 'for', 'while', 'return', 'discard', 'break', 'continue', 'in', 'out', 'precision', 'true', 'false'])
const TYPES = new Set(['void', 'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat3', 'mat4', 'sampler2D', 'bvec2', 'ivec2'])
// comment | directive | number | name followed by ( | other name | anything else, one run at a time
const PATTERN = /(\/\/.*$)|(^\s*#.*$)|(\b\d+\.?\d*\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)|(\s+|.)/g

const kindOf = (match) => {
  const [, comment, directive, number, call, name] = match
  if (comment) return TOKEN.COMMENT
  if (directive) return TOKEN.DIRECTIVE
  if (number) return TOKEN.NUMBER
  if (call) return TYPES.has(call) ? TOKEN.TYPE : TOKEN.CALL
  if (name && KEYWORDS.has(name)) return TOKEN.KEYWORD
  if (name && TYPES.has(name)) return TOKEN.TYPE
  return TOKEN.PLAIN
}

/** @returns {Array<{ text: string, kind: string }>} */
export const tokenizeLine = (line) => Array.from(line.matchAll(PATTERN), (match) => ({ text: match[0], kind: kindOf(match) }))

/** Tabs to spaces, no blank lines at either end, no trailing spaces: the exact text he types. */
export const normaliseSource = (source) =>
  source
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')

/** Where each line starts in the text, so a typed count maps to a line and a column. */
export const lineStarts = (text) => {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return starts
}
