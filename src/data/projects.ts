import projectsData from './projects.json'

export type ProjectStatus = 'active' | 'paused' | 'archived'

export type ProjectLocale = 'zh' | 'en'

export type Project = {
  /** Stable slug, used as the anchor / analytics id */
  id: string
  name: string
  status: ProjectStatus
  stack: string[]
  repo?: string
  demo?: string
  featured?: boolean
  image?: string
  zh: { description: string }
  en: { description: string }
}

// Projects are JSON so the authenticated CRUD API can update the same data
// source used by both homepages and the project listings.
export const projects: Project[] = projectsData as Project[]

export function getProjects(locale: ProjectLocale) {
  return projects.map((project) => ({
    ...project,
    description: project[locale].description
  }))
}
