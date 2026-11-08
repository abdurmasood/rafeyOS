import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  // Vite's built-in oxc transform handles JSX with the automatic runtime, as Next does
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
    // Source imports omit extensions (e.g. lib/posts.js -> './blogData')
    extensions: ['.js', '.jsx', '.mjs', '.json'],
  },
  test: {
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock
    environment: 'node',
    include: ['**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', '.next/**'],
    setupFiles: ['./tests/setup/tz.js'],
    coverage: {
      provider: 'v8',
      // Scoped to modules added or extracted for rafeyOS, and the homepage terminal that runs its shell
      include: [
        'lib/browserStorage.js',
        'lib/contact.js',
        'lib/help.js',
        'lib/loadRafeyOS.js',
        'lib/studio/**/*.js',
        'components/rafeyos/**/*.{js,jsx}',
        'components/home/**/*.{js,jsx}',
      ],
      exclude: ['**/*.test.{js,jsx}'],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
    },
  },
})
