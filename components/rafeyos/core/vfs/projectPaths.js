// Links between the projects and the /home/rafey/projects/*.txt files that describe each one
import { RAFEY_HOME } from './buildVfs'
import { joinPath, realPath } from './paths'

export const PROJECTS_FOLDER = joinPath(RAFEY_HOME, 'projects')

/** The position of the project with this slug, or the first project when there's none. */
export const projectIndexFor = (projects, slug) => {
  const index = projects.findIndex((project) => project.slug === slug)
  return index < 0 ? 0 : index
}

/** The project a file describes (buildVfs tags project files with projectIndex), or null. Follows a symlink. */
export const projectForPath = ({ vfs, content }, path) => {
  const node = vfs[realPath(vfs, path)]
  if (node?.projectIndex === undefined) return null
  return content.projects.find((project) => project.index === node.projectIndex) ?? null
}
