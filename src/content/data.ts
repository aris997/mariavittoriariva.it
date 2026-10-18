// Language-neutral facts. Localized strings live in en.ts / it.ts / ja.ts.

export const LANGS = ['en', 'it', 'ja'] as const
export type Lang = (typeof LANGS)[number]

export const LANG_NAMES: Record<Lang, string> = { en: 'English', it: 'Italiano', ja: '日本語' }

export const SECTIONS = ['about', 'experience', 'education', 'languages', 'contact'] as const
export type SectionId = (typeof SECTIONS)[number]

// 'YYYY' or 'YYYY-MM'
export type When = { from: string; to: string } | { on: readonly string[] }

export const NAME = 'Maria Vittoria Riva'
export const SITE_URL = 'https://mariavittoriariva.it'
export const CV_PATH = '/maria-vittoria-riva-cv.pdf'

// Split so the address and number are not present verbatim in the shipped bundle.
export const CONTACT = {
  email: ['m.vittoria.riva', 'gmail.com'],
  phone: ['+39', '342', '137', '6022'],
  linkedin: 'https://www.linkedin.com/in/maria-vittoria-riva/',
} as const

export const PLACES = ['nagoya', 'osaka', 'tokyo', 'rome'] as const
export type PlaceId = (typeof PLACES)[number]

export const STATS = [
  { id: 'events', value: '2' },
  { id: 'areas', value: '6' },
  { id: 'languages', value: '5' },
  { id: 'honours', value: '110/110' },
] as const
export type StatId = (typeof STATS)[number]['id']

export const STRENGTHS = ['venueOps', 'protocol', 'teams', 'bridge'] as const
export type StrengthId = (typeof STRENGTHS)[number]

export const EXPERIENCE = [
  {
    id: 'asianGames',
    place: 'nagoya',
    featured: true,
    roles: [{ id: 'venueOpsAssistant', when: { from: '2026-09', to: '2026-10' } }],
  },
  {
    id: 'expo',
    place: 'osaka',
    featured: true,
    roles: [{ id: 'protocolOfficer', when: { from: '2025-08', to: '2025-10' } }],
  },
  {
    id: 'kuoni',
    place: 'rome',
    featured: false,
    roles: [{ id: 'tourLeader', when: { from: '2024-05', to: '2026-06' } }],
  },
  {
    id: 'tourGuy',
    place: 'rome',
    featured: false,
    roles: [
      { id: 'guideCoordinator', when: { from: '2023-08', to: '2025-03' } },
      { id: 'welcomeStaff', when: { from: '2022-04', to: '2023-08' } },
    ],
  },
  {
    id: 'ciao',
    place: 'rome',
    featured: false,
    roles: [{ id: 'studentHelper', when: { from: '2021-06', to: '2021-11' } }],
  },
] as const satisfies readonly {
  id: string
  place: PlaceId
  featured: boolean
  roles: readonly { id: string; when: When }[]
}[]
export type ExperienceId = (typeof EXPERIENCE)[number]['id']
export type RoleId = (typeof EXPERIENCE)[number]['roles'][number]['id']

export const EDUCATION = [
  { id: 'sophia', place: 'tokyo', when: { from: '2025-03', to: '2026-01' } },
  { id: 'master', place: 'rome', when: { from: '2023-09', to: '2026-07' } },
  { id: 'bachelor', place: 'rome', when: { from: '2019-10', to: '2023-01' } },
] as const satisfies readonly { id: string; place: PlaceId; when: When }[]
export type EducationId = (typeof EDUCATION)[number]['id']

// level: 1..5
export const SPOKEN = [
  { id: 'it', level: 5 },
  { id: 'en', level: 4 },
  { id: 'ja', level: 3 },
  { id: 'ko', level: 1 },
  { id: 'fr', level: 1 },
] as const
export type SpokenId = (typeof SPOKEN)[number]['id']

export const TOOLS = ['CRM', 'MS Excel', 'MS PowerPoint', 'MS Word', 'MS Outlook', 'Zoom', 'Skype'] as const

export const EXTRAS = [
  { id: 'mun', place: 'rome', when: { on: ['2017-02', '2018-02'] } },
  { id: 'scouts', place: 'rome', when: { from: '2009', to: '2016' } },
] as const satisfies readonly { id: string; place: PlaceId; when: When }[]
export type ExtraId = (typeof EXTRAS)[number]['id']
