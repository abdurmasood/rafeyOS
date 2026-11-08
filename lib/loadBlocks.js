export const loadBlocks = () =>
  import('@/components/rafeyos/apps/blocks/BlocksScene.jsx').then((module) => ({ default: module.BlocksScene }))
