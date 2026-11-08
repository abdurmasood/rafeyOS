import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

// rafeyOS layers, bottom to top. A folder may import only from its own layer or the ones below;
// shell and apps share a layer but never import each other.
const RAFEYOS = '@/components/rafeyos'
const RAFEYOS_LAYERS = {
  core: ['state', 'ui', 'wm', 'shell', 'apps', 'session'],
  state: ['ui', 'wm', 'shell', 'apps', 'session'],
  ui: ['wm', 'shell', 'apps', 'session'],
  wm: ['shell', 'apps', 'session'],
  shell: ['apps', 'session'],
  apps: ['shell', 'session'],
  session: [],
}
const RELATIVE_PARENT = { group: ['../*', '../**'], message: 'Import across folders with the @/ alias.' }
const layerPattern = (layer, forbidden) => (forbidden.length ? [{
  group: forbidden.map((folder) => `${RAFEYOS}/${folder}/**`),
  message: `${layer}/ sits below ${forbidden.join(', ')}; move the shared code down a layer instead.`,
}] : [])
// Flat config replaces no-restricted-imports options rather than merging them, so extra patterns repeat the layer ones.
const layerRule = (layer, forbidden, { files = [`components/rafeyos/${layer}/**/*.{js,jsx}`], extra = [] } = {}) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [RELATIVE_PARENT, ...layerPattern(layer, forbidden), ...extra] }],
  },
})

// shell/ feature folders never import each other; shared helpers live in shell/logic and only the root files compose.
const SHELL_FEATURES = ['calendar', 'chrome', 'desktop', 'menus', 'overview', 'popups']
const shellSiblingRule = (folder, siblings) => layerRule('shell', RAFEYOS_LAYERS.shell, {
  files: [`components/rafeyos/shell/${folder}/**/*.{js,jsx}`],
  extra: [{
    group: [`${RAFEYOS}/shell/*`, `!${RAFEYOS}/shell/logic`, ...siblings.map((sibling) => `${RAFEYOS}/shell/${sibling}/**`)],
    message: `shell/${folder}/ may import only shell/logic; compose features in shell/Desktop.jsx or shell/ShellLayer.jsx.`,
  }],
})

export default [
  { ignores: ['dist', '.next', 'coverage'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
    },
  },
  {
    // Plain JS with JSDoc and no prop-types dependency; props are covered by component tests instead
    files: [
      'components/rafeyos/**/*.{js,jsx}',
      'app/os/**/*.{js,jsx}',
      'tests/rafeyos/**/*.{js,jsx}',
      'components/home/**/*.{js,jsx}',
      'tests/home/**/*.{js,jsx}',
      'app/projects/**/*.{js,jsx}',
      'components/studio/**/*.{js,jsx}',
      'tests/projects/**/*.{js,jsx}',
      'tests/studio/**/*.{js,jsx}',
    ],
    rules: { 'react/prop-types': 'off' },
  },
  {
    // react-three-fiber JSX takes three.js object props, which aren't DOM attributes
    files: ['components/studio/**/*.{js,jsx}'],
    rules: {
      'react/no-unknown-property': ['error', {
        ignore: ['object', 'geometry', 'matrix', 'matrixAutoUpdate', 'renderOrder', 'frustumCulled', 'map', 'transparent', 'depthWrite', 'blending', 'toneMapped'],
      }],
    },
  },
  ...Object.entries(RAFEYOS_LAYERS).map(([layer, forbidden]) => layerRule(layer, forbidden)),
  ...SHELL_FEATURES.map((folder) => shellSiblingRule(folder, SHELL_FEATURES.filter((other) => other !== folder))),
  shellSiblingRule('logic', SHELL_FEATURES),
  {
    files: ['components/rafeyos/*.{js,jsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [RELATIVE_PARENT] }] },
  },
]
