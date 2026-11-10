// The print pass: the screen is a grid of character cells, and each cell shows the glyph for its brightness.

export const printFragment = /* glsl */ `
uniform sampler2D uBrightness; // one texel per character cell, from the view pass
uniform sampler2D uGlyphs;     // the ramp's characters side by side, dimmest first
uniform vec2 uGrid;            // columns and rows of cells
uniform float uGlyphCount, uDim;
varying vec2 vUv;

void main() {
  vec2 cell = vUv * uGrid;
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  float v = clamp(texture2D(uBrightness, (id + 0.5) / uGrid).r, 0.0, 0.999);
  float g = texture2D(uGlyphs, vec2((floor(v * uGlyphCount) + f.x) / uGlyphCount, f.y)).r;
  // A brighter cell gets a denser glyph and brighter ink, so the ramp reads over a wider range than glyphs alone
  gl_FragColor = vec4(vec3(g * mix(0.4, 1.0, v) * uDim), 1.0);
}
`
