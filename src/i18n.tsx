import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LANGS, type Lang, type When } from './content/data'
import { content } from './content'
import type { Content } from './content/types'

const STORAGE_KEY = 'lang'
const LOCALES: Record<Lang, string> = { en: 'en-US', it: 'it-IT', ja: 'ja-JP' }
const RANGE_SEP: Record<Lang, string> = { en: ' – ', it: ' – ', ja: '～' }

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang)

function detectLang(): Lang {
  const param = new URLSearchParams(window.location.search).get('lang')
  if (isLang(param)) return param
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLang(stored)) return stored
  } catch {
    // storage unavailable (private mode, blocked cookies)
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag.toLowerCase().split('-')[0]
    if (isLang(base)) return base
  }
  return 'en'
}

function toDate(s: string) {
  const [y, m = '1'] = s.split('-')
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1))
}

// Not Intl formatRange: ICU renders ja month ranges as "2026/09～2026/10".
export function formatWhen(when: When, lang: Lang) {
  const locale = LOCALES[lang]
  const precise = 'from' in when ? when.from.includes('-') : when.on[0].includes('-')
  const fmt = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    ...(precise ? { month: 'short' } : {}),
    timeZone: 'UTC',
  })
  if (!('from' in when)) {
    return new Intl.ListFormat(locale, { type: 'conjunction' }).format(when.on.map((d) => fmt.format(toDate(d))))
  }
  const [from, to] = [toDate(when.from), toDate(when.to)]
  const sep = RANGE_SEP[lang]
  if (precise && from.getUTCFullYear() === to.getUTCFullYear()) {
    const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
    // Year goes once, where the locale puts it: "Sep – Oct 2026" / "2026年9月～10月".
    return lang === 'ja' ? fmt.format(from) + sep + month.format(to) : month.format(from) + sep + fmt.format(to)
  }
  return fmt.format(from) + sep + fmt.format(to)
}

interface I18n {
  lang: Lang
  t: Content
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang)
  const t = content[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    if (lang === 'ja') void import('./fonts-ja')
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore
    }
    const url = new URL(window.location.href)
    url.searchParams.set('lang', next)
    window.history.replaceState(null, '', url)
  }, [])

  const value = useMemo(() => ({ lang, t, setLang }), [lang, t, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n outside I18nProvider')
  return ctx
}
