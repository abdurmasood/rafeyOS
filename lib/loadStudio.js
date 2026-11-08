// Loaded on first use so three.js and the room's assets stay out of the homepage chunk
export const loadStudio = () => import('@/components/studio/Studio.jsx').then((module) => module.Studio)
