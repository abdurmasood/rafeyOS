export const loadSingularity = () =>
  import('@/components/singularity/SingularityScene.jsx').then((module) => ({ default: module.SingularityScene }))
