import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './styles.css'
import { ArrowIcon } from './components/Icons'
import { I18nProvider, useI18n } from './i18n'

const REDIRECT_SECONDS = 5

function NotFound() {
  const { t } = useI18n()
  const [left, setLeft] = useState(REDIRECT_SECONDS)

  useEffect(() => {
    document.title = `404 | ${t.notFound.title}`
  }, [t])

  useEffect(() => {
    if (left === 0) {
      window.location.replace('/')
      return
    }
    const id = window.setTimeout(() => setLeft(left - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])

  return (
    <main className="not-found">
      <div className="hero__sun not-found__sun" aria-hidden="true" />
      <p className="not-found__code">404</p>
      <h1 className="not-found__title">{t.notFound.title}</h1>
      <p className="not-found__text">{t.notFound.text}</p>
      <p className="not-found__redirect">{t.notFound.redirect(left)}</p>
      <a className="btn btn--primary" href="/">
        {t.notFound.back} <ArrowIcon />
      </a>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <NotFound />
    </I18nProvider>
  </StrictMode>,
)
