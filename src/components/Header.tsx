import { useEffect, useRef, useState } from 'react'
import { LANG_NAMES, LANGS, NAME, SECTIONS, type SectionId } from '../content/data'
import { useI18n } from '../i18n'
import { useTheme } from '../theme'
import { CloseIcon, MenuIcon, MoonIcon, SunIcon } from './Icons'

const LANG_SHORT = { en: 'EN', it: 'IT', ja: '日本語' } as const

// Last section whose top has passed 40% of the viewport; the bottom of the page always
// means the last section, which may be too short to ever reach that line on tall screens.
function useActiveSection() {
  const [active, setActive] = useState<SectionId | null>(null)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const { scrollY, innerHeight } = window
      if (scrollY + innerHeight >= document.documentElement.scrollHeight - 2) {
        setActive(SECTIONS[SECTIONS.length - 1])
        return
      }
      let current: SectionId | null = null
      for (const id of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= innerHeight * 0.4) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])
  return active
}

export function Header() {
  const { lang, t, setLang } = useI18n()
  const { theme, toggle } = useTheme()
  const active = useActiveSection()
  const [open, setOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (navRef.current?.contains(document.activeElement)) toggleRef.current?.focus()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">
        {t.ui.skipToContent}
      </a>
      <div className="site-header__inner">
        <a className="brand" href="#top" aria-label={`MVR, ${NAME}`}>
          <span className="brand__mark" aria-hidden="true">
            MVR
          </span>
        </a>

        {/* Before the nav in DOM order so Tab goes from the toggle into the open menu. */}
        <button
          ref={toggleRef}
          type="button"
          className="icon-button menu-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={t.ui.menu}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav
          ref={navRef}
          className={`site-nav ${open ? 'is-open' : ''}`}
          id="site-nav"
          aria-label={t.ui.mainNav}
        >
          <ul>
            {SECTIONS.map((id) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  aria-current={active === id ? 'location' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {t.nav[id]}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="controls">
          <div className="segmented" role="group" aria-label={t.ui.language}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={lang === l}
                // Keep the visible text in the accessible name (WCAG 2.5.3).
                aria-label={LANG_SHORT[l] === LANG_NAMES[l] ? undefined : `${LANG_SHORT[l]}, ${LANG_NAMES[l]}`}
                title={LANG_NAMES[l]}
                onClick={() => setLang(l)}
              >
                {LANG_SHORT[l]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-pressed={theme === 'dark'}
            aria-label={t.ui.darkMode}
            title={t.ui.darkMode}
            onClick={toggle}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
      <div className="scroll-progress" aria-hidden="true" />
    </header>
  )
}
