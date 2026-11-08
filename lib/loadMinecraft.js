export const loadMinecraft = () =>
  import('@/components/rafeyos/apps/minecraft/MinecraftScene.jsx').then((module) => ({ default: module.MinecraftScene }))
