import { useCallback, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'
// Must match --paper in styles.css.
const THEME_COLOR: Record<Theme, string> = { light: '#f7f3ec', dark: '#121314' }

function readTheme(): Theme {
  try {
    if (localStorage.getItem(STORAGE_KEY) === 'dark') return 'dark'
  } catch {
    // storage unavailable
  }
  return 'light'
}

// Light by default, regardless of the OS setting. The initial attribute is set by the
// inline script in index.html before first paint.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    if (next === 'dark') root.dataset.theme = 'dark'
    else delete root.dataset.theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', THEME_COLOR[next])
    try {
      if (next === 'dark') localStorage.setItem(STORAGE_KEY, 'dark')
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setTheme(next)
  }, [theme])

  return { theme, toggle }
}
