// Loaded when the Studio window first opens, so three.js and the room's assets stay out of the OS chunk
export const loadStudio = () => import('@/components/studio/Studio.jsx').then((module) => module.Studio)
