import type {
  EducationId,
  ExperienceId,
  ExtraId,
  PlaceId,
  RoleId,
  SectionId,
  SpokenId,
  StatId,
  StrengthId,
} from './data'

export interface Content {
  meta: { title: string; description: string }
  ui: {
    skipToContent: string
    mainNav: string
    menu: string
    language: string
    darkMode: string
    backToTop: string
  }
  nav: Record<SectionId, string>
  hero: {
    kicker: string
    // Katakana reading of the name; empty when not needed.
    nameReading: string
    role: string
    intro: string
    location: string
    ctaContact: string
    ctaCv: string
    portraitAlt: string
  }
  stats: Record<StatId, { label: string; detail: string }>
  about: { heading: string; paragraphs: string[] }
  strengths: { heading: string; items: Record<StrengthId, { title: string; text: string }> }
  places: Record<PlaceId, string>
  experience: {
    heading: string
    intro: string
    featuredBadge: string
    entries: Record<ExperienceId, string>
    roles: Record<RoleId, { title: string; employer: string; bullets: string[] }>
  }
  education: {
    heading: string
    entries: Record<EducationId, { institution: string; degree: string; grade: string; details: string[] }>
  }
  languages: {
    heading: string
    toolsHeading: string
    items: Record<SpokenId, { name: string; level: string }>
  }
  extras: {
    heading: string
    items: Record<ExtraId, { title: string; role: string; text: string }>
  }
  contact: {
    heading: string
    intro: string
    email: string
    phone: string
    linkedin: string
    cv: string
    cvNote: string
  }
  footer: { rights: string }
  notFound: { title: string; text: string; back: string }
}
