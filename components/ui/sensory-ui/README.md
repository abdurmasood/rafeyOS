# sensory-ui (vendored core)

Web Audio UI sounds from [shadcn-labs/sensory-ui](https://github.com/shadcn-labs/sensory-ui) (MIT, see `LICENSE`).

- **Source:** the `sensory-ui-core` registry item at commit `d82a67d34d5ab6e86eabf1a196d4ed55e6f3eebb` (2026-11-04).
- **Why copied, not `shadcn add`:** the registry gives its files no `target`, so the CLI flattens `config/`, `sounds/`
  and `sounds/core/` into the root `lib/` and `hooks/`. Their relative imports then break, and the two `index.ts` files
  overwrite each other. Upstream issue #16 covers the flattening.
- **How:** `shadcn add` with `"tsx": false` in a scratch folder converted the TypeScript to JavaScript. The output was
  moved back into upstream's folder layout here. `sounds/index.js` was converted by hand, since the CLI overwrote it.
- **Local patch:** `config/provider.jsx` `useReducedMotion` also returns early when `window.matchMedia` is missing
  (jsdom in the tests). Re-apply it when updating.

rafeyOS mounts it in `components/rafeyos/state/SoundProvider.jsx`.
